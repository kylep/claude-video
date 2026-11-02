#!/usr/bin/env node
// cv: spec-driven tutorial videos. video.json -> local TTS narration -> Remotion render.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { boardBase, layoutScene, pickVoice, sayable, speechRanges, splitPauses, splitSegments, toSrt } from '../lib/timing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const require = createRequire(import.meta.url);
const SFX = await import('@remotion/sfx');
const EMOJI = require(path.join(ROOT, 'node_modules/@remotion/animated-emoji/dist/cjs/emoji-data.js')).emojis;

// Remote assets are downloaded once at build time so renders never depend on the network for them.
function download(url, dest) {
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  run('curl', ['-fsSL', '--max-time', '60', '-o', `${dest}.part`, url]);
  fs.renameSync(`${dest}.part`, dest);
}
// <AnimatedEmoji> loads staticFile(`${name}-1x.webm`) from the public root. Noto Animated Emoji, CC BY 4.0.
function ensureEmoji(name) {
  if (!EMOJI.some((e) => e.name === name)) die(`unknown emoji "${name}" (see getAvailableEmojis() in @remotion/animated-emoji)`);
  // Pinned commit so a clean build always fetches the same files.
  download(`https://raw.githubusercontent.com/remotion-dev/animated-emoji/84bfdfbd5fb97729cb1973d9003017fe669f8c92/public/${name}-1x.webm`, path.join(PUBLIC, `${name}-1x.webm`));
}
// sfx names are @remotion/sfx export names (whoosh, ding, uiSwitch, ...); returns the public-relative path.
// @remotion/rive hardcodes its runtime URL (unpkg). Before any render that uses Rive, check the
// served wasm is byte-identical to the lockfile-verified copy in node_modules.
let riveChecked = false;
function verifyRiveWasm() {
  if (riveChecked) return;
  const local = path.join(ROOT, 'node_modules', '@rive-app', 'canvas-advanced', 'rive.wasm');
  const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', '@rive-app', 'canvas-advanced', 'package.json'), 'utf8')).version;
  const tmp = path.join(os.tmpdir(), `cv-rive-${process.pid}.wasm`);
  run('curl', ['-fsSL', '--max-time', '60', '-o', tmp, `https://unpkg.com/@rive-app/canvas-advanced@${ver}/rive.wasm`]);
  const sha = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const ok = sha(tmp) === sha(local);
  fs.rmSync(tmp);
  if (!ok) die(`rive.wasm from unpkg does not match node_modules/@rive-app/canvas-advanced@${ver}; refusing to render`);
  riveChecked = true;
}
function ensureSfx(name) {
  const url = SFX[name];
  if (typeof url !== 'string' || !url.startsWith('https://remotion.media/')) die(`unknown sfx "${name}" (one of ${Object.keys(SFX).join(', ')})`);
  download(url, path.join(PUBLIC, 'sfx', path.basename(url)));
  return `sfx/${path.basename(url)}`;
}
const OUT_DIR = process.env.CV_OUT_DIR ?? path.join(os.homedir(), 'gh', 'reports', 'video');
const FPS = 30;
const TYPES = ['title', 'bullets', 'code', 'terminal', 'flow', 'image', 'clip', 'breadboard', 'diagram', 'quiz', 'outro',
  'open', 'bumper', 'globe', 'security', 'market', 'movers', 'scoreboard', 'story', 'screen', 'gif', 'rundown', 'signoff'];
const ITEMS = { bullets: 'bullets', terminal: 'lines', flow: 'steps', breadboard: 'groups', diagram: 'callouts' };
const BOARD_KINDS = ['pico', 'wire', 'resistor', 'led', 'rgbled', 'pot', 'diode', 'transistor', 'buzzer', 'glow', 'strip', 'flow', 'remove'];
const ANCHORS = {
  led: ['dome', 'anode', 'cathode', 'flat'], resistor: ['bands', 'left', 'right', 'body'], transistor: ['flat', 'e', 'b', 'c'],
  rgbled: ['red', 'green', 'blue', 'common', 'dome'],
  mix: ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan', 'white'],
  pwm: ['bright', 'dim', 'on', 'off'],
  buzzer: ['coil', 'disc', 'waves', 'low', 'high'],
  diode: ['band', 'plain', 'door', 'kick'],
  pot: ['track', 'wiper', 'top', 'ground', 'middle', 'meter'],
};
// Quiz scenes: narration = question [[next]] A [[next]] B [[next]] C [[next]] D [[next]] [[pause N]] [[next]] reveal.
const QUIZ_CUES = 6;
const TRANSITIONS = ['fade', 'slide', 'wipe', 'flip', 'clockWipe', 'iris', 'lightLeak', 'starburst'];
const BOARD_REF = /^(?:[a-j](?:[1-9]|[1-5]\d|6[0-3])|(?:far|near)[+-]:(?:[1-9]|[1-5]\d|6[0-3]))$/;
const VENV_PY = path.join(ROOT, '.venv', 'bin', 'python');
// Neural engines run locally through mlx-audio (Apple Silicon). Kokoro is the default:
// fast, small, and non-autoregressive, so it doesn't skip or repeat words.
const ENGINES = {
  kokoro: { model: 'mlx-community/Kokoro-82M-bf16', voice: 'af_heart' },
  qwen3: { model: 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit', voice: 'Ryan' },
  chatterbox: { model: 'mlx-community/chatterbox-turbo-fp16', voice: null },
  say: {},
};
const MAX_WER = 0.2;
// Standard narrators + the user's voice feedback live with the skill.
const VOICES_FILE = path.join(ROOT, 'skill', 'tutorial-video', 'voices.json');
const VOICES = JSON.parse(fs.readFileSync(VOICES_FILE, 'utf8'));
// A narrator preset ("heart", "ryan") -> engine, voice and style instruction.
function narratorTts(name) {
  const n = VOICES.narrators[name];
  return { engine: n.tts, model: ENGINES[n.tts].model, voice: n.voice, instruct: n.instruct ?? null, lang: null };
}

const die = (msg) => { console.error(`cv: ${msg}`); process.exit(1); };
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });
const has = (cmd) => { try { run('which', [cmd]); return true; } catch { return false; } };
// Apple Silicon runs the voices on the GPU through MLX; everything else (Linux, Intel, Docker)
// runs the same models on the CPU through PyTorch. lib/tts.py makes the same choice.
const MLX = process.platform === 'darwin' && process.arch === 'arm64';
const REQUIREMENTS = path.join(ROOT, MLX ? 'requirements.txt' : 'requirements-torch.txt');

