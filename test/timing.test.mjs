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
