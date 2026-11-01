import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { evolvePath, getLength, getPointAtLength, interpolatePath } from '@remotion/paths';
import { fitText } from '@remotion/layout-utils';
import { Arrow, Pie, Star, Triangle } from '@remotion/shapes';
import { Trail } from '@remotion/motion-blur';
import { useGsapTimeline } from '@remotion/gsap';
import { AnimatedEmoji } from '@remotion/animated-emoji';
import { useFontsReady } from '../theme';
import { P, SAFE, Kicker, colors, fonts, down, itemFrame, up, useEnter } from './common';

const AMBER = '#fbbf24';
const mono = fonts.mono;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const dirColor = (n: number) => (n >= 0 ? up : down);
const signed = (n: number, d = 1) => `${n > 0 ? '+' : ''}${n.toFixed(d)}`;

// Headline sized to fit one line inside `width`, capped at `max` px.
const FitHeadline: React.FC<{ text: string; width: number; max?: number }> = ({ text, width, max = 88 }) => {
  const p = useEnter(4);
  const ready = useFontsReady();
  const size = useMemo(() => {
    try {
      return Math.min(max, fitText({ text, withinWidth: width, fontFamily: fonts.sans, fontWeight: 800, letterSpacing: '-2px', validateFontIsLoaded: false }).fontSize);
    } catch {
      return max;
    }
  }, [text, width, max, ready]);
  return (
    <div style={{ fontSize: size, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, whiteSpace: 'nowrap', opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
      {text}
    </div>
  );
};

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ padding: `${SAFE.top}px ${SAFE.side}px ${SAFE.bottom}px`, fontFamily: fonts.sans, color: colors.text, display: 'flex', flexDirection: 'column', gap: 22 }}>
    {children}
  </AbsoluteFill>
);

/* ------------------------------ MARKET ------------------------------ */

const SERIES_COLORS = ['#60a5fa', '#c084fc', '#fbbf24', '#2dd4bf'];

export const MarketScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const days = scene.days ?? [];
  const series = scene.series ?? [];
  const stats = scene.stats ?? [];

  const W = 1120, H = 470, L = 90, R = 150, T = 20, B = 50;
  const pct = series.map((s) => s.values.map((v) => ((v - s.values[0]) / s.values[0]) * 100));
  const all = pct.flat().concat(0);
  const lo = Math.floor(Math.min(...all) - 0.3), hi = Math.ceil(Math.max(...all) + 0.3);
  const n = Math.max(days.length, ...series.map((s) => s.values.length), 2);
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const yTicks: number[] = [];
  // ~4-8 gridlines whatever the range (a fixed step would draw thousands for extreme series).
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((st) => (hi - lo) / st <= 8) ?? Math.ceil((hi - lo) / 8);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);

  // End labels: nudge apart so close finishers stay legible.
  const labelY = pct.map((v) => y(v[v.length - 1]) + 8);
  [...labelY.keys()].sort((a, b) => labelY[a] - labelY[b]).forEach((k, j, order) => {
    if (j > 0 && labelY[k] - labelY[order[j - 1]] < 32) labelY[k] = labelY[order[j - 1]] + 32;
  });
  const paths = pct.map((vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' '));
  const flat = pct.map((vals) => vals.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(0).toFixed(1)}`).join(' '));
  const area = (p: string, vals: number[]) => `${p} L${x(vals.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const gridIn = useEnter(2);
  const rows = Math.max(stats.length, 1);

  return (
    <Frame>
      <Kicker text={scene.kicker ?? 'MARKETS'} accent={accent} place={scene.place} />
      {scene.headline && <FitHeadline text={scene.headline} width={1680} />}
      <div style={{ display: 'flex', gap: 40, flex: 1, minHeight: 0, alignItems: 'center' }}>
        <div style={{ background: colors.bg2, border: `1px solid ${colors.border}`, borderRadius: 20, padding: 12, opacity: gridIn }}>
          <svg width={W} height={H} style={{ display: 'block' }}>
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#5b6173' : colors.border} strokeWidth={v === 0 ? 2 : 1} strokeDasharray={v === 0 ? '0' : '4 8'} />
                <text x={L - 14} y={y(v) + 7} textAnchor="end" fill={colors.muted} fontFamily={mono} fontSize={20}>{`${v > 0 ? '+' : ''}${v}%`}</text>
              </g>
            ))}
            {days.map((d, i) => (
              <text key={d} x={x(i)} y={H - 14} textAnchor="middle" fill={colors.muted} fontFamily={mono} fontSize={20}>{d}</text>
            ))}
            {paths.map((d, si) => {
              const col = SERIES_COLORS[si % SERIES_COLORS.length];
              const start = 10 + si * 14;
              const prog = interpolate(frame, [start, start + 55], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
              const grow = spring({ frame: frame - start, fps, config: { damping: 22 } });
              const ev = evolvePath(prog, d);
              const len = getLength(d);
              const pt = getPointAtLength(d, len * prog) ?? { x: x(0), y: y(0) };
              const last = pct[si][pct[si].length - 1];
              const labelIn = interpolate(prog, [0.9, 1], [0, 1], clamp);
              return (
                <g key={si}>
                  <path d={interpolatePath(grow, area(flat[si], pct[si]), area(d, pct[si]))} fill={col} opacity={0.09 * grow} />
                  <path d={d} fill="none" stroke={col} strokeOpacity={0.12} strokeWidth={4} strokeLinejoin="round" />
                  <path d={d} fill="none" stroke={col} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />
                  <circle cx={pt.x} cy={pt.y} r={16} fill={col} opacity={0.25 * (1 - labelIn * 0.5)} />
                  <circle cx={pt.x} cy={pt.y} r={8} fill="#fff" stroke={col} strokeWidth={4} opacity={prog > 0 ? 1 : 0} />
                  <g opacity={labelIn} transform={`translate(${x(pct[si].length - 1) + 22} ${labelY[si]})`}>
                    <text fill={col} fontFamily={mono} fontWeight={700} fontSize={26}>{signed(last, 2)}%</text>
                  </g>
                </g>
              );
            })}
          </svg>
          <div style={{ display: 'flex', gap: 30, padding: '4px 20px 6px', fontFamily: mono, fontSize: 22 }}>
            {series.map((s, i) => (
              <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.text }}>
                <span style={{ width: 22, height: 6, borderRadius: 3, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />{s.name}
              </span>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'center', height: H + 24 }}>
          {stats.map((s, i) => (
            <StatTile key={i} stat={s} at={itemFrame(scene, i)} accent={accent} h={Math.min(150, (H - 18 * (rows - 1)) / rows)} />
          ))}
        </div>
      </div>
    </Frame>
  );
};

