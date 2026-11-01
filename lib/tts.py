"""Batch neural TTS via mlx-audio. Loads the model once for every segment.

Usage: python lib/tts.py jobs.json
jobs.json: {"model": repo_id, "voice": str|null, "speed": float, "instruct": str|null,
            "verify": bool, "jobs": [{"text": str, "out": "/abs/path.wav"}]}
Prints one JSON line per job: {"out", "seconds", "wer"?, "heard"?}.
"""
import json
import re
import sys

import numpy as np
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model

STT_MODEL = "mlx-community/whisper-large-v3-turbo-asr-fp16"


SAME = {
    "see": "c", "sea": "c", "be": "b", "bee": "b", "ay": "a", "dee": "d",
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
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


def main():
    spec = json.load(open(sys.argv[1]))
    model = load_model(model_path=spec["model"])
    stt = None
    if spec.get("verify"):
        from mlx_audio.stt.utils import load_model as load_stt

        stt = load_stt(STT_MODEL)
    for job in spec["jobs"]:
        kwargs = {"text": job["text"], "speed": spec.get("speed", 1.0), "verbose": False}
        if spec.get("lang_code"):
            kwargs["lang_code"] = spec["lang_code"]
        elif "kokoro" in spec["model"].lower() and spec.get("voice"):
            # Kokoro voice ids start with their language: a=American, b=British, ...
            kwargs["lang_code"] = spec["voice"][0]
        if spec.get("voice"):
            kwargs["voice"] = spec["voice"]
        if spec.get("instruct"):
            kwargs["instruct"] = spec["instruct"]
        chunks, sr = [], model.sample_rate
        for result in model.generate(**kwargs):
            chunks.append(np.array(result.audio))
            sr = result.sample_rate
        audio = np.concatenate(chunks)
        audio_write(job["out"], audio, sr, format="wav")
        line = {"out": job["out"], "seconds": round(len(audio) / sr, 3)}
        if stt is not None:
            heard = stt.generate(job["out"]).text.strip()
            line.update(heard=heard, wer=round(wer(job.get("ref", job["text"]), heard), 3))
        print(json.dumps(line), flush=True)


if __name__ == "__main__":
    main()
