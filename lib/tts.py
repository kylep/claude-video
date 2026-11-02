"""Batch neural TTS. Loads the model once for every segment.

Two backends with the same models and voices:
  mlx    Apple Silicon (mlx-audio, uses the GPU). Default on macOS arm64.
  torch  anywhere else: Linux, Intel, Docker (PyTorch on the CPU; requirements-torch.txt).
Set CV_TTS_BACKEND=mlx|torch to override.

Usage: python lib/tts.py jobs.json
jobs.json: {"engine": "kokoro"|"qwen3"|"chatterbox", "model": mlx repo_id, "voice": str|null,
            "speed": float, "instruct": str|null, "lang_code": str|null, "verify": bool,
            "jobs": [{"text": str, "ref": str, "out": "/abs/path.wav"}]}
Prints one JSON line per job: {"out", "seconds", "wer"?, "heard"?}.
"""
import gc
import json
import os
import platform
import re
import sys

import numpy as np

MLX_STT_MODEL = "mlx-community/whisper-large-v3-turbo-asr-fp16"
TORCH_MODELS = {"qwen3": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"}


def memory_gb():
    """Usable RAM: the container's cgroup limit when there is one, else the machine's."""
    total = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    try:
        limit = open("/sys/fs/cgroup/memory.max").read().strip()
        if limit != "max":
            total = min(total, int(limit))
    except OSError:
        pass
    return total / 2**30


def torch_stt_model():
    # faster-whisper names. large-v3-turbo needs ~4 GB to load; small.en ~1.1 GB and is plenty
    # for catching skipped or garbled words. CV_STT_MODEL overrides.
    return os.environ.get("CV_STT_MODEL") or ("large-v3-turbo" if memory_gb() >= 8 else "small.en")


def backend():
    want = os.environ.get("CV_TTS_BACKEND")
    if want:
        return want
    return "mlx" if sys.platform == "darwin" and platform.machine() == "arm64" else "torch"


SAME = {
    "see": "c", "sea": "c", "be": "b", "bee": "b", "ay": "a", "dee": "d",
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    # British vs American spelling (Whisper writes US spellings)
    "colour": "color", "colours": "colors", "favourite": "favorite", "grey": "gray",
}


ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def int_words(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    for size, name in ((10**9, "billion"), (10**6, "million"), (1000, "thousand"), (100, "hundred")):
        if n >= size:
            rest = n % size
            return int_words(n // size) + " " + name + ("" if rest == 0 else " " + int_words(rest))
    return str(n)


def spell_numbers(s):
    # Whisper writes "53", "$6.3", "19%"; scripts say "fifty three". Spell digits out on both
    # sides so the comparison is about words, not number formatting.
    def one(m):
        whole, frac, pct = m.group(1).replace(",", ""), m.group(2), m.group(3)
        n = int(whole) if len(whole) < 13 else None
        if n is None:
            out = whole
        elif "," not in m.group(1) and not frac and 1100 <= n <= 2099 and not 2000 <= n <= 2009:
            hi, lo = divmod(n, 100)  # years: 1946 -> nineteen forty six
            out = int_words(hi) + (" hundred" if lo == 0 else " oh " + ONES[lo] if lo < 10 else " " + int_words(lo))
        else:
            out = int_words(n)
        if frac:
            out += " point " + " ".join(ONES[int(d)] for d in frac)
        return " " + out + (" percent" if pct else "") + " "
    s = re.sub(r"\$(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand)?", lambda m: m.group(1) + (" " + m.group(2) if m.group(2) else "") + " dollars ", s)
    def ordinal(m):
        w = int_words(int(m.group(1).replace(",", ""))).split()
        last = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth",
                "nine": "ninth", "twelve": "twelfth"}.get(w[-1]) or (w[-1][:-1] + "ieth" if w[-1].endswith("y") else w[-1] + "th")
        return " " + " ".join(w[:-1] + [last]) + " "
    s = re.sub(r"\b(\d+(?:,\d{3})*)(?:st|nd|rd|th)\b", ordinal, s)
    s = re.sub(r"(\d+(?:,\d{3})*)(?:\.(\d+))?(%)?", one, s)
    # "a hundred and twenty" == "one hundred twenty"
    s = re.sub(r"\ba (hundred|thousand|million|billion)\b", r"one \1", s, flags=re.I)
    # Only the "and" inside a number ("a hundred and twenty"), never ordinary words: dropping every
    # "and" would let a skipped "and" in the narration pass unnoticed.
    return re.sub(r"\b(hundred|thousand|million|billion) and\b", r"\1", s, flags=re.I)


def words(s, hyphen=""):
    s = spell_numbers(s)
    # hyphen="" joins ("hand-written" == "handwritten"); hyphen=" " splits
    # ("220-ohm" == "220 ohm"). Other punctuation always separates.
    toks = re.sub(r"[^a-z0-9' ]+", " ", s.lower().replace("-", hyphen)).split()
    # Quiz-style "C, three" is often heard as "C3"; letters sound like words
    # ("see", "be"); numbers come back as digits. Same mapping on both sides.
    split = []
    for t in toks:
        m = re.fullmatch(r"([a-z])(\d+)", t)
        split.extend([m.group(1), m.group(2)] if m else [t])
    toks = [SAME.get(t, t) for t in split]
    # Runs of spelled-out letters ("L.E.D.", "L E D") collapse to one word ("led").
    out, run = [], ""
    for t in toks + [""]:
        if len(t) == 1 and t.isalpha():
            run += t
            continue
        if run:
            out.append(run)
            run = ""
        if t:
            out.append(t)
    return out


def wer(ref, hyp):
    # Whisper hyphenates inconsistently, so score both readings and keep the better.
    return min(_wer(words(ref, j), words(hyp, j)) for j in ("", " "))


def _wer(r, h):
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / max(1, len(r))


class MlxVoice:
    def __init__(self, spec):
        from mlx_audio.tts.utils import load_model

        self.spec = spec
        self.model = load_model(model_path=spec["model"])

    def say(self, text):
        spec = self.spec
        kwargs = {"text": text, "speed": spec.get("speed", 1.0), "verbose": False}
        if spec.get("lang_code"):
            kwargs["lang_code"] = spec["lang_code"]
        elif spec.get("engine") == "kokoro" and spec.get("voice"):
            # Kokoro voice ids start with their language: a=American, b=British, ...
            kwargs["lang_code"] = spec["voice"][0]
        if spec.get("voice"):
            kwargs["voice"] = spec["voice"]
        if spec.get("instruct"):
            kwargs["instruct"] = spec["instruct"]
        chunks, sr = [], self.model.sample_rate
        for result in self.model.generate(**kwargs):
            chunks.append(np.array(result.audio))
            sr = result.sample_rate
        return np.concatenate(chunks), sr


class TorchVoice:
    def __init__(self, spec):
        import torch

        self.spec = spec
        self.engine = spec.get("engine")
        torch.set_num_threads(os.cpu_count() or 4)
        if self.engine == "kokoro":
            from kokoro import KPipeline

            self.pipe = KPipeline(lang_code=spec.get("lang_code") or spec["voice"][0], repo_id="hexgrad/Kokoro-82M")
        elif self.engine == "qwen3":
            from qwen_tts import Qwen3TTSModel

            self.model = Qwen3TTSModel.from_pretrained(TORCH_MODELS["qwen3"], device_map="cpu", dtype=torch.float32)
        else:
            sys.exit(f"tts engine {self.engine!r} has no torch backend (use kokoro or qwen3)")

    def say(self, text):
        spec = self.spec
        if self.engine == "kokoro":
            parts = [np.asarray(audio) for _, _, audio in self.pipe(text, voice=spec["voice"], speed=spec.get("speed", 1.0))]
            return np.concatenate(parts), 24000
        kwargs = {"text": text, "language": "English", "speaker": spec.get("voice") or "Ryan"}
        if spec.get("instruct"):
            kwargs["instruct"] = spec["instruct"]
        wavs, sr = self.model.generate_custom_voice(**kwargs)
        return np.asarray(wavs[0], dtype=np.float32), sr


class MlxEars:
    def __init__(self):
        from mlx_audio.stt.utils import load_model

        self.model = load_model(MLX_STT_MODEL)

    def hear(self, wav):
        return self.model.generate(wav).text.strip()


class TorchEars:
    def __init__(self):
        from faster_whisper import WhisperModel

        self.model = WhisperModel(torch_stt_model(), device="cpu", compute_type="int8")

    def hear(self, wav):
        # Hand Whisper 16 kHz mono samples directly; its own file decoding goes through PyAV,
        # whose API changes have broken it before.
        import soundfile

        audio, sr = soundfile.read(wav, dtype="float32", always_2d=True)
        audio = audio.mean(axis=1)
        if sr != 16000:
            n = int(len(audio) * 16000 / sr)
            audio = np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)
        segments, _ = self.model.transcribe(audio, language="en", beam_size=1)
        return " ".join(seg.text.strip() for seg in segments).strip()


def write_wav(path, audio, sr, mlx):
    if mlx:
        from mlx_audio.audio_io import write

        write(path, audio, sr, format="wav")
    else:
        import soundfile

        soundfile.write(path, np.asarray(audio, dtype=np.float32), sr, subtype="PCM_16", format="WAV")


def main():
    spec = json.load(open(sys.argv[1]))
    mlx = backend() == "mlx"
    voice = MlxVoice(spec) if mlx else TorchVoice(spec)
    lines = []
    for job in spec["jobs"]:
        audio, sr = voice.say(job["text"])
        write_wav(job["out"], audio, sr, mlx)
        lines.append({"out": job["out"], "seconds": round(len(audio) / sr, 3)})
    if spec.get("verify"):
        # Unload the voice before loading Whisper: peak memory is the larger model, not both
        # (matters on CPU boxes and small Docker VMs).
        del voice
        gc.collect()
        ears = MlxEars() if mlx else TorchEars()
        for job, line in zip(spec["jobs"], lines):
            heard = ears.hear(job["out"])
            line.update(heard=heard, wer=round(wer(job.get("ref", job["text"]), heard), 3))
    for line in lines:
        print(json.dumps(line), flush=True)


if __name__ == "__main__":
    main()