const StatTile: React.FC<{ stat: { label: string; value: string; delta?: number }; at: number; accent: string; h: number }> = ({ stat, at, accent, h }) => {
  const p = useEnter(at);
  const d = stat.delta;
  return (
    <div style={{ height: h, boxSizing: 'border-box', background: colors.panel, border: `1px solid ${colors.border}`, borderLeft: `8px solid ${d === undefined ? accent : dirColor(d)}`, borderRadius: 16, padding: '0 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: p, transform: `translateX(${(1 - p) * 60}px)` }}>
      <div style={{ fontFamily: mono, fontSize: 20, letterSpacing: 3, color: colors.muted, textTransform: 'uppercase' }}>{stat.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
        <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1, fontFamily: mono }}>{stat.value}</span>
        {d !== undefined && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: dirColor(d), fontFamily: mono, fontWeight: 700, fontSize: 28 }}>
            <Triangle length={22} direction={d >= 0 ? 'up' : 'down'} fill={dirColor(d)} />
            {signed(d, 2)}%
          </span>
        )}
      </div>
    </div>
  );
};

/* ------------------------------ MOVERS ------------------------------ */

const CountUp: React.FC<{ value: number; at: number; w: number; h: number; size: number }> = ({ value, at, w, h, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <Trail layers={5} lagInFrames={0.6} trailOpacity={0.55}>
        <CountText value={value} at={at} frame={frame} fps={fps} size={size} />
      </Trail>
    </div>
  );
};

