import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSegments, captionChunks, layoutScene, srtTime, toSrt, pickVoice } from '../lib/timing.mjs';

test('splitSegments keeps a leading empty segment for an immediate cue', () => {
  assert.deepEqual(splitSegments('[[next]] One. [[next]]Two.'), ['', 'One.', 'Two.']);
  assert.deepEqual(splitSegments('Intro text.'), ['Intro text.']);
});

test('captionChunks caps words per caption', () => {
  const long = Array.from({ length: 25 }, (_, i) => `w${i}`).join(' ') + '.';
  const chunks = captionChunks(long, 12);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((c) => c.split(' ').length <= 12));
});

test('layoutScene places cues at segment boundaries and covers all audio', () => {
  const fps = 30;
  const r = layoutScene(['Intro.', 'First.', 'Second.'], [2, 1, 1], { fps, leadIn: 0.5, gap: 0, tail: 1 });
  assert.deepEqual(r.cues, [75, 105]);
  assert.equal(r.segments.length, 3);
  assert.equal(r.durationInFrames, 15 + 60 + 30 + 30 + 30);
  const last = r.captions.at(-1);
  assert.equal(last.end, 135);
});

test('leading cue fires at lead-in', () => {
  const r = layoutScene(['', 'A.'], [0, 1], { fps: 30, leadIn: 0.5, gap: 0, tail: 0 });
  assert.deepEqual(r.cues, [15]);
  assert.equal(r.segments.length, 1);
});

test('minFrames extends short scenes (e.g. clips)', () => {
  const r = layoutScene(['A.'], [1], { fps: 30, leadIn: 0, gap: 0, tail: 0, minFrames: 300 });
  assert.equal(r.durationInFrames, 300);
});

test('srt formatting and offsets across scenes', () => {
  assert.equal(srtTime(45, 30), '00:00:01,500');
  const srt = toSrt([
    { durationInFrames: 30, captions: [{ text: 'a', start: 0, end: 30 }] },
    { durationInFrames: 30, captions: [{ text: 'b', start: 0, end: 15 }] },
  ], 30);
  assert.match(srt, /2\n00:00:01,000 --> 00:00:01,500\nb/);
});

test('pickVoice prefers premium, falls back to Samantha', () => {
  const listing = [
    'Daniel              en_GB    # Hello',
    'Samantha            en_US    # Hello',
    'Zoe (Premium)       en_US    # Hello',
  ].join('\n');
  assert.equal(pickVoice(listing), 'Zoe (Premium)');
  assert.equal(pickVoice('Samantha            en_US    # Hi'), 'Samantha');
});

import { pickRandomVoice } from '../lib/timing.mjs';

test('pickRandomVoice skips excluded and weights preferred', () => {
  const cfg = { pool: ['a', 'b', 'c'], excluded: { b: 'no' }, preferred: { c: 'yes' } };
  const seen = new Set();
  for (let i = 0; i < 4; i++) seen.add(pickRandomVoice(cfg, () => i / 4));
  assert.deepEqual([...seen].sort(), ['a', 'c']);
  assert.equal(pickRandomVoice(cfg, () => 0.99), 'c');
  assert.throws(() => pickRandomVoice({ pool: ['a'], excluded: { a: 'x' } }));
});

test('boardBase carries parts forward between breadboard scenes, skipping glows', async () => {
  const { boardBase } = await import('../lib/timing.mjs');
  const pico = { kind: 'pico', col: 1 };
  const wire = { kind: 'wire', at: ['j1', 'far+:1'] };
  const glow = { kind: 'glow', id: 'red' };
  const scenes = [
    { type: 'title' },
    { type: 'breadboard', groups: [{ items: [pico] }] },
    { type: 'bullets' },
    { type: 'breadboard', groups: [{ items: [wire, glow] }] },
    { type: 'breadboard', groups: [{ items: [glow] }] },
    { type: 'breadboard', fresh: true, groups: [{ items: [wire] }] },
  ];
  assert.deepEqual(boardBase(scenes, 1), []);
  assert.deepEqual(boardBase(scenes, 3), [pico]);
  assert.deepEqual(boardBase(scenes, 4), [pico, wire]);
  assert.deepEqual(boardBase(scenes, 5), []);
});