function resolveSpec(arg) {
  if (!arg) die('missing spec (path to video.json or a project slug)');
  const p = fs.existsSync(arg) ? arg : path.join(ROOT, 'projects', arg, 'video.json');
  if (!fs.existsSync(p)) die(`spec not found: ${arg}`);
  const file = path.resolve(p);
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  spec.slug ??= path.basename(path.dirname(file));
  return { file, dir: path.dirname(file), spec };
}

function validate(spec) {
  const errs = [];
  if (!spec.title) errs.push('spec.title is required');
  if (!Array.isArray(spec.scenes) || !spec.scenes.length) errs.push('spec.scenes must be a non-empty array');
  if (!/^[a-z0-9-]+$/.test(spec.slug ?? '')) errs.push('spec.slug must match [a-z0-9-]+');
  if (spec.tts && !ENGINES[spec.tts]) errs.push(`spec.tts must be one of ${Object.keys(ENGINES).join(', ')}`);
  if (spec.narrator !== undefined && !VOICES.narrators[spec.narrator]) errs.push(`spec.narrator must be one of ${Object.keys(VOICES.narrators).join(', ')}`);
  const ids = new Set();
  (spec.scenes ?? []).forEach((s, i) => {
    const at = `scenes[${i}]${s.id ? ` (${s.id})` : ''}`;
    if (!/^[A-Za-z0-9_-]+$/.test(s.id ?? '')) errs.push(`${at}: id is required and must match [A-Za-z0-9_-]+`);
    if (ids.has(s.id)) errs.push(`${at}: duplicate id`);
    ids.add(s.id);
    if (!TYPES.includes(s.type)) errs.push(`${at}: type must be one of ${TYPES.join(', ')}`);
    if (typeof s.narration !== 'string') errs.push(`${at}: narration (string) is required`);
    const key = ITEMS[s.type];
    if (key) {
      const n = (s[key] ?? []).length;
      const cues = (s.narration?.match(/\[\[next\]\]/g) ?? []).length;
      if (!n) errs.push(`${at}: ${key} must be non-empty`);
      if (cues && cues !== n) errs.push(`${at}: ${cues} [[next]] cues but ${n} ${key} (use one cue per item, or none)`);
    }
    if ((s.type === 'image' || s.type === 'clip') && !s.src) errs.push(`${at}: src is required`);
    if (s.type === 'quiz') {
      if (!s.question) errs.push(`${at}: question is required`);
      if ((s.options ?? []).length !== 4) errs.push(`${at}: options must have 4 entries`);
      if (!(Number.isInteger(s.answer) && s.answer >= 0 && s.answer < 4)) errs.push(`${at}: answer must be 0-3 (index into options)`);
      const cues = (s.narration?.match(/\[\[next\]\]/g) ?? []).length;
      if (cues !== QUIZ_CUES) errs.push(`${at}: quiz narration needs ${QUIZ_CUES} [[next]] cues (question, A, B, C, D, countdown, reveal); got ${cues}`);
    }
    if (s.voice !== undefined && typeof s.voice !== 'string') errs.push(`${at}: voice must be a string`);
    if (s.narrator !== undefined && !VOICES.narrators[s.narrator]) errs.push(`${at}: narrator must be one of ${Object.keys(VOICES.narrators).join(', ')}`);
    if (s.transition && !TRANSITIONS.includes(s.transition.type)) errs.push(`${at}: transition.type must be one of ${TRANSITIONS.join(', ')}`);
    if (s.lang !== undefined && !/^[a-z]$/.test(s.lang)) errs.push(`${at}: lang must be one Kokoro language letter (a, b, e, f, h, i, j, p, z)`);
    if (s.music !== undefined && (typeof s.music !== 'object' || !s.music.src)) errs.push(`${at}: music must be {src, volume?, duck?}`);
    if (s.type === 'diagram') {
      if (!ANCHORS[s.component]) errs.push(`${at}: component must be one of ${Object.keys(ANCHORS).join(', ')}`);
      (s.callouts ?? []).forEach((c, ci) => {
        if (ANCHORS[s.component] && !ANCHORS[s.component].includes(c.anchor)) errs.push(`${at}: callouts[${ci}].anchor must be one of ${ANCHORS[s.component].join(', ')}`);
      });
    }
    if (s.type === 'breadboard') {
      (s.groups ?? []).forEach((g, gi) => {
        if (!Array.isArray(g.items) || !g.items.length) errs.push(`${at}: groups[${gi}].items must be non-empty`);
        (g.items ?? []).forEach((it, ii) => {
          const where = `${at}: groups[${gi}].items[${ii}]`;
          if (!BOARD_KINDS.includes(it.kind)) errs.push(`${where}: kind must be one of ${BOARD_KINDS.join(', ')}`);
          for (const ref of it.at ?? []) if (!BOARD_REF.test(ref)) errs.push(`${where}: bad hole "${ref}" (a1..j63 or far+:N / near-:N)`);
          const need = { wire: 2, resistor: 2, led: 2, rgbled: 4, pot: 3, diode: 2, transistor: 3, buzzer: 2, strip: 1 }[it.kind];
          if (need && (it.at ?? []).length !== need) errs.push(`${where}: ${it.kind} needs ${need} holes in "at"`);
          if (it.kind === 'flow' && (it.at ?? []).length < 2) errs.push(`${where}: flow needs at least 2 points in "at"`);
          if (it.kind === 'remove' && !(it.at ?? []).length) errs.push(`${where}: remove needs the part's "at" holes`);
          if (it.kind === 'glow' && !it.id) errs.push(`${where}: glow needs an id`);
        });
      });
    }
    if (s.type === 'code' && !s.code) errs.push(`${at}: code is required`);
    if (s.type === 'code' && s.code) {
      const lines = s.code.split('\n');
      const max = lines.length > 14 ? 90 : lines.length > 8 ? 75 : 62;
      lines.forEach((l, n) => { if (l.length > max) errs.push(`${at}: code line ${n + 1} is ${l.length} chars (max ${max} at this size); shorten it`); });
      if (lines.length > 18) errs.push(`${at}: ${lines.length} code lines; keep it under 18 or split the scene`);
    }
  });
  if (spec.music && (typeof spec.music.src !== 'string' || !spec.music.src)) errs.push('spec.music.src is required when music is set');
  if (errs.length) die(`invalid spec:\n  - ${errs.join('\n  - ')}`);
}

