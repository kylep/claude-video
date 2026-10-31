#!/usr/bin/env node
// cv: spec-driven tutorial videos. video.json -> local TTS narration -> Remotion render.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardBase, layoutScene, pickRandomVoice, pickVoice, sayable, speechRanges, splitPauses, splitSegments, toSrt } from '../lib/timing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT_DIR = process.env.CV_OUT_DIR ?? path.join(os.homedir(), 'gh', 'reports', 'video');
const FPS = 30;
const TYPES = ['title', 'bullets', 'code', 'terminal', 'flow', 'image', 'clip', 'breadboard', 'diagram', 'outro'];
const ITEMS = { bullets: 'bullets', terminal: 'lines', flow: 'steps', breadboard: 'groups', diagram: 'callouts' };
const BOARD_KINDS = ['pico', 'wire', 'resistor', 'led', 'transistor', 'buzzer', 'glow', 'strip', 'flow'];
const ANCHORS = { led: ['dome', 'anode', 'cathode', 'flat'], resistor: ['bands', 'left', 'right', 'body'], transistor: ['flat', 'e', 'b', 'c'] };
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
// Voice pool + the user's voice feedback live with the skill so feedback steers random picks.
const VOICES_FILE = path.join(ROOT, 'skill', 'tutorial-video', 'voices.json');
const randomVoice = () => pickRandomVoice(JSON.parse(fs.readFileSync(VOICES_FILE, 'utf8')));

const die = (msg) => { console.error(`cv: ${msg}`); process.exit(1); };
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });

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
          const need = { wire: 2, resistor: 2, led: 2, transistor: 3, buzzer: 2, strip: 1 }[it.kind];
          if (need && (it.at ?? []).length !== need) errs.push(`${where}: ${it.kind} needs ${need} holes in "at"`);
          if (it.kind === 'flow' && (it.at ?? []).length < 2) errs.push(`${where}: flow needs at least 2 points in "at"`);
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
// No voice in the spec: pick a random kokoro voice and write it back, so rebuilds,
// stills and the final render all use the same (cached) voice.
function pinVoice(file, spec) {
  if ((spec.tts ?? 'kokoro') !== 'kokoro' || (spec.voice && spec.voice !== 'auto')) return;
  spec.voice = randomVoice();
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.voice = spec.voice;
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
  console.log(`voice: randomly picked ${spec.voice} (saved to ${path.relative(ROOT, file)}; set "voice" to override)`);
}

function resolveTts(spec) {
  const engine = spec.tts ?? 'kokoro';
  if (engine === 'say') {
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
    verify: spec.verify ?? true,
  };
}

const ttsKey = (tts, text) =>
  createHash('sha1').update(JSON.stringify([tts.engine, tts.voice, tts.rate, tts.speed, tts.instruct, text])).digest('hex').slice(0, 16);

const wavSeconds = (wav) => {
  const m = run('afinfo', [wav]).match(/estimated duration:\s*([\d.]+)/);
  if (!m) die(`could not read duration of ${wav}`);
  return Number(m[1]);
};

// Synthesize every uncached clip. jobs: [{key, text (spoken form), ref (caption form)}].
function synthesize(jobs, tts, outDir) {
  const todo = jobs.filter((j) => !fs.existsSync(path.join(outDir, `${j.key}.wav`)));
  if (!todo.length) return;
  console.log(`tts: ${tts.engine}${tts.voice ? ` / ${tts.voice}` : ''}: generating ${todo.length} clip(s)...`);
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
    model: tts.model, voice: tts.voice, speed: tts.speed, instruct: tts.instruct, verify: tts.verify,
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
  if (tts.verify) console.log(`tts: speech check passed (Whisper transcript within ${MAX_WER * 100}% word error)`);
}

