// Chat scene: two devices talk in speech bubbles, one message per [[next]] cue.
// Each message can show the real line sent over the wire under its words, and
// its speaker's own narrator voice reads it (spec.cast, resolved by cv build).
// Timeline scene: a big status light above a strip of stages, one stage per cue.
import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from './theme';
import type { CastMember, Scene } from './types';

type P = { scene: Scene; accent: string };

function useSpringAt() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (at: number, damping = 18) => spring({ frame: frame - at, fps, config: { damping } });
}

const Heading: React.FC<{ text?: string; accent: string }> = ({ text, accent }) =>
  text ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 36 }}>
      <div style={{ width: 10, height: 60, borderRadius: 5, background: accent }} />
      <div style={{ fontSize: 62, fontWeight: 800, letterSpacing: -1.4 }}>{text}</div>
    </div>
  ) : null;

// A laptop, drawn so its screen can glow while it's talking.
const Laptop: React.FC<{ glow: number; accent: string }> = ({ glow, accent }) => (
  <svg viewBox="0 0 200 150" width={200} height={150}>
    <rect x={30} y={10} width={140} height={95} rx={10} fill="#2a2e3b" stroke="#454b5e" strokeWidth={4} />
    <rect x={42} y={22} width={116} height={71} rx={4} fill={accent} fillOpacity={0.15 + 0.5 * glow} />
    <rect x={62} y={40} width={50} height={8} rx={4} fill="#fff" fillOpacity={0.5} />
    <rect x={62} y={56} width={76} height={8} rx={4} fill="#fff" fillOpacity={0.35} />
    <rect x={62} y={72} width={36} height={8} rx={4} fill="#fff" fillOpacity={0.35} />
    <path d="M10 112 H190 L178 132 H22 Z" fill="#3a3f50" stroke="#555c72" strokeWidth={3} />
  </svg>
);

// The robot: a glowing dome on a little board. `light` is its LED colour.
const Robot: React.FC<{ light: string; glow: number }> = ({ light, glow }) => (
  <svg viewBox="0 0 200 150" width={200} height={150} style={{ overflow: 'visible' }}>
    <defs>
      <radialGradient id="robot-glow">
        <stop offset="0%" stopColor={light} stopOpacity={0.9} />
        <stop offset="100%" stopColor={light} stopOpacity={0} />
      </radialGradient>
    </defs>
    <circle cx={100} cy={62} r={70 + 8 * glow} fill="url(#robot-glow)" opacity={0.55 + 0.3 * glow} />
    <rect x={30} y={100} width={140} height={36} rx={8} fill="#1f7a4a" stroke="#2c9a60" strokeWidth={3} />
    {[50, 70, 90, 110, 130, 150].map((x) => <rect key={x} x={x - 4} y={108} width={8} height={8} rx={2} fill="#d9b45a" />)}
    <path d="M62 100 V64 A38 38 0 0 1 138 64 V100 Z" fill={light} stroke="#ffffff" strokeOpacity={0.5} strokeWidth={3} />
    <ellipse cx={86} cy={58} rx={10} ry={16} fill="#fff" opacity={0.45} />
  </svg>
);

const Avatar: React.FC<{ who: CastMember; talking: number; light: string; accent: string }> = ({ who, talking, light, accent }) => (
  <div style={{ width: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    transform: `scale(${1 + 0.05 * talking})` }}>
    {who.icon === 'robot' ? <Robot light={light} glow={talking} /> : <Laptop glow={talking} accent={accent} />}
    <div style={{ fontSize: 40, fontWeight: 800, color: talking > 0.5 ? colors.text : colors.muted }}>{who.name}</div>
  </div>
);

const VISIBLE = 3;

