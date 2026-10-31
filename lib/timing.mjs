// Pure timing helpers: no I/O, so they're unit-testable.

export const CUE = /\[\[next\]\]/g;

// Split narration on [[next]] markers. A leading marker yields an empty first
// segment, which means "reveal item 0 the moment the scene starts".
export function splitSegments(narration) {
  return narration.split(CUE).map((s) => s.replace(/\s+/g, ' ').trim());
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
export function layoutScene(segTexts, segDurations, { fps, leadIn = 0.35, gap = 0.12, tail = 0.7, minFrames = 0 }) {
  const f = (s) => Math.round(s * fps);
  let cursor = f(leadIn);
  const segments = [];
  const cues = [];
  const captions = [];
  segTexts.forEach((text, i) => {
    if (i > 0) cues.push(cursor);
    const dur = f(segDurations[i]);
    if (text) {
      segments.push({ index: i, from: cursor, durationInFrames: dur });
      captions.push(...timeCaptions(text, cursor, dur));
      cursor += dur + f(gap);
    }
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
