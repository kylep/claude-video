# claude-video

Spec-driven narrated tutorial videos, built locally on macOS by Claude Code.

[![Watch: how claude-video works (60s, made with claude-video)](https://img.youtube.com/vi/Luvb_ftcjKQ/maxresdefault.jpg)](https://youtu.be/Luvb_ftcjKQ)

*Watch the 60-second explainer above. It was made with this repo.*

```
video.json ──► Kokoro or Qwen3 TTS (per [[next]] segment) ──► Whisper check ──► measured timing + captions ──► Remotion ──► MP4 + SRT
```

- **Script:** `projects/<slug>/video.json` lists scenes (`title`, `bullets`, `flow`, `code`,
  `terminal`, `image`, `clip`, `outro`), each with narration.
- **Voice:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0) runs locally via
  [mlx-audio](https://github.com/Blaizzy/mlx-audio). Every clip is transcribed back with Whisper and
  rejected if words were skipped or garbled. Two standard narrators: `"narrator": "heart"` (Kokoro
  `af_heart`, the default) and `"narrator": "ryan"` ([Qwen3-TTS](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice)
  Ryan, styled as a calm professor), set for the whole video or per scene. Chatterbox and macOS
  `say` are optional engines (`"tts"` in the spec). Clips are cached by hash.
- **Sync:** `[[next]]` markers split narration into segments. Each list item appears
  exactly when its segment starts, because timing comes from the real audio length.
- **Render:** Remotion 4 (React) renders 1080p30 H.264. It uses Remotion's bundled ffmpeg, so no Homebrew ffmpeg is needed.
- **Review:** `cv stills` renders one frame per scene plus a contact sheet so Claude can see the layout before rendering.

## Requirements

- macOS on Apple Silicon (MLX runs the voice models locally)
- Node 22+
- `uv` and ImageMagick: `brew install uv imagemagick`
- About 10 GB of disk for the models (Kokoro 0.7 GB, Qwen3-TTS 5.7 GB, Whisper 3 GB), kept in `~/.cache/huggingface`

Videos are written to `~/gh/reports/video/` by default; set `CV_OUT_DIR` to change that.

## Setup

```sh
git clone https://github.com/kylep/claude-video && cd claude-video
node bin/cv.mjs setup
```

`setup` is the only install step, and it is safe to re-run (after a `git pull`, or to check
an install). Each step checks its state and skips work that's done:

1. Checks macOS/Apple Silicon, Node 22+, `uv` and ImageMagick, with the install command for anything missing.
2. Runs `npm ci` only when `node_modules` is missing or older than `package-lock.json`.
3. Creates `.venv` (Python 3.12) if it doesn't exist, then installs the pinned `requirements.txt` (uv skips what's already there).
4. Says one test line with each narrator, which downloads its model the first time and
   checks the Whisper speech check works. Later runs load from the cache.

`node bin/cv.mjs doctor` re-checks the tools without installing anything.

To use it from Claude Code, install the skill with `scripts/deploy-skill.sh` (copies
`skill/tutorial-video/` to `~/.claude/skills/tutorial-video`; re-run it after pulling).

## Use

```sh
node bin/cv.mjs init my-video        # edit projects/my-video/video.json
node bin/cv.mjs build my-video       # narration + timing report
node bin/cv.mjs stills my-video      # projects/my-video/build/stills/contact.png
node bin/cv.mjs render my-video      # ~/gh/reports/video/my-video.mp4 (+ .srt)
npm run studio                       # optional live preview (load build/props.json as props)
```

The Claude Code skill is `skill/tutorial-video/`: SKILL.md holds the authoring rules (scene
lengths, cue usage, text limits) that keep videos consistent; voices.json holds the narrator
presets and voice feedback.

## Notes

- `zod` is overridden to a patched version (GHSA-mrhx-c7xc-m3w5), so Remotion prints a
  version-mismatch banner. Renders are unaffected. Remove the override when Remotion ships zod ≥ 4.6.6.
- Remotion's license is free for individuals and small companies. See remotion.dev/license.
