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


def words(s, hyphen=""):
    # hyphen="" joins ("hand-written" == "handwritten"); hyphen=" " splits
    # ("220-ohm" == "220 ohm"). Other punctuation always separates.
    toks = re.sub(r"[^a-z0-9' ]+", " ", s.lower().replace("-", hyphen)).split()
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
