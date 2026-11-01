// Fields used by the news scene types (src/news/*). All optional on Scene; each
// scene type documents which ones it reads. "cue" values index scene.cues.
import type { EmojiName } from '@remotion/animated-emoji';

export type MarkKind = 'highlight' | 'underline' | 'circle' | 'box' | 'strike' | 'bracket';
// rough-notation annotation on a phrase that appears verbatim in the headline or a point.
export type Mark = { text: string; kind?: MarkKind; cue?: number; color?: string };
// A headline number. delta > 0 renders green/up, < 0 red/down.
export type Stat = { label: string; value: string; delta?: number };
export type Pin = { lat: number; lon: number; label: string };
export type Mover = { ticker: string; name?: string; change: number; note?: string };
export type Game = { date: string; opponent: string; home: boolean; score: string; result: 'W' | 'L' | 'OTL' };
export type Bg = 'grid' | 'dots' | 'rings' | 'scanlines' | 'halftone' | 'noise' | 'none';

export type NewsFields = {
  kicker?: string;        // small category label, e.g. "WORLD", "TORONTO"
  headline?: string;
  points?: string[];      // supporting lines, revealed one per [[next]] cue
  marks?: Mark[];
  emoji?: EmojiName;      // Noto animated emoji (cv build downloads it to public/)
  stat?: Stat;
  stats?: Stat[];
  bg?: Bg;
  place?: string;         // location tag
  pins?: Pin[];           // globe: camera turns to pins[i] at cue i
  days?: string[];        // market: x-axis labels
  series?: { name: string; values: number[] }[];
  movers?: Mover[];
  team?: string;
  games?: Game[];
  record?: { w: number; l: number; otl: number };
  star?: { name: string; line: string };
  cve?: string;
  cvss?: number;
  product?: string;
  url?: string;           // screen: address bar text
  gif?: string;           // gif: path relative to the spec (copied by cv build)
  rive?: string;          // signoff: .riv path relative to the spec
  items?: string[];       // rundown: quick hits
  hue?: number;           // bumper/open: colour accent rotation
  date?: string;
};