// Reads the frame itself so each Trail layer sees its own lagged frame.
const CountText: React.FC<{ value: number; at: number; frame: number; fps: number; size: number }> = ({ value, at, size }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = interpolate(f, [at + 4, at + 40], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  const slide = spring({ frame: f - at - 2, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <span style={{ fontFamily: mono, fontWeight: 700, fontSize: size, letterSpacing: -3, color: dirColor(value), transform: `translateY(${(1 - slide) * 70}px)`, opacity: Math.min(1, slide * 2) }}>
        {signed(value * t, 1)}%
      </span>
    </AbsoluteFill>
  );
};

export const MoversScene: React.FC<P> = ({ scene, accent }) => {
  const { fps } = useVideoConfig();
  const movers = scene.movers ?? [];
  const n = Math.max(movers.length, 1);
  const gap = 36;
  const cardW = Math.min(540, (1680 - gap * (n - 1)) / n);
  const maxAbs = Math.max(...movers.map((m) => Math.abs(m.change)), 1);
  const cues = movers.map((_, i) => itemFrame(scene, i));

  const ref = useGsapTimeline<HTMLDivElement>(({ timeline, selector }) => {
    movers.forEach((_, i) => {
      const t = cues[i] / fps;
      const card = selector(`.mv-card-${i}`);
      timeline.fromTo(card, { y: 120, opacity: 0, scale: 0.9, rotateX: 18 }, { y: 0, opacity: 1, scale: 1, rotateX: 0, duration: 0.7, ease: 'back.out(1.5)' }, t);
      timeline.fromTo(selector(`.mv-bar-${i}`), { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'power3.out' }, t + 0.25);
      timeline.fromTo(selector(`.mv-arrow-${i}`), { y: (movers[i].change < 0 ? -1 : 1) * 40, opacity: 0 }, { y: 0, opacity: 0.2, duration: 0.8, ease: 'power2.out' }, t + 0.1);
    });
  }, { dependencies: [movers.length, fps, cues.join(',')] });

  return (
    <Frame>
      <Kicker text={scene.kicker ?? 'BIGGEST MOVERS'} accent={accent} place={scene.place} />
      {scene.headline && <FitHeadline text={scene.headline} width={1680} />}
      <div ref={ref} style={{ flex: 1, display: 'flex', gap, alignItems: 'center', justifyContent: 'center', perspective: 1200 }}>
        {movers.map((m, i) => {
          const col = dirColor(m.change);
          return (
            <div key={i} className={`mv-card-${i}`} style={{ position: 'relative', width: cardW, height: 440, boxSizing: 'border-box', background: `linear-gradient(160deg, ${colors.panel}, ${colors.bg2})`, border: `1px solid ${colors.border}`, borderTop: `8px solid ${col}`, borderRadius: 22, padding: '28px 34px', overflow: 'hidden', opacity: 0 }}>
              <div className={`mv-arrow-${i}`} style={{ position: 'absolute', right: 30, top: 34, opacity: 0 }}>
                <Arrow length={120} headWidth={100} headLength={60} shaftWidth={38} direction={m.change < 0 ? 'down' : 'up'} fill={col} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Triangle length={26} direction={m.change < 0 ? 'down' : 'up'} fill={col} />
                <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 44, letterSpacing: 2 }}>{m.ticker}</span>
              </div>
              {m.name && <div style={{ color: colors.muted, fontSize: 26, marginTop: 4 }}>{m.name}</div>}
              <div style={{ marginTop: 22 }}>
                <CountUp value={m.change} at={cues[i]} w={cardW - 68} h={130} size={cardW > 450 ? 112 : 84} />
              </div>
              <div style={{ height: 10, borderRadius: 5, background: colors.border, marginTop: 14, overflow: 'hidden' }}>
                <div className={`mv-bar-${i}`} style={{ height: '100%', width: `${(Math.abs(m.change) / maxAbs) * 100}%`, background: col, transformOrigin: 'left center' }} />
              </div>
              {m.note && <div style={{ marginTop: 22, fontSize: 26, lineHeight: 1.3, color: colors.text, opacity: 0.85, maxWidth: cardW - 68 - 120 }}>{m.note}</div>}
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

/* ---------------------------- SCOREBOARD ---------------------------- */

const RESULT_COLOR = { W: up, L: down, OTL: AMBER } as const;

export const ScoreboardScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const games = scene.games ?? [];
  const rec = scene.record;
  const cues = games.map((_, i) => itemFrame(scene, i));
  const recAt = itemFrame(scene, games.length);
  const starAt = itemFrame(scene, games.length + 1);

  const ref = useGsapTimeline<HTMLDivElement>(({ timeline, selector }) => {
    games.forEach((_, i) => {
      const t = cues[i] / fps;
      timeline.fromTo(selector(`.gm-row-${i}`), { x: -140, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, t);
      timeline.fromTo(selector(`.gm-badge-${i}`), { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, duration: 0.55, ease: 'back.out(2)' }, t + 0.25);
    });
  }, { dependencies: [games.length, fps, cues.join(',')] });

  // Puck slides along the ice line under the headline, then rests.
  const slide = interpolate(frame, [8, 38], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const puckSpin = slide * 540;
  const RINK_W = 1000;

  const recP = useEnter(recAt);
  const starP = useEnter(starAt, 10);
  const total = rec ? rec.w + rec.l + rec.otl : 0;
  const slices = rec ? [
    { k: 'W', n: rec.w, c: up }, { k: 'L', n: rec.l, c: down }, { k: 'OTL', n: rec.otl, c: AMBER },
  ] : [];
  const pieGrow = interpolate(frame, [recAt, recAt + 30], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  let acc = 0;

  return (
    <Frame>
      <Kicker text={scene.kicker ?? 'SPORTS'} accent={accent} place={scene.place} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <FitHeadline text={scene.team ?? scene.headline ?? ''} width={1100} max={96} />
          {scene.team && scene.headline && <div style={{ fontSize: 34, color: colors.muted, marginTop: 6 }}>{scene.headline}</div>}
        </div>
        <div style={{ marginTop: -60, marginRight: 10 }}>
          <AnimatedEmoji emoji={scene.emoji ?? 'ice-hockey'} scale="1" style={{ width: 150, height: 150 }} />
        </div>
      </div>
      {/* ice line with sliding puck */}
      <div style={{ position: 'relative', width: RINK_W, height: 34, marginTop: -4 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 26, height: 3, background: `linear-gradient(90deg, ${accent}, transparent)`, opacity: 0.7 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: RINK_W, height: 34 }}>
          <Trail layers={8} lagInFrames={0.7} trailOpacity={0.6}>
            <AbsoluteFill>
              <PuckAt rinkW={RINK_W} />
            </AbsoluteFill>
          </Trail>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 48, flex: 1, minHeight: 0, alignItems: 'flex-start', marginTop: 6 }}>
        <div ref={ref} style={{ width: 1000, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {games.map((g, i) => {
            const c = RESULT_COLOR[g.result];
            return (
              <div key={i} className={`gm-row-${i}`} style={{ opacity: 0, display: 'flex', alignItems: 'center', height: 96, boxSizing: 'border-box', background: colors.panel, border: `1px solid ${colors.border}`, borderLeft: `8px solid ${c}`, borderRadius: 16, padding: '0 28px', gap: 28 }}>
                <span style={{ fontFamily: mono, fontSize: 26, color: colors.muted, width: 110 }}>{g.date}</span>
                <span style={{ fontFamily: mono, fontSize: 24, color: colors.muted, width: 56 }}>{g.home ? 'vs' : 'at'}</span>
                <span style={{ fontSize: 44, fontWeight: 800, flex: 1, letterSpacing: 1 }}>{g.opponent}</span>
                <span style={{ fontFamily: mono, fontSize: 48, fontWeight: 700 }}>{g.score}</span>
                <span className={`gm-badge-${i}`} style={{ width: 84, height: 54, borderRadius: 10, background: c, color: '#0b0c10', fontFamily: mono, fontWeight: 700, fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{g.result}</span>
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {rec && (
            <div style={{ opacity: recP, transform: `translateY(${(1 - recP) * 30}px)`, display: 'flex', alignItems: 'center', gap: 36, background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 20, padding: '20px 30px', height: 232, boxSizing: 'border-box' }}>
              <div style={{ position: 'relative', width: 190, height: 190 }}>
                {slices.map((s) => {
                  const start = acc / total;
                  acc += s.n;
                  return (
                    <div key={s.k} style={{ position: 'absolute', inset: 0 }}>
                      <Pie radius={95} progress={(s.n / total) * pieGrow - 0.004} rotation={start * Math.PI * 2 * pieGrow} fill={s.c} stroke={colors.panel} strokeWidth={4} />
                    </div>
                  );
                })}
                <div style={{ position: 'absolute', inset: 55, borderRadius: '50%', background: colors.panel }} />
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 20, letterSpacing: 3, color: colors.muted }}>RECORD W-L-OTL</div>
                <div style={{ fontFamily: mono, fontSize: 68, fontWeight: 700, letterSpacing: -2 }}>{rec.w}-{rec.l}-{rec.otl}</div>
                <div style={{ display: 'flex', gap: 14, fontFamily: mono, fontSize: 20 }}>
                  {slices.map((s) => <span key={s.k} style={{ color: s.c }}>{s.k} {s.n}</span>)}
                </div>
              </div>
            </div>
          )}
          {scene.star && (
            <div style={{ opacity: starP, transform: `scale(${0.9 + 0.1 * starP})`, display: 'flex', alignItems: 'center', gap: 30, background: colors.panel, border: `1px solid ${AMBER}55`, borderRadius: 20, padding: '20px 30px', minHeight: 232, boxSizing: 'border-box' }}>
              <div style={{ transform: `rotate(${(1 - starP) * -200}deg) scale(${starP})`, flexShrink: 0 }}>
                <Star points={5} innerRadius={42} outerRadius={92} cornerRadius={6} fill={AMBER} stroke="#fff3c4" strokeWidth={3} />
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 20, letterSpacing: 3, color: AMBER }}>STAR OF THE WEEK</div>
                <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1 }}>{scene.star.name}</div>
                <div style={{ fontSize: 26, color: colors.muted, marginTop: 4 }}>{scene.star.line}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Frame>
  );
};

// Puck position is derived from the frame inside the Trail so each layer lags correctly.
const PuckAt: React.FC<{ rinkW: number }> = ({ rinkW }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [8, 38], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  return (
    <div style={{ position: 'absolute', left: t * (rinkW - 70), top: 6, width: 56, height: 26, opacity: f < 8 ? 0 : 1 }}>
      <div style={{ position: 'absolute', inset: 0, top: 7, borderRadius: '50%', background: '#000', border: '2px solid #333' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 18, borderRadius: '50%', background: '#1b1b1f', border: '2px solid #555' }} />
    </div>
  );
};
