import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Tutorial } from './Tutorial';
import type { VideoProps } from './types';

const placeholder: VideoProps = {
  title: 'claude-video',
  fps: 30,
  width: 1920,
  height: 1080,
  accent: '#d97757',
  showCaptions: true,
  scenes: [{
    id: 'intro', type: 'title', narration: '', title: 'Run cv render', subtitle: 'Props come from projects/<slug>/build/props.json',
    durationInFrames: 90, segments: [], cues: [], captions: [],
  }],
};

const Root: React.FC = () =>
  React.createElement(Composition, {
    id: 'Tutorial',
    component: Tutorial as React.FC<Record<string, unknown>>,
    defaultProps: placeholder as unknown as Record<string, unknown>,
    durationInFrames: 90,
    fps: 30,
    width: 1920,
    height: 1080,
    calculateMetadata: ({ props }: { props: Record<string, unknown> }) => {
      const p = props as unknown as VideoProps;
      return {
        durationInFrames: Math.max(1, p.scenes.reduce((a, s) => a + s.durationInFrames, 0)),
        fps: p.fps, width: p.width, height: p.height,
      };
    },
  });

registerRoot(Root);
