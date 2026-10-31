// Breadboard scene: an SVG solderless breadboard where parts snap into holes,
// one [[next]] group at a time, with a camera that eases toward each group.
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from './theme';
import type { BoardItem, Scene } from './types';

const P = 26; // hole pitch in SVG units
const COLS = 63;
const ROWS_FAR = 'jihgf';
const ROWS_NEAR = 'edcba';
const MARGIN_X = 46;

// Vertical layout (top to bottom): far+ rail, far- rail, j..f, channel, e..a, near+ rail, near- rail.
const Y = (() => {
  const y: Record<string, number> = {};
  let cur = 40;
  y['far+'] = cur;
  y['far-'] = (cur += P);
  cur += P * 1.6;
  for (const r of ROWS_FAR) { y[r] = cur; cur += P; }
  cur += P; // centre channel takes one extra row of space
  for (const r of ROWS_NEAR) { y[r] = cur; cur += P; }
  y.channel = (y.f + y.e) / 2;
  cur += P * 0.6;
  y['near+'] = cur;
  y['near-'] = (cur += P);
  y.bottom = cur + 40;
  return y;
})();

const W = MARGIN_X * 2 + (COLS - 1) * P;
const H = Y.bottom;
const colX = (c: number) => MARGIN_X + (c - 1) * P;

type Pt = { x: number; y: number };

// "j14" -> point; "far+:1" -> rail point at column 1.
export function holePoint(ref: string): Pt {
  const rail = ref.match(/^(far|near)([+-]):(\d+)$/);
  if (rail) return { x: colX(Number(rail[3])), y: Y[`${rail[1]}${rail[2]}`] };
  const m = ref.match(/^([a-j])(\d+)$/);
  if (!m) throw new Error(`bad hole ref: ${ref}`);
  return { x: colX(Number(m[2])), y: Y[m[1]] };
}

const BAND: Record<string, string> = {
  black: '#1b1b1b', brown: '#7a4a24', red: '#d1342f', orange: '#ee7d22', yellow: '#f2d23c',
  green: '#2f9e4f', blue: '#2d63d1', violet: '#8b4fc9', grey: '#8a8a8a', white: '#f2f2f2', gold: '#c9a646',
};
const LED: Record<string, string> = { red: '#ff3b30', green: '#30d158', blue: '#2f7bff', yellow: '#ffd60a', white: '#f5f5f5' };

function itemPoints(it: BoardItem): Pt[] {
  switch (it.kind) {
    case 'pico': {
      const a = holePoint(`c${it.col ?? 1}`);
      const b = holePoint(`h${(it.col ?? 1) + 19}`);
      return [{ x: a.x - P, y: b.y - P * 0.6 }, { x: b.x + P * 0.6, y: a.y + P * 0.6 }];
    }
    case 'buzzer': {
      const a = holePoint(it.at![0]); const b = holePoint(it.at![1]);
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = P * 2.36;
      return [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r }];
    }
    case 'glow': return [];
    case 'strip': {
      const b = stripBox(it.at![0]);
      return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }];
    }
    default:
      return (it.at ?? []).map(holePoint);
  }
}

// Bounding box of a group, padded and expanded to the board's aspect ratio.
function focusBox(items: BoardItem[]): { x: number; y: number; w: number; h: number } {
  const pts = items.flatMap(itemPoints);
  // Steps that only highlight a few holes get a closer camera.
  const holesOnly = items.length > 0 && items.every((it) => it.kind === 'strip' && !it.at![0].includes(':'));
  if (!pts.length) return { x: 0, y: 0, w: W, h: H };
  let x0 = Math.min(...pts.map((p) => p.x)) - P * 5;
  let x1 = Math.max(...pts.map((p) => p.x)) + P * 5;
  const y0 = Math.min(...pts.map((p) => p.y));
  const y1 = Math.max(...pts.map((p) => p.y));
  let w = Math.max(x1 - x0, holesOnly ? W / 3.2 : W / 1.9);
  const cx = (x0 + x1) / 2;
  let h = w * (H / W);
  if (h < y1 - y0 + P * 4) { h = y1 - y0 + P * 4; w = h * (W / H); }
  w = Math.min(w, W); h = Math.min(h, H);
  x0 = Math.max(0, Math.min(W - w, cx - w / 2));
  const cy = (y0 + y1) / 2;
  const y = Math.max(0, Math.min(H - h, cy - h / 2));
  x1 = x0 + w;
  return { x: x0, y, w: x1 - x0, h };
}

