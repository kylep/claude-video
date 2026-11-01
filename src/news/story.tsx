// Story-family news scenes: story, screen, gif, rundown, signoff.
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AbsoluteFill, Solid, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { fitText, fitTextOnNLines, measureText } from '@remotion/layout-utils';
import { createRoundedTextBox } from '@remotion/rounded-text-box';
import {
  Box as RnBox, Bracket as RnBracket, Circle as RnCircle, Highlight as RnHighlight,
  StrikeThrough as RnStrike, Underline as RnUnderline,
} from '@remotion/rough-notation';
import { AnimatedEmoji } from '@remotion/animated-emoji';
import { interpolateStyles, makeTransform, scale, translateX, translateY } from '@remotion/animation-utils';
import { gridlines, rings } from '@remotion/effects';
import { dotGrid } from '@remotion/effects/dot-grid';
import { halftone } from '@remotion/effects/halftone';
import { noise } from '@remotion/effects/noise';
import { scanlines } from '@remotion/effects/scanlines';
import { MacOSCursor, resolveCursor } from '@remotion/mac-cursors';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { Gif } from '@remotion/gif';
import { useGsapTimeline } from '@remotion/gsap';
import { RemotionRiveCanvas } from '@remotion/rive';
import { SAFE, colors, down, fonts, itemFrame, up, useEnter, type P } from './common';
import { useFontsReady } from '../theme';
import type { Bg, Mark, MarkKind, Stat } from './types';

const W = 1920;
const H = 1080;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

// ---------------------------------------------------------------- background

const hexA = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const v = parseInt(n, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
};