// Remotion ships ffmpeg/ffprobe in a platform package; call it directly (no Homebrew ffmpeg needed).
function ffprobe(args) {
  const dir = path.join(ROOT, 'node_modules', '@remotion', `compositor-${process.platform}-${process.arch}`);
  return run(path.join(dir, 'ffprobe'), ['-v', 'error', ...args], { env: { ...process.env, DYLD_LIBRARY_PATH: dir } });
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
  const segs = spec.scenes.map((s) => splitSegments(s.narration).map((t) => splitPauses(t).map((p) => (p.text
    ? { key: ttsKey(tts, sayable(p.text, spec.pronounce)), text: sayable(p.text, spec.pronounce), ref: p.text, pauseAfter: p.pauseAfter }
    : { key: null, ref: '', pauseAfter: p.pauseAfter }))));
  synthesize(segs.flat(2).filter((j) => j.key), tts, pubDir);

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
    if (s.type === 'breadboard') scene.base = boardBase(spec.scenes, si);
    const segTexts = splitSegments(s.narration);
    const audio = segs[si].map((parts) => parts.map((j) => ({
      key: j.key, text: j.ref, pauseAfter: j.pauseAfter,
      seconds: j.key ? wavSeconds(path.join(pubDir, `${j.key}.wav`)) : 0,
    })));
    const layout = layoutScene(segTexts, audio, { fps: FPS, minFrames });
    scene.durationInFrames = layout.durationInFrames;
    scene.cues = layout.cues;
    scene.captions = layout.captions;
    scene.segments = layout.segments.map((seg) => ({ ...seg, audio: `${pubRel}/${audio[seg.index][seg.part].key}.wav` }));
    return scene;
  });

  let music;
  if (spec.music) {
    const src = path.resolve(dir, spec.music.src);
    if (!fs.existsSync(src)) die(`music src not found: ${src}`);
    const name = path.basename(src);
    fs.copyFileSync(src, path.join(pubDir, 'assets', name));
    music = {
      src: `${pubRel}/assets/${name}`,
      volume: spec.music.volume ?? 0.16,
      duck: spec.music.duck ?? 0.4,
      speech: speechRanges(scenes),
    };
  }

  const props = {
    title: spec.title,
    fps: FPS,
    width: 1920,
    height: 1080,
    accent: spec.accent ?? '#d97757',
    showCaptions: spec.captions ?? true,
    voiceLabel: tts.engine === 'kokoro' ? tts.voice : `${tts.engine}/${tts.voice ?? 'default'}`,
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
async function stills(arg) {
  const { props, buildDir } = build(arg);
  const { renderStill } = await import('@remotion/renderer');
  const { serveUrl, composition } = await bundleAndSelect(props);
  const outDir = path.join(buildDir, 'stills');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let offset = 0;
  const files = [];
  for (const [i, s] of props.scenes.entries()) {
    const frame = offset + Math.floor(s.durationInFrames * 0.7);
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
  run('magick', [...rows, '-append', sheet]);
  console.log(`stills: ${outDir}\ncontact sheet: ${sheet}`);
}

async function render(arg, outArg) {
  const { spec, props } = build(arg);
  const { renderMedia } = await import('@remotion/renderer');
  const { serveUrl, composition } = await bundleAndSelect(props);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.resolve(outArg ?? path.join(OUT_DIR, `${spec.slug}.mp4`));
  let last = -1;
  await renderMedia({
    serveUrl, composition, inputProps: props, codec: 'h264', crf: 20, outputLocation: out,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== last) { last = pct; process.stdout.write(`render ${pct}%\n`); }
    },
  });
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
  tpl.voice = randomVoice();
  fs.writeFileSync(file, JSON.stringify(tpl, null, 2) + '\n');
  console.log(file);
}

function setup() {
  if (!fs.existsSync(VENV_PY)) run('uv', ['venv', '-q', '--python', '3.12', path.join(ROOT, '.venv')], { stdio: 'inherit' });
  run('uv', ['pip', 'install', '-q', '--python', VENV_PY, '-r', path.join(ROOT, 'requirements.txt')], { stdio: 'inherit' });
  // Warm-up downloads the Kokoro weights, the spaCy model misaki needs, and Whisper for the speech check.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-setup-'));
  const tts = { engine: 'kokoro', ...ENGINES.kokoro, speed: 1, instruct: null, verify: true };
  synthesize([{ key: 'warmup', text: 'Setup complete.', ref: 'Setup complete.' }], tts, tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('setup ok: kokoro + speech check ready');
}

function doctor() {
  const checks = [
    ['say', () => run('which', ['say'])],
    ['afconvert', () => run('which', ['afconvert'])],
    ['afinfo', () => run('which', ['afinfo'])],
    ['magick (contact sheets)', () => run('which', ['magick'])],
    ['neural TTS env (.venv)', () => { if (!fs.existsSync(VENV_PY)) throw new Error('run: node bin/cv.mjs setup'); }],
    ['node_modules', () => { if (!fs.existsSync(path.join(ROOT, 'node_modules', 'remotion'))) throw new Error('run npm ci'); }],
  ];
  let ok = true;
  for (const [name, fn] of checks) {
    try { fn(); console.log(`ok   ${name}`); } catch (e) { ok = false; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
  }
  console.log(`default tts: kokoro / ${ENGINES.kokoro.voice}  (alternatives: qwen3, chatterbox, say)`);
  console.log(`output dir: ${OUT_DIR}`);
  if (!ok) process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
const outIdx = rest.indexOf('--out');
const outArg = outIdx >= 0 ? rest[outIdx + 1] : undefined;
switch (cmd) {
  case 'init': init(rest[0]); break;
  case 'build': build(rest[0]); break;
  case 'stills': await stills(rest[0]); break;
  case 'render': await render(rest[0], outArg); break;
  case 'doctor': doctor(); break;
  case 'setup': setup(); break;
  case 'voices': console.log(run('say', ['-v', '?']).split('\n').filter((l) => / en_/.test(l)).join('\n')); break;
  default:
    console.log(`usage: cv <command>
  init <slug>             scaffold projects/<slug>/video.json
  setup                   create .venv with mlx-audio (Kokoro TTS + Whisper speech check)
  build <spec|slug>       narrate (local TTS), verify speech, compute timing -> build/props.json
  stills <spec|slug>      build + one PNG per scene + contact.png for review
  render <spec|slug> [--out file.mp4]   build + render MP4 (+ .srt) to $CV_OUT_DIR
  doctor                  check prerequisites and chosen voice
  voices                  list English say voices`);
}
