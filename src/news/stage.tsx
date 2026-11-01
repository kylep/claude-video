// Stage scenes: show open, section bumper, 3D globe, security alert.
import React, { useMemo } from 'react';
import { AbsoluteFill, Solid, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Lottie } from '@remotion/lottie';
import { noise2D, noise3D } from '@remotion/noise';
import { Starburst } from '@remotion/starburst';
import { ThreeCanvas } from '@remotion/three';
import { Pie, Circle } from '@remotion/shapes';
import { chromaticAberration } from '@remotion/effects/chromatic-aberration';
import { scanlines } from '@remotion/effects/scanlines';
import { tvSignalOff } from '@remotion/effects/tv-signal-off';
import { gridlines } from '@remotion/effects/gridlines';
import * as THREE from 'three';
import { SAFE, colors, fonts, itemFrame, useEnter, Kicker, type P } from './common';
import { Text3D, layoutText } from './stage/text3d';
import livePulse from './stage/live-pulse.json';
import landDots from './stage/land-dots.json';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;
const hex = (h: number, s: number, l: number) => {
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
};
// react-three-fiber intrinsic elements, loosely typed (three has no types installed).
const E = Object.fromEntries(['mesh', 'group', 'lineSegments', 'points', 'bufferGeometry', 'bufferAttribute', 'lineBasicMaterial', 'pointsMaterial', 'sphereGeometry', 'meshBasicMaterial', 'shaderMaterial', 'ringGeometry', 'cylinderGeometry'].map((t) => [t, t])) as unknown as Record<string, React.FC<any>>;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// Accent hex -> hue degrees, so scenes can derive tints from the brand colour.
function hueOf(c: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) return 20;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// ---------------------------------------------------------------- OPEN

const BlobField: React.FC<{ hue: number; count?: number }> = ({ hue, count = 26 }) => {
  const frame = useCurrentFrame();
  const t = frame / 90;
  return (
    <AbsoluteFill style={{ mixBlendMode: 'screen', filter: 'blur(40px)' }}>
      {Array.from({ length: count }, (_, i) => {
        const bx = (noise2D('bx', i, 0) * 0.5 + 0.5) * 1920;
        const by = (noise2D('by', i, 0) * 0.5 + 0.5) * 1080;
        const x = bx + noise3D('x', i, t, 0) * 260;
        const y = by + noise3D('y', i, t, 5) * 200;
        const r = 70 + (noise2D('r', i, 1) * 0.5 + 0.5) * 150;
        const h = hue + noise2D('h', i, 2) * 40;
        const a = 0.16 + (noise3D('a', i, t * 1.5, 3) * 0.5 + 0.5) * 0.2;
        return <div key={i} style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', background: hsl(h, 80, 55, a) }} />;
      })}
    </AbsoluteFill>
  );
};

// Little bright motes drifting on noise (sharp, unlike the blurred blobs).
const Motes: React.FC<{ hue: number; count?: number }> = ({ hue, count = 70 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({ length: count }, (_, i) => {
        const bx = (noise2D('mx', i, 0) * 0.5 + 0.5) * 1920;
        const by = (noise2D('my', i, 0) * 0.5 + 0.5) * 1080;
        const x = bx + noise3D('mdx', i, frame / 120, 0) * 160;
        const y = by - ((frame * (0.2 + (noise2D('ms', i, 4) * 0.5 + 0.5) * 0.5)) % 1080) + 0;
        const yy = ((y % 1080) + 1080) % 1080;
        const s = 2 + (noise2D('msz', i, 0) * 0.5 + 0.5) * 5;
        return <div key={i} style={{ position: 'absolute', left: x, top: yy, width: s, height: s, borderRadius: '50%', background: hsl(hue + 20, 90, 80, 0.6) }} />;
      })}
    </AbsoluteFill>
  );
};