export const ChatScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const springAt = useSpringAt();
  const cast = scene.cast ?? {};
  const msgs = scene.messages ?? [];
  const at = (i: number) => scene.cues[i] ?? 10 + i * 30;
  const shown = msgs.filter((_, i) => frame >= at(i)).length;
  const latest = shown - 1;
  const sides = Object.entries(cast);
  const left = sides.find(([, c]) => c.side !== 'right');
  const right = sides.find(([, c]) => c.side === 'right');
  // The robot's light: the last `light` set by any shown message, else its starting colour.
  const light = msgs.slice(0, shown).reduce((c, m) => m.light ?? c, scene.light ?? '#3b82f6');
  const talking = (key?: string) => (latest >= 0 && msgs[latest].from === key ? springAt(at(latest)) : 0);
  // Older bubbles slide up and fade once more than VISIBLE are on screen.
  const first = Math.max(0, shown - VISIBLE);

  return (
    <AbsoluteFill style={{ padding: '110px 110px 170px', fontFamily: fonts.sans, color: colors.text }}>
      <Heading text={scene.heading} accent={accent} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 30, minHeight: 0 }}>
        {left && <Avatar who={left[1]} talking={talking(left[0])} light={light} accent={accent} />}
        <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 22, overflow: 'hidden' }}>
          {msgs.map((m, i) => {
            if (i >= shown || i < first) return null;
            const p = springAt(at(i));
            const isRight = cast[m.from]?.side === 'right';
            const active = i === latest;
            return (
              <div key={i} style={{ display: 'flex', justifyContent: isRight ? 'flex-end' : 'flex-start',
                opacity: p * (active ? 1 : 0.62), transform: `translateY(${(1 - p) * 30}px) scale(${0.96 + 0.04 * p})` }}>
                <div style={{
                  maxWidth: '78%', padding: '22px 30px', borderRadius: 30,
                  borderBottomLeftRadius: isRight ? 30 : 8, borderBottomRightRadius: isRight ? 8 : 30,
                  background: isRight ? '#232838' : `${accent}26`,
                  border: `3px solid ${active ? (isRight ? '#8b93ad' : accent) : colors.border}`,
                }}>
                  <div style={{ fontSize: 42, fontWeight: 600, lineHeight: 1.25 }}>{m.text}</div>
                  {m.wire && (
                    <div style={{ marginTop: 12, fontFamily: fonts.mono, fontSize: 28, color: isRight ? '#b6bdd3' : accent,
                      whiteSpace: 'pre-wrap' }}>{m.wire}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {right && <Avatar who={right[1]} talking={talking(right[0])} light={light} accent={accent} />}
      </div>
    </AbsoluteFill>
  );
};

// ---------- Timeline ----------

export const TimelineScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const springAt = useSpringAt();
  const stages = scene.stages ?? [];
  const at = (i: number) => scene.cues[i] ?? 10 + i * 30;
  const active = stages.reduce((a, _, i) => (frame >= at(i) ? i : a), -1);
  const st = active >= 0 ? stages[active] : undefined;
  const color = st?.color ?? '#2b2f3d';
  // Breathing stages pulse with a 2 s period, like the firmware's amber.
  const breathe = st?.breathe ? 0.55 + 0.45 * (0.5 + 0.5 * Math.cos((2 * Math.PI * frame) / (2 * fps))) : 1;
  const level = (st?.level ?? 1) * breathe;
  const enter = active >= 0 ? springAt(at(active)) : 0;
  const notes = st?.sound ? ['♪', '♫', '♪'] : [];

  return (
    <AbsoluteFill style={{ padding: '110px 110px 170px', fontFamily: fonts.sans, color: colors.text }}>
      <Heading text={scene.heading} accent={accent} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', minHeight: 0 }}>
        <div style={{ position: 'relative', width: 420, height: 330, display: 'flex', justifyContent: 'center' }}>
          <svg viewBox="0 0 420 330" width={420} height={330} style={{ overflow: 'visible' }}>
            <defs>
              <radialGradient id="tl-glow">
                <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </radialGradient>
            </defs>
            <circle cx={210} cy={150} r={200} fill="url(#tl-glow)" opacity={0.85 * level} />
            <path d="M120 290 V160 A90 90 0 0 1 300 160 V290 Z" fill={color} fillOpacity={0.25 + 0.75 * level}
              stroke="#fff" strokeOpacity={0.45} strokeWidth={4} />
            <ellipse cx={175} cy={150} rx={18} ry={34} fill="#fff" opacity={0.35} />
            <rect x={90} y={288} width={240} height={34} rx={8} fill="#1f7a4a" />
          </svg>
          {notes.map((n, i) => {
            const t = ((frame - at(active)) / fps + i * 0.45) % 1.4;
            return (
              <div key={i} style={{ position: 'absolute', left: 330 + i * 40, top: 150 - t * 110, fontSize: 64,
                color: '#fff', opacity: Math.max(0, 1 - t / 1.4) * enter }}>{n}</div>
            );
          })}
        </div>
        <div style={{ width: '100%', display: 'flex', gap: 18 }}>
          {stages.map((s, i) => {
            const on = i === active;
            const p = frame >= at(i) ? springAt(at(i)) : 0;
            return (
              <div key={i} style={{ flex: 1, position: 'relative', opacity: 0.35 + 0.65 * p }}>
                <div style={{ height: 22, borderRadius: 11, background: s.color, opacity: on ? 1 : 0.55,
                  boxShadow: on ? `0 0 34px ${s.color}` : 'none' }} />
                <div style={{ marginTop: 18, padding: '18px 20px', borderRadius: 18, minHeight: 150, boxSizing: 'border-box',
                  border: `3px solid ${on ? accent : colors.border}`, background: on ? `${accent}18` : colors.panel }}>
                  <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15 }}>{s.label}</div>
                  {s.detail && <div style={{ marginTop: 8, fontSize: 27, color: colors.muted, lineHeight: 1.3 }}>{s.detail}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
