import React from 'react';
import { AbsoluteFill, Audio, Sequence, Series, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { sceneComponents } from './scenes';
import { colors, fonts } from './theme';
import type { Music, Scene, VideoProps } from './types';

const FADE = 8;

const SceneFrame: React.FC<{ scene: Scene; accent: string; showCaptions: boolean }> = ({ scene, accent, showCaptions }) => {
  const frame = useCurrentFrame();
  const d = scene.durationInFrames;
  const opacity = interpolate(frame, [0, FADE, d - FADE, d], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const Comp = sceneComponents[scene.type];
  const cap = scene.captions.find((c) => frame >= c.start && frame < c.end);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity }}>
        <Comp scene={scene} accent={accent} />
      </AbsoluteFill>
      {scene.segments.map((s) => (
        <Sequence key={s.index} from={s.from} durationInFrames={s.durationInFrames + 2} layout="none">
          <Audio src={staticFile(s.audio)} />
        </Sequence>
      ))}
      {showCaptions && cap && (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 64 }}>
          <div style={{
            maxWidth: 1500, padding: '14px 30px', borderRadius: 14, background: 'rgba(8,9,12,.82)',
            fontFamily: fonts.sans, fontSize: 36, lineHeight: 1.3, color: colors.text, textAlign: 'center',
          }}>{cap.text}</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// Background music: looped, faded in and out, ducked smoothly whenever narration plays.
const DUCK_RAMP = 9; // frames to ease into/out of a duck
const MusicBed: React.FC<{ music: Music; total: number; fps: number }> = ({ music, total, fps }) => {
  const level = (f: number) => {
    let gap = Infinity; // frames to the nearest narration (0 while speaking)
    for (const [a, b] of music.speech) {
      if (f >= a && f < b) { gap = 0; break; }
      gap = Math.min(gap, f < a ? a - f : f - b + 1);
    }
    const duck = interpolate(gap, [0, DUCK_RAMP], [music.duck, 1], { extrapolateRight: 'clamp' });
    const fade = interpolate(f, [0, fps * 1.5, total - fps * 2.5, total], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return music.volume * duck * fade;
  };
  return <Audio src={staticFile(music.src)} loop volume={level} />;
};

// "voice: <name>" bottom-right for the opening scene, so every video credits its narrator.
const VoiceLabel: React.FC<{ label: string; until: number; accent: string }> = ({ label, until, accent }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [10, 25, until - 15, until], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', right: 48, bottom: 22, opacity, fontFamily: fonts.mono, fontSize: 24, color: colors.muted }}>
      voice: <span style={{ color: accent }}>{label}</span>
    </div>
  );
};

export const Tutorial: React.FC<VideoProps> = ({ title, accent, scenes, showCaptions, voiceLabel, music, fps }) => {
  const frame = useCurrentFrame();
  const total = scenes.reduce((a, s) => a + s.durationInFrames, 0) || 1;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1400px 900px at 15% 0%, ${colors.bg2}, ${colors.bg})` }}>
      <Series>
        {scenes.map((s) => (
          <Series.Sequence key={s.id} durationInFrames={s.durationInFrames}>
            <SceneFrame scene={s} accent={accent} showCaptions={showCaptions} />
          </Series.Sequence>
        ))}
      </Series>
      <div style={{ position: 'absolute', top: 44, left: 150, fontFamily: fonts.mono, fontSize: 22, color: colors.muted, letterSpacing: 2, textTransform: 'uppercase' }}>
        {title}
      </div>
      {music && <MusicBed music={music} total={total} fps={fps} />}
      {voiceLabel && scenes.length > 0 && <VoiceLabel label={voiceLabel} until={scenes[0].durationInFrames} accent={accent} />}
      <div style={{ position: 'absolute', left: 0, bottom: 0, height: 6, width: `${(frame / total) * 100}%`, background: accent }} />
    </AbsoluteFill>
  );
};
