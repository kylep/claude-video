// Quiz scene: a question, four options revealed one per cue, a silent 5-4-3-2-1
// countdown (with a soft tick), then the right answer lights up green.
// Narration: question [[next]] A [[next]] B [[next]] C [[next]] D [[next]] [[pause N]] [[next]] reveal.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from './theme';
import type { Scene } from './types';

const GOOD = '#34c759';
const LETTERS = ['A', 'B', 'C', 'D'];

export const QuizScene: React.FC<{ scene: Scene; accent: string }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cue = (i: number) => scene.cues[i] ?? 20 + i * 30;
  const enter = (at: number, damping = 14) => spring({ frame: frame - at, fps, config: { damping } });
  const countFrom = cue(4);
  const revealAt = cue(5);
  const step = (revealAt - countFrom) / 5;
  const counting = frame >= countFrom && frame < revealAt;
  const n = 5 - Math.floor((frame - countFrom) / step);
  const revealed = frame >= revealAt;
  const rp = revealed ? enter(revealAt, 12) : 0;
  const options = scene.options ?? [];

  return (
    <AbsoluteFill style={{ padding: '110px 150px 170px', fontFamily: fonts.sans, color: colors.text }}>
      {/* tick on each count */}
      {scene.tick && [0, 1, 2, 3, 4].map((k) => (
        <Sequence key={k} from={Math.round(countFrom + k * step)} durationInFrames={10} layout="none">
          <Audio src={staticFile(scene.tick!)} volume={0.6} />
        </Sequence>
      ))}
      <div style={{ opacity: enter(0), fontFamily: fonts.mono, fontSize: 30, color: accent, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 18 }}>
        Question {scene.quizNumber} of {scene.quizTotal}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 40, marginBottom: 54 }}>
        <div style={{
          flex: 1, opacity: enter(0), transform: `translateY(${(1 - enter(0)) * 30}px)`,
          fontSize: 66, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.12,
        }}>{scene.question}</div>
        {/* countdown badge */}
        <div style={{ width: 170, height: 170, position: 'relative', flexShrink: 0 }}>
          {counting && (() => {
            const local = (frame - countFrom) % step;
            const pop = spring({ frame: local, fps, config: { damping: 9 } });
            const ring = 1 - local / step;
            const C = 2 * Math.PI * 74;
            return (
              <svg width={170} height={170} style={{ position: 'absolute', inset: 0 }}>
                <circle cx={85} cy={85} r={74} fill="#14161c" stroke={colors.border} strokeWidth={10} />
                <circle cx={85} cy={85} r={74} fill="none" stroke={accent} strokeWidth={10} strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - ring)} transform="rotate(-90 85 85)" />
                <text x={85} y={85} dy={34} textAnchor="middle" fontSize={96 * (0.7 + 0.3 * pop)} fontWeight={800}
                  fill="#fff" fontFamily={fonts.sans}>{n}</text>
              </svg>
            );
          })()}
          {revealed && (
            <svg width={170} height={170} style={{ position: 'absolute', inset: 0, opacity: rp, transform: `scale(${0.6 + 0.4 * rp})` }}>
              <circle cx={85} cy={85} r={74} fill={GOOD} />
              <path d="M 50 88 L 75 113 L 122 62" fill="none" stroke="#fff" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
        {options.map((o, i) => {
          const p = frame >= cue(i) ? enter(cue(i)) : 0;
          const right = i === scene.answer;
          const dim = revealed && !right ? interpolate(rp, [0, 1], [1, 0.28]) : 1;
          const glow = revealed && right ? rp : 0;
          return (
            <div key={i} style={{
              opacity: p * dim, transform: `translateY(${(1 - p) * 26}px) scale(${1 + 0.04 * glow})`,
              display: 'flex', alignItems: 'center', gap: 28, padding: '26px 32px', borderRadius: 22,
              background: glow ? `rgba(52,199,89,${0.18 * glow})` : colors.panel,
              border: `4px solid ${glow ? GOOD : colors.border}`,
              boxShadow: glow ? `0 0 ${50 * glow}px rgba(52,199,89,.45)` : 'none',
            }}>
              <div style={{
                width: 74, height: 74, borderRadius: 37, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: glow ? GOOD : accent, fontSize: 42, fontWeight: 800, color: '#fff', fontFamily: fonts.mono,
              }}>{LETTERS[i]}</div>
              <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.18 }}>{o}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