test('speechRanges offsets segments by scene start', async () => {
  const { speechRanges } = await import('../lib/timing.mjs');
  const r = speechRanges([
    { durationInFrames: 100, segments: [{ from: 10, durationInFrames: 30 }, { from: 50, durationInFrames: 20 }] },
    { durationInFrames: 60, segments: [{ from: 5, durationInFrames: 40 }] },
  ]);
  assert.deepEqual(r, [[10, 40], [50, 70], [105, 145]]);
});

test('sayable applies default pronunciations, longest first, spec overrides win', async () => {
  const { sayable } = await import('../lib/timing.mjs');
  assert.equal(sayable('Three LEDs, one LED, a JSON file.'), 'Three L E Dees, one L E D, a jay-sawn file.');
  assert.equal(sayable('LEDGER and BLED stay put.'), 'LEDGER and BLED stay put.');
  assert.equal(sayable('The LED in Remotion', { LED: 'light', Remotion: 'Ree-motion' }), 'The light in Ree-motion');
});

test('boardBase drops strip and flow effects', async () => {
  const { boardBase } = await import('../lib/timing.mjs');
  const wire = { kind: 'wire', at: ['a1', 'a5'] };
  const scenes = [
    { type: 'breadboard', groups: [{ items: [wire, { kind: 'strip', at: ['a1'] }, { kind: 'flow', at: ['a1', 'a5'] }] }] },
    { type: 'breadboard', groups: [{ items: [{ kind: 'glow', id: 'x' }] }] },
  ];
  assert.deepEqual(boardBase(scenes, 1), [wire]);
});

test('splitPauses splits a segment into spoken parts with silences', async () => {
  const { splitPauses } = await import('../lib/timing.mjs');
  assert.deepEqual(splitPauses('Which leg is plus? [[pause 4]] The long leg.'), [
    { text: 'Which leg is plus?', pauseAfter: 4 },
    { text: 'The long leg.', pauseAfter: 0 },
  ]);
  assert.deepEqual(splitPauses('No pauses here.'), [{ text: 'No pauses here.', pauseAfter: 0 }]);
  assert.deepEqual(splitPauses('Think. [[pause 2.5]]'), [{ text: 'Think.', pauseAfter: 2.5 }, { text: '', pauseAfter: 0 }]);
});

test('layoutScene inserts pause silence and keeps the question caption up', async () => {
  const fps = 30;
  const r = layoutScene(['Q?', ''], [[{ text: 'Q?', seconds: 1, pauseAfter: 4 }, { text: 'A.', seconds: 1, pauseAfter: 0 }], 0],
    { fps, leadIn: 0, gap: 0, tail: 0 });
  assert.deepEqual(r.segments.map((s) => [s.part, s.from]), [[0, 0], [1, 150]]);
  assert.equal(r.captions[0].end, 150);  // "Q?" stays on screen through the pause
  assert.equal(r.durationInFrames, 180);
});

test('boardBase applies remove steps', async () => {
  const { boardBase } = await import('../lib/timing.mjs');
  const led = { kind: 'led', at: ['e28', 'e29'] };
  const wire = { kind: 'wire', at: ['a29', 'near-:29'] };
  const scenes = [
    { type: 'breadboard', groups: [{ items: [led, wire] }] },
    { type: 'breadboard', groups: [{ items: [{ kind: 'remove', at: ['e28', 'e29'] }] }] },
    { type: 'breadboard', groups: [] },
  ];
  assert.deepEqual(boardBase(scenes, 2), [wire]);
});
