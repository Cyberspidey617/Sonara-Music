import { artworkAtPixels } from './artwork';

export type Rgb = [number, number, number];

/** The backdrop is the artwork averaged into a GRID × GRID square of colours. */
export const GRID = 4;
export const NEUTRAL: Rgb = [44, 44, 48];

const cache = new Map<string, Rgb[]>();

/**
 * Pushes a colour toward something white text reads on: a little more
 * saturated, never brighter than a mid-dark tone. Dark colours stay dark, so a
 * black sleeve still makes a black backdrop.
 */
function shape([r, g, b]: Rgb, ceiling = 0.38): Rgb {
  const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const saturated = [r, g, b].map((v) => gray + (v - gray) * 1.35) as Rgb;
  const luminance = gray / 255;
  const k = luminance > ceiling ? ceiling / luminance : 1;
  return saturated.map((v) => Math.round(Math.min(255, Math.max(0, v * k)))) as Rgb;
}

const rawCache = new Map<string, Rgb[]>();

async function measure(url: string): Promise<Rgb[]> {
  return (await measureRaw(url)).map((c) => shape(c));
}

/** The artwork's GRID² mean colours, unshaped. */
async function measureRaw(url: string): Promise<Rgb[]> {
  const known = rawCache.get(url);
  if (known) return known;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  image.src = artworkAtPixels(url, 60);
  await image.decode();
  const side = GRID * 3;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Video thumbnails are 16:9 with bars; crop to the middle square.
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const s = Math.min(w, h) * (w > h * 1.2 ? 0.75 : 1);
  ctx.drawImage(image, (w - s) / 2, (h - s) / 2, s, s, 0, 0, side, side);
  const { data } = ctx.getImageData(0, 0, side, side);
  const cells: Rgb[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const sum: Rgb = [0, 0, 0];
      for (let y = row * 3; y < row * 3 + 3; y++) {
        for (let x = col * 3; x < col * 3 + 3; x++) {
          const i = (y * side + x) * 4;
          sum[0] += data[i]!;
          sum[1] += data[i + 1]!;
          sum[2] += data[i + 2]!;
        }
      }
      cells.push(sum.map((v) => v / 9) as Rgb);
    }
  }
  rawCache.set(url, cells);
  return cells;
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function fromHsl([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round) as Rgb;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => Math.round(v * 255)) as Rgb;
}

/** An accent from the artwork: its most colourful tone, made bright enough to read on black. */
export async function vibrantColor(url: string): Promise<Rgb | null> {
  const cells = await measureRaw(url);
  let best: [number, number, number] | null = null;
  let bestScore = 0;
  for (const c of cells) {
    const [h, s, l] = toHsl(c);
    const score = s * (1 - Math.abs(l - 0.5) * 1.4);
    if (score > bestScore) {
      bestScore = score;
      best = [h, s, l];
    }
  }
  if (!best || bestScore < 0.12) return null; // A grey sleeve: keep the chosen accent.
  return fromHsl([best[0], Math.max(0.55, Math.min(0.9, best[1])), Math.max(0.62, Math.min(0.72, best[2]))]);
}

export function hexToRgb(hex: string): Rgb {
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [250, 88, 106];
}

/** Brightens a chosen accent that would be too dark to read on the dark page. */
export function readableAccent(rgbColor: Rgb): Rgb {
  const [h, s, l] = toHsl(rgbColor);
  return l < 0.5 ? fromHsl([h, s, 0.6]) : rgbColor;
}

export function meshPalette(url: string): Promise<Rgb[]> {
  const known = cache.get(url);
  if (known) return Promise.resolve(known);
  return measure(url).then((cells) => {
    cache.set(url, cells);
    return cells;
  });
}

/** The artwork's most colourful mean, darkened for a page header tint. */
export async function tintFor(url: string): Promise<Rgb> {
  const cells = await meshPalette(url);
  const score = ([r, g, b]: Rgb) => Math.max(r, g, b) - Math.min(r, g, b) + (r + g + b) / 12;
  const best = cells.slice().sort((a, b) => score(b) - score(a))[0] ?? NEUTRAL;
  return shape(best, 0.24);
}

export const rgb = ([r, g, b]: Rgb, a = 1) => (a === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a})`);