let sayVoiceCache;
// No narrator, engine or voice in the spec: write in the default narrator, so the spec
// says who speaks and a later change of default doesn't re-voice old videos.
function pinVoice(file, spec) {
  if (spec.narrator || (spec.tts && spec.tts !== 'kokoro') || (spec.voice && spec.voice !== 'auto')) return;
  spec.narrator = VOICES.defaultNarrator;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete raw.tts;
  delete raw.voice;
  raw.narrator = spec.narrator;
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
  console.log(`voice: narrator ${spec.narrator} (saved to ${path.relative(ROOT, file)}; set "narrator" to change)`);
}

function resolveTts(spec) {
  if (spec.narrator) {
    if (!fs.existsSync(VENV_PY)) die('neural TTS needs the Python env: run `node bin/cv.mjs setup`');
    return { ...narratorTts(spec.narrator), speed: spec.speed ?? 1.0, verify: spec.verify ?? true };
  }
  const engine = spec.tts ?? 'kokoro';
  if (engine === 'say') {
    if (process.platform !== 'darwin') die('tts "say" is macOS only; use a narrator');
    const voice = spec.voice && spec.voice !== 'auto' ? spec.voice : (sayVoiceCache ??= pickVoice(run('say', ['-v', '?'])));
    return { engine, voice, rate: spec.rate ?? 185 };
  }
  if (!fs.existsSync(VENV_PY)) die(`tts "${engine}" needs the Python env: run \`node bin/cv.mjs setup\` (or set "tts": "say")`);
  const { model, voice } = ENGINES[engine];
  return {
    engine, model,
    voice: spec.voice && spec.voice !== 'auto' ? spec.voice : voice,
    speed: spec.speed ?? 1.0,
    instruct: spec.instruct ?? null,
    // Kokoro phonemizer language; null = the voice id's first letter. "a" + a foreign voice = accented English.
    lang: spec.lang ?? null,
    verify: spec.verify ?? true,
  };
}

// lang joins the key only when set, so clips cached before it existed keep their keys.
const ttsKey = (tts, text) =>
  createHash('sha1').update(JSON.stringify([tts.engine, tts.voice, tts.rate, tts.speed, tts.instruct, text, ...(tts.lang ? [tts.lang] : [])])).digest('hex').slice(0, 16);

