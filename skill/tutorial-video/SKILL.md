---
name: tutorial-video
description: Use when the user asks for a tutorial, explainer, walkthrough, demo or "how it works" video (narrated MP4), or to turn docs, a repo, a feature or a process into a short video. Builds it locally on macOS with the claude-video toolkit (~/gh/claude-video) using a JSON scene script, free local neural narration (Kokoro) and Remotion rendering, and saves the result to ~/gh/reports/video/.
---

# Tutorial video

Narrated 1080p tutorial videos made from a JSON script. The toolkit lives in
`~/gh/claude-video` ([kylep/claude-video](https://github.com/kylep/claude-video)). Every video gets the same
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
5. **Look at it:** `node bin/cv.mjs stills <slug>` (add `--only id,id --at 0.97` to check the end of particular scenes, e.g. a quiz reveal), then Read
   `projects/<slug>/build/stills/contact.png` (and individual PNGs if anything
   looks off). Fix overflow, crowding, orphans and empty-looking scenes, then re-run.
   Never render without looking at the stills at least once.
6. **Render:** `node bin/cv.mjs render <slug>`. It fails loudly if the output has
   no audio stream. Spot-check a frame from the MP4 if you changed layouts.
7. **Never commit videos or their specs.** Only the tooling (`bin/`, `lib/`, `src/`,
   `skill/`, tests) goes in git. Before writing the spec, add the project folder
   to `.git/info/exclude`. Render to `~/gh/reports/video/` (not a repo) and report
   the MP4 path.

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
  Built-in defaults (`DEFAULT_PRONOUNCE` in `lib/timing.mjs`) already fix
  words Kokoro gets wrong everywhere: **LED** → "L E D" (it said "lead", the
  metal), **LEDs** → "L E Dees", **JSON** → "jay-sawn" (it spelled out
  "J S O N"). A spec's `pronounce` overrides them. Add new always-wrong words
  there, not per spec.
- **Pauses:** `[[pause 4]]` anywhere in narration inserts that many seconds of
  silence; the caption before it stays on screen. Whenever the narration asks
  the viewer something (quizzes, "what do you think happens?"), pause **3–5 s**
  before the answer. Kids especially need the time, and answering straight
  away defeats the question. Example:
  `[[next]] Which LED leg is plus? [[pause 4]] The long leg.`
- **Standalone:** a video can't ask for anything that only works in a chat with
  an agent ("send a photo for a second look"). End with something the viewer
  can do alone.
- **Hands-on build videos (wiring, assembly):** one placement per `[[next]]`
  step. Name both ends every time ("Wire 5 is black. It goes from a29 to the
  bottom blue rail."), with the same text in the on-screen label and the
  subtitles. Use the written guide's names and numbers ("Wire 5"), never
  unexplained codes. Give safety checks their own scene before power-on.

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
| `breadboard` | `heading`, `groups[{label, items[]}]`, `zoom`, `tags`, `fresh` | electronics builds: parts snap into holes one group per cue, camera eases to each group, holes get tags |
| `diagram` | `heading`, `component`, `callouts[{text, anchor, lit?}]` | one big part with labels popping in per cue (`\n` splits a label line) |
| `quiz` | `question`, `options[4]`, `answer` (0–3) | multiple choice: options appear per cue, silent 5-4-3-2-1 countdown with ticks, right answer turns green |
| `outro` | `title`, `subtitle` | wrap-up + where to find it |

**Breadboard items** (`groups[].items[]`): holes are `a1`…`j63`, rails are
`far+:N`, `far-:N`, `near+:N`, `near-:N` (far = top of screen). Kinds: `pico`
(`col` of pin 1; pins land in rows c and h), `wire` (`at[2]`, `color`, `bow`),
`resistor` (`at[2]`, `bands[]`), `led` (`at[anode, cathode]`, `color`, `id`),
`transistor` (`at[E, B, C]`), `buzzer` (`at[−, +]`, `id`), `rgbled` (`at[R, common,
G, B]`, `id`; `glow` with `color` tints it), `pot` (`at[end, wiper, end]`,
`angle`), `diode` (`at[anode, cathode]`; band drawn at the cathode). Effects that only
show during their step: `glow` (`id`, `on`; lights an LED or animates a
buzzer), `strip` (`at[1]`; highlights the five joined holes, or a whole rail),
`flow` (`at[≥2]`; current dots along the refs, following wires). Parts carry
over into later breadboard scenes; `"fresh": true` starts empty. `remove`
(`at` = the part's holes) lifts a previously placed part out and drops it from
later scenes, with its holes ringed and tagged, which is useful for "upgrade
the last build" videos. Use one
`[[next]]` per group, as with bullets.

**Laying out a build** (don't narrate any of this; just place parts so):
- Ask what the viewer is starting from. A from-scratch build beats a long
  run of "pull this out" steps (Kyle, 2026-10-31).
- The part people watch (the light) goes toward the end of the board, and no
  wire crosses over it. Wires should not pass over any part if avoidable.
- Resistors standing across the centre channel (`f30`→`e30`) look clean.
- Kit jumpers are long: prefer long runs along the board edges (rows a/b,
  i/j) over short hops, and order a group of parallel wires so they nest
  instead of crossing (turn a part around if that helps).
- Wires lying in the near half sag toward the viewer; far-half wires arc
  toward the far rails. `bow` (SVG units, about twice the sag) sets one
  wire's depth: give parallel wires distinct bows so they read as separate strands.
- Check the wiring as a netlist (union the 5-hole strips through every wire,
  then check each part's legs and the forbidden pins) before rendering, and
  keep any written guide generated from the same holes as the video.

**Diagram components and anchors:** `led` (dome, anode, cathode, flat),
`resistor` (bands, left, right, body), `transistor` (flat, e, b, c), and animated:
`rgbled` (red, green, blue, common, dome; each die lights when its callout shows),
`mix` (red, green, blue, yellow, magenta, cyan, white; circles appear with their callout),
`pwm` (on, off, bright, dim), `buzzer` (coil, disc, waves, low, high; vibrates faster once `high` shows),
`diode` (plain, band, door, kick; the kick loop animates once `kick` shows),
`pot` (track, wiper, ground, top, middle, meter; the wiper sweeps and a meter shows volts).

**Quiz narration** must have exactly 6 cues:
`question [[next]] Is it A, X? [[next]] B, Y! [[next]] C, Z! [[next]] Or D, W? [[next]] [[pause 5]] [[next]] reveal`.
Kokoro garbles a bare "A," at the start of a clip ("her", "eye"); leading with
"Is it A, …?" fixes it. Some one-word clips grow a trailing "s" ("yellows"):
end with "!" or add a word. Questions are numbered automatically.

**Per-scene overrides:** `voice` and `speed` (a different narrator for a
section; the voice credit shows wherever the voice changes), `lang` (Kokoro
phonemizer language, also settable top-level; default is the voice id's first
letter. `"lang": "a"` with a non-English voice like `ff_siwis` or `ef_dora` gives
accented English. Without it a foreign voice mangles English text), `pronounce`
(merged over the spec's), `music` (`{src, volume, duck}` switches the bed from
that scene on, crossfaded), `seconds` (minimum length, e.g. a silent section
title: `"type": "title", "narration": ""`).

Every scene needs `id` (unique) and `narration`. `src` paths are relative to the
spec file. Keep assets beside it in `projects/<slug>/`.

**Real footage:** screenshots via `screencapture -x -R x,y,w,h file.png`; for UI
use the Playwright MCP's screenshot tool (never control Chrome). Screen
recordings via `screencapture -v -V <seconds> file.mov`, which needs Screen
Recording permission. If it fails, ask the user to record instead of working around it.

## Spec top-level

`slug`, `title` (shown top-left on every scene), `targetSeconds`, `accent` (hex),
`captions` (bool), `pronounce`, `music` (`{src, volume=0.16, duck=0.4}`: a
looped bed, faded in/out and ducked under narration; use CC0 tracks and
note the source), `scenes`, and the voice settings:

| `tts` | default `voice` | notes |
|---|---|---|
| `kokoro` (default) | random from `voices.json` | Fast (~1s/clip warm), stable. 27 English voices |
| `qwen3` | `Ryan` | More expressive; slower, autoregressive; supports `instruct` (style) |
| `chatterbox` | built-in | Most expressive; slower, autoregressive |
| `say` | best installed | macOS built-in; robotic. Uses `rate` (wpm) instead of `speed` |

`speed` (neural, default 1.0) and `verify` (default true: Whisper speech check) apply to neural engines.

## Voices

- **Random unless specified.** If the user names a voice, set `"voice"`. Otherwise leave it out:
  `cv init`/`cv build` pick a random English Kokoro voice from `voices.json` (never `excluded`,
  `preferred` 3x as likely) and **write it into video.json**, so rebuilds stay on that voice.
  To re-roll, delete the `"voice"` line.
- Every video shows `voice: <name>` bottom-right during the opening scene (automatic).
- Kokoro ids: first letter = accent (`a` American, `b` British), second = `f`/`m`.
  Samples of all of them are in `~/gh/reports/video/voice-samples/kokoro/`.

### Voice feedback → save it here

When the user gives feedback on a voice ("that voice is great", "never use X", "too fast"),
record it in `voices.json` **in the repo** (`~/gh/claude-video/skill/tutorial-video/voices.json`):

1. Append `{"date", "voice", "note"}` to `feedback`, quoting the user's words.
2. Clear dislikes → add to `excluded` (`"voice": "reason"`). Clear likes → `preferred`.
   Mixed or vague feedback goes only in `feedback`.
3. Commit + push the repo, then run `~/gh/claude-video/scripts/deploy-skill.sh`.

Read `feedback` before choosing a non-default engine or voice; it overrides general reputation.
See `~/gh/claude-video/projects/how-it-works/video.json` for a complete example.

## When the layouts aren't enough

Add or change a scene component in `src/scenes.tsx`, register it in
`sceneComponents`, and add the type to `TYPES` in `bin/cv.mjs` plus `SceneType` in
`src/types.ts`. Keep the shared theme (`src/theme.ts`) and verify with stills.
Run `npm run typecheck && npm test` before committing. Commit straight to
main and push.

## Editing this skill

The source of truth is `~/gh/claude-video/skill/tutorial-video/`. The copy in
`~/.claude/skills/tutorial-video/` is deployed by `scripts/deploy-skill.sh`, which
overwrites it. Never edit the deployed copy; edit the repo, commit, then deploy.

## Gotchas

- A zod "Version mismatch" banner during render is expected (zod is pinned
  above Remotion's to clear a security advisory). Renders still work.
- Fonts (Inter, JetBrains Mono) load from Google Fonts at render time, so rendering needs network.
- Clips are cached by (engine, voice, speed, text) in `public/<slug>/`; editing one
  sentence only re-synthesizes that segment.
- Voice comparison samples: `~/gh/reports/video/voice-samples/`.
- Output dir override: `CV_OUT_DIR=/path node bin/cv.mjs render <slug>` or `--out file.mp4`.
- `node bin/cv.mjs doctor` checks prerequisites.
