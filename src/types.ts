export type Caption = { text: string; start: number; end: number };
export type Segment = { index: number; from: number; durationInFrames: number; audio: string };

export type SceneType = 'title' | 'bullets' | 'code' | 'terminal' | 'flow' | 'image' | 'clip' | 'outro';

export type Scene = {
  id: string;
  type: SceneType;
  narration: string;
  title?: string;
  subtitle?: string;
  heading?: string;
  bullets?: string[];
  code?: string;
  language?: string;
  highlight?: number[];
  lines?: { cmd?: string; out?: string }[];
  steps?: { label: string; detail?: string }[];
  src?: string;
  caption?: string;
  // Filled in by `cv voice`:
  durationInFrames: number;
  segments: Segment[];
  cues: number[];
  captions: Caption[];
};

export type VideoProps = {
  title: string;
  fps: number;
  width: number;
  height: number;
  accent: string;
  showCaptions: boolean;
  scenes: Scene[];
};
