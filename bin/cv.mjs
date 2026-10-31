#!/usr/bin/env node
// cv: spec-driven tutorial videos. video.json -> `say` narration -> Remotion render.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutScene, pickVoice, splitSegments, toSrt } from '../lib/timing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT_DIR = process.env.CV_OUT_DIR ?? path.join(os.homedir(), 'gh', 'reports', 'video');
const FPS = 30;
const TYPES = ['title', 'bullets', 'code', 'terminal', 'flow', 'image', 'clip', 'outro'];
const ITEMS = { bullets: 'bullets', terminal: 'lines', flow: 'steps' };

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
  const ids = new Set();
  (spec.scenes ?? []).forEach((s, i) => {
    const at = `scenes[${i}]${s.id ? ` (${s.id})` : ''}`;
    if (!s.id) errs.push(`${at}: id is required`);
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
    if (s.type === 'code' && !s.code) errs.push(`${at}: code is required`);
    if (s.type === 'code' && s.code) {
      const lines = s.code.split('\n');
      const max = lines.length > 14 ? 90 : lines.length > 8 ? 75 : 62;
      lines.forEach((l, n) => { if (l.length > max) errs.push(`${at}: code line ${n + 1} is ${l.length} chars (max ${max} at this size); shorten it`); });
      if (lines.length > 18) errs.push(`${at}: ${lines.length} code lines; keep it under 18 or split the scene`);
    }
  });
  if (errs.length) die(`invalid spec:\n  - ${errs.join('\n  - ')}`);
}

let voiceCache;
function resolveVoice(spec) {
  if (spec.voice && spec.voice !== 'auto') return spec.voice;
  voiceCache ??= pickVoice(run('say', ['-v', '?']));
  return voiceCache;
}

function speak(text, { voice, rate, outDir }) {
  const key = createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex').slice(0, 16);
  const wav = path.join(outDir, `${key}.wav`);
  if (!fs.existsSync(wav)) {
    const txt = path.join(outDir, `${key}.txt`);
    const aiff = path.join(outDir, `${key}.aiff`);
    fs.writeFileSync(txt, text);
    run('say', ['-v', voice, '-r', String(rate), '-f', txt, '-o', aiff]);
    run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', aiff, wav]);
    fs.rmSync(aiff);
    fs.rmSync(txt);
  }
  const m = run('afinfo', [wav]).match(/estimated duration:\s*([\d.]+)/);
  if (!m) die(`could not read duration of ${wav}`);
  return { file: wav, key, seconds: Number(m[1]) };
}

// Remotion ships ffmpeg/ffprobe in a platform package; call it directly (no Homebrew ffmpeg needed).
function ffprobe(args) {
  const dir = path.join(ROOT, 'node_modules', '@remotion', `compositor-${process.platform}-${process.arch}`);
  return run(path.join(dir, 'ffprobe'), ['-v', 'error', ...args], { env: { ...process.env, DYLD_LIBRARY_PATH: dir } });
}

const mediaSeconds = (file) => Number(ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim()) || 0;

function sayable(text, pronounce = {}) {
  let t = text;
  for (const [word, sounds] of Object.entries(pronounce)) t = t.replace(new RegExp(`\\b${word}\\b`, 'g'), sounds);
  return t;
}

// Build props.json: narration audio per [[next]] segment, cue frames, captions.
function build(arg) {
  const { dir, spec } = resolveSpec(arg);
  validate(spec);
  const voice = resolveVoice(spec);
  const rate = spec.rate ?? 185;
  const pubRel = spec.slug;
  const pubDir = path.join(PUBLIC, pubRel);
  fs.mkdirSync(path.join(pubDir, 'assets'), { recursive: true });

  const scenes = spec.scenes.map((s) => {
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
    const segTexts = splitSegments(s.narration);
    const audio = segTexts.map((t) => (t ? speak(sayable(t, spec.pronounce), { voice, rate, outDir: pubDir }) : null));
    const layout = layoutScene(segTexts, audio.map((a) => a?.seconds ?? 0), { fps: FPS, minFrames });
    scene.durationInFrames = layout.durationInFrames;
    scene.cues = layout.cues;
    scene.captions = layout.captions;
    scene.segments = layout.segments.map((seg) => ({ ...seg, audio: `${pubRel}/${audio[seg.index].key}.wav` }));
    return scene;
  });

  const props = {
    title: spec.title,
    fps: FPS,
    width: 1920,
    height: 1080,
    accent: spec.accent ?? '#d97757',
    showCaptions: spec.captions ?? true,
    scenes,
  };
  const buildDir = path.join(dir, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'props.json'), JSON.stringify(props, null, 2));

  const total = scenes.reduce((a, s) => a + s.durationInFrames, 0) / FPS;
  console.log(`voice: ${voice} @ ${rate} wpm`);
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
  fs.writeFileSync(file, JSON.stringify(tpl, null, 2) + '\n');
  console.log(file);
}

function doctor() {
  const checks = [
    ['say', () => run('which', ['say'])],
    ['afconvert', () => run('which', ['afconvert'])],
    ['afinfo', () => run('which', ['afinfo'])],
    ['magick (contact sheets)', () => run('which', ['magick'])],
    ['node_modules', () => { if (!fs.existsSync(path.join(ROOT, 'node_modules', 'remotion'))) throw new Error('run npm ci'); }],
  ];
  let ok = true;
  for (const [name, fn] of checks) {
    try { fn(); console.log(`ok   ${name}`); } catch (e) { ok = false; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
  }
  const voice = pickVoice(run('say', ['-v', '?']));
  console.log(`voice: ${voice}${/Premium|Enhanced/.test(voice) ? '' : '  (tip: install a Premium voice in System Settings > Accessibility > Spoken Content)'}`);
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
  case 'voices': console.log(run('say', ['-v', '?']).split('\n').filter((l) => / en_/.test(l)).join('\n')); break;
  default:
    console.log(`usage: cv <command>
  init <slug>             scaffold projects/<slug>/video.json
  build <spec|slug>       narrate with say, compute timing -> build/props.json
  stills <spec|slug>      build + one PNG per scene + contact.png for review
  render <spec|slug> [--out file.mp4]   build + render MP4 (+ .srt) to $CV_OUT_DIR
  doctor                  check prerequisites and chosen voice
  voices                  list English say voices`);
}
