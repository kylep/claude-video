import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { TransitionSeries, linearTiming, springTiming } from '@remotion/transitions';
import type { TransitionPresentation } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { flip } from '@remotion/transitions/flip';
import { clockWipe } from '@remotion/transitions/clock-wipe';
import { iris } from '@remotion/transitions/iris';
import { LightLeak } from '@remotion/light-leaks';
import { Starburst } from '@remotion/starburst';
import { createTikTokStyleCaptions } from '@remotion/captions';
import type { Caption as WordCaption } from '@remotion/captions';
import { useAudioData, visualizeAudio } from '@remotion/media-utils';
import { measureText } from '@remotion/layout-utils';
import { sceneComponents } from './scenes';
import { colors, fonts, useFontsReady } from './theme';
import type { Music, Scene, Transition, VideoProps } from './types';

const FADE = 8;
const TICKER_H = 58;

// Narration audio, scene sound effects and captions for one scene.
const SceneFrame: React.FC<{
  scene: Scene; accent: string; showCaptions: boolean; captionStyle: 'box' | 'word'; news: boolean;
  fadeIn: boolean; fadeOut: boolean; visible: number;
}> = ({ scene, accent, showCaptions, captionStyle, news, fadeIn, fadeOut, visible }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = visible;
  const opacity = interpolate(frame, [0, FADE, d - FADE, d], [fadeIn ? 0 : 1, 1, 1, fadeOut ? 0 : 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const Comp = sceneComponents[scene.type];
  const cap = scene.captions.find((c) => frame >= c.start && frame < c.end);
  const capBottom = news ? TICKER_H + 40 : 64;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity }}>
        <Comp scene={scene} accent={accent} />
      </AbsoluteFill>
      {scene.segments.map((s) => (
        <Sequence key={`${s.index}-${s.from}`} from={s.from} durationInFrames={s.durationInFrames + 2} layout="none">
          <Audio src={staticFile(s.audio)} />
          {news && <NarratorBars src={staticFile(s.audio)} accent={accent} />}
        </Sequence>
      ))}
      {(scene.sfx ?? []).filter((x) => x.src).map((x, i) => (
        <Sequence key={`sfx${i}`} from={x.at !== undefined ? Math.round(x.at * fps) : (scene.cues[x.cue ?? 0] ?? 0)} layout="none">
          <Audio src={staticFile(x.src!)} volume={x.volume ?? 0.35} />
        </Sequence>
      ))}
      {showCaptions && captionStyle === 'word' && <WordCaptions scene={scene} accent={accent} bottom={capBottom} />}
      {showCaptions && captionStyle === 'box' && cap && (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: capBottom }}>
          <div style={{
            maxWidth: 1500, padding: '14px 30px', borderRadius: 14, background: 'rgba(8,9,12,.82)',
            fontFamily: fonts.sans, fontSize: 36, lineHeight: 1.3, color: colors.text, textAlign: 'center',
          }}>{cap.text}</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// TikTok-style captions (@remotion/captions): words light up as they're spoken. Word times are
// spread across each caption chunk by length, which tracks Kokoro's even pacing closely.
const WordCaptions: React.FC<{ scene: Scene; accent: string; bottom: number }> = ({ scene, accent, bottom }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pages = useMemo(() => {
    const words: WordCaption[] = [];
    for (const c of scene.captions) {
      const parts = c.text.split(/\s+/).filter(Boolean);
      const total = parts.reduce((a, w) => a + w.length + 1, 0);
      let t = (c.start / fps) * 1000;
      const span = ((c.end - c.start) / fps) * 1000;
      parts.forEach((w, i) => {
        const len = (span * (w.length + 1)) / total;
        words.push({ text: `${i || words.length ? ' ' : ''}${w}`, startMs: t, endMs: t + len, timestampMs: t + len / 2, confidence: null });
        t += len;
      });
    }
    return createTikTokStyleCaptions({ captions: words, combineTokensWithinMilliseconds: 1400 }).pages;
  }, [scene.captions, fps]);
  const ms = (frame / fps) * 1000;
  const page = pages.find((p) => ms >= p.startMs && ms < p.startMs + p.durationMs);
  if (!page) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: bottom }}>
      <div style={{
        maxWidth: 1500, padding: '12px 28px', borderRadius: 14, background: 'rgba(8,9,12,.78)', whiteSpace: 'pre-wrap',
        fontFamily: fonts.sans, fontWeight: 800, fontSize: 44, lineHeight: 1.25, textAlign: 'center', letterSpacing: -0.5,
      }}>
        {page.tokens.map((t, i) => {
          const active = ms >= t.fromMs && ms < t.toMs;
          const said = ms >= t.toMs;
          return <span key={i} style={{ color: active ? accent : said ? colors.text : 'rgba(236,238,244,.45)' }}>{t.text}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

// Live narrator level meter (@remotion/media-utils) beside the voice name.
const NarratorBars: React.FC<{ src: string; accent: string }> = ({ src, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioData = useAudioData(src);
  if (!audioData) return null;
  const bars = visualizeAudio({ fps, frame, audioData, numberOfSamples: 32, smoothing: true }).slice(1, 15);
  return (
    <div style={{ position: 'absolute', right: 48, bottom: TICKER_H + 24, height: 40, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
      {bars.map((v, i) => (
        <div key={i} style={{ width: 6, borderRadius: 3, background: accent, height: Math.max(4, Math.min(40, Math.sqrt(v) * 90)) }} />
      ))}
    </div>
  );
};

// Background music: looped, faded in and out, ducked smoothly whenever narration plays.
const DUCK_RAMP = 9; // frames to ease into/out of a duck
const MusicBed: React.FC<{ music: Music; total: number; fps: number }> = ({ music, total, fps }) => {
  // f is relative to this bed's start; speech ranges are absolute.
  const level = (f: number) => {
    let gap = Infinity; // frames to the nearest narration (0 while speaking)
    const abs = f + music.from;
    for (const [a, b] of music.speech) {
      if (abs >= a && abs < b) { gap = 0; break; }
      gap = Math.min(gap, abs < a ? a - abs : abs - b + 1);
    }
    const len = music.to - music.from;
    const atStart = music.from === 0; const atEnd = music.to >= total;
    const fadeIn = atStart ? fps * 1.5 : fps * 0.8; const fadeOut = atEnd ? fps * 2.5 : fps * 0.8;
    const duck = interpolate(gap, [0, DUCK_RAMP], [music.duck, 1], { extrapolateRight: 'clamp' });
    const fade = interpolate(f, [0, fadeIn, len - fadeOut, len], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return music.volume * duck * fade;
  };
  return (
    <Sequence from={music.from} durationInFrames={Math.max(1, music.to - music.from)} layout="none">
      <Audio src={staticFile(music.src)} loop volume={level} />
    </Sequence>
  );
};

// "voice: <name>": on the opening scene and wherever the narrator changes (always on in news mode).
const VoiceLabel: React.FC<{ label: string; until: number; accent: string; news: boolean }> = ({ label, until, accent, news }) => {
  const frame = useCurrentFrame();
  const opacity = news ? interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' })
    : interpolate(frame, [10, 25, until - 15, until], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', right: news ? 200 : 48, bottom: news ? TICKER_H + 28 : 22, opacity, fontFamily: fonts.mono, fontSize: 24, color: colors.muted }}>
      voice: <span style={{ color: accent }}>{label}</span>
    </div>
  );
};

// News ticker crawl along the bottom; text width from @remotion/layout-utils measureText.
const Ticker: React.FC<{ items: string[]; accent: string; date?: string }> = ({ items, accent, date }) => {
  const frame = useCurrentFrame();
  const text = items.join('   •   ') + '   •   ';
  const fontSize = 26;
  const ready = useFontsReady();
  const w = useMemo(() => measureText({ text, fontFamily: fonts.sans, fontSize, fontWeight: '600' }).width, [text, ready]);
  const x = -((frame * 3.2) % Math.max(1, w));
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 6, height: TICKER_H, display: 'flex', alignItems: 'center', background: 'rgba(10,11,15,.94)', borderTop: `2px solid ${accent}` }}>
      <div style={{ zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', padding: '0 26px', background: accent, color: '#0b0c10', fontFamily: fonts.mono, fontWeight: 700, fontSize: 24, letterSpacing: 3 }}>
        {date ?? 'THIS WEEK'}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', height: '100%', display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', whiteSpace: 'pre', transform: `translateX(${x}px)`, fontFamily: fonts.sans, fontWeight: 600, fontSize, color: colors.text }}>
          <span>{text}</span><span>{text}</span><span>{text}</span>
        </div>
      </div>
    </div>
  );
};

const DOM_PRESENTATIONS: Record<string, (t: Transition, w: number, h: number) => TransitionPresentation<Record<string, unknown>>> = {
  fade: () => fade() as never,
  slide: (t) => slide({ direction: t.direction ?? 'from-right' }) as never,
  wipe: (t) => wipe({ direction: t.direction ?? 'from-left' }) as never,
  flip: (t) => flip({ direction: t.direction ?? 'from-right' }) as never,
  clockWipe: (_t, w, h) => clockWipe({ width: w, height: h }) as never,
  iris: (_t, w, h) => iris({ width: w, height: h }) as never,
};
const OVERLAYS = new Set(['lightLeak', 'starburst']);
export const transitionFrames = (t?: Transition) => (t && !OVERLAYS.has(t.type) && DOM_PRESENTATIONS[t.type] ? t.frames ?? 18 : 0);

export const Tutorial: React.FC<VideoProps> = ({ title, accent, scenes, showCaptions, captionStyle, music, fps, chrome, ticker, date }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const news = chrome === 'news';
  const total = scenes.reduce((a, s) => a + s.durationInFrames, 0) || 1;
  // A presentation transition overlaps two scenes by T frames. Each scene is padded by the T of the
  // transition that follows it, so every scene still starts at its original frame and the audio,
  // music ducking and .srt timings stay exactly where cv build put them.
  const children: React.ReactNode[] = [];
  scenes.forEach((s, i) => {
    const T = i < scenes.length - 1 ? transitionFrames(s.transition) : 0;
    const prevT = i > 0 ? transitionFrames(scenes[i - 1].transition) : 0;
    children.push(
      <TransitionSeries.Sequence key={s.id} durationInFrames={s.durationInFrames + T}>
        <SceneFrame scene={s} accent={accent} showCaptions={showCaptions} captionStyle={captionStyle ?? 'box'} news={news}
          fadeIn={!prevT && !(i > 0 && OVERLAYS.has(scenes[i - 1].transition?.type ?? ''))} fadeOut={!T} visible={s.durationInFrames + T} />
        {(news || s.voiceTag) && <VoiceLabel label={s.voiceName ?? s.voiceTag ?? ''} until={s.durationInFrames + T} accent={accent} news={news} />}
      </TransitionSeries.Sequence>,
    );
    if (i === scenes.length - 1 || !s.transition) return;
    const t = s.transition;
    if (T) {
      children.push(
        <TransitionSeries.Transition key={`${s.id}-t`} presentation={DOM_PRESENTATIONS[t.type](t, width, height)}
          timing={t.type === 'flip' || t.type === 'slide' ? springTiming({ config: { damping: 200 }, durationInFrames: T }) : linearTiming({ durationInFrames: T })} />,
      );
    } else if (OVERLAYS.has(t.type)) {
      const len = t.frames ?? 40;
      children.push(
        <TransitionSeries.Overlay key={`${s.id}-o`} durationInFrames={len}>
          <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none', opacity: 0.8 }}>
            {t.type === 'lightLeak'
              ? <LightLeak seed={i} hueShift={(i * 47) % 360} />
              : <StarburstFlash accent={accent} len={len} />}
          </AbsoluteFill>
        </TransitionSeries.Overlay>,
      );
    }
  });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1400px 900px at 15% 0%, ${colors.bg2}, ${colors.bg})` }}>
      <TransitionSeries>{children}</TransitionSeries>
      <div style={{ position: 'absolute', top: 44, left: 150, fontFamily: fonts.mono, fontSize: 22, color: colors.muted, letterSpacing: 2, textTransform: 'uppercase' }}>
        {title}
      </div>
      {news && ticker?.length ? <Ticker items={ticker} accent={accent} date={date} /> : null}
      {(music ?? []).map((m, i) => <MusicBed key={i} music={m} total={total} fps={fps} />)}
      <div style={{ position: 'absolute', left: 0, bottom: 0, height: 6, width: `${(frame / total) * 100}%`, background: accent }} />
    </AbsoluteFill>
  );
};

// A quick radial burst across a cut: rays flare up then fade.
const StarburstFlash: React.FC<{ accent: string; len: number }> = ({ accent, len }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, len / 2, len], [0, 0.55, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Starburst rays={18} colors={[accent, '#0b0c10']} rotation={frame * 2} vignette={0.6} />
    </AbsoluteFill>
  );
};