// Control point of a jumper's arc. Mostly-horizontal wires arc away from the channel;
// mostly-vertical ones (e.g. down to a rail) bow left so they don't cover
// parts in their own column.
function wireCurve(a: Pt, b: Pt, bow?: number) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x) * 2;
  const auto = vertical ? Math.max(P * 2.6, Math.min(70, 18 + dist * 0.18)) : Math.min(70, 18 + dist * 0.18);
  const lift = bow ?? auto;
  // Wires lying in the near half arc toward the viewer, over the empty near
  // rails, so they never cover parts standing by the centre channel.
  const near = a.y > Y.channel && b.y > Y.channel;
  return { mx: (a.x + b.x) / 2 - (vertical ? lift : 0), my: (a.y + b.y) / 2 + (vertical ? 0 : near ? lift : -lift), lift, dist };
}

const TRANSIENT = new Set(['glow', 'strip', 'flow', 'remove']);
const sameHoles = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

// The holes joined underneath a hole (its 5-hole column half), or a whole rail.
function stripBox(ref: string) {
  if (ref.includes(':')) {
    const y = Y[ref.split(':')[0]];
    return { x: MARGIN_X - P * 0.5, y: y - P * 0.42, w: (COLS - 1) * P + P, h: P * 0.84 };
  }
  const { x } = holePoint(ref);
  const far = ROWS_FAR.includes(ref[0]);
  const top = far ? Y.j : Y.e; const bot = far ? Y.f : Y.a;
  return { x: x - P * 0.42, y: top - P * 0.42, w: P * 0.84, h: bot - top + P * 0.84 };
}

const Strips: React.FC<{ items: BoardItem[]; p: number; frame: number; accent: string }> = ({ items, p, frame, accent }) => {
  const pulse = 0.55 + 0.25 * Math.sin(frame / 6);
  return (
    <g opacity={p}>
      {items.filter((it) => it.kind === 'strip').map((it, i) => {
        const b = stripBox(it.at![0]);
        const color = it.color ?? accent;
        return <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={P * 0.4}
          fill={color} fillOpacity={0.28 * pulse} stroke={color} strokeWidth={3} />;
      })}
    </g>
  );
};

// Current: dots marching along the refs in order, following any wire that
// joins two consecutive refs.
function flowPolyline(refs: string[], wires: BoardItem[]): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < refs.length; i++) {
    const b = holePoint(refs[i]);
    if (i === 0) { pts.push(b); continue; }
    const w = wires.find((it) => it.at && ((it.at[0] === refs[i - 1] && it.at[1] === refs[i]) || (it.at[1] === refs[i - 1] && it.at[0] === refs[i])));
    if (w) {
      const [wa, wb] = w.at!.map(holePoint);
      const { mx, my } = wireCurve(wa, wb, w.bow);
      const fwd = w.at![0] === refs[i - 1];
      for (let k = 1; k <= 24; k++) {
        const t0 = k / 24; const t = fwd ? t0 : 1 - t0;
        const q = { x: (1 - t) ** 2 * wa.x + 2 * (1 - t) * t * mx + t * t * wb.x, y: (1 - t) ** 2 * wa.y + 2 * (1 - t) * t * my + t * t * wb.y };
        pts.push(q);
      }
      pts[pts.length - 1] = b;
    } else {
      pts.push(b);
    }
  }
  return pts;
}