// Length of a PCM/float WAV from its header (portable: no afinfo on Linux).
const wavSeconds = (wav) => {
  const b = fs.readFileSync(wav);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') die(`not a WAV file: ${wav}`);
  let byteRate = 0;
  for (let at = 12; at + 8 <= b.length;) {
    const id = b.toString('ascii', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(at + 16);
    if (id === 'data' && byteRate) return Math.min(size, b.length - at - 8) / byteRate;
    at += 8 + size + (size & 1);
  }
  die(`could not read duration of ${wav}`);
};

// Synthesize every uncached clip. jobs: [{key, text (spoken form), ref (caption form)}].
function synthesize(jobs, tts, outDir, quiet = false) {
  // The same line can appear twice (e.g. a repeated quiz option); synthesize it once.
  const todo = [...new Map(jobs.filter((j) => !fs.existsSync(path.join(outDir, `${j.key}.wav`))).map((j) => [j.key, j])).values()];
  if (!todo.length) return;
  if (!quiet) console.log(`tts: ${tts.engine}${tts.voice ? ` / ${tts.voice}` : ''}: generating ${todo.length} clip(s)...`);
  if (tts.engine === 'say') {
    for (const j of todo) {
      const base = path.join(outDir, j.key);
      fs.writeFileSync(`${base}.txt`, j.text);
      run('say', ['-v', tts.voice, '-r', String(tts.rate), '-f', `${base}.txt`, '-o', `${base}.aiff`]);
      run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', `${base}.aiff`, `${base}.wav`]);
      fs.rmSync(`${base}.aiff`);
      fs.rmSync(`${base}.txt`);
    }
    return;
  }
  // Write to a temp name first so a failed or rejected clip is never cached.
  const jobFile = path.join(outDir, 'tts-jobs.json');
  fs.writeFileSync(jobFile, JSON.stringify({
    engine: tts.engine, model: tts.model, voice: tts.voice, lang_code: tts.lang, speed: tts.speed, instruct: tts.instruct, verify: tts.verify,
    jobs: todo.map((j) => ({ text: j.text, ref: j.ref, out: path.join(outDir, `${j.key}.tmp.wav`) })),
  }));
  const out = run(VENV_PY, ['-I', path.join(ROOT, 'lib', 'tts.py'), jobFile], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  fs.rmSync(jobFile);
  const bad = [];
  for (const line of out.trim().split('\n').filter((l) => l.startsWith('{'))) {
    const r = JSON.parse(line);
    const job = todo.find((j) => r.out.endsWith(`${j.key}.tmp.wav`));
    if (r.wer !== undefined && r.wer > MAX_WER) {
      bad.push(`WER ${r.wer}\n      script: ${job.ref}\n      heard:  ${r.heard}`);
      fs.rmSync(r.out);
    } else {
      fs.renameSync(r.out, path.join(outDir, `${job.key}.wav`));
    }
  }
  if (bad.length) die(`speech check failed (clip skipped/garbled words; re-run to resample, or rephrase):\n  - ${bad.join('\n  - ')}`);
  if (tts.verify && !quiet) console.log(`tts: speech check passed (Whisper transcript within ${MAX_WER * 100}% word error)`);
}

// Remotion ships ffmpeg/ffprobe in a platform package; call it directly (no Homebrew ffmpeg needed).
function ffmpeg(args) {
  const dir = path.join(ROOT, 'node_modules', '@remotion', `compositor-${process.platform}-${process.arch}`);
  return run(path.join(dir, 'ffmpeg'), ['-v', 'error', ...args], { env: { ...process.env, DYLD_LIBRARY_PATH: dir } });
}

// Remotion's bundled ffprobe: compositor-darwin-arm64, compositor-linux-x64-gnu, ...
function ffprobe(args) {
  const base = path.join(ROOT, 'node_modules', '@remotion');
  const name = fs.readdirSync(base).find((d) => d.startsWith(`compositor-${process.platform}-${process.arch}`));
  if (!name) die(`no Remotion compositor for ${process.platform}-${process.arch} in node_modules/@remotion`);
  const dir = path.join(base, name);
  return run(path.join(dir, 'ffprobe'), ['-v', 'error', ...args], { env: { ...process.env, DYLD_LIBRARY_PATH: dir, LD_LIBRARY_PATH: dir } });
}

// A short soft "tick" for quiz countdowns: 40 ms decaying 1.2 kHz blip, 48 kHz mono WAV.
function writeTick(file) {
  const rate = 48000; const n = Math.round(rate * 0.04);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 90) * 0.5 * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

const mediaSeconds = (file) => Number(ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim()) || 0;

// Build props.json: narration audio per [[next]] segment, cue frames, captions.
function build(arg) {
  const { file, dir, spec } = resolveSpec(arg);
  validate(spec);
  pinVoice(file, spec);
  const tts = resolveTts(spec);
  const pubRel = spec.slug;
  const pubDir = path.join(PUBLIC, pubRel);
  fs.mkdirSync(path.join(pubDir, 'assets'), { recursive: true });

  // Pass 1: every narration segment -> a cached clip key, then synthesize the missing ones in one batch.
  // segs[scene][segment] = spoken parts, split on [[pause N]].
  // A scene can override the narrator (`narrator`, or `voice`/`speed`/`lang`); clips are cached per engine, voice, style, speed and lang.
  const sceneTts = spec.scenes.map((s) => {
    const base = s.narrator ? { ...tts, ...narratorTts(s.narrator) } : tts;
    return { ...base, voice: s.voice ?? base.voice, speed: s.speed ?? base.speed, lang: s.lang ?? base.lang };
  });
  const segs = spec.scenes.map((s, si) => splitSegments(s.narration).map((t) => splitPauses(t).map((p) => (p.text
    ? { key: ttsKey(sceneTts[si], sayable(p.text, { ...spec.pronounce, ...s.pronounce })), text: sayable(p.text, { ...spec.pronounce, ...s.pronounce }), ref: p.text, pauseAfter: p.pauseAfter, tts: sceneTts[si] }
    : { key: null, ref: '', pauseAfter: p.pauseAfter }))));
  const groups = new Map();
  for (const j of segs.flat(2).filter((x) => x.key)) {
    const g = `${j.tts.engine}|${j.tts.voice}|${j.tts.instruct}|${j.tts.speed}|${j.tts.lang}`;
    if (!groups.has(g)) groups.set(g, { tts: j.tts, jobs: [] });
    groups.get(g).jobs.push(j);
  }
  for (const { tts: t, jobs } of groups.values()) synthesize(jobs, t, pubDir);
  const label = (t) => (t.engine === 'kokoro' ? t.voice : `${t.engine}/${t.voice ?? 'default'}`);

  const scenes = spec.scenes.map((s, si) => {
    const scene = { ...s };
    let minFrames = 0;
    if (s.src) {
      const src = path.resolve(dir, s.src);
      if (!fs.existsSync(src)) die(`${s.id}: src not found: ${src}`);
      const name = path.basename(src);
      fs.copyFileSync(src, path.join(pubDir, 'assets', name));
      scene.src = `${pubRel}/assets/${name}`;
      if (s.type === 'clip') minFrames = Math.round(mediaSeconds(src) * FPS) + 20;
    }
    for (const key of ['gif', 'rive']) {
      if (!s[key]) continue;
      const src = path.resolve(dir, s[key]);
      if (!fs.existsSync(src)) die(`${s.id}: ${key} not found: ${src}`);
      // Prefix with the scene id so two scenes' same-named files can't overwrite each other.
      const name = `${s.id}-${path.basename(src)}`;
      fs.copyFileSync(src, path.join(pubDir, 'assets', name));
      scene[key] = `${pubRel}/assets/${name}`;
    }
    if (s.rive) verifyRiveWasm();
    const emoji = s.emoji ?? (s.type === 'scoreboard' ? 'ice-hockey' : undefined); // scoreboard's default
    if (emoji) ensureEmoji(emoji);
    if (s.sfx) scene.sfx = s.sfx.map((x) => ({ ...x, src: ensureSfx(x.name) }));
    if (s.type === 'breadboard') scene.base = boardBase(spec.scenes, si);
    if (s.type === 'quiz') {
      const tick = path.join(pubDir, 'assets', 'tick.wav');
      if (!fs.existsSync(tick)) writeTick(tick);
      scene.tick = `${pubRel}/assets/tick.wav`;
      scene.quizNumber = spec.scenes.slice(0, si + 1).filter((x) => x.type === 'quiz').length;
      scene.quizTotal = spec.scenes.filter((x) => x.type === 'quiz').length;
    }
    const segTexts = splitSegments(s.narration);
    const audio = segs[si].map((parts) => parts.map((j) => ({
      key: j.key, text: j.ref, pauseAfter: j.pauseAfter,
      seconds: j.key ? wavSeconds(path.join(pubDir, `${j.key}.wav`)) : 0,
    })));
    if (s.seconds) minFrames = Math.max(minFrames, Math.round(s.seconds * FPS));
    // Quiz answers get a beat to sink in before the next question.
    const layout = layoutScene(segTexts, audio, { fps: FPS, minFrames, tail: s.type === 'quiz' ? 2 : 0.7 });
    // Credit the narrator on the first scene and wherever the voice changes.
    if (si === 0 || sceneTts[si].voice !== sceneTts[si - 1].voice) scene.voiceTag = label(sceneTts[si]);
    scene.voiceName = label(sceneTts[si]);
    scene.durationInFrames = layout.durationInFrames;
    scene.cues = layout.cues;
    scene.captions = layout.captions;
    scene.segments = layout.segments.map((seg) => ({ ...seg, audio: `${pubRel}/${audio[seg.index][seg.part].key}.wav` }));
    return scene;
  });

  // Music beds: spec.music plays from the start; a scene's own `music` switches
  // to a new bed from that scene on (crossfaded).
  const beds = [];
  const speech = speechRanges(scenes);
  let offset = 0;
  scenes.forEach((s, si) => {
    const m = si === 0 ? (spec.scenes[0].music ?? spec.music) : spec.scenes[si].music;
    if (m) {
      const src = path.resolve(dir, m.src);
      if (!fs.existsSync(src)) die(`music src not found: ${src}`);
      const name = path.basename(src);
      fs.copyFileSync(src, path.join(pubDir, 'assets', name));
      if (beds.length) beds[beds.length - 1].to = offset;
      beds.push({ src: `${pubRel}/assets/${name}`, volume: m.volume ?? spec.music?.volume ?? 0.16, duck: m.duck ?? spec.music?.duck ?? 0.4, from: offset, to: 0, speech });
    }
    offset += s.durationInFrames;
  });
  if (beds.length) beds[beds.length - 1].to = offset;
  const music = beds.length ? beds : undefined;

  const props = {
    title: spec.title,
    fps: FPS,
    width: 1920,
    height: 1080,
    accent: spec.accent ?? '#d97757',
    showCaptions: spec.captions ?? true,
    captionStyle: spec.captionStyle ?? 'box',
    chrome: spec.chrome,
    ticker: spec.ticker,
    date: spec.date,
    music,
    scenes,
  };
  const buildDir = path.join(dir, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'props.json'), JSON.stringify(props, null, 2));

  const total = scenes.reduce((a, s) => a + s.durationInFrames, 0) / FPS;
  console.log(`voice: ${tts.engine} / ${tts.voice ?? 'default'}${tts.rate ? ` @ ${tts.rate} wpm` : ` @ ${tts.speed}x`}`);
  for (const s of scenes) console.log(`  ${s.id.padEnd(18)} ${s.type.padEnd(9)} ${(s.durationInFrames / FPS).toFixed(1).padStart(5)}s  cues=${s.cues.length}`);
  console.log(`total: ${total.toFixed(1)}s${spec.targetSeconds ? ` (target ${spec.targetSeconds}s, ${total > spec.targetSeconds * 1.05 ? 'OVER' : total < spec.targetSeconds * 0.85 ? 'UNDER' : 'ok'})` : ''}`);
  return { dir, spec, props, buildDir };
}

async function bundleAndSelect(props) {
  const { bundle } = await import('@remotion/bundler');
  const { selectComposition } = await import('@remotion/renderer');
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts'), publicDir: PUBLIC });
  const composition = await selectComposition({ serveUrl, id: 'Tutorial', inputProps: props });
  return { serveUrl, composition };
}

// One still per scene at ~70% through (after most cues fired), plus a contact sheet.
// --only id1,id2 renders just those scenes; --at 0.95 picks the point in each scene (default 0.7).
async function stills(arg, opts = {}) {
  const { props, buildDir } = build(arg);
  const { renderStill } = await import('@remotion/renderer');
  const { serveUrl, composition } = await bundleAndSelect(props);
  const outDir = path.join(buildDir, 'stills');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let offset = 0;
  const files = [];
  const only = opts.only ? new Set(opts.only.split(',')) : null;
  for (const [i, s] of props.scenes.entries()) {
    if (only && !only.has(s.id)) { offset += s.durationInFrames; continue; }
    const frame = offset + Math.floor(s.durationInFrames * Math.min(0.999, Number(opts.at ?? 0.7)));
    const output = path.join(outDir, `${String(i + 1).padStart(2, '0')}-${s.id}.png`);
    await renderStill({ serveUrl, composition, inputProps: props, frame, output });
    files.push(output);
    offset += s.durationInFrames;
  }
  const sheet = path.join(outDir, 'contact.png');
  // Rows of 3 via +append/-append: montage needs a configured font, append doesn't.
  const rows = [];
  for (let i = 0; i < files.length; i += 3) {
    const row = files.slice(i, i + 3);
    while (row.length < 3) row.push('xc:#111111');
    rows.push('(', ...row.flatMap((f) => ['(', f, '-resize', '640x360!', ')']), '-bordercolor', '#111111', '-border', '6', '+append', ')');
  }
  run(has('magick') ? 'magick' : 'convert', [...rows, '-append', sheet]);  // ImageMagick 7 or 6 (Debian)
  console.log(`stills: ${outDir}\ncontact sheet: ${sheet}`);
}

async function render(arg, outArg) {
  const { spec, props } = build(arg);
  const { renderMedia } = await import('@remotion/renderer');
  const { serveUrl, composition } = await bundleAndSelect(props);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.resolve(outArg ?? path.join(OUT_DIR, `${spec.slug}.mp4`));
  const concurrency = process.env.CV_CONCURRENCY ? Number(process.env.CV_CONCURRENCY) : undefined;
  // CV_GL=swangle renders WebGL in software (SwiftShader): slower, but no GPU-process crashes.
  const chromiumOptions = process.env.CV_GL ? { gl: process.env.CV_GL } : undefined;
  const progress = (label) => {
    let last = -1;
    return ({ progress: p }) => {
      const pct = Math.floor(p * 10) * 10;
      if (pct !== last) { last = pct; process.stdout.write(`${label} ${pct}%\n`); }
    };
  };
  const total = composition.durationInFrames;
  // Long WebGL-heavy renders leak memory in Chrome until the tab crashes ("Page crashed!").
  // Render video and audio in chunks (each renderMedia call gets a fresh browser): video as muted
  // H.264 joined without re-encoding, audio as PCM WAV (sample-exact joins), encoded to AAC once.
  const CHUNK = Number(process.env.CV_CHUNK ?? 1500);
  if (process.env.CV_FRAMES || total <= CHUNK) {
    await renderMedia({
      serveUrl, composition, inputProps: props, codec: 'h264', crf: 20, outputLocation: out, concurrency, chromiumOptions,
      // CV_FRAMES=a-b renders a slice for testing.
      frameRange: process.env.CV_FRAMES ? process.env.CV_FRAMES.split('-').map(Number) : undefined,
      onProgress: progress('render'),
    });
  } else {
    // Chunks live in a folder keyed by the props and chunk size, so an interrupted render resumes:
    // finished chunks (renamed into place only once complete) are skipped.
    const key = createHash('sha256').update(JSON.stringify(props)).update(String(CHUNK)).digest('hex').slice(0, 12);
    const tmp = path.join(ROOT, 'projects', spec.slug, 'build', `chunks-${key}`);
    fs.mkdirSync(tmp, { recursive: true });
    const parts = [];
    const wavs = [];
    // Chrome intermittently kills a tab ("Page crashed!") around WebGL mounts; a fresh browser on
    // the same chunk almost always succeeds, so retry a chunk before giving up. Remotion's own
    // browser restart can also hang forever with no progress, so a chunk that makes no progress
    // for CV_STALL seconds (default 300) is cancelled and retried.
    const { makeCancelSignal } = await import('@remotion/renderer');
    const STALL = Number(process.env.CV_STALL ?? 300) * 1000;
    const attempt = async (label, file, opts) => {
      if (fs.existsSync(file)) { console.log(`${label}: done earlier, skipping`); return; }
      const partial = file.replace(/(\.\w+)$/, '.partial$1');
      for (let n = 1; ; n++) {
        const { cancelSignal, cancel } = makeCancelSignal();
        let timer;
        const poke = () => { clearTimeout(timer); timer = setTimeout(() => { console.log(`${label}: no progress for ${STALL / 1000}s, cancelling`); cancel(); }, STALL); };
        const onProgress = opts.onProgress;
        poke();
        try {
          await renderMedia({ ...opts, outputLocation: partial, cancelSignal, onProgress: (p) => { poke(); onProgress(p); } });
          fs.renameSync(partial, file);
          return;
        } catch (e) {
          const msg = String(e?.message ?? e);
          if (n >= 3 || !/crash|Target closed|Session closed|cancel/i.test(msg)) throw e;
          console.log(`${label}: ${msg.split('\n')[0]} - retrying (${n}/2)`);
        } finally { clearTimeout(timer); }
      }
    };
    for (let a = 0, i = 0; a < total; a += CHUNK, i++) {
      const b = Math.min(total, a + CHUNK) - 1;
      const part = path.join(tmp, `part${String(i).padStart(3, '0')}.mp4`);
      await attempt(`video ${a}-${b}`, part, {
        serveUrl, composition, inputProps: props, codec: 'h264', crf: 20, muted: true, frameRange: [a, b],
        concurrency, chromiumOptions, onProgress: progress(`video ${a}-${b}/${total}`),
      });
      parts.push(part);
      const wav = path.join(tmp, `part${String(i).padStart(3, '0')}.wav`);
      await attempt(`audio ${a}-${b}`, wav, {
        serveUrl, composition, inputProps: props, codec: 'wav', frameRange: [a, b],
        concurrency, chromiumOptions, onProgress: progress(`audio ${a}-${b}/${total}`),
      });
      wavs.push(wav);
    }
    const list = (name, files) => {
      const f = path.join(tmp, name);
      fs.writeFileSync(f, files.map((x) => `file '${x}'`).join('\n'));
      return f;
    };
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', list('video.txt', parts), '-f', 'concat', '-safe', '0', '-i', list('audio.txt', wavs),
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-y', out]);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  fs.writeFileSync(out.replace(/\.mp4$/, '.srt'), toSrt(props.scenes, FPS));
  const info = JSON.parse(ffprobe(['-show_entries', 'stream=codec_type:format=duration', '-of', 'json', out]));
  const kinds = info.streams.map((s) => s.codec_type).sort().join('+');
  console.log(`wrote ${out} (${Number(info.format.duration).toFixed(1)}s, ${kinds})`);
  if (!kinds.includes('audio')) die('rendered file has no audio stream');
}

function init(slug) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) die('usage: cv init <slug>  (lowercase, digits, dashes)');
  const dir = path.join(ROOT, 'projects', slug);
  const file = path.join(dir, 'video.json');
  if (fs.existsSync(file)) die(`${file} already exists`);
  fs.mkdirSync(dir, { recursive: true });
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates', 'video.json'), 'utf8'));
  tpl.slug = slug;
  delete tpl.tts;
  delete tpl.voice;
  tpl.narrator = VOICES.defaultNarrator;
  fs.writeFileSync(file, JSON.stringify(tpl, null, 2) + '\n');
  console.log(file);
}

