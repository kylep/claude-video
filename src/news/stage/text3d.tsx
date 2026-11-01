// Extruded block-letter text built on @remotion/svg-3d-engine. Letters come from a 5x7 bitmap font
// (no font file needed), merged into horizontal runs; every run is extruded to a box.
import React from 'react';
import { parsePath } from '@remotion/paths';
import {
  extrudeAndTransformElement, reduceMatrices, rotateX, rotateY, threeDIntoSvgPath, transformPath,
  translateX, translateY, translateZ,
  type MatrixTransform4D,
} from '@remotion/svg-3d-engine';

const G: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
};

type Rect = { x: number; y: number; w: number; h: number };

// Split into at most `maxLines` lines on word boundaries when the text is too wide for `maxChars`.
function wrap(text: string, maxChars: number): string[] {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Rects (merged runs) centred on the origin, in px.
export function layoutText(text: string, maxWidth: number, maxCell: number, maxChars = 14) {
  const lines = wrap(text, maxChars);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const cell = Math.min(maxCell, Math.floor(maxWidth / (longest * 6 - 1)));
  const lineH = 9 * cell;
  const totalH = lines.length * lineH - 2 * cell;
  const rects: Rect[] = [];
  lines.forEach((line, li) => {
    const lw = line.length * 6 * cell - cell;
    const ox = -lw / 2;
    const oy = -totalH / 2 + li * lineH;
    [...line].forEach((ch, ci) => {
      const g = G[ch];
      if (!g) return;
      g.forEach((row, r) => {
        let c = 0;
        while (c < 5) {
          if (row[c] !== '#') { c++; continue; }
          let e = c;
          while (e < 5 && row[e] === '#') e++;
          rects.push({ x: ox + (ci * 6 + c) * cell, y: oy + r * cell, w: (e - c) * cell, h: cell });
          c = e;
        }
      });
    });
  });
  return { rects, cell, width: longest * 6 * cell, height: totalH };
}

type Face = { z: number; d: string; fill: string };

// Sides are all behind the (coplanar) front faces, so: every side far-to-near, then every front.
export function buildFaces(rects: Rect[], depth: number, m: MatrixTransform4D, front: string, side: string) {
  const frontM = reduceMatrices([m, translateZ(-depth / 2)]);
  const sides: Face[] = [];
  const fronts: Face[] = [];
  for (const r of rects) {
    const d = `M ${r.x} ${r.y} L ${r.x + r.w} ${r.y} L ${r.x + r.w} ${r.y + r.h} L ${r.x} ${r.y + r.h} Z`;
    for (const f of extrudeAndTransformElement({
      depth, pressInDepth: 0, sideColor: side, points: parsePath(d), crispEdges: false, transformations: m,
    })) {
      sides.push({ z: f.points.reduce((a, p) => a + p.point[2], 0) / f.points.length, d: threeDIntoSvgPath(f.points), fill: f.color });
    }
    fronts.push({ z: 0, d: transformPath({ path: d, transformation: frontM }), fill: front });
  }
  sides.sort((a, b) => b.z - a.z);
  return [...sides, ...fronts];
}

export const Text3D: React.FC<{
  rects: Rect[]; depth: number; front: string; side: string;
  rx: number; ry: number; tx: number; ty: number;
}> = ({ rects, depth, front, side, rx, ry, tx, ty }) => {
  const m = reduceMatrices([translateX(tx), translateY(ty), rotateX(rx), rotateY(ry)]);
  const faces = buildFaces(rects, depth, m, front, side);
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
      {faces.map((f, i) => (
        <path key={i} d={f.d} fill={f.fill} stroke={f.fill} strokeWidth={1} strokeLinejoin="round" />
      ))}
    </svg>
  );
};