// @remotion/effects on a <Solid>. Each variant is tuned dark and low-contrast so text stays readable.
const NewsBg: React.FC<{ bg?: Bg; accent: string }> = ({ bg = 'grid', accent }) => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.35) % 64;
  let effects: React.ComponentProps<typeof Solid>['effects'] = [];
  let color = colors.bg;
  if (bg === 'grid') {
    effects = [gridlines({ gridSize: 64, lineWidth: 1.5, lineColor: hexA(accent, 0.22), rotationX: 58, perspective: 900, offsetY: drift, offsetX: 0 })];
  } else if (bg === 'dots') {
    color = '#2a2d3a';
    effects = [dotGrid({ dotSize: 5, gridSize: 36 })];
  } else if (bg === 'rings') {
    effects = [rings({ colors: [colors.bg, '#12141b'], thickness: 90, gap: 0, offset: -frame * 0.6, center: [0.82, 0.5] })];
  } else if (bg === 'scanlines') {
    color = '#14161e';
    effects = [scanlines({ amount: 0.22, spacing: 5, thickness: 1.5, offset: frame * 0.2 })];
  } else if (bg === 'halftone') {
    color = hexA(accent, 0.1);
    effects = [halftone({ dotSize: 9, dotSpacing: 24, rotation: 30, shape: 'circle', colorMode: 'solid', dotColor: hexA(accent, 0.3) })];
  } else if (bg === 'noise') {
    effects = [noise({ amount: 0.12, seed: frame % 12 })];
  }
  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      {bg !== 'none' && <Solid width={W} height={H} color={color} effects={effects} />}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse at 20% 15%, ${hexA(accent, 0.14)}, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(0,0,0,0.55), transparent 60%)`,
      }} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------- kicker

// Lower-third tag drawn as ONE rounded path around kicker (+ place) via @remotion/rounded-text-box.
const RoundedTag: React.FC<{ kicker?: string; place?: string; accent: string }> = ({ kicker, place, accent }) => {
  const p = useEnter(0, 16);
  const ready = useFontsReady();
  const geo = useMemo(() => {
    if (!kicker || !ready) return null;
    const lines = [kicker.toUpperCase(), ...(place ? [place.toUpperCase()] : [])];
    const sizes = [30, 22];
    const pad = 22;
    const meas = lines.map((t, i) => {
      const m = measureText({ text: t, fontFamily: fonts.mono, fontSize: sizes[i], fontWeight: 700, letterSpacing: i === 0 ? '4px' : '3px' });
      return { width: m.width + 4 * t.length * 0 + pad * 0, height: i === 0 ? 54 : 44 };
    });
    const box = createRoundedTextBox({ textMeasurements: meas, textAlign: 'left', horizontalPadding: pad, borderRadius: 14 });
    return { lines, sizes, meas, box };
  }, [kicker, place, ready]);
  if (!geo) return null;
  const { box, lines, sizes, meas } = geo;
  const bb = box.boundingBox;
  let y = 0;
  return (
    <div style={{ position: 'relative', width: bb.width, height: bb.height, opacity: p, transform: `translateX(${(1 - p) * -60}px)`, flexShrink: 0 }}>
      <svg width={bb.width} height={bb.height} viewBox={`${bb.x1} ${bb.y1} ${bb.width} ${bb.height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d={box.d} fill={accent} />
      </svg>
      {lines.map((t, i) => {
        const top = y;
        y += meas[i].height;
        return (
          <div key={i} style={{
            position: 'absolute', left: 22, top, height: meas[i].height, display: 'flex', alignItems: 'center',
            fontFamily: fonts.mono, fontWeight: 700, fontSize: sizes[i], letterSpacing: i === 0 ? 4 : 3,
            color: i === 0 ? '#0b0c10' : 'rgba(11,12,16,0.72)', whiteSpace: 'nowrap',
          }}>{t}</div>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------- annotations

const NOTE: Record<MarkKind, React.FC<any>> = {
  highlight: RnHighlight, underline: RnUnderline, circle: RnCircle, box: RnBox, strike: RnStrike, bracket: RnBracket,
};
const NOTE_COLOR: Record<MarkKind, (accent: string) => string> = {
  highlight: (a) => hexA(a, 0.5), underline: () => '#ffd84d', circle: () => '#ffd84d', box: () => '#7dd3fc', strike: () => down, bracket: () => '#ffd84d',
};

// Splits `text` into plain runs and rough-notation-wrapped phrases (first verbatim match per mark).
const Annotated: React.FC<{ text: string; marks: Mark[]; scene: P['scene']; accent: string; baseCue: number; delay?: number }> = ({
  text, marks, scene, accent, baseCue, delay = 10,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hits = marks
    .map((m, i) => ({ m, i, at: text.indexOf(m.text) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  hits.forEach(({ m, i, at }) => {
    if (at < pos) return;
    if (at > pos) parts.push(text.slice(pos, at));
    const kind = m.kind ?? 'highlight';
    const Cmp = NOTE[kind];
    const start = itemFrame(scene, m.cue ?? baseCue + i) + delay;
    const progress = spring({ frame: frame - start, fps, config: { damping: 200 }, durationInFrames: 22 });
    const color = m.color ?? NOTE_COLOR[kind](accent);
    const extra = kind === 'highlight' ? { padding: { left: 6, right: 6, top: 2, bottom: 2 } } : kind === 'underline' ? { strokeWidth: 6 } : { strokeWidth: 5, padding: { left: 10, right: 10, top: 4, bottom: 4 } };
    parts.push(
      <Cmp key={`m${i}`} progress={progress} color={color} seed={7 + i} {...extra}>
        <span>{m.text}</span>
      </Cmp>,
    );
    pos = at + m.text.length;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
};

// -------------------------------------------------------------- stat callout

const StatCard: React.FC<{ stat: Stat; accent: string; at: number }> = ({ stat, accent, at }) => {
  const frame = useCurrentFrame() - at;
  const style = interpolateStyles(
    frame,
    [0, 16, 26],
    [
      { opacity: 0, transform: makeTransform([translateY(60), scale(0.86)]) },
      { opacity: 1, transform: makeTransform([translateY(-8), scale(1.04)]) },
      { opacity: 1, transform: makeTransform([translateY(0), scale(1)]) },
    ],
    clamp,
  );
  const d = stat.delta;
  const col = d == null ? accent : d >= 0 ? up : down;
  return (
    <div style={{
      ...style, width: 480, padding: '28px 36px 32px', borderRadius: 24, background: 'rgba(23,25,34,0.88)',
      border: `2px solid ${hexA(col, 0.55)}`, boxShadow: `0 18px 60px rgba(0,0,0,0.5), 0 0 50px ${hexA(col, 0.18)}`,
    }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 24, letterSpacing: 4, color: colors.muted, textTransform: 'uppercase' }}>{stat.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 6 }}>
        <div style={{ fontFamily: fonts.sans, fontWeight: 800, fontSize: 108, letterSpacing: -3, lineHeight: 1.05, color: colors.text }}>{stat.value}</div>
      </div>
      {d != null && (
        <div style={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 34, color: col, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 30 }}>{d >= 0 ? '▲' : '▼'}</span>{d >= 0 ? '+' : ''}{d}%
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------- points

const Points: React.FC<{ scene: P['scene']; accent: string; size?: number; marks: Mark[]; gap?: number }> = ({ scene, accent, size = 40, marks, gap = 22 }) => {
  const frame = useCurrentFrame();
  const pts = scene.points ?? [];
  const latest = pts.reduce((acc, _, i) => (frame >= itemFrame(scene, i) ? i : acc), -1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {pts.map((t, i) => (
        <PointRow key={i} at={itemFrame(scene, i)} active={i === latest} accent={accent} size={size}>
          <Annotated text={t} marks={marks} scene={scene} accent={accent} baseCue={i} />
        </PointRow>
      ))}
    </div>
  );
};

const PointRow: React.FC<{ at: number; active: boolean; accent: string; size: number; children: React.ReactNode }> = ({ at, active, accent, size, children }) => {
  const p = useEnter(at, 20);
  return (
    <div style={{
      display: 'flex', gap: 22, alignItems: 'flex-start', opacity: p * (active ? 1 : 0.72),
      transform: `translateX(${(1 - p) * 70}px)`, fontFamily: fonts.sans, fontSize: size, fontWeight: 600, lineHeight: 1.25, color: colors.text,
    }}>
      <div style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, background: active ? accent : hexA(accent, 0.4), flexShrink: 0 }} />
      <div>{children}</div>
    </div>
  );
};

// ----------------------------------------------------------------- headline

const Headline: React.FC<{ scene: P['scene']; accent: string; width: number; maxLines?: number; maxFont?: number }> = ({
  scene, accent, width, maxLines = 3, maxFont = 104,
}) => {
  const text = scene.headline ?? scene.title ?? '';
  const ready = useFontsReady();
  const fit = useMemo(
    () => !ready ? { fontSize: 60, lines: [text] } : fitTextOnNLines({ text, maxLines, maxBoxWidth: width, fontFamily: fonts.sans, fontWeight: 800, letterSpacing: '-2px', maxFontSize: maxFont }),
    [text, maxLines, width, maxFont, ready],
  );
  // A phrase that wraps across lines is split into one fragment per line (same kind, cue and colour).
  const lineMarks = useMemo(() => {
    const all = scene.marks ?? [];
    let cursor = 0;
    return fit.lines.map((ln) => {
      const start = text.indexOf(ln, cursor);
      const from = start < 0 ? cursor : start;
      cursor = from + ln.length;
      const out: Mark[] = [];
      all.forEach((m, i) => {
        const at = text.indexOf(m.text);
        if (at < 0) return;
        const a = Math.max(at, from);
        const b = Math.min(at + m.text.length, from + ln.length);
        if (b > a) out.push({ ...m, text: text.slice(a, b), cue: m.cue ?? i });
      });
      return out;
    });
  }, [fit.lines, text, scene.marks]);
  // layout-utils lays the lines out; then the real DOM width is checked once so a line can never overrun its column.
  const ref = useRef<HTMLDivElement>(null);
  const [shrink, setShrink] = useState(1);
  useLayoutEffect(() => {
    const widest = Math.max(0, ...Array.from(ref.current?.querySelectorAll('[data-line]') ?? []).map((n) => (n as HTMLElement).getBoundingClientRect().width));
    const w = ref.current?.getBoundingClientRect().width ?? 0;
    // getBoundingClientRect is affected by ancestor transforms only; the scene root is untransformed.
    if (widest > 0 && w > 0) setShrink((s) => Math.min(1, (s * width) / widest));
  }, [fit.fontSize, text, width, ready]);
  return (
    <div ref={ref} style={{ fontFamily: fonts.sans, fontWeight: 800, fontSize: fit.fontSize * shrink, letterSpacing: -2, lineHeight: 1.1, color: colors.text }}>
      {fit.lines.map((ln, i) => (
        <HeadLine key={i} at={4 + i * 4}>
          <span data-line style={{ display: 'inline-block' }}>
            <Annotated text={ln} marks={lineMarks[i]} scene={scene} accent={accent} baseCue={0} delay={14} />
          </span>
        </HeadLine>
      ))}
    </div>
  );
};

const HeadLine: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const p = useEnter(at, 22);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 40}px)`, whiteSpace: 'nowrap', padding: '2px 0' }}>{children}</div>;
};

// -------------------------------------------------------------------- story

export const StoryScene: React.FC<P> = ({ scene, accent }) => {
  const hasSide = !!(scene.stat || scene.emoji);
  const textW = hasSide ? 1120 : W - SAFE.side * 2 - 80;
  const marks = scene.marks ?? [];
  return (
    <AbsoluteFill style={{ fontFamily: fonts.sans, color: colors.text, }}>
      <NewsBg bg={scene.bg} accent={accent} />
      <AbsoluteFill style={{ padding: `${SAFE.top}px ${SAFE.side}px ${SAFE.bottom}px`, flexDirection: 'row', gap: 70, alignItems: 'center' }}>
        <div style={{ width: textW, display: 'flex', flexDirection: 'column', gap: 34 }}>
          <RoundedTag kicker={scene.kicker} place={scene.place} accent={accent} />
          <Headline scene={scene} accent={accent} width={textW} />
          {!!scene.points?.length && <Points scene={scene} accent={accent} marks={marks} size={hasSide ? 38 : 42} />}
        </div>
        {hasSide && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34 }}>
            {scene.emoji && <EmojiBadge name={scene.emoji} />}
            {scene.stat && <StatCard stat={scene.stat} accent={accent} at={14} />}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const EmojiBadge: React.FC<{ name: any; size?: number }> = ({ name, size = 220 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - 6, fps, config: { damping: 10, mass: 0.8 } });
  return (
    <div style={{ width: size, height: size, transform: `scale(${p}) rotate(${(1 - p) * -25}deg)`, filter: 'drop-shadow(0 14px 30px rgba(0,0,0,0.5))' }}>
      <AnimatedEmoji emoji={name} scale="1" style={{ width: size, height: size }} />
    </div>
  );
};

// ------------------------------------------------------------------- screen

const WIN = { x: 200, y: 215, w: 1520, h: 610, chrome: 112 };

export const ScreenScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pts = scene.points ?? [];
  const n = Math.max(pts.length, 1);
  const bodyH = WIN.h - WIN.chrome;
  const listW = 640;
  const rowH = Math.min(100, (bodyH - 48) / n);
  const rowTop = (i: number) => 24 + i * rowH;
  const rowPoint = (i: number) => ({ x: WIN.x + 30 + listW * 0.82, y: WIN.y + WIN.chrome + rowTop(i) + rowH / 2 });

  const fly = spring({ frame: frame - 2, fps, config: { damping: 16, mass: 1.1 }, durationInFrames: 34 });
  const cuePts = pts.map((_, i) => itemFrame(scene, i));
  // Cursor: starts parked bottom-right of window, glides to each row (arrives at its cue), presses on click.
  const park = { x: WIN.x + WIN.w - 140, y: WIN.y + WIN.h - 60 };
  const stops = [{ f: 0, ...park }];
  pts.forEach((_, i) => {
    const prevF = stops[stops.length - 1].f;
    const prev = i === 0 ? park : rowPoint(i - 1);
    const depart = Math.max(prevF + 2, cuePts[i] - 3 - 26);
    const arrive = Math.max(cuePts[i] - 3, depart + 6);
    stops.push({ f: depart, ...prev }, { f: arrive, ...rowPoint(i) });
  });
  const sf = stops.map((s) => s.f);
  const cx = interpolate(frame, sf, stops.map((s) => s.x), { ...clamp, easing: ease });
  const cy = interpolate(frame, sf, stops.map((s) => s.y), { ...clamp, easing: ease });
  const activeIdx = cuePts.reduce((a, c, i) => (frame >= c ? i : a), -1);
  const click = activeIdx >= 0 ? frame - cuePts[activeIdx] : 99;
  const pressed = click >= -3 && click < 5;
  const overRow = activeIdx >= 0 || frame > 30;
  const curIn = interpolate(frame, [26, 36], [0, 1], clamp);
  const cursorName = pressed || (activeIdx >= 0 && click < 14) ? 'pointer' : overRow && frame > 30 ? 'default' : 'default';
  const hot = resolveCursor(cursorName)?.hotspot ?? { x: 0, y: 0 };
  const S = 2.3;

  return (
    <AbsoluteFill style={{ fontFamily: fonts.sans, color: colors.text }}>
      <NewsBg bg={scene.bg ?? 'dots'} accent={accent} />
      <div style={{ position: 'absolute', left: SAFE.side, top: SAFE.top - 4, right: SAFE.side, display: 'flex', alignItems: 'center', gap: 28 }}>
        <RoundedTag kicker={scene.kicker} place={scene.place} accent={accent} />
        <HeadlineLine scene={scene} width={W - SAFE.side * 2 - 360} />
      </div>
      <CameraMotionBlur shutterAngle={140} samples={8}>
        <AbsoluteFill style={{ perspective: 2400 }}>
          <div style={{
            position: 'absolute', left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, borderRadius: 22, overflow: 'hidden',
            background: '#14161d', border: `1.5px solid ${colors.border}`,
            boxShadow: `0 40px 120px rgba(0,0,0,0.65), 0 0 90px ${hexA(accent, 0.12)}`,
            transform: `translateY(${(1 - fly) * 520}px) rotateX(${(1 - fly) * 28}deg) scale(${0.9 + fly * 0.1})`,
            transformOrigin: '50% 100%', opacity: Math.min(1, fly * 2),
          }}>
            <BrowserChrome url={scene.url} />
            <div style={{ position: 'relative', height: bodyH, display: 'flex' }}>
              <div style={{ width: listW + 60, padding: '24px 30px', borderRight: `1px solid ${colors.border}`, background: '#10121a', position: 'relative' }}>
                {pts.map((t, i) => {
                  const on = activeIdx >= i;
                  const sel = activeIdx === i;
                  const pop = spring({ frame: frame - cuePts[i], fps, config: { damping: 12 } });
                  return (
                    <div key={i} style={{
                      position: 'absolute', left: 30, width: listW, top: rowTop(i), height: rowH - 12, borderRadius: 14,
                      display: 'flex', alignItems: 'center', gap: 18, padding: '0 22px', boxSizing: 'border-box',
                      background: sel ? hexA(accent, 0.28) : on ? hexA(accent, 0.1) : colors.panel,
                      border: `2px solid ${sel ? accent : on ? hexA(accent, 0.4) : colors.border}`,
                      transform: `scale(${sel && frame >= cuePts[i] ? 1 + 0.025 * Math.min(pop, 1) : 1})`,
                      fontSize: 31, fontWeight: 600,
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: on ? accent : 'transparent', border: `2px solid ${on ? accent : colors.muted}`, color: '#0b0c10', fontWeight: 800, fontSize: 24,
                      }}>{on ? '✓' : ''}</div>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: on ? colors.text : colors.muted }}>{t}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ flex: 1, padding: '44px 56px', position: 'relative' }}>
                <DetailPane scene={scene} accent={accent} idx={activeIdx} />
              </div>
            </div>
          </div>
        </AbsoluteFill>
      </CameraMotionBlur>
      <div style={{ position: 'absolute', left: cx, top: cy, opacity: curIn, pointerEvents: 'none' }}>
        {pressed && click >= 0 && (
          <div style={{
            position: 'absolute', left: -40, top: -40, width: 80, height: 80, borderRadius: 40,
            border: `4px solid ${accent}`, opacity: 1 - click / 5, transform: `scale(${0.4 + click * 0.3})`,
          }} />
        )}
        <div style={{
          position: 'absolute', left: -hot.x * S, top: -hot.y * S, transformOrigin: `${hot.x}px ${hot.y}px`,
          transform: `scale(${S * (pressed ? 0.88 : 1)})`, filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.5))',
        }}>
          <MacOSCursor cursor={cursorName} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const HeadlineLine: React.FC<{ scene: P['scene']; width: number }> = ({ scene, width }) => {
  const p = useEnter(3);
  const ready = useFontsReady();
  const text = scene.headline ?? '';
  const fontSize = useMemo(
    () => (text && ready ? Math.min(60, fitText({ text, withinWidth: width * 0.91, fontFamily: fonts.sans, fontWeight: 800, letterSpacing: '-1px' }).fontSize) : 40),
    [text, width, ready],
  );
  if (!text) return null;
  return <div style={{ fontWeight: 800, fontSize, letterSpacing: -1, whiteSpace: 'nowrap', opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>{text}</div>;
};

const BrowserChrome: React.FC<{ url?: string }> = ({ url }) => (
  <div style={{ background: '#1b1e29', borderBottom: `1px solid ${colors.border}` }}>
    <div style={{ height: 50, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px' }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />)}
      <div style={{ marginLeft: 24, padding: '8px 22px', borderRadius: '10px 10px 0 0', background: '#252938', fontSize: 18, color: colors.muted }}>{url ? url.replace(/^https?:\/\//, '').split('/')[0] : 'New Tab'}</div>
    </div>
    <div style={{ height: 62, display: 'flex', alignItems: 'center', gap: 18, padding: '0 22px 10px' }}>
      <span style={{ color: colors.muted, fontSize: 26 }}>‹  ›  ⟳</span>
      <div style={{ flex: 1, height: 42, borderRadius: 21, background: '#0e0f13', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', padding: '0 20px', fontFamily: fonts.mono, fontSize: 21, color: colors.muted }}>
        <span style={{ color: up, marginRight: 10 }}>🔒</span>{url ?? ''}
      </div>
    </div>
  </div>
);

const DetailPane: React.FC<{ scene: P['scene']; accent: string; idx: number }> = ({ scene, accent, idx }) => {
  const frame = useCurrentFrame();
  const pts = scene.points ?? [];
  const at = idx >= 0 ? itemFrame(scene, idx) : 0;
  const p = ease(interpolate(frame - at, [0, 14], [0, 1], clamp));
  return (
    <div>
      <div style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: 4, color: colors.muted, textTransform: 'uppercase' }}>
        {idx >= 0 ? `Step ${idx + 1} of ${pts.length}` : scene.kicker ?? 'Overview'}
      </div>
      <div style={{ marginTop: 22, opacity: idx >= 0 ? p : 0.4, transform: `translateY(${(1 - p) * 24}px)`, fontSize: 62, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.15 }}>
        {idx >= 0 ? pts[idx] : scene.headline}
      </div>
      <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[0.92, 0.7, 0.82].map((w, i) => (
          <div key={i} style={{ height: 16, width: `${w * 100}%`, borderRadius: 8, background: i === 0 && idx >= 0 ? hexA(accent, 0.45 * p + 0.1) : '#222635' }} />
        ))}
      </div>
    </div>
  );
};

// --------------------------------------------------------------------- gif

export const GifScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const marks = scene.marks ?? [];
  const panelW = 760;
  const textW = W - SAFE.side * 2 - panelW - 70;
  const p = useEnter(8, 18);
  return (
    <AbsoluteFill style={{ fontFamily: fonts.sans, color: colors.text }}>
      <NewsBg bg={scene.bg ?? 'scanlines'} accent={accent} />
      <AbsoluteFill style={{ padding: `${SAFE.top}px ${SAFE.side}px ${SAFE.bottom}px`, flexDirection: 'row', gap: 70, alignItems: 'center' }}>
        <div style={{ width: textW, display: 'flex', flexDirection: 'column', gap: 32 }}>
          <RoundedTag kicker={scene.kicker} place={scene.place} accent={accent} />
          <Headline scene={scene} accent={accent} width={textW} maxFont={88} />
          {!!scene.points?.length && <Points scene={scene} accent={accent} marks={marks} size={36} gap={18} />}
        </div>
        <div style={{ flex: 1, opacity: p, transform: `translateX(${(1 - p) * 120}px) rotate(${(1 - p) * 2}deg)` }}>
          <div style={{
            position: 'relative', borderRadius: 26, overflow: 'hidden', border: `3px solid ${accent}`, background: '#05060a',
            boxShadow: `0 30px 90px rgba(0,0,0,0.6), 0 0 80px ${hexA(accent, 0.2)}`, aspectRatio: '8 / 5',
          }}>
            {scene.gif && <Gif src={staticFile(scene.gif)} fit="cover" width={panelW} height={panelW * 0.625} style={{ width: '100%', height: '100%', display: 'block' }} />}
            {scene.place && (
              <div style={{ position: 'absolute', right: 18, bottom: 16, padding: '5px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.65)', fontFamily: fonts.mono, fontSize: 20, letterSpacing: 3, textTransform: 'uppercase' }}>{scene.place}</div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ rundown

export const RundownScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = scene.items ?? [];
  const cues = items.map((_, i) => itemFrame(scene, i));
  const ref = useGsapTimeline<HTMLDivElement>(
    ({ timeline, selector }) => {
      items.forEach((_, i) => {
        const t = cues[i] / fps;
        timeline.fromTo(selector(`.row-${i}`), { x: -140, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.55, ease: 'power3.out' }, t);
        timeline.fromTo(selector(`.txt-${i}`), { x: 60, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: 'power2.out' }, t + 0.12);
      });
      timeline.fromTo(selector('.head'), { y: -40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: 'power3.out' }, 0);
    },
    { dependencies: [fps, cues.join(','), items.length] },
  );
  const latest = cues.reduce((a, c, i) => (frame >= c ? i : a), -1);
  const size = Math.min(54, Math.floor(560 / Math.max(items.length, 1) * 0.72));
  return (
    <AbsoluteFill style={{ fontFamily: fonts.sans, color: colors.text }}>
      <NewsBg bg={scene.bg ?? 'grid'} accent={accent} />
      <AbsoluteFill style={{ padding: `${SAFE.top}px ${SAFE.side}px ${SAFE.bottom}px`, justifyContent: 'center' }}>
        <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
          <div className="head" style={{ visibility: 'hidden' }}>
            <RoundedTag kicker={scene.kicker ?? 'Rundown'} place={scene.place} accent={accent} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items.map((t, i) => {
              const f = frame - cues[i];
              const badge = interpolateStyles(f, [0, 8, 18], [
                { transform: makeTransform([scale(0.2)]), opacity: 0 },
                { transform: makeTransform([scale(1.25)]), opacity: 1 },
                { transform: makeTransform([scale(1)]), opacity: 1 },
              ], clamp);
              const bar = interpolateStyles(f, [0, 20], [
                { transform: makeTransform([translateX(-100)]) }, { transform: makeTransform([translateX(0)]) },
              ], clamp);
              return (
                <div key={i} className={`row-${i}`} style={{
                  visibility: 'hidden', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 28,
                  padding: '0 36px 0 20px', height: size * 1.9, borderRadius: 18,
                  background: i === latest ? hexA(accent, 0.2) : 'rgba(28,31,42,0.82)',
                  border: `2px solid ${i === latest ? accent : colors.border}`,
                }}>
                  <div style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: '100%', background: accent, opacity: 0.85, transform: bar.transform }} />
                  <div style={{
                    ...badge, width: size * 1.15, height: size * 1.15, borderRadius: size * 0.3, background: accent, color: '#0b0c10',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.mono, fontWeight: 700, fontSize: size * 0.7, flexShrink: 0,
                  }}>{i + 1}</div>
                  <div className={`txt-${i}`} style={{ fontSize: size, fontWeight: 700, letterSpacing: -0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ signoff

export const SignoffScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useEnter(6, 20);
  const s = useEnter(18, 20);
  const w = 1000;
  const ready = useFontsReady();
  const fs = useMemo(
    () => !ready ? 100 : Math.min(120, fitText({ text: scene.title ?? '', withinWidth: w, fontFamily: fonts.sans, fontWeight: 800, letterSpacing: '-3px' }).fontSize),
    [scene.title, ready],
  );
  const pulse = 1 + 0.04 * Math.sin((frame / fps) * 2.4);
  return (
    <AbsoluteFill style={{ fontFamily: fonts.sans, color: colors.text }}>
      <NewsBg bg={scene.bg ?? 'rings'} accent={accent} />
      <AbsoluteFill style={{ padding: `${SAFE.top}px ${SAFE.side}px ${SAFE.bottom}px`, flexDirection: 'row', alignItems: 'center', gap: 40 }}>
        <div style={{ width: w }}>
          <div style={{ width: 120, height: 10, borderRadius: 5, background: accent, marginBottom: 36, transform: `scaleX(${t})`, transformOrigin: 'left' }} />
          <div style={{ fontSize: fs, fontWeight: 800, letterSpacing: -3, lineHeight: 1.05, whiteSpace: 'nowrap', opacity: t, transform: `translateY(${(1 - t) * 40}px)` }}>{scene.title}</div>
          {scene.subtitle && (
            <div style={{ marginTop: 28, fontSize: 44, fontWeight: 400, color: colors.muted, opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>{scene.subtitle}</div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: useEnter(4, 22) }}>
          {scene.rive ? (
            <div style={{ width: 620, height: 620, borderRadius: 40, overflow: 'hidden', boxShadow: `0 30px 90px rgba(0,0,0,0.6), 0 0 90px ${hexA(accent, 0.25)}` }}>
              <RemotionRiveCanvas src={staticFile(scene.rive)} fit="cover" alignment="center" style={{ width: '100%', height: '100%' }} />
            </div>
          ) : (
            <div style={{ width: 620, height: 620 }}><FallbackMark accent={accent} frame={frame} pulse={pulse} /></div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const FallbackMark: React.FC<{ accent: string; frame: number; pulse: number }> = ({ accent, frame, pulse }) => (
  <svg viewBox="-200 -200 400 400" style={{ width: '100%', height: '100%' }}>
    {[160, 110, 60].map((r, i) => (
      <circle key={r} r={r * pulse} fill="none" stroke={accent} strokeOpacity={0.9 - i * 0.25} strokeWidth={8} strokeDasharray={`${40 + i * 20} 24`} transform={`rotate(${frame * (i % 2 ? -1.2 : 1.2) * (i + 1)})`} />
    ))}
    <circle r={28} fill={accent} />
  </svg>
);
