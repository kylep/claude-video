// Diagram scene: one big part (LED, resistor, transistor) with callouts that
// pop in one per [[next]] cue, each with a leader line to its anchor.
import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from './theme';
import type { Callout, Scene } from './types';

type Pt = { x: number; y: number };
type Anchor = { at: Pt; label: Pt };

const VB = { w: 1000, h: 690 };

// Where each anchor points, and where its label sits.
const ANCHORS: Record<string, Record<string, Anchor>> = {
  led: {
    dome: { at: { x: 500, y: 150 }, label: { x: 190, y: 110 } },
    flat: { at: { x: 592, y: 258 }, label: { x: 820, y: 200 } },
    anode: { at: { x: 455, y: 520 }, label: { x: 190, y: 520 } },
    cathode: { at: { x: 545, y: 440 }, label: { x: 820, y: 440 } },
  },
  resistor: {
    bands: { at: { x: 470, y: 290 }, label: { x: 500, y: 110 } },
    body: { at: { x: 560, y: 345 }, label: { x: 760, y: 500 } },
    left: { at: { x: 150, y: 320 }, label: { x: 190, y: 500 } },
    right: { at: { x: 850, y: 320 }, label: { x: 860, y: 160 } },
  },
  transistor: {
    flat: { at: { x: 500, y: 200 }, label: { x: 830, y: 140 } },
    e: { at: { x: 420, y: 520 }, label: { x: 210, y: 500 } },
    b: { at: { x: 500, y: 560 }, label: { x: 500, y: 640 } },
    c: { at: { x: 580, y: 520 }, label: { x: 790, y: 500 } },
  },
};

const LED_COLOR = '#ff3b30';

const Led: React.FC<{ lit: number }> = ({ lit }) => (
  <g>
    {lit > 0 && <circle cx={500} cy={190} r={170 * lit} fill={LED_COLOR} opacity={0.25 * lit} />}
    {/* legs: long anode on the left, short cathode on the right */}
    <rect x={447} y={300} width={16} height={260} rx={4} fill="#c9c9c9" />
    <rect x={537} y={300} width={16} height={170} rx={4} fill="#c9c9c9" />
    {/* rim with the flat edge on the cathode side */}
    <path d="M 392 300 L 392 270 L 600 270 L 600 300 Z" fill={LED_COLOR} opacity={0.9} />
    <rect x={588} y={262} width={10} height={44} fill="#c0281f" />
    {/* dome */}
    <path d="M 410 272 L 410 170 A 90 90 0 0 1 590 170 L 590 272 Z" fill={LED_COLOR} opacity={0.75 + 0.25 * lit} />
    <ellipse cx={460} cy={160} rx={22} ry={40} fill="#fff" opacity={0.35} />
  </g>
);

const Resistor: React.FC = () => {
  const bands = ['#d1342f', '#d1342f', '#1b1b1b', '#1b1b1b', '#7a4a24'];
  return (
    <g>
      <rect x={120} y={312} width={760} height={16} rx={6} fill="#c9c9c9" />
      <rect x={300} y={255} width={400} height={130} rx={60} fill="#7fb6e8" stroke="#5d8fbd" strokeWidth={4} />
      {bands.map((c, i) => <rect key={i} x={360 + i * 52 + (i === 4 ? 30 : 0)} y={255} width={26} height={130} fill={c} />)}
    </g>
  );
};

const Transistor: React.FC = () => (
  <g>
    {[420, 500, 580].map((x) => <rect key={x} x={x - 8} y={330} width={16} height={230} rx={4} fill="#c9c9c9" />)}
    <path d="M 360 340 L 360 170 A 140 120 0 0 1 640 170 L 640 340 Z" fill="#202124" />
    <text x={500} y={240} fontSize={56} fontWeight={800} textAnchor="middle" fill="#e6e6e6" fontFamily={fonts.mono}>8050</text>
    {['E', 'B', 'C'].map((l, i) => (
      <text key={l} x={420 + i * 80} y={315} fontSize={34} fontWeight={800} textAnchor="middle" fill="#9aa1b2" fontFamily={fonts.mono}>{l}</text>
    ))}
  </g>
);

type Props = { scene: Scene; accent: string };

export const DiagramScene: React.FC<Props> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const callouts: Callout[] = scene.callouts ?? [];
  const cueAt = (i: number) => scene.cues[i] ?? 12 + i * 20;
  const enter = (at: number) => spring({ frame: frame - at, fps, config: { damping: 16 } });
  const anchors = ANCHORS[scene.component ?? 'led'];
  const litIdx = callouts.findIndex((c) => c.lit);
  const lit = litIdx >= 0 && frame >= cueAt(litIdx) ? enter(cueAt(litIdx)) : 0;
  const partIn = enter(0);

  return (
    <AbsoluteFill style={{ padding: '120px 150px 150px', fontFamily: fonts.sans, color: colors.text }}>
      {scene.heading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 20 }}>
          <div style={{ width: 10, height: 56, borderRadius: 5, background: accent }} />
          <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: -1.2 }}>{scene.heading}</div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
          <g opacity={partIn} transform={`translate(0 ${(1 - partIn) * 30})`}>
            {scene.component === 'resistor' ? <Resistor /> : scene.component === 'transistor' ? <Transistor /> : <Led lit={lit} />}
          </g>
          {callouts.map((c, i) => {
            const a = anchors[c.anchor];
            if (!a || frame < cueAt(i)) return null;
            const p = enter(cueAt(i));
            const lines = c.text.split('\n');
            const w = Math.max(...lines.map((l) => l.length)) * 17 + 40;
            const h = lines.length * 38 + 18;
            return (
              <g key={i} opacity={p}>
                <line x1={a.at.x} y1={a.at.y} x2={a.label.x} y2={a.label.y} stroke={accent} strokeWidth={4} strokeDasharray="2 8" strokeLinecap="round" />
                <circle cx={a.at.x} cy={a.at.y} r={10 * p} fill={accent} />
                <g transform={`translate(${a.label.x} ${a.label.y}) scale(${0.8 + 0.2 * p})`}>
                  <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={14} fill="#14161c" stroke={accent} strokeWidth={3} />
                  {lines.map((l, k) => (
                    <text key={k} x={0} y={-h / 2 + 40 + k * 38} fontSize={30} fontWeight={700} textAnchor="middle" fill="#ffffff" fontFamily={fonts.sans}>{l}</text>
                  ))}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </AbsoluteFill>
  );
};