const Flows: React.FC<{ items: BoardItem[]; wires: BoardItem[]; p: number; frame: number }> = ({ items, wires, p, frame }) => (
  <g opacity={p}>
    {items.filter((it) => it.kind === 'flow').map((it, fi) => {
      const pts = flowPolyline(it.at!, wires);
      const segs: number[] = [0];
      for (let i = 1; i < pts.length; i++) segs.push(segs[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const total = segs[segs.length - 1];
      const gap = P * 1.1;
      const shift = (frame * 2.2) % gap;
      const dots: Pt[] = [];
      for (let d = shift; d < total; d += gap) {
        let k = 1;
        while (k < segs.length - 1 && segs[k] < d) k++;
        const t = (d - segs[k - 1]) / Math.max(1e-6, segs[k] - segs[k - 1]);
        dots.push({ x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * t });
      }
      const color = it.color ?? '#ffd23f';
      return (
        <g key={fi}>
          <polyline points={pts.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={5} strokeLinejoin="round" />
          {dots.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={6} fill={color} stroke="#7a5b00" strokeWidth={1.5} />)}
        </g>
      );
    })}
  </g>
);

const Holes: React.FC = () => {
  const els: React.ReactNode[] = [];
  for (let c = 1; c <= COLS; c++) {
    for (const r of ROWS_FAR + ROWS_NEAR) {
      const { x, y } = holePoint(`${r}${c}`);
      els.push(<rect key={`${r}${c}`} x={x - 4.5} y={y - 4.5} width={9} height={9} rx={1.5} fill="#3b3a36" />);
    }
    if (c % 5 !== 0) {
      for (const rail of ['far+', 'far-', 'near+', 'near-']) {
        els.push(<rect key={`${rail}${c}`} x={colX(c) - 4.5} y={Y[rail] - 4.5} width={9} height={9} rx={1.5} fill="#3b3a36" />);
      }
    }
  }
  return <g>{els}</g>;
};

const Board: React.FC = () => {
  const labels: React.ReactNode[] = [];
  for (let c = 1; c <= COLS; c++) {
    if (c === 1 || c % 5 === 0) {
      labels.push(<text key={`t${c}`} x={colX(c)} y={Y.j - P * 0.75} fontSize={11} textAnchor="middle" fill="#8d887a" fontFamily={fonts.mono}>{c}</text>);
      labels.push(<text key={`b${c}`} x={colX(c)} y={Y.a + P * 0.95} fontSize={11} textAnchor="middle" fill="#8d887a" fontFamily={fonts.mono}>{c}</text>);
    }
  }
  for (const r of ROWS_FAR + ROWS_NEAR) {
    labels.push(<text key={`r${r}`} x={MARGIN_X - 22} y={Y[r] + 4} fontSize={12} textAnchor="middle" fill="#8d887a" fontFamily={fonts.mono}>{r}</text>);
  }
  const line = (y: number, color: string, k: string) => (
    <line key={k} x1={MARGIN_X - 10} x2={W - MARGIN_X + 10} y1={y} y2={y} stroke={color} strokeWidth={2.5} />
  );
  return (
    <g>
      <rect x={0} y={0} width={W} height={H} rx={18} fill="#f1ede2" />
      <rect x={MARGIN_X - 14} y={Y.channel - 7} width={W - MARGIN_X * 2 + 28} height={14} rx={4} fill="#d9d3c3" />
      {line(Y['far+'] - P * 0.55, '#d6453d', 'l1')}
      {line(Y['far-'] + P * 0.55, '#3a6fd1', 'l2')}
      {line(Y['near+'] - P * 0.55, '#d6453d', 'l3')}
      {line(Y['near-'] + P * 0.55, '#3a6fd1', 'l4')}
      <text x={MARGIN_X - 26} y={Y['far+'] + 5} fontSize={16} fill="#d6453d" fontWeight={800}>+</text>
      <text x={MARGIN_X - 26} y={Y['far-'] + 5} fontSize={18} fill="#3a6fd1" fontWeight={800}>−</text>
      <text x={MARGIN_X - 26} y={Y['near+'] + 5} fontSize={16} fill="#d6453d" fontWeight={800}>+</text>
      <text x={MARGIN_X - 26} y={Y['near-'] + 5} fontSize={18} fill="#3a6fd1" fontWeight={800}>−</text>
      <Holes />
      {labels}
    </g>
  );
};

// p: 0..1 placement progress (drop-in); lit: 0..1 glow (buzzer: wave phase).
const Part: React.FC<{ it: BoardItem; p: number; lit: number; accent: string }> = ({ it, p, lit, accent }) => {
  const drop = (1 - p) * -60;
  const op = Math.min(1, p * 1.6);
  const g = (children: React.ReactNode) => <g opacity={op} transform={`translate(0 ${drop})`}>{children}</g>;
  switch (it.kind) {
    case 'pico': {
      const [tl, br] = itemPoints(it);
      const pins: React.ReactNode[] = [];
      for (let i = 0; i < 20; i++) {
        const c = (it.col ?? 1) + i;
        for (const r of ['c', 'h']) {
          const { x, y } = holePoint(`${r}${c}`);
          pins.push(<rect key={`${r}${c}`} x={x - 5} y={y - 5} width={10} height={10} rx={2} fill="#d4b25a" />);
        }
      }
      const midY = (tl.y + br.y) / 2;
      return g(
        <g>
          <rect x={tl.x} y={tl.y} width={br.x - tl.x} height={br.y - tl.y} rx={10} fill="#1f7a46" stroke="#155c34" strokeWidth={2} />
          <rect x={tl.x - 22} y={midY - 16} width={34} height={32} rx={4} fill="#c7cbd1" stroke="#8d939c" strokeWidth={2} />
          <rect x={tl.x + (br.x - tl.x) * 0.45} y={midY - 26} width={52} height={52} rx={4} fill="#22262b" />
          <text x={tl.x + (br.x - tl.x) * 0.2} y={midY + 9} fontSize={26} fontWeight={800} fill="#e9f5ee" fontFamily={fonts.sans}>Pico 2 W</text>
          <text x={tl.x + 14} y={midY - 16} fontSize={12} fill="#cfe9da" fontFamily={fonts.mono}>USB</text>
          {pins}
        </g>,
      );
    }
    case 'wire': {
      const [a, b] = it.at!.map(holePoint);
      const { mx, my, lift, dist } = wireCurve(a, b, it.bow);
      const d = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
      const len = dist * 1.25 + lift;
      const color = it.color ?? '#f5a623';
      return (
        <g opacity={Math.min(1, p * 3)}>
          <path d={d} fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={9} strokeLinecap="round" transform="translate(2 4)"
            strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
          <path d={d} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
          <circle cx={a.x} cy={a.y} r={6} fill="#cfcfcf" />
          {p > 0.95 && <circle cx={b.x} cy={b.y} r={6} fill="#cfcfcf" />}
        </g>
      );
    }
    case 'resistor': {
      const [a, b] = it.at!.map(holePoint);
      const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const bands = (it.bands ?? []).map((n) => BAND[n] ?? n);
      return g(
        <g>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b9b9b9" strokeWidth={3.5} />
          <circle cx={a.x} cy={a.y} r={5.5} fill="#cfcfcf" stroke="#8f8f8f" strokeWidth={1} />
          <circle cx={b.x} cy={b.y} r={5.5} fill="#cfcfcf" stroke="#8f8f8f" strokeWidth={1} />
          <g transform={`translate(${mx} ${my}) rotate(${ang})`}>
            <rect x={-26} y={-9} width={52} height={18} rx={8} fill="#7fb6e8" stroke="#5d8fbd" strokeWidth={1.5} />
            {bands.map((c, i) => <rect key={i} x={-18 + i * 8.5} y={-9} width={4.5} height={18} fill={c} />)}
          </g>
        </g>,
      );
    }
    case 'led': {
      // Top-down: a 5 mm dome straddling its two legs; "+" marks the long leg.
      const [a, k] = it.at!.map(holePoint);
      const color = LED[it.color ?? 'red'] ?? it.color!;
      const cx = (a.x + k.x) / 2; const cy = (a.y + k.y) / 2;
      return g(
        <g>
          {lit > 0 && <circle cx={cx} cy={cy} r={40 * lit} fill={color} opacity={0.35 * lit} />}
          <circle cx={cx} cy={cy} r={P * 0.95} fill={color} opacity={0.6 + 0.4 * lit} stroke="rgba(0,0,0,.3)" strokeWidth={2} />
          <circle cx={cx - P * 0.3} cy={cy - P * 0.3} r={P * 0.25} fill="#fff" opacity={0.45} />
          <circle cx={a.x} cy={a.y} r={3.5} fill="#bdbdbd" />
          <circle cx={k.x} cy={k.y} r={3.5} fill="#bdbdbd" />
          <text x={a.x} y={a.y - P * 1.15} fontSize={14} fontWeight={800} textAnchor="middle" fill="#3b3a36">+</text>
        </g>,
      );
    }
    case 'transistor': {
      // Top-down TO-92: D-shaped body over its three legs, flat face toward the
      // viewer (down the screen), round back away from them.
      const pts = it.at!.map(holePoint);
      const cx = pts[1].x; const cy = pts[1].y;
      // E/B/C are printed on the body directly over the leg each one names.
      const hw = P * 1.45; const flatY = cy + P * 0.45; const backY = cy - P * 0.6;
      return g(
        <g>
          <path d={`M ${cx - hw} ${flatY} L ${cx + hw} ${flatY} L ${cx + hw} ${backY} Q ${cx} ${backY - P * 0.9} ${cx - hw} ${backY} Z`} fill="#202124" />
          {pts.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={4} fill="#cfcfcf" />)}
          {['E', 'B', 'C'].map((l, i) => (
            <text key={l} x={pts[i].x} y={cy - P * 0.3} fontSize={13} fontWeight={800} textAnchor="middle" fill="#f2f2f2" fontFamily={fonts.mono}>{l}</text>
          ))}
        </g>,
      );
    }
    case 'rgbled': {
      // Clear 4-leg LED seen from above: legs R, common (+), G, B.
      const pts = it.at!.map(holePoint);
      const cx = (pts[1].x + pts[2].x) / 2; const cy = (pts[0].y + pts[3].y) / 2;
      const color = it.color ?? '#ffffff';
      return g(
        <g>
          {lit > 0 && <circle cx={cx} cy={cy} r={P * 2.2 * lit} fill={color} opacity={0.35 * lit} />}
          <circle cx={cx} cy={cy} r={P * 1.25} fill={lit > 0 ? color : '#eef3f7'} fillOpacity={lit > 0 ? 0.55 + 0.45 * lit : 0.85}
            stroke="rgba(0,0,0,.3)" strokeWidth={2} />
          <circle cx={cx - P * 0.4} cy={cy - P * 0.4} r={P * 0.3} fill="#fff" opacity={0.6} />
          {pts.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={3.5} fill="#9a9a9a" />)}
          {['R', '+', 'G', 'B'].map((l, i) => (
            <text key={l} x={pts[i].x} y={pts[i].y - P * 1.45} fontSize={13} fontWeight={800} textAnchor="middle"
              fill={['#d6453d', '#3b3a36', '#2f9e4f', '#2d63d1'][i]} fontFamily={fonts.mono}>{l}</text>
          ))}
        </g>,
      );
    }
    case 'pot': {
      // Potentiometer from above: legs in a row, square body and round knob
      // hanging toward the viewer (down the screen), over the centre channel.
      const pts = it.at!.map(holePoint);
      const mid = pts[1];
      const bw = P * 4.6; const bh = P * 4.2;
      const bx = mid.x - bw / 2; const by = mid.y + P * 0.35;
      const kx = mid.x; const ky = by + bh / 2;
      const ang = ((it.angle ?? 0) * Math.PI) / 180;
      return g(
        <g>
          <rect x={bx} y={by} width={bw} height={bh} rx={6} fill="#2f6fb3" stroke="#1f4f86" strokeWidth={2} />
          <circle cx={kx} cy={ky} r={P * 1.45} fill="#2a2b2e" stroke="#111" strokeWidth={2} />
          {Array.from({ length: 18 }, (_, i) => {
            const a = (i / 18) * Math.PI * 2;
            return <line key={i} x1={kx + Math.cos(a) * P * 1.15} y1={ky + Math.sin(a) * P * 1.15}
              x2={kx + Math.cos(a) * P * 1.42} y2={ky + Math.sin(a) * P * 1.42} stroke="#444" strokeWidth={2} />;
          })}
          <line x1={kx} y1={ky} x2={kx + Math.sin(ang) * P * 1.1} y2={ky - Math.cos(ang) * P * 1.1}
            stroke="#f2f2f2" strokeWidth={4} strokeLinecap="round" />
          {pts.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={4} fill="#cfcfcf" stroke="#888" />)}
        </g>,
      );
    }
    case 'diode': {
      // 1N4001: black body, silver band at the cathode (second hole).
      const [a, k] = it.at!.map(holePoint);
      const mx = (a.x + k.x) / 2; const my = (a.y + k.y) / 2;
      const ang = (Math.atan2(k.y - a.y, k.x - a.x) * 180) / Math.PI;
      return g(
        <g>
          <line x1={a.x} y1={a.y} x2={k.x} y2={k.y} stroke="#b9b9b9" strokeWidth={3.5} />
          <circle cx={a.x} cy={a.y} r={5} fill="#cfcfcf" />
          <circle cx={k.x} cy={k.y} r={5} fill="#cfcfcf" />
          <g transform={`translate(${mx} ${my}) rotate(${ang})`}>
            <rect x={-22} y={-9} width={44} height={18} rx={5} fill="#1d1d1f" />
            <rect x={12} y={-9} width={6} height={18} fill="#d8d8d8" />
          </g>
        </g>,
      );
    }
    case 'buzzer': {
      const [tl, br] = itemPoints(it);
      const cx = (tl.x + br.x) / 2; const cy = (tl.y + br.y) / 2; const r = (br.x - tl.x) / 2;
      const plus = holePoint(it.at![1]);
      return g(
        <g>
          {lit > 0 && [0, 1, 2].map((i) => {
            const t = (lit + i / 3) % 1;
            return <circle key={i} cx={cx} cy={cy} r={r + 10 + t * 70} fill="none" stroke={accent} strokeWidth={4} opacity={(1 - t) * 0.8} />;
          })}
          <circle cx={cx} cy={cy} r={r} fill="#18191b" opacity={0.94} />
          <circle cx={cx} cy={cy} r={r * 0.22} fill="#3a3b3e" />
          <text x={plus.x} y={cy - r * 0.45} fontSize={20} fontWeight={800} textAnchor="middle" fill="#e9e9e9">+</text>
        </g>,
      );
    }
    default:
      return null;
  }
};

