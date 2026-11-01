// Shared helpers for news scenes. Safe areas: the video title sits top-left (y < 90),
// captions + the news ticker occupy the bottom 240px, the narrator chip sits bottom-right.
import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from '../theme';
import type { Scene } from '../types';

export type P = { scene: Scene; accent: string };
export const SAFE = { top: 110, bottom: 240, side: 120 };
export const up = '#4ade80';
export const down = '#f87171';
export { colors, fonts };

// Frame at which item i appears: its [[next]] cue, else a quick stagger (silent test specs).
export const itemFrame = (scene: Scene, i: number) => scene.cues[i] ?? 12 + i * 18;

export function useEnter(at: number, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping } });
}

export const Kicker: React.FC<{ text?: string; accent: string; place?: string }> = ({ text, accent, place }) => {
  const p = useEnter(0);
  if (!text) return null;
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', opacity: p, fontFamily: fonts.mono, fontSize: 26, letterSpacing: 4, textTransform: 'uppercase' }}>
      <span style={{ background: accent, color: '#0b0c10', padding: '6px 14px', borderRadius: 6, fontWeight: 700 }}>{text}</span>
      {place && <span style={{ color: colors.muted }}>{place}</span>}
    </div>
  );
};
