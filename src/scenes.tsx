import React from 'react';
import {
  AbsoluteFill, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { colors, fonts } from './theme';
import type { Scene } from './types';
import { BreadboardScene } from './breadboard';
import { DiagramScene } from './diagram';

type P = { scene: Scene; accent: string };

// Frame at which list item i appears: its [[next]] cue, else a quick stagger.
const itemFrame = (scene: Scene, i: number) => scene.cues[i] ?? 10 + i * 6;

function useEnter(at: number, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping } });
}

const Rise: React.FC<{ at: number; children: React.ReactNode; dist?: number; style?: React.CSSProperties }> = ({
  at, children, dist = 24, style,
}) => {
  const p = useEnter(at);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * dist}px)`, ...style }}>{children}</div>;
};

const Heading: React.FC<{ text?: string; accent: string }> = ({ text, accent }) =>
  text ? (
    <Rise at={0}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 56 }}>
        <div style={{ width: 10, height: 64, borderRadius: 5, background: accent }} />
        <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: -1.5 }}>{text}</div>
      </div>
    </Rise>
  ) : null;

const Body: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ padding: '120px 150px 170px', fontFamily: fonts.sans, color: colors.text }}>
    {children}
  </AbsoluteFill>
);

// Heading pinned at top; content vertically centered in the remaining space.
const Centered: React.FC<{ heading?: string; accent: string; children: React.ReactNode }> = ({ heading, accent, children }) => (
  <Body>
    <Heading text={heading} accent={accent} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 60 }}>{children}</div>
  </Body>
);

export const TitleScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const bar = interpolate(frame, [8, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 170px', fontFamily: fonts.sans, color: colors.text }}>
      <Rise at={0} dist={40}>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02 }}>{scene.title}</div>
      </Rise>
      <div style={{ height: 8, width: 260 * bar, background: accent, borderRadius: 4, margin: '44px 0' }} />
      <Rise at={14}>
        <div style={{ fontSize: 46, color: colors.muted, maxWidth: 1550, lineHeight: 1.3 }}>{scene.subtitle}</div>
      </Rise>
    </AbsoluteFill>
  );
};

export const BulletsScene: React.FC<P> = ({ scene, accent }) => (
  <Centered heading={scene.heading} accent={accent}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
      {(scene.bullets ?? []).map((b, i) => (
        <Rise key={i} at={itemFrame(scene, i)}>
          <div style={{ display: 'flex', gap: 28, alignItems: 'baseline', fontSize: 60, lineHeight: 1.25, fontWeight: 600 }}>
            <span style={{ color: accent, fontWeight: 800, fontFamily: fonts.mono, fontSize: 46 }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{b}</span>
          </div>
        </Rise>
      ))}
    </div>
  </Centered>
);

const Panel: React.FC<{ title?: string; children: React.ReactNode; accent: string }> = ({ title, children, accent }) => (
  <div style={{ background: colors.panel, border: `2px solid ${colors.border}`, borderRadius: 22, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.45)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 26px', background: colors.bg2, borderBottom: `2px solid ${colors.border}` }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />)}
      <div style={{ marginLeft: 18, fontFamily: fonts.mono, fontSize: 24, color: colors.muted }}>{title}</div>
      <div style={{ flex: 1 }} />
      <div style={{ width: 12, height: 12, borderRadius: 6, background: accent }} />
    </div>
    <div style={{ padding: '30px 38px', fontFamily: fonts.mono }}>{children}</div>
  </div>
);

export const CodeScene: React.FC<P> = ({ scene, accent }) => {
  const lines = (scene.code ?? '').replace(/\n$/, '').split('\n');
  const hl = new Set(scene.highlight ?? []);
  const size = lines.length > 14 ? 28 : lines.length > 8 ? 33 : 40;
  return (
    <Centered heading={scene.heading} accent={accent}>
      <Rise at={6}>
        <Panel title={scene.language ?? 'code'} accent={accent}>
          {lines.map((l, i) => (
            <Rise key={i} at={8 + i * 2} dist={8}>
              <div style={{
                display: 'flex', fontSize: size, lineHeight: 1.55, whiteSpace: 'pre',
                background: hl.has(i + 1) ? `${accent}26` : 'transparent',
                borderLeft: `5px solid ${hl.has(i + 1) ? accent : 'transparent'}`, paddingLeft: 14, marginLeft: -19,
              }}>
                <span style={{ width: 54, color: '#565c6e', textAlign: 'right', marginRight: 28 }}>{i + 1}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: l.trim().startsWith('#') || l.trim().startsWith('//') ? colors.muted : colors.text }}>{l || ' '}</span>
              </div>
            </Rise>
          ))}
        </Panel>
      </Rise>
    </Centered>
  );
};

const Typed: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const frame = useCurrentFrame();
  const n = Math.max(0, Math.min(text.length, Math.floor((frame - at) * 1.6)));
  const caret = n < text.length || Math.floor(frame / 15) % 2 === 0;
  return <span>{text.slice(0, n)}<span style={{ opacity: caret ? 1 : 0 }}>▋</span></span>;
};

export const TerminalScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  return (
    <Centered heading={scene.heading} accent={accent}>
      <Rise at={4}>
        <Panel title="zsh" accent={accent}>
          {(scene.lines ?? []).map((l, i) => {
            const at = itemFrame(scene, i);
            if (frame < at) return null;
            return (
              <div key={i} style={{ fontSize: 40, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {l.cmd !== undefined && (
                  <div><span style={{ color: accent }}>❯ </span><Typed text={l.cmd} at={at} /></div>
                )}
                {l.out !== undefined && (
                  <Rise at={at + (l.cmd ? Math.ceil(l.cmd.length / 1.6) + 4 : 0)} dist={6}>
                    <div style={{ color: colors.muted }}>{l.out}</div>
                  </Rise>
                )}
              </div>
            );
          })}
        </Panel>
      </Rise>
    </Centered>
  );
};

export const FlowScene: React.FC<P> = ({ scene, accent }) => {
  const steps = scene.steps ?? [];
  const frame = useCurrentFrame();
  return (
    <Centered heading={scene.heading} accent={accent}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {steps.map((s, i) => {
          const at = itemFrame(scene, i);
          const active = frame >= at && (i === steps.length - 1 || frame < itemFrame(scene, i + 1));
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <Rise at={at - 4} dist={0} style={{ flex: '0 0 70px', alignSelf: 'center', textAlign: 'center', fontSize: 54, color: accent }}>→</Rise>
              )}
              <Rise at={at} style={{ flex: 1 }}>
                <div style={{
                  background: active ? `${accent}1f` : colors.panel,
                  border: `3px solid ${active ? accent : colors.border}`, borderRadius: 24, padding: '40px 34px', height: '100%', minHeight: 340, boxSizing: 'border-box',
                  boxShadow: active ? `0 0 60px ${accent}40` : 'none',
                }}>
                  <div style={{ fontFamily: fonts.mono, color: accent, fontSize: 30, marginBottom: 16 }}>{String(i + 1).padStart(2, '0')}</div>
                  <div style={{ fontSize: 50, fontWeight: 800, lineHeight: 1.15, marginBottom: 18 }}>{s.label}</div>
                  {s.detail && <div style={{ fontSize: 32, color: colors.muted, lineHeight: 1.35 }}>{s.detail}</div>}
                </div>
              </Rise>
            </React.Fragment>
          );
        })}
      </div>
    </Centered>
  );
};

// Fits any aspect ratio inside the space left under the heading (pixel bounds,
// because percentage heights don't resolve reliably for images in flex columns).
export const ImageScene: React.FC<P> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, scene.durationInFrames], [1, 1.06]);
  const maxW = 1920 - 150 * 2;
  const maxH = 1080 - 120 - 170 - (scene.heading ? 120 : 0) - (scene.caption ? 60 : 0);
  return (
    <Body>
      <Heading text={scene.heading} accent={accent} />
      <Rise at={4} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        <div style={{ display: 'inline-block', borderRadius: 20, overflow: 'hidden', border: `2px solid ${colors.border}`, lineHeight: 0 }}>
          {scene.src && (
            <Img src={staticFile(scene.src)} style={{
              display: 'block', maxWidth: maxW, maxHeight: maxH, width: 'auto', height: 'auto',
              transform: `scale(${zoom})`,
            }} />
          )}
        </div>
        {scene.caption && <div style={{ marginTop: 20, fontSize: 30, color: colors.muted }}>{scene.caption}</div>}
      </Rise>
    </Body>
  );
};

export const ClipScene: React.FC<P> = ({ scene, accent }) => (
  <Body>
    <Heading text={scene.heading} accent={accent} />
    <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center' }}>
      <div style={{ borderRadius: 20, overflow: 'hidden', border: `2px solid ${colors.border}`, height: '100%' }}>
        {scene.src && <OffthreadVideo src={staticFile(scene.src)} muted style={{ height: '100%' }} />}
      </div>
    </div>
  </Body>
);

export const OutroScene: React.FC<P> = ({ scene, accent }) => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', fontFamily: fonts.sans, color: colors.text }}>
    <Rise at={0} dist={30}><div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>{scene.title}</div></Rise>
    <Rise at={12}>
      <div style={{ marginTop: 34, fontSize: 40, fontFamily: fonts.mono, color: accent }}>{scene.subtitle}</div>
    </Rise>
  </AbsoluteFill>
);

export const sceneComponents: Record<Scene['type'], React.FC<P>> = {
  title: TitleScene, bullets: BulletsScene, code: CodeScene, terminal: TerminalScene,
  flow: FlowScene, image: ImageScene, clip: ClipScene, breadboard: BreadboardScene, diagram: DiagramScene, outro: OutroScene,
};
