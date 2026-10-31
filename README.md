# claude-video

Spec-driven narrated tutorial videos, built locally on macOS by Claude Code.

```
video.json ──► Kokoro TTS (per [[next]] segment) ──► Whisper check ──► measured timing + captions ──► Remotion ──► MP4 + SRT
```

- **Script:** `projects/<slug>/video.json` lists scenes (`title`, `bullets`, `flow`, `code`,
  `terminal`, `image`, `clip`, `outro`), each with narration.
- **Voice:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0) runs locally via
  [mlx-audio](https://github.com/Blaizzy/mlx-audio). Every clip is transcribed back with Whisper and
  rejected if words were skipped or garbled. Qwen3-TTS, Chatterbox and macOS `say` are optional
  engines (`"tts"` in the spec). Clips are cached by hash.
- **Sync:** `[[next]]` markers split narration into segments. Each list item appears
  exactly when its segment starts, because timing comes from the real audio length.
- **Render:** Remotion 4 (React) renders 1080p30 H.264. It uses Remotion's bundled ffmpeg, so no Homebrew ffmpeg is needed.
- **Review:** `cv stills` renders one frame per scene plus a contact sheet so Claude can see the layout before rendering.

## Use

```sh
npm ci
node bin/cv.mjs setup               # .venv + Kokoro/Whisper models (~2 GB, one time)
node bin/cv.mjs doctor
node bin/cv.mjs init my-video        # edit projects/my-video/video.json
node bin/cv.mjs build my-video       # narration + timing report
node bin/cv.mjs stills my-video      # projects/my-video/build/stills/contact.png
node bin/cv.mjs render my-video      # ~/gh/reports/video/my-video.mp4 (+ .srt)
npm run studio                       # optional live preview (load build/props.json as props)
```

The Claude Code skill is `skill/tutorial-video/SKILL.md`, symlinked to
`~/.claude/skills/tutorial-video`. It holds the authoring rules (scene lengths, cue
usage, text limits) that keep videos consistent.

## Notes

- `zod` is overridden to a patched version (GHSA-mrhx-c7xc-m3w5), so Remotion prints a
  version-mismatch banner. Renders are unaffected. Remove the override when Remotion ships zod ≥ 4.6.6.
- Remotion's license is free for individuals and small companies. See remotion.dev/license.
