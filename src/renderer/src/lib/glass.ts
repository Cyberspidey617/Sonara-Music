/*
 * Liquid Glass behaviours that CSS alone can't do.
 *
 * Lensing: "the primary way Liquid Glass visually defines itself", bending
 * light at the element's curved edges. Chromium accepts SVG filters in
 * backdrop-filter, so a displacement map shaped like the element's rounded
 * rectangle refracts whatever is behind it, strongest at the rim. Apple asks
 * for glass effects to be used sparingly; this one is kept to the floating
 * controls (the player capsule, the full-screen transport).
 *
 * Glow: "when you interact with Liquid Glass, the material illuminates from
 * within" — a light that follows the pointer inside elements with `.glow`.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useLibrary } from '@/state/library';
import { usePowerSaving } from './power';

const supportsLens = typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#x)');
const reducedTransparency = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-transparency: reduce)') : null;

let defs: SVGDefsElement | null = null;
function svgDefs(): SVGDefsElement {
  if (defs) return defs;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

/** Signed distance from a point to a rounded rectangle's edge (negative inside). */
function sdf(px: number, py: number, w: number, h: number, r: number): number {
  const qx = Math.abs(px - w / 2) - (w / 2 - r);
  const qy = Math.abs(py - h / 2) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * The displacement map: neutral grey inside, and within `band` px of the edge
 * a vector pointing back into the shape, so the rim gathers light from inside
 * like the curved edge of a lens.
 */
function lensMap(w: number, h: number, radius: number, band: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const r = Math.min(radius, w / 2, h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = -sdf(x + 0.5, y + 0.5, w, h, r);
      let nx = 0;
      let ny = 0;
      let s = 0;
      if (d > 0 && d < band) {
        const gx = sdf(x + 1.5, y + 0.5, w, h, r) - sdf(x - 0.5, y + 0.5, w, h, r);
        const gy = sdf(x + 0.5, y + 1.5, w, h, r) - sdf(x + 0.5, y - 0.5, w, h, r);
        const len = Math.hypot(gx, gy) || 1;
        nx = gx / len;
        ny = gy / len;
        s = (1 - d / band) ** 2.2;
      }
      const i = (y * w + x) * 4;
      img.data[i] = 128 + nx * s * 127;
      img.data[i + 1] = 128 + ny * s * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * A rounded rectangle's lens for any width, drawn fast: its two ends never change, and every column of
 * its straight middle is the same, so the exact map for a width is the ends with one middle column
 * stretched between them (a copy, not the per-pixel shape). A control can then grow and shrink with
 * its lens following its rim every frame. The shape is drawn once per height, each width's map once.
 */
const shapes = new Map<string, { cap: number; full: HTMLCanvasElement }>();
const maps = new Map<string, string>();
function lensFor(w: number, h: number, radius: number, band: number): string {
  const key = `${w}x${h}x${radius}x${band}`;
  const hit = maps.get(key);
  if (hit) return hit;
  const kind = `${h}x${radius}x${band}`;
  let shape = shapes.get(kind);
  if (!shape) {
    const cap = Math.ceil(Math.max(radius, band)) + 1;
    shape = { cap, full: lensMap(cap * 2 + 1, h, radius, band) };
    if (shapes.size > 8) shapes.clear();
    shapes.set(kind, shape);
  }
  const { cap, full } = shape;
  let url: string;
  if (w < cap * 2 + 1) {
    url = lensMap(w, h, radius, band).toDataURL();
  } else {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(full, 0, 0, cap, h, 0, 0, cap, h);
    g.drawImage(full, cap, 0, 1, h, cap, 0, w - cap * 2, h);
    g.drawImage(full, cap + 1, 0, cap, h, w - cap, 0, cap, h);
    url = c.toDataURL();
  }
  // Enough for a pebble's growth to the full bar and back, several sizes over.
  if (maps.size > 400) maps.delete(maps.keys().next().value!);
  maps.set(key, url);
  return url;
}

let lensCount = 0;

/**
 * Real refraction for a floating glass control. Returns the style to put on
 * the element (a backdrop-filter with the lens first, then the frosting), or
 * nothing where the platform or the person's settings say otherwise.
 */
export function useLiquidLens(ref: RefObject<HTMLElement | null>, options: { radius?: number; band?: number; strength?: number; blur?: number; key?: unknown } = {}): CSSProperties | undefined {
  const { radius, band = 18, strength = 46, blur = 14, key } = options;
  // Settings › Appearance › Glass blur, as a factor of this control's own frosting (the CSS glass scales to match).
  const blurScale = useLibrary((s) => s.settings.glassBlur ?? 1);
  const [id] = useState(() => `lens-${++lensCount}`);
  const [ready, setReady] = useState(false);
  const [reduceSetting, setReduce] = useState(reducedTransparency?.matches ?? false);
  // Saving power: plain frosting (the CSS glass), not the refracting lens.
  const saving = usePowerSaving();
  const reduce = reduceSetting || saving;
  const filterRef = useRef<SVGFilterElement | null>(null);

  useEffect(() => {
    if (!reducedTransparency) return;
    const onChange = () => setReduce(reducedTransparency.matches);
    reducedTransparency.addEventListener('change', onChange);
    return () => reducedTransparency.removeEventListener('change', onChange);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !supportsLens || reduce) return;
    const ns = 'http://www.w3.org/2000/svg';
    const filter = document.createElementNS(ns, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const image = document.createElementNS(ns, 'feImage');
    image.setAttribute('result', 'map');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    // One displacement for all colours: the rim bends light without splitting it into a prism fringe.
    const displace = document.createElementNS(ns, 'feDisplacementMap');
    displace.setAttribute('in', 'SourceGraphic');
    displace.setAttribute('in2', 'map');
    displace.setAttribute('scale', String(strength));
    displace.setAttribute('xChannelSelector', 'R');
    displace.setAttribute('yChannelSelector', 'G');
    filter.append(image, displace);
    svgDefs().appendChild(filter);
    filterRef.current = filter;

    let drawn = '';
    // Follows the element's size every frame it changes (growing from the pebble, say), so the lens
    // is always the exact one for that size.
    const place = () => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const r = Math.min(radius ?? parseFloat(getComputedStyle(el).borderTopLeftRadius) ?? h / 2, h / 2);
      const key = `${w}x${h}x${r}`;
      if (key === drawn) return;
      drawn = key;
      image.setAttribute('href', lensFor(w, h, r, band));
      image.setAttribute('width', String(w));
      image.setAttribute('height', String(h));
      setReady(true);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => {
      observer.disconnect();
      filter.remove();
      setReady(false);
    };
  }, [ref, id, radius, band, strength, reduce, key]);

  if (!ready || reduce || !supportsLens) return undefined;
  const value = `url(#${id}) blur(${blur * blurScale}px) saturate(1.9) brightness(1.06)`;
  return { backdropFilter: value, WebkitBackdropFilter: value } as CSSProperties;
}

/** The pointer light inside `.glow` elements. Installed once for the whole app. */
export function installGlassGlow() {
  let current: HTMLElement | null = null;
  window.addEventListener(
    'pointermove',
    (event) => {
      const el = (event.target as Element | null)?.closest?.('.glow') as HTMLElement | null;
      if (current && current !== el) current = null;
      if (!el) return;
      current = el;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--glow-x', `${event.clientX - r.left}px`);
      el.style.setProperty('--glow-y', `${event.clientY - r.top}px`);
    },
    { passive: true },
  );
}
