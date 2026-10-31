// Pure timing helpers: no I/O, so they're unit-testable.

export const CUE = /\[\[next\]\]/g;

// Words Kokoro gets wrong in every video. A spec's own "pronounce" map is
// applied on top and can override these. Audio only: captions keep the
// real spelling.
export const DEFAULT_PRONOUNCE = {
  LEDs: 'L E Dees', // not "leads"
  LED: 'L E D',     // not "lead" (the metal)
  JSON: 'jay-sawn', // not "J S O N"
};

// Spoken form of a narration segment. Longer keys first so "LEDs" wins over "LED".
export function sayable(text, pronounce = {}) {
  const map = { ...DEFAULT_PRONOUNCE, ...pronounce };
  let t = text;
  for (const word of Object.keys(map).sort((a, b) => b.length - a.length)) {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\b${esc}\\b`, 'g'), map[word]);
  }
  return t;
}

// Step-only effects that never stay on the board.
const TRANSIENT = new Set(['glow', 'strip', 'flow']);

// Parts already on the board when breadboard scene i starts: every non-glow
// item from earlier breadboard scenes, reset by a scene with "fresh": true.
export function boardBase(scenes, i) {
  let base = [];
  for (let k = 0; k < i; k++) {
    const s = scenes[k];
    if (s.type !== 'breadboard') continue;
    if (s.fresh) base = [];
    for (const g of s.groups ?? []) base.push(...g.items.filter((it) => !TRANSIENT.has(it.kind)));
  }
  return scenes[i].fresh ? [] : base;
}

// Absolute [from, to) frame ranges where narration is playing.
export function speechRanges(scenes) {
  const out = [];
  let offset = 0;
  for (const s of scenes) {
    for (const seg of s.segments) out.push([offset + seg.from, offset + seg.from + seg.durationInFrames]);
    offset += s.durationInFrames;
  }
  return out;
}

// Split narration on [[next]] markers. A leading marker yields an empty first
// segment, which means "reveal item 0 the moment the scene starts".
export function splitSegments(narration) {
  return narration.split(CUE).map((s) => s.replace(/\s+/g, ' ').trim());
}

// "[[pause 4]]" inside a segment: that many seconds of silence (e.g. after a
// question to the viewer). Splits a segment into spoken parts.
export const PAUSE = /\[\[pause\s+(\d+(?:\.\d+)?)\]\]/g;

export function splitPauses(segment) {
  const parts = [];
  let last = 0;
  for (const m of segment.matchAll(PAUSE)) {
    parts.push({ text: segment.slice(last, m.index).trim(), pauseAfter: Number(m[1]) });
    last = m.index + m[0].length;
  }
  parts.push({ text: segment.slice(last).trim(), pauseAfter: 0 });
  return parts;
}

export function sentences(text) {
  const parts = text.match(/[^.!?]+[.!?]*["')\]]*\s*/g) ?? [];
  return parts.map((s) => s.trim()).filter(Boolean);
}

// Chunk long sentences so a caption never exceeds maxWords on screen.
export function captionChunks(text, maxWords = 12) {
  const out = [];
  for (const s of sentences(text)) {
    const words = s.split(' ');
    const n = Math.ceil(words.length / maxWords);
    const per = Math.ceil(words.length / n);
    for (let i = 0; i < words.length; i += per) out.push(words.slice(i, i + per).join(' '));
  }
  return out;
}

// Distribute captions across a segment proportionally to character count.
export function timeCaptions(text, fromFrame, durationFrames) {
  const chunks = captionChunks(text);
  const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
  let cursor = fromFrame;
  return chunks.map((c, i) => {
    const len = i === chunks.length - 1
      ? fromFrame + durationFrames - cursor
      : Math.round((c.length / total) * durationFrames);
    const cap = { text: c, start: cursor, end: cursor + len };
    cursor += len;
    return cap;
  });
}

// Lay out one scene: segment audio placed back to back after a lead-in,
// cue frames at each segment boundary, captions inside each segment.
// segDurations are in seconds (measured from the real audio files).
// segDurations[i] is either seconds for the whole segment, or the segment's
// parts: [{ text, seconds, pauseAfter }] (see splitPauses). During a pause the
// last caption stays on screen so the viewer can read the question.
export function layoutScene(segTexts, segDurations, { fps, leadIn = 0.35, gap = 0.12, tail = 0.7, minFrames = 0 }) {
  const f = (s) => Math.round(s * fps);
  let cursor = f(leadIn);
  const segments = [];
  const cues = [];
  const captions = [];
  segTexts.forEach((text, i) => {
    if (i > 0) cues.push(cursor);
    const parts = Array.isArray(segDurations[i])
      ? segDurations[i]
      : [{ text, seconds: segDurations[i], pauseAfter: 0 }];
    parts.forEach((p, k) => {
      if (p.text) {
        const dur = f(p.seconds);
        segments.push({ index: i, part: k, from: cursor, durationInFrames: dur });
        captions.push(...timeCaptions(p.text, cursor, dur));
        cursor += dur + f(gap);
      }
      if (p.pauseAfter) {
        const hold = f(p.pauseAfter);
        if (p.text && captions.length) captions[captions.length - 1].end += f(gap) + hold;
        cursor += hold;
      }
    });
  });
  const durationInFrames = Math.max(cursor - f(gap) + f(tail), minFrames);
  return { segments, cues, captions, durationInFrames };
}

export function srtTime(frames, fps) {
  const ms = Math.round((frames / fps) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

export function toSrt(scenes, fps) {
  let offset = 0;
  let n = 0;
  const lines = [];
  for (const s of scenes) {
    for (const c of s.captions) {
      lines.push(String(++n), `${srtTime(offset + c.start, fps)} --> ${srtTime(offset + c.end, fps)}`, c.text, '');
    }
    offset += s.durationInFrames;
  }
  return lines.join('\n');
}

// Pick the best installed `say` voice: Premium > Enhanced > preferred compact.
export function pickVoice(sayListing, preferred = ['Ava', 'Zoe', 'Evan', 'Nathan', 'Samantha']) {
  const names = sayListing.split('\n').map((l) => {
    const m = l.match(/^(.+?)\s{2,}(\w\w_\w\w)\s/);
    return m ? { name: m[1].trim(), locale: m[2] } : null;
  }).filter((v) => v && v.locale.startsWith('en_'));
  for (const tier of ['(Premium)', '(Enhanced)', '']) {
    for (const p of preferred) {
      const hit = names.find((v) => v.name.startsWith(p) && v.name.includes(tier) && (tier || !v.name.includes('(')));
      if (hit) return hit.name;
    }
    if (tier) {
      const any = names.find((v) => v.name.includes(tier) && v.locale === 'en_US');
      if (any) return any.name;
    }
  }
  return 'Samantha';
}

// Random voice from the skill's voices.json: excluded voices never, preferred ones 3x as likely.
export function pickRandomVoice({ pool, excluded = {}, preferred = {} }, rand = Math.random) {
  const weighted = pool.filter((v) => !(v in excluded)).flatMap((v) => (v in preferred ? [v, v, v] : [v]));
  if (!weighted.length) throw new Error('voices.json: every voice in the pool is excluded');
  return weighted[Math.floor(rand() * weighted.length)];
}
