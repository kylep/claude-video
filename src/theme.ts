import { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

const inter = loadInter('normal', { weights: ['400', '600', '800'], subsets: ['latin'] });
const mono = loadMono('normal', { weights: ['400', '700'], subsets: ['latin'] });

export const fonts = { sans: inter.fontFamily, mono: mono.fontFamily };

// @remotion/layout-utils measures text in the DOM: measuring before the fonts load returns the
// fallback face's widths (~15% narrow). Gate any measurement on this.
let fontsDone = false;
export function useFontsReady() {
  const [ready, setReady] = useState(fontsDone);
  useEffect(() => {
    if (fontsDone) return;
    const h = delayRender('fonts');
    Promise.all([inter.waitUntilDone(), mono.waitUntilDone()])
      .catch(() => undefined)
      .then(() => { fontsDone = true; setReady(true); continueRender(h); });
  }, []);
  return ready;
}

export const colors = {
  bg: '#0e0f13',
  bg2: '#171922',
  panel: '#1c1f2a',
  border: '#2b2f3d',
  text: '#eceef4',
  muted: '#9aa1b2',
  good: '#7ad99a',
};
