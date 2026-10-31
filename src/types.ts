export type Caption = { text: string; start: number; end: number };
export type Segment = { index: number; from: number; durationInFrames: number; audio: string };

export type SceneType = 'title' | 'bullets' | 'code' | 'terminal' | 'flow' | 'image' | 'clip' | 'breadboard' | 'diagram' | 'outro';

// diagram scenes: one big part with labels revealed one per [[next]] cue.
export type Callout = { text: string; anchor: string; lit?: boolean };

// Breadboard parts. Holes are "a1".."j63"; rails are "far+:12", "near-:3", etc.
export type BoardItem = {
  // strip: highlight the joined holes (or whole rail) at each ref; flow: animated
  // current dots along the refs in order. Both show only while their step is active.
  // remove: lifts out the placed part whose `at` matches (later scenes drop it).
  kind: 'pico' | 'wire' | 'resistor' | 'led' | 'rgbled' | 'pot' | 'diode' | 'transistor' | 'buzzer'
    | 'glow' | 'strip' | 'flow' | 'remove';
  at?: string[];      // holes the part's legs/ends sit in
  col?: number;       // pico: column of pin 1 (pins land in rows c and h)
  color?: string;     // wire colour (css) or LED colour name
  bands?: string[];   // resistor colour bands
  id?: string;        // target for glow items (LEDs, buzzer)
  on?: boolean;       // glow: false turns it off
  bow?: number;      // wire: arc depth in SVG units (default from length); spreads parallel wires apart
  angle?: number;     // pot: knob indicator angle in degrees (0 = toward the top)
};
export type BoardGroup = { label?: string; items: BoardItem[]; zoom?: boolean };

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
  groups?: BoardGroup[];
  base?: BoardItem[];   // filled in by cv build: parts placed in earlier breadboard scenes
  zoom?: boolean;
  fresh?: boolean;      // breadboard: start from an empty board
  tags?: boolean;       // breadboard: label the active group's holes (default true)
  component?: 'led' | 'resistor' | 'transistor';
  callouts?: Callout[];
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
  voiceLabel?: string;
  music?: Music;
  scenes: Scene[];
};

// Background music bed: looped, faded in/out, ducked under narration.
export type Music = {
  src: string;
  volume: number;              // level when nobody is speaking
  duck: number;                // multiplier while narration plays
  speech: [number, number][];  // absolute frame ranges with narration
};