// Points a tag must not cover: every leg/end hole plus the middle of each body.
function occupied(items: BoardItem[]): Pt[] {
  const out: Pt[] = [];
  for (const it of items) {
    if (TRANSIENT.has(it.kind) || it.kind === 'pico') continue;
    const pts = (it.at ?? []).filter((r) => /^[a-j]\d+$/.test(r)).map(holePoint);
    out.push(...pts);
    if (pts.length >= 2 && it.kind !== 'wire') {
      // Sample along the body so tags avoid resistors, LEDs and transistors.
      for (let k = 1; k < 4; k++) {
        out.push({ x: pts[0].x + ((pts.at(-1)!.x - pts[0].x) * k) / 4, y: pts[0].y + ((pts.at(-1)!.y - pts[0].y) * k) / 4 });
      }
    }
    if (it.kind === 'transistor') out.push({ x: pts[1].x, y: pts[1].y - P * 0.8 });
  }
  return out;
}

// Tags naming each hole the active group uses ("b24"), placed in the first
// direction that doesn't cover another part, hole or tag.
const HoleTags: React.FC<{ items: BoardItem[]; others: BoardItem[]; p: number; accent: string }> = ({ items, others, p, accent }) => {
  // Multi-leg parts in one row (the transistor) get a single "j54–j56" tag.
  const isGroupTag = (it: BoardItem) => it.kind === 'transistor';
  const tagged = (it: BoardItem) => !TRANSIENT.has(it.kind) || it.kind === 'remove';
  const refs = Array.from(new Set(items.flatMap((it) => (!tagged(it) || isGroupTag(it) ? [] : it.at ?? []))))
    .filter((r) => /^[a-j]\d+$/.test(r));
  const holes = refs.map((r) => ({ ref: r, pt: holePoint(r) }));
  const rings = Array.from(new Set(items.flatMap((it) => (!tagged(it) ? [] : it.at ?? []))))
    .filter((r) => /^[a-j]\d+$/.test(r)).map((r) => ({ ref: r, pt: holePoint(r) }));
  const taken: Pt[] = [...holes.map((h) => h.pt), ...occupied([...items, ...others])];
  // Tags are ~1.5 holes wide, so check their left and right ends too.
  const clear = (q: Pt) => [-P * 0.6, 0, P * 0.6].every((dx) =>
    !taken.some((t) => Math.abs(t.x - (q.x + dx)) < P * 0.55 && Math.abs(t.y - q.y) < P * 0.6));
  const tags = holes.map(({ ref, pt }) => {
    const dirs = [
      { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1.6, y: 0 }, { x: 1.6, y: 0 },
      { x: -1.2, y: -1 }, { x: 1.2, y: -1 }, { x: -1.2, y: 1 }, { x: 1.2, y: 1 },
    ];
    let pos = { x: pt.x, y: pt.y - P };
    for (const d of dirs) {
      const q = { x: pt.x + d.x * P, y: pt.y + d.y * P };
      if (clear(q)) { pos = q; break; }
    }
    taken.push(pos);
    return { ref, pt, pos };
  });
  for (const it of items.filter(isGroupTag)) {
    const pts = (it.at ?? []).map(holePoint);
    const mid = pts[Math.floor(pts.length / 2)];
    const ref = `${it.at![0]}–${it.at!.at(-1)}`;
    const cands = [{ x: mid.x, y: mid.y + P * 2 }, { x: mid.x, y: mid.y - P * 1.9 }, { x: mid.x, y: mid.y + P * 3 }];
    const pos = cands.find((q) => clear(q)) ?? cands[0];
    taken.push(pos);
    tags.push({ ref, pt: mid, pos });
  }
  return (
    <g opacity={p}>
      {rings.map(({ ref, pt }) => (
        <circle key={`r${ref}`} cx={pt.x} cy={pt.y} r={9} fill="none" stroke={accent} strokeWidth={3} />
      ))}
      {tags.map(({ ref, pos }) => (
        <g key={`t${ref}`}>
          <rect x={pos.x - 4 - ref.length * 4} y={pos.y - 10} width={8 + ref.length * 8} height={20} rx={6} fill="#14161c" stroke={accent} strokeWidth={1.5} />
          <text x={pos.x} y={pos.y + 5} fontSize={13} fontWeight={700} textAnchor="middle" fill="#ffffff" fontFamily={fonts.mono}>{ref}</text>
        </g>
      ))}
    </g>
  );
};