export const OpenScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hue = scene.hue ?? hueOf(accent);
  const title = scene.title ?? scene.headline ?? 'NEWS';
  const lay = useMemo(() => layoutText(title, 1480, 30, 12), [title]);
  const p = spring({ frame: frame - 4, fps, config: { damping: 20, stiffness: 60, mass: 1.3 } });
  const ry = (1 - p) * -1.25 + Math.sin(frame / 38) * 0.3 - 0.3;
  const rx = (1 - p) * 0.35 + Math.sin(frame / 52) * 0.1 + 0.12;
  const sub = useEnter(34);
  const wipe = interpolate(frame, [18, 50], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, ${hsl(hue, 45, 14)} 0%, ${colors.bg} 70%)`, fontFamily: fonts.sans, color: colors.text }}>
      <BlobField hue={hue} />
      <Motes hue={hue} />
      <div style={{ position: 'absolute', top: SAFE.top, left: SAFE.side, display: 'flex', alignItems: 'center', gap: 6, opacity: useEnter(6) }}>
        <Lottie animationData={livePulse as never} loop style={{ width: 110, height: 110 }} />
        <span style={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 30, letterSpacing: 6, color: '#ff4d58' }}>WEEKLY</span>
      </div>
      {scene.date && (
        <div style={{ position: 'absolute', top: SAFE.top + 34, right: SAFE.side, fontFamily: fonts.mono, fontSize: 30, letterSpacing: 4, color: colors.muted, opacity: useEnter(10) }}>
          {scene.date.toUpperCase()}
        </div>
      )}
      <Text3D
        rects={lay.rects} depth={lay.cell * 3.2}
        front={hex(hue, 20, 96)} side={hex(hue, 75, 38)}
        rx={rx} ry={ry} tx={960} ty={450}
      />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 450 + lay.height / 2 + 70, textAlign: 'center', opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>
        <div style={{ margin: '0 auto 26px', height: 6, width: 560 * wipe, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
        {scene.subtitle && <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: 2 }}>{scene.subtitle}</div>}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- BUMPER

const Shimmer: React.FC<{ hue: number }> = ({ hue }) => {
  const frame = useCurrentFrame();
  const cols = 32, rows = 18;
  const w = 1920 / cols, h = 1080 / rows;
  return (
    <AbsoluteFill style={{ mixBlendMode: 'overlay' }}>
      {Array.from({ length: cols * rows }, (_, i) => {
        const cx = i % cols, cy = Math.floor(i / cols);
        const n = noise3D('shim', cx * 0.18, cy * 0.18, frame / 26);
        const a = Math.max(0, n) * 0.55;
        return <div key={i} style={{ position: 'absolute', left: cx * w, top: cy * h, width: w + 1, height: h + 1, background: hsl(hue + 30, 90, 70, a) }} />;
      })}
    </AbsoluteFill>
  );
};

export const BumperScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hue = scene.hue ?? hueOf(accent);
  const word = scene.title ?? scene.kicker ?? scene.headline ?? 'NEWS';
  const lay = useMemo(() => layoutText(word, 1500, 40, 10), [word]);
  const p = spring({ frame, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
  const ry = (1 - p) * 1.6 + Math.sin(frame / 20) * 0.2 - 0.35;
  const sc = interpolate(frame, [0, 12], [0.6, 1], clamp);
  const sub = interpolate(frame, [10, 22], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: colors.bg, fontFamily: fonts.sans, color: colors.text }}>
      <Starburst rays={14} colors={[hex(hue, 80, 22), hex(hue + 25, 85, 40)]} rotation={frame * 1.2} vignette={0.65} />
      <Shimmer hue={hue} />
      <AbsoluteFill style={{ transform: `scale(${sc})`, transformOrigin: '50% 45%' }}>
        <Text3D
          rects={lay.rects} depth={lay.cell * 3.4}
          front="#ffffff" side={hex(hue + 10, 85, 30)}
          rx={0.16} ry={ry} tx={960} ty={480}
        />
      </AbsoluteFill>
      {scene.subtitle && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 480 + lay.height / 2 + 70, display: 'flex', justifyContent: 'center', opacity: sub }}>
          <div style={{ background: 'rgba(8,10,16,0.82)', padding: '14px 40px', borderLeft: `10px solid ${accent}`, fontSize: 42, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', transform: `translateX(${(1 - sub) * -60}px)` }}>
            {scene.subtitle}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- shared text column

const PointList: React.FC<{ scene: P['scene']; accent: string; width: number; size?: number }> = ({ scene, accent, width, size = 36 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width }}>
    {(scene.points ?? []).map((pt, i) => <PointRow key={i} at={itemFrame(scene, i)} text={pt} accent={accent} size={size} />)}
  </div>
);
const PointRow: React.FC<{ at: number; text: string; accent: string; size: number }> = ({ at, text, accent, size }) => {
  const p = useEnter(at);
  return (
    <div style={{ opacity: p, transform: `translateX(${(1 - p) * -30}px)`, display: 'flex', gap: 18, alignItems: 'flex-start', fontSize: size, lineHeight: 1.25, fontWeight: 600 }}>
      <div style={{ width: 12, height: 12, marginTop: size * 0.4, borderRadius: 2, background: accent, flexShrink: 0 }} />
      <div>{text}</div>
    </div>
  );
};

// ---------------------------------------------------------------- GLOBE

const R = 1.5;
const CAM_Z = 9;
const FOV = 30;
const FOCAL = 540 / Math.tan((FOV / 2) * Math.PI / 180);
const GX = (1390 - 960) * (CAM_Z - R) / FOCAL;
const GY = (540 - 455) * CAM_Z / FOCAL;
const rad = (d: number) => (d * Math.PI) / 180;
const dirOf = (lat: number, lon: number): [number, number, number] =>
  [Math.cos(rad(lat)) * Math.sin(rad(lon)), Math.sin(rad(lat)), Math.cos(rad(lat)) * Math.cos(rad(lon))];

function makeGlobeData() {
  // Real coastlines: Natural Earth 1:110m land (public domain) sampled onto a Fibonacci sphere.
  const land: number[] = [];
  for (const [lat, lon] of landDots as [number, number][]) land.push(...dirOf(lat, lon).map((v) => v * R * 1.003));
  const grat: number[] = [];
  const seg = (a: number[], b: number[]) => grat.push(...a, ...b);
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = 0; lon < 360; lon += 4) {
      seg(dirOf(lat, lon).map((v) => v * R * 1.001), dirOf(lat, lon + 4).map((v) => v * R * 1.001));
    }
  }
  for (let lon = 0; lon < 360; lon += 15) {
    for (let lat = -88; lat < 88; lat += 4) {
      seg(dirOf(lat, lon).map((v) => v * R * 1.001), dirOf(lat + 4, lon).map((v) => v * R * 1.001));
    }
  }
  return { land: new Float32Array(land), grat: new Float32Array(grat) };
}

const atmoVert = 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const atmoFrag = 'varying vec3 vN; uniform vec3 uColor; uniform float uPow; void main(){ float i = uPow < 0.0 ? pow(1.0 - abs(vN.z), -uPow) * 0.55 : pow(clamp(1.0 + vN.z, 0.0, 1.0), uPow) * 0.9; gl_FragColor = vec4(uColor, 1.0) * i; }';

const Marker: React.FC<{ lat: number; lon: number; active: number; pulse: number; color: string }> = ({ lat, lon, active, pulse, color }) => {
  const d = dirOf(lat, lon);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...d)), [lat, lon]);
  const s = 1 + pulse * 4.5;
  return (
    <E.group position={[d[0] * R * 1.01, d[1] * R * 1.01, d[2] * R * 1.01]} quaternion={q}>
      <E.mesh><E.sphereGeometry args={[0.028 + active * 0.014, 16, 16]} /><E.meshBasicMaterial color={active > 0.5 ? '#ffffff' : color} /></E.mesh>
      <E.mesh scale={[s, s, s]}><E.ringGeometry args={[0.05, 0.062, 48]} /><E.meshBasicMaterial color={color} transparent opacity={active * (1 - pulse) * 0.95} side={THREE.DoubleSide} /></E.mesh>
      <E.mesh position={[0, 0, 0.11]}><E.cylinderGeometry args={[0.004, 0.004, 0.22, 6]} /><E.meshBasicMaterial color={color} transparent opacity={0.3 + active * 0.5} />
      </E.mesh>
    </E.group>
  );
};

export const GlobeScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pins = scene.pins ?? [];
  const hue = hueOf(accent);
  const data = useMemo(makeGlobeData, []);
  const cool = hex((hue + 170) % 360, 85, 62);

  // Orientation: sequential eases from pin to pin; intro spins in from the west.
  let lat = (pins[0]?.lat ?? 20) * 0.4, lon = (pins[0]?.lon ?? 0) - 110;
  let activeIdx = -1, since = 0;
  pins.forEach((pin, i) => {
    const at = itemFrame(scene, i);
    if (frame < at - 18 && i > 0) return;
    const k = spring({ frame: frame - (i === 0 ? 0 : at), fps, config: { damping: 30, stiffness: 55, mass: 1.2 } });
    let dl = pin.lon - lon;
    dl = ((((dl + 180) % 360) + 360) % 360) - 180;
    lat = lat + (pin.lat - lat) * k;
    lon = lon + dl * k;
    if (frame >= at + (i === 0 ? 22 : 16)) { activeIdx = i; since = frame - at; }
  });
  lon += Math.sin(frame / 70) * 1.2;

  // Projection of the active pin for the DOM label.
  const project = (pl: number, plon: number) => {
    const [x, y, z] = dirOf(pl, plon).map((v) => v * R);
    const th = -rad(lon), ph = rad(lat);
    const x1 = x * Math.cos(th) + z * Math.sin(th);
    const z1 = -x * Math.sin(th) + z * Math.cos(th);
    const y2 = y * Math.cos(ph) - z1 * Math.sin(ph);
    const z2 = y * Math.sin(ph) + z1 * Math.cos(ph);
    const X = x1 + GX, Y = y2 + GY, Z = z2;
    return { sx: 960 + (FOCAL * X) / (CAM_Z - Z), sy: 540 - (FOCAL * Y) / (CAM_Z - Z), facing: z2 > 0.6 };
  };
  const act = activeIdx >= 0 ? pins[activeIdx] : undefined;
  const pj = act ? project(act.lat, act.lon) : undefined;
  const lp = act ? spring({ frame: since, fps, config: { damping: 18 } }) : 0;
  const intro = interpolate(frame, [0, 24], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 68% 42%, ${hsl(hue + 190, 55, 13)} 0%, ${colors.bg} 68%)`, fontFamily: fonts.sans, color: colors.text }}>
      <ThreeCanvas width={1920} height={1080} camera={{ fov: FOV, position: [0, 0, CAM_Z], near: 0.1, far: 50 }} style={{ opacity: intro }}>
        <E.group position={[GX, GY, 0]}>
          <E.mesh><E.sphereGeometry args={[R * 0.998, 64, 64]} /><E.meshBasicMaterial color="#071322" /></E.mesh>
          <E.mesh scale={[1.16, 1.16, 1.16]}>
            <E.sphereGeometry args={[R, 64, 64]} />
            <E.shaderMaterial vertexShader={atmoVert} fragmentShader={atmoFrag} side={THREE.BackSide} transparent depthWrite={false} blending={THREE.AdditiveBlending}
              uniforms={{ uColor: { value: new THREE.Color(cool) }, uPow: { value: 5.0 } }} />
          </E.mesh>
          <E.mesh scale={[1.012, 1.012, 1.012]}>
            <E.sphereGeometry args={[R, 64, 64]} />
            <E.shaderMaterial vertexShader={atmoVert} fragmentShader={atmoFrag} transparent depthWrite={false} blending={THREE.AdditiveBlending}
              uniforms={{ uColor: { value: new THREE.Color(cool) }, uPow: { value: -2.5 } }} />
          </E.mesh>
          <E.group rotation={[rad(lat), rad(-lon), 0]}>
            <E.lineSegments>
              <E.bufferGeometry><E.bufferAttribute attach="attributes-position" array={data.grat} count={data.grat.length / 3} itemSize={3} /></E.bufferGeometry>
              <E.lineBasicMaterial color={hex((hue + 200) % 360, 60, 38)} transparent opacity={0.55} />
            </E.lineSegments>
            <E.points>
              <E.bufferGeometry><E.bufferAttribute attach="attributes-position" array={data.land} count={data.land.length / 3} itemSize={3} /></E.bufferGeometry>
              <E.pointsMaterial color={hex((hue + 180) % 360, 70, 72)} size={0.026} sizeAttenuation transparent opacity={0.95} />
            </E.points>
            {pins.map((pin, i) => (
              <Marker key={i} lat={pin.lat} lon={pin.lon} color={accent}
                active={i === activeIdx ? 1 : i < activeIdx ? 0.35 : 0}
                pulse={((frame + i * 9) % 42) / 42} />
            ))}
          </E.group>
        </E.group>
      </ThreeCanvas>

      <div style={{ position: 'absolute', left: SAFE.side, top: SAFE.top + 20, width: 760, display: 'flex', flexDirection: 'column', gap: 30 }}>
        <Kicker text={scene.kicker} accent={accent} place={scene.place} />
        {scene.headline && <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.2, opacity: useEnter(4) }}>{scene.headline}</div>}
        <PointList scene={scene} accent={accent} width={740} size={34} />
      </div>

      {act && pj && pj.facing && (
        <>
          <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
            <line x1={pj.sx} y1={pj.sy} x2={pj.sx + 70 * lp} y2={pj.sy - 105 * lp} stroke={accent} strokeWidth={3} />
          </svg>
          <div style={{
            position: 'absolute', left: pj.sx + 70, top: pj.sy - 105 - 34, opacity: lp, transform: `translateX(${(1 - lp) * -20}px)`,
            background: 'rgba(10,14,22,0.88)', borderLeft: `8px solid ${accent}`, padding: '10px 26px', borderRadius: 4,
            fontFamily: fonts.mono, fontSize: 30, fontWeight: 700, letterSpacing: 2, whiteSpace: 'nowrap', textTransform: 'uppercase',
          }}>
            {act.label}
            <div style={{ fontSize: 18, fontWeight: 400, color: colors.muted, letterSpacing: 3, marginTop: 4 }}>
              {Math.abs(act.lat).toFixed(1)}°{act.lat >= 0 ? 'N' : 'S'}  {Math.abs(act.lon).toFixed(1)}°{act.lon >= 0 ? 'E' : 'W'}
            </div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- SECURITY

const severity = (s: number) =>
  s >= 9 ? { name: 'CRITICAL', c: '#ff2d55' } : s >= 7 ? { name: 'HIGH', c: '#ff8a1f' } : s >= 4 ? { name: 'MEDIUM', c: '#ffd23f' } : { name: 'LOW', c: '#4ade80' };

export const SecurityScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No published CVSS score: show the spec's stat (e.g. "Exploited in the wild") instead of a gauge.
  // Never draw a made-up number.
  const scored = typeof scene.cvss === 'number';
  const cvss = scene.cvss ?? 0;
  const sev = scored ? severity(cvss) : { name: '', c: '#ff2d55' };
  // Glitch burst: random-ish jitter decaying over the first ~14 frames, plus a faint recurring twitch.
  const burst = interpolate(frame, [0, 14], [1, 0], clamp);
  const twitch = Math.max(0, noise2D('tw', Math.floor(frame / 3), 0) - 0.82) * 5;
  const g = Math.min(1, burst + twitch);
  const jx = noise2D('jx', frame, 1) * 26 * g;
  const gauge = spring({ frame: frame - 14, fps, config: { damping: 24, stiffness: 50 } });
  const card = useEnter(8);
  const GR = 150;
  const bg = '#060a0c';
  return (
    <AbsoluteFill style={{ background: bg, fontFamily: fonts.sans, color: colors.text }}>
      <Solid
        width={1920} height={1080} color={bg}
        effects={[
          gridlines({ gridSize: 70, lineWidth: 1.5, lineColor: 'rgba(60,255,160,0.16)', backgroundColor: bg, rotationX: 62, perspective: 900, offsetY: (frame * 1.6) % 70, offsetX: 0 }),
          chromaticAberration({ amount: 3 + g * 22, angle: 0 }),
          scanlines({ amount: 0.2, spacing: 4, thickness: 2, offset: frame * 0.6 }),
          tvSignalOff({ amount: burst * 0.85 }),
        ]}
      />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 75% 50%, ${sev.c}22 0%, transparent 60%)` }} />
      <div style={{
        position: 'absolute', left: SAFE.side, top: SAFE.top + 20, width: 880, display: 'flex', flexDirection: 'column', gap: 28,
        transform: `translateX(${jx}px)`, textShadow: g > 0.05 ? `${4 + g * 10}px 0 #ff2d55aa, ${-4 - g * 10}px 0 #00e5ffaa` : 'none',
      }}>
        <Kicker text={scene.kicker ?? 'SECURITY ALERT'} accent={sev.c} place={scene.place} />
        {scene.headline && <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.2 }}>{scene.headline}</div>}
        <PointList scene={scene} accent={sev.c} width={860} size={34} />
      </div>
      <div style={{
        position: 'absolute', right: SAFE.side, top: 190, width: 560, opacity: card, transform: `translate(${(1 - card) * 60 + jx * 0.6}px, 0)`,
        background: 'rgba(8,12,14,0.9)', border: `2px solid ${sev.c}`, borderRadius: 10, padding: '30px 36px 34px',
        boxShadow: `0 0 50px ${sev.c}44, inset 0 0 40px ${sev.c}18`, fontFamily: fonts.mono,
      }}>
        <div style={{ fontSize: 22, letterSpacing: 5, color: sev.c, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: sev.c, opacity: 0.5 + 0.5 * Math.sin(frame / 4) }} />{scene.cve ? 'VULNERABILITY' : 'INCIDENT'}
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 1, margin: '14px 0 6px' }}>{scene.cve}</div>
        {scene.product && <div style={{ fontSize: 26, color: colors.muted }}>{scene.product}</div>}
        {!scored && scene.stat && (
          <div style={{ margin: '34px 0 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, letterSpacing: 5, color: colors.muted, textTransform: 'uppercase' }}>{scene.stat.label}</div>
            <div style={{ fontSize: 64, fontWeight: 700, color: sev.c, lineHeight: 1.1, marginTop: 12, fontFamily: fonts.sans, opacity: gauge }}>{scene.stat.value}</div>
          </div>
        )}
        {scored && <>
        <div style={{ position: 'relative', width: GR * 2, height: GR * 2, margin: '28px auto 8px' }}>
          <div style={{ position: 'absolute', inset: 0 }}><Circle radius={GR} fill="#1a2226" /></div>
          <div style={{ position: 'absolute', inset: 0 }}>
            <Pie radius={GR} progress={(cvss / 10) * gauge} fill={sev.c} closePath />
          </div>
          <div style={{ position: 'absolute', inset: 26 }}><Circle radius={GR - 26} fill="#0a0f12" /></div>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 92, fontWeight: 700, color: sev.c, lineHeight: 1 }}>{(cvss * gauge).toFixed(1)}</div>
            <div style={{ fontSize: 20, letterSpacing: 5, color: colors.muted, marginTop: 6 }}>CVSS</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 30, fontWeight: 700, letterSpacing: 8, color: sev.c }}>{sev.name}</div>
        </>}
      </div>
    </AbsoluteFill>
  );
};
