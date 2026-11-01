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
  rgbled: {
    red: { at: { x: 445, y: 235 }, label: { x: 170, y: 180 } },
    green: { at: { x: 500, y: 205 }, label: { x: 830, y: 110 } },
    blue: { at: { x: 555, y: 235 }, label: { x: 840, y: 290 } },
    common: { at: { x: 470, y: 560 }, label: { x: 220, y: 470 } },
    dome: { at: { x: 560, y: 120 }, label: { x: 820, y: 470 } },
  },
  mix: {
    red: { at: { x: 330, y: 260 }, label: { x: 130, y: 120 } },
    green: { at: { x: 670, y: 260 }, label: { x: 870, y: 120 } },
    blue: { at: { x: 500, y: 560 }, label: { x: 500, y: 655 } },
    yellow: { at: { x: 500, y: 200 }, label: { x: 500, y: 45 } },
    magenta: { at: { x: 395, y: 440 }, label: { x: 150, y: 520 } },
    cyan: { at: { x: 605, y: 440 }, label: { x: 860, y: 520 } },
    white: { at: { x: 500, y: 360 }, label: { x: 885, y: 410 } },
  },
  pwm: {
    on: { at: { x: 160, y: 150 }, label: { x: 190, y: 45 } },
    off: { at: { x: 390, y: 520 }, label: { x: 390, y: 640 } },
    bright: { at: { x: 860, y: 200 }, label: { x: 860, y: 45 } },
    dim: { at: { x: 860, y: 470 }, label: { x: 860, y: 640 } },
  },
  buzzer: {
    coil: { at: { x: 500, y: 480 }, label: { x: 180, y: 560 } },
    disc: { at: { x: 640, y: 335 }, label: { x: 850, y: 450 } },
    waves: { at: { x: 500, y: 150 }, label: { x: 180, y: 70 } },
    low: { at: { x: 420, y: 190 }, label: { x: 170, y: 280 } },
    high: { at: { x: 590, y: 190 }, label: { x: 840, y: 230 } },
  },
  diode: {
    plain: { at: { x: 345, y: 340 }, label: { x: 150, y: 200 } },
    band: { at: { x: 625, y: 300 }, label: { x: 840, y: 190 } },
    door: { at: { x: 500, y: 225 }, label: { x: 500, y: 70 } },
    kick: { at: { x: 500, y: 520 }, label: { x: 500, y: 650 } },
  },
  pot: {
    track: { at: { x: 378, y: 177 }, label: { x: 200, y: 80 } },
    wiper: { at: { x: 500, y: 300 }, label: { x: 170, y: 300 } },
    ground: { at: { x: 390, y: 520 }, label: { x: 170, y: 470 } },
    top: { at: { x: 610, y: 520 }, label: { x: 840, y: 480 } },
    middle: { at: { x: 500, y: 520 }, label: { x: 500, y: 600 } },
    meter: { at: { x: 880, y: 200 }, label: { x: 720, y: 60 } },
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

// Components below get the frame and the set of anchors whose callouts are showing.
type Live = { frame: number; shown: Set<string>; accent: string };

const RgbLed: React.FC<Live> = ({ shown }) => {
  const die = (x: number, y: number, c: string, on: boolean) => (
    <g>
      {on && <circle cx={x} cy={y} r={60} fill={c} opacity={0.35} />}
      <rect x={x - 14} y={y - 14} width={28} height={28} rx={4} fill={on ? c : '#777'} stroke="#333" strokeWidth={2} />
    </g>
  );
  const legs = [{ x: 410, h: 230 }, { x: 470, h: 300 }, { x: 530, h: 260 }, { x: 590, h: 245 }];
  return (
    <g>
      {legs.map((l, i) => <rect key={i} x={l.x - 8} y={330} width={16} height={l.h} rx={4} fill="#c9c9c9" />)}
      {[['R', '#ff5a4f'], ['+', '#e6e6e6'], ['G', '#30d158'], ['B', '#4f8dff']].map(([t, c], i) => (
        <text key={t} x={legs[i].x} y={330 + legs[i].h + 34} fontSize={30} fontWeight={800} textAnchor="middle" fill={c} fontFamily={fonts.mono}>{t}</text>
      ))}
      {/* thin wires inside the dome, each die to its leg */}
      <path d="M 445 249 L 410 330 M 500 219 L 470 330 M 555 249 L 590 330 M 500 219 L 530 330" stroke="#aab" strokeWidth={3} fill="none" />
      <path d="M 380 320 L 380 170 A 120 120 0 0 1 620 170 L 620 320 Z" fill="#dfe8f0" fillOpacity={0.16} stroke="#dfe8f0" strokeOpacity={0.7} strokeWidth={4} />
      <rect x={366} y={312} width={268} height={22} rx={6} fill="#dfe8f0" fillOpacity={0.3} />
      {die(445, 235, '#ff3b30', shown.has('red'))}
      {die(500, 205, '#30d158', shown.has('green'))}
      {die(555, 235, '#2f7bff', shown.has('blue'))}
    </g>
  );
};

const Mix: React.FC<Live> = ({ shown }) => {
  const any = ['red', 'green', 'blue'].some((c) => shown.has(c));
  const vis = (c: string) => (any ? shown.has(c) : true);
  return (
    <g>
      <rect x={140} y={40} width={720} height={610} rx={30} fill="#000" />
      <g style={{ isolation: 'isolate' }}>
        {vis('red') && <circle cx={420} cy={290} r={175} fill="#ff0000" style={{ mixBlendMode: 'screen' }} />}
        {vis('green') && <circle cx={580} cy={290} r={175} fill="#00ff00" style={{ mixBlendMode: 'screen' }} />}
        {vis('blue') && <circle cx={500} cy={430} r={175} fill="#0000ff" style={{ mixBlendMode: 'screen' }} />}
      </g>
    </g>
  );
};

const Pwm: React.FC<Live> = ({ frame }) => {
  const wave = (y: number, duty: number) => {
    const period = 90; const hi = y - 50; const lo = y + 50;
    const shift = (frame * 3) % period;
    let d = '';
    for (let x0 = 100 - shift - period; x0 < 720; x0 += period) {
      const a = Math.max(100, x0); const b = Math.min(720, x0 + period * duty); const c = Math.min(720, x0 + period);
      if (b > a) d += `M ${a} ${hi} L ${b} ${hi} `;
      if (b >= 100 && b <= 720) d += `M ${b} ${hi} L ${b} ${lo} `;
      const lo0 = Math.max(100, b); if (c > lo0) d += `M ${lo0} ${lo} L ${c} ${lo} `;
      if (c >= 100 && c < 720) d += `M ${c} ${lo} L ${c} ${hi} `;
    }
    return d;
  };
  const bulb = (y: number, level: number) => (
    <g>
      <circle cx={860} cy={y} r={70 + 60 * level} fill="#fff1a8" opacity={0.25 * level} />
      <circle cx={860} cy={y} r={58} fill={`rgba(255,226,120,${0.15 + 0.85 * level})`} stroke="#888" strokeWidth={3} />
    </g>
  );
  return (
    <g>
      <path d={wave(200, 0.8)} stroke="#ffd60a" strokeWidth={8} strokeLinecap="round" fill="none" />
      {bulb(200, 0.85)}
      <path d={wave(470, 0.2)} stroke="#ffd60a" strokeWidth={8} strokeLinecap="round" fill="none" />
      {bulb(470, 0.2)}
    </g>
  );
};

const Buzzer: React.FC<Live> = ({ frame, shown, accent }) => {
  const high = shown.has('high');
  const speed = high ? 0.95 : 0.32;
  const wob = Math.sin(frame * speed) * 9;
  const gap = high ? 38 : 80;
  const arcs = [0, 1, 2, 3, 4].map((k) => {
    const r = ((frame * (high ? 3.2 : 2.2) + k * gap) % (gap * 5)) + 30;
    return <path key={k} d={`M ${500 - r} ${300 - r * 0.25} Q 500 ${300 - r * 1.25} ${500 + r} ${300 - r * 0.25}`}
      stroke={accent} strokeWidth={5} fill="none" opacity={Math.max(0, 1 - r / (gap * 5))} />;
  });
  return (
    <g>
      {arcs}
      <rect x={330} y={320} width={340} height={230} rx={24} fill="#1d1e21" stroke="#444" strokeWidth={3} />
      {/* coil */}
      {[0, 1, 2, 3, 4].map((k) => <ellipse key={k} cx={500} cy={500 - k * 18} rx={70} ry={12} fill="none" stroke="#c87533" strokeWidth={8} />)}
      <rect x={485} y={410} width={30} height={100} fill="#7d7d7d" />
      {/* metal disc, pulled by the coil */}
      <path d={`M 345 335 Q 500 ${335 + wob * 2} 655 335`} stroke="#d8d8d8" strokeWidth={10} fill="none" strokeLinecap="round" />
      {[440, 560].map((x) => <rect key={x} x={x - 7} y={550} width={14} height={90} rx={4} fill="#c9c9c9" />)}
    </g>
  );
};

const Diode: React.FC<Live> = ({ frame, shown, accent }) => {
  const kick = shown.has('kick');
  const dots = [0, 1, 2, 3, 4, 5].map((k) => {
    const t = ((frame * 0.012 + k / 6) % 1);
    const a = t * Math.PI * 2;
    return <circle key={k} cx={500 + Math.cos(a) * 230} cy={470 + Math.sin(a) * 60} r={10} fill={accent} />;
  });
  return (
    <g>
      <rect x={120} y={332} width={760} height={16} rx={6} fill="#c9c9c9" />
      <rect x={330} y={295} width={340} height={90} rx={18} fill="#1d1d1f" />
      <rect x={600} y={295} width={36} height={90} fill="#d8d8d8" />
      {/* one-way door: arrow plain end -> band */}
      <path d="M 380 230 L 600 230" stroke={accent} strokeWidth={10} strokeLinecap="round" />
      <path d="M 590 205 L 625 230 L 590 255 Z" fill={accent} />
      {kick && (
        <g>
          <ellipse cx={500} cy={470} rx={230} ry={60} fill="none" stroke={accent} strokeOpacity={0.4} strokeWidth={4} strokeDasharray="8 10" />
          {dots}
        </g>
      )}
    </g>
  );
};

const Pot: React.FC<Live> = ({ frame }) => {
  const t = 0.5 + 0.5 * Math.sin(frame / 38);        // 0 at the ground end, 1 at the 3.3 V end
  const a0 = (225 * Math.PI) / 180; const sweep = (270 * Math.PI) / 180;
  const ang = a0 - t * sweep;                          // ground end bottom-left, 3.3 V end bottom-right
  const cx = 500; const cy = 300; const r = 175;
  const pt = (a: number, rr = r) => ({ x: cx + Math.cos(a) * rr, y: cy - Math.sin(a) * rr });
  const s0 = pt(a0); const s1 = pt(a0 - sweep);
  const w = pt(ang);
  const volts = (t * 3.3).toFixed(1);
  return (
    <g>
      <path d={`M ${s0.x} ${s0.y} A ${r} ${r} 0 1 1 ${s1.x} ${s1.y}`} stroke="#8a5a2b" strokeWidth={34} fill="none" strokeLinecap="round" />
      <path d={`M ${s0.x} ${s0.y} L 390 520 M ${s1.x} ${s1.y} L 610 520 M ${cx} ${cy} L 500 520`} stroke="#c9c9c9" strokeWidth={10} fill="none" />
      <line x1={cx} y1={cy} x2={w.x} y2={w.y} stroke="#e6e6e6" strokeWidth={12} strokeLinecap="round" />
      <circle cx={w.x} cy={w.y} r={18} fill="#ffd60a" />
      <circle cx={cx} cy={cy} r={22} fill="#555" />
      {/* meter */}
      <rect x={850} y={110} width={60} height={260} rx={12} fill="#14161c" stroke="#444" strokeWidth={3} />
      <rect x={856} y={116 + 248 * (1 - t)} width={48} height={248 * t} rx={8} fill="#ffd60a" />
      <text x={880} y={410} fontSize={30} fontWeight={800} textAnchor="middle" fill="#fff" fontFamily={fonts.mono}>{volts} V</text>
    </g>
  );
};

const LIVE: Record<string, React.FC<Live>> = { rgbled: RgbLed, mix: Mix, pwm: Pwm, buzzer: Buzzer, diode: Diode, pot: Pot };

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
            {(() => {
              const C = LIVE[scene.component ?? ''];
              if (C) {
                const shown = new Set(callouts.filter((_, i) => frame >= cueAt(i)).map((c) => c.anchor));
                return <C frame={frame} shown={shown} accent={accent} />;
              }
              return scene.component === 'resistor' ? <Resistor /> : scene.component === 'transistor' ? <Transistor /> : <Led lit={lit} />;
            })()}
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