// Row letters pinned to the left edge of the current view, so they survive zoom.
const RowLetters: React.FC<{ x: number }> = ({ x }) => (
  <g>
    {(ROWS_FAR + ROWS_NEAR).split('').map((r) => (
      <g key={r}>
        <rect x={x + 4} y={Y[r] - 9} width={18} height={18} rx={4} fill="#e3ddcc" />
        <text x={x + 13} y={Y[r] + 5} fontSize={13} fontWeight={700} textAnchor="middle" fill="#5d584c" fontFamily={fonts.mono}>{r}</text>
      </g>
    ))}
  </g>
);

type Props = { scene: Scene; accent: string };

export const BreadboardScene: React.FC<Props> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const groups = scene.groups ?? [];
  const base = scene.base ?? [];
  const cueAt = (i: number) => scene.cues[i] ?? 12 + i * 20;
  const springAt = (at: number, damping = 16) => spring({ frame: frame - at, fps, config: { damping } });

  // Which group is active (latest cue that has fired).
  let active = -1;
  groups.forEach((_, i) => { if (frame >= cueAt(i)) active = i; });

  // Camera: ease from the previous focus to the active group's focus.
  const full = { x: 0, y: 0, w: W, h: H };
  const boxes = groups.map((gr) => (scene.zoom === false || gr.zoom === false ? full : focusBox(gr.items)));
  const prev = active <= 0 ? full : boxes[active - 1];
  const cur = active < 0 ? full : boxes[active];
  const t = active < 0 ? 0 : springAt(cueAt(active), 22);
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const vb = [lerp(prev.x, cur.x), lerp(prev.y, cur.y), lerp(prev.w, cur.w), lerp(prev.h, cur.h)];

  // Glow state per part id, from glow items in fired groups (later groups win).
  const lit: Record<string, number> = {};
  const glowColor: Record<string, string> = {};
  groups.forEach((gr, i) => {
    for (const it of gr.items) {
      if (it.kind !== 'glow' || !it.id) continue;
      const k = springAt(cueAt(i), 12);
      if (frame < cueAt(i)) continue;
      const on = it.on !== false;
      const was = lit[it.id] ?? 0;
      lit[it.id] = on ? Math.max(was, k) : was * (1 - k);
      if (it.color) glowColor[it.id] = it.color;
    }
  });
  // When (if ever) each part is lifted out by a `remove` step in this scene.
  // Only steps after the one that placed the part (placedIn = -1 for earlier scenes).
  const removedAt = (it: BoardItem, placedIn: number): number | undefined => {
    for (let i = placedIn + 1; i < groups.length; i++) {
      if (groups[i].items.some((r) => r.kind === 'remove' && sameHoles(r.at, it.at))) return cueAt(i);
    }
    return undefined;
  };
  // Buzzer waves cycle once a second while it's on.
  const buzzPhase = (frame % fps) / fps;
  const litValue = (it: BoardItem) => {
    if (!it.id || !lit[it.id]) return 0;
    return it.kind === 'buzzer' ? (lit[it.id] > 0.5 ? Math.max(0.001, buzzPhase) : 0) : lit[it.id];
  };

  const placed = [
    ...base.map((it) => ({ it, p: 1, from: -1 })),
    ...groups.flatMap((gr, i) => gr.items.filter((it) => !TRANSIENT.has(it.kind)).map((it) => {
      const at = cueAt(i);
      return { it, p: frame < at ? 0 : springAt(at), from: i };
    })),
  ].map(({ it, p, from }) => {
    const r = removedAt(it, from);
    const out = r !== undefined && frame >= r ? springAt(r) : 0;
    return { it: it.kind === 'rgbled' && it.id && glowColor[it.id] ? { ...it, color: glowColor[it.id] } : it, p, out };
  }).filter((x) => x.out < 0.98);
  // Draw order: board-level parts first, wires last so they sit on top.
  const order: Record<string, number> = { pico: 0, resistor: 1, diode: 1, transistor: 2, led: 3, rgbled: 3, pot: 4, buzzer: 4, wire: 5 };
  placed.sort((a, b) => (order[a.it.kind] ?? 9) - (order[b.it.kind] ?? 9));

  const label = active >= 0 ? groups[active].label : undefined;
  const labelIn = active >= 0 ? springAt(cueAt(active) + 4) : 0;

  return (
    <AbsoluteFill style={{ padding: '120px 120px 150px', fontFamily: fonts.sans, color: colors.text }}>
      {scene.heading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 30 }}>
          <div style={{ width: 10, height: 56, borderRadius: 5, background: accent }} />
          <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: -1.2 }}>{scene.heading}</div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <svg viewBox={vb.join(' ')} style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 24px 50px rgba(0,0,0,.5))' }}
          preserveAspectRatio="xMidYMid meet">
          <Board />
          {active >= 0 && <Strips items={groups[active].items} p={springAt(cueAt(active))} frame={frame} accent={accent} />}
          {placed.map(({ it, p, out }, i) => (
            <g key={i} opacity={1 - out} transform={`translate(0 ${-out * 70})`}>
              <Part it={it} p={p} accent={accent} lit={litValue(it)} />
            </g>
          ))}
          {active >= 0 && (
            <Flows items={groups[active].items} p={springAt(cueAt(active) + 6)} frame={frame}
              wires={[...base, ...groups.flatMap((g) => g.items)].filter((it) => it.kind === 'wire')} />
          )}
          {vb[0] > MARGIN_X * 0.5 && <RowLetters x={vb[0]} />}
          {active >= 0 && scene.tags !== false && (
            <HoleTags items={groups[active].items}
              others={[...base, ...groups.filter((_, i) => i !== active && i < active).flatMap((g) => g.items)]}
              p={springAt(cueAt(active) + 10)} accent={accent} />
          )}
        </svg>
      </div>
      <div style={{ height: 70, marginTop: 18, display: 'flex', justifyContent: 'center' }}>
        {label && (
          <div style={{
            opacity: labelIn, transform: `translateY(${(1 - labelIn) * 14}px)`,
            fontFamily: fonts.mono, fontSize: 38, padding: '10px 26px', borderRadius: 14,
            background: `${accent}22`, border: `2px solid ${accent}`, color: colors.text,
          }}>{label}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};