// One command, safe to re-run: every step checks its own state and skips what's already done.
function setup(args = []) {
  const skipModels = args.includes('--skip-models');
  const step = (name, fn) => {
    process.stdout.write(`${name.padEnd(34)} `);
    try { console.log(fn() ?? 'ok'); } catch (e) {
      console.log('FAILED');
      // A failed child process: show the end of its stderr, where the real error is.
      if (e.stderr) console.error(String(e.stderr).trim().split('\n').slice(-12).join('\n'));
      die(`${name}: ${e.message.split('\n')[0]}`);
    }
  };
  step('platform', () => (MLX ? 'macOS Apple Silicon (MLX, GPU)' : `${process.platform} ${process.arch} (PyTorch, CPU)`));
  step('Node 22+', () => {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error(`found ${process.version}; install Node 22 or newer`);
    return process.version;
  });
  step('uv, ImageMagick', () => {
    const missing = [has('uv') ? null : 'uv', has('magick') || has('convert') ? null : 'imagemagick'].filter(Boolean);
    if (missing.length) throw new Error(`missing ${missing.join(', ')}: ${process.platform === 'darwin' ? 'brew install' : 'install'} ${missing.join(' ')}`);
  });
  step('npm packages', () => {
    const stamp = path.join(ROOT, 'node_modules', '.package-lock.json');
    const lock = path.join(ROOT, 'package-lock.json');
    if (fs.existsSync(stamp) && fs.statSync(stamp).mtimeMs >= fs.statSync(lock).mtimeMs) return 'ok (already installed)';
    run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    return 'installed';
  });
  step('Python env (.venv)', () => {
    if (fs.existsSync(VENV_PY)) return 'ok (exists)';
    run('uv', ['venv', '-q', '--python', '3.12', path.join(ROOT, '.venv')], { stdio: ['ignore', 'ignore', 'inherit'] });
    return 'created';
  });
  step('Python packages', () => {
    // uv checks the pins and only installs what's missing or different.
    // --torch-backend cpu keeps the multi-GB CUDA wheels out on Linux.
    run('uv', ['pip', 'install', '-q', '--python', VENV_PY, ...(MLX ? [] : ['--torch-backend', 'cpu']), '-r', REQUIREMENTS], { stdio: ['ignore', 'ignore', 'inherit'] });
    return `ok (${path.basename(REQUIREMENTS)})`;
  });
  // Saying one line with each narrator downloads its model the first time (Hugging Face cache,
  // ~/.cache/huggingface) plus Whisper for the speech check; later runs load from the cache.
  for (const [name, n] of Object.entries(VOICES.narrators)) {
    if (skipModels) { console.log(`${`narrator ${name}`.padEnd(34)} skipped (--skip-models; downloads on first build)`); continue; }
    step(`narrator ${name} (${n.tts} / ${n.voice})`, () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-setup-'));
      try {
        synthesize([{ key: 'check', text: 'Setup complete.', ref: 'Setup complete.' }], { ...narratorTts(name), speed: 1, verify: true }, tmp, true);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
  console.log(`\nsetup ok. Default narrator: ${VOICES.defaultNarrator}. Videos go to ${OUT_DIR}`);
  console.log('Claude Code skill: scripts/deploy-skill.sh (copies skill/tutorial-video to ~/.claude/skills)');
}

function doctor() {
  const checks = [
    ...(process.platform === 'darwin' ? [['say (optional engine)', () => run('which', ['say'])], ['afconvert', () => run('which', ['afconvert'])]] : []),
    ['ImageMagick (contact sheets)', () => { if (!has('magick') && !has('convert')) throw new Error('not installed'); }],
    ['neural TTS env (.venv)', () => { if (!fs.existsSync(VENV_PY)) throw new Error('run: node bin/cv.mjs setup'); }],
    ['node_modules', () => { if (!fs.existsSync(path.join(ROOT, 'node_modules', 'remotion'))) throw new Error('run: node bin/cv.mjs setup'); }],
  ];
  let ok = true;
  for (const [name, fn] of checks) {
    try { fn(); console.log(`ok   ${name}`); } catch (e) { ok = false; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
  }
  console.log(`narrators: ${Object.entries(VOICES.narrators).map(([k, n]) => `${k} = ${n.tts}/${n.voice}`).join(', ')} (default ${VOICES.defaultNarrator})`);
  console.log(`voice backend: ${MLX ? 'mlx (GPU)' : 'torch (CPU)'}`);
  console.log(`output dir: ${OUT_DIR}`);
  if (!ok) process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
const outIdx = rest.indexOf('--out');
const outArg = outIdx >= 0 ? rest[outIdx + 1] : undefined;
switch (cmd) {
  case 'init': init(rest[0]); break;
  case 'build': build(rest[0]); break;
  case 'stills': {
    const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
    await stills(rest[0], { only: flag('--only'), at: flag('--at') });
    break;
  }
  case 'render': await render(rest[0], outArg); break;
  case 'doctor': doctor(); break;
  case 'setup': setup(process.argv.slice(3)); break;
  case 'voices': console.log(run('say', ['-v', '?']).split('\n').filter((l) => / en_/.test(l)).join('\n')); break;
  default:
    console.log(`usage: cv <command>
  init <slug>             scaffold projects/<slug>/video.json
  setup                   create .venv with mlx-audio (Kokoro TTS + Whisper speech check)
  build <spec|slug>       narrate (local TTS), verify speech, compute timing -> build/props.json
  stills <spec|slug> [--only id,id] [--at 0.95]  build + PNGs + contact.png for review
  render <spec|slug> [--out file.mp4]   build + render MP4 (+ .srt) to $CV_OUT_DIR
  doctor                  check prerequisites and chosen voice
  voices                  list English say voices`);
}
