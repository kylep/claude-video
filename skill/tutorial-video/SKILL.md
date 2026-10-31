---
name: tutorial-video
description: Use when the user asks for a tutorial, explainer, walkthrough, demo or "how it works" video (narrated MP4), or to turn docs, a repo, a feature or a process into a short video. Builds it locally on macOS with the claude-video toolkit (~/gh/claude-video) using a JSON scene script, free local neural narration (Kokoro) and Remotion rendering, and saves the result to ~/gh/reports/video/.
---

# Tutorial video

Narrated 1080p tutorial videos made from a JSON script. The toolkit lives in
`~/gh/claude-video` (private repo kylep/claude-video). Every video gets the same
theme, scene layouts and timing rules, so you write **data, not animation code**.

Pipeline: `video.json` → Kokoro (local neural TTS via mlx-audio) speaks each narration
segment → Whisper transcribes it back and rejects garbled clips → measured audio
lengths set every cue → Remotion renders MP4 + `.srt` → `~/gh/reports/video/<slug>.mp4`.

## Workflow

1. **Understand the subject first.** Read the code/docs you're explaining. A video
   with a wrong claim is worse than no video.
2. **Scaffold:** `cd ~/gh/claude-video && node bin/cv.mjs init <slug>` and
   edit `projects/<slug>/video.json`. If `node_modules` is missing, run `npm ci`;
   if `.venv` is missing, run `node bin/cv.mjs setup` (one-time model download).
3. **Write the script** (rules below). Default length is 60s ≈ 140–150 spoken words with Kokoro.
4. **Build + check timing:** `node bin/cv.mjs build <slug>`. It prints each
   scene's length and the total against `targetSeconds`. Edit the narration
   until it reports `ok`. Trim words rather than pushing `speed` past 1.1.
   If the speech check fails, the clip skipped or garbled words: re-run (it resamples)
   or rephrase. Don't disable `verify` to get past it.
5. **Look at it:** `node bin/cv.mjs stills <slug>`, then Read
   `projects/<slug>/build/stills/contact.png` (and individual PNGs if anything
   looks off). Fix overflow, crowding, orphans and empty-looking scenes, then re-run.
   Never render without looking at the stills at least once.
6. **Render:** `node bin/cv.mjs render <slug>`. It fails loudly if the output has
   no audio stream. Spot-check a frame from the MP4 if you changed layouts.
7. **Commit** the spec (`projects/<slug>/video.json`) to the claude-video repo.
   Build output and audio are gitignored. Report the MP4 path to the user.

## Script rules

- **One idea per scene, 5–15s each.** 5–8 scenes for a 60s video. Open with a
  `title`, close with an `outro`.
- **Narration is spoken text.** Short sentences. No markdown, URLs or code in
  narration. Write numbers and symbols how they should sound.
- **Sync with `[[next]]`.** In `bullets`, `flow` and `terminal` scenes, put one
  `[[next]]` marker right before the words that introduce each item. The item
  appears exactly when that segment starts speaking. Count must equal the item
  count (the CLI rejects mismatches). A leading `[[next]]` reveals item 1
  immediately. No markers means items appear together at the start.
- **On-screen text is shorter than the narration.** Bullets ≤ ~6 words, flow
  labels 1–2 words with a ≤ 6 word `detail`, max 4 flow steps, max 5 bullets.
- **Code scenes:** ≤ 10 lines reads best (CLI enforces line length per size);
  `highlight` is a 1-based line list. Explain the highlighted lines in narration.
- **Mispronunciations:** add `"pronounce": {"Remotion": "Ree-motion"}`. This
  affects audio only; captions keep the real spelling. Listen-test unfamiliar
  terms by running a one-scene spec and checking the Whisper transcript.

## Scene types

| type | fields | use for |
|---|---|---|
| `title` | `title`, `subtitle` | opening hook |
| `bullets` | `heading`, `bullets[]` | key points, cued |
| `flow` | `heading`, `steps[{label, detail}]` | pipelines and processes, cued; the active step glows |
| `code` | `heading`, `code`, `language`, `highlight[]` | config/code snippets |
| `terminal` | `heading`, `lines[{cmd, out}]` | CLI walkthroughs, typed out, cued |
| `image` | `heading`, `src`, `caption` | screenshots (slow zoom) |
| `clip` | `heading`, `src` | screen recordings (muted under narration; scene lasts ≥ the clip) |
| `outro` | `title`, `subtitle` | wrap-up + where to find it |

Every scene needs `id` (unique) and `narration`. `src` paths are relative to the
spec file. Keep assets beside it in `projects/<slug>/`.

**Real footage:** screenshots via `screencapture -x -R x,y,w,h file.png`; for UI
use the Playwright MCP's screenshot tool (never control Chrome). Screen
recordings via `screencapture -v -V <seconds> file.mov`, which needs Screen
Recording permission. If it fails, ask the user to record instead of working around it.

## Spec top-level

`slug`, `title` (shown top-left on every scene), `targetSeconds`, `accent` (hex),
`captions` (bool), `pronounce`, `scenes`, and the voice settings:

| `tts` | default `voice` | notes |
|---|---|---|
| `kokoro` (default) | `af_heart` | Fast (~1s/clip warm), stable. Others: `af_bella`, `am_michael`, `am_fenrir`, `bf_emma`, `bm_george` |
| `qwen3` | `Ryan` | More expressive; slower, autoregressive; supports `instruct` (style) |
| `chatterbox` | built-in | Most expressive; slower, autoregressive |
| `say` | best installed | macOS built-in; robotic. Uses `rate` (wpm) instead of `speed` |

`speed` (neural, default 1.0) and `verify` (default true: Whisper speech check) apply to neural engines.
Stick with kokoro/af_heart unless the user asks for a different voice; it's what keeps videos consistent.
See `~/gh/claude-video/projects/how-it-works/video.json` for a complete example.

## When the layouts aren't enough

Add or change a scene component in `src/scenes.tsx`, register it in
`sceneComponents`, and add the type to `TYPES` in `bin/cv.mjs` plus `SceneType` in
`src/types.ts`. Keep the shared theme (`src/theme.ts`) and verify with stills.
Run `npm run typecheck && npm test` before committing. Commit straight to
main and push.

## Gotchas

- A zod "Version mismatch" banner during render is expected (zod is pinned
  above Remotion's to clear a security advisory). Renders still work.
- Fonts (Inter, JetBrains Mono) load from Google Fonts at render time, so rendering needs network.
- Clips are cached by (engine, voice, speed, text) in `public/<slug>/`; editing one
  sentence only re-synthesizes that segment.
- Voice comparison samples: `~/gh/reports/video/voice-samples/`.
- Output dir override: `CV_OUT_DIR=/path node bin/cv.mjs render <slug>` or `--out file.mp4`.
- `node bin/cv.mjs doctor` checks prerequisites and shows which voice will be used.
