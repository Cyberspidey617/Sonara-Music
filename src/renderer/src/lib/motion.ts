/*
 * Motion, after Apple's: things move because something caused them to, with
 * springs rather than linear tweens, and elements that persist across a change
 * (the artwork going full screen, the sidebar selection) travel to their new
 * place instead of disappearing and reappearing.
 *
 * - View transitions morph shared elements (`view-transition-name`) between two
 *   states of the UI: the now-playing artwork, the sidebar selection, the page.
 * - Elastic glass, as in liquid-glass-react: floating glass leans toward a nearby
 *   pointer and squishes when pressed, then springs back.
 *
 * Everything is skipped when Windows' "Animation effects" is off.
 */
import { flushSync } from 'react-dom';

const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const prefersReducedMotion = () => reducedMotion?.matches ?? false;

export const hasViewTransitions = typeof document !== 'undefined' && 'startViewTransition' in document;

type StartViewTransition = (cb: () => void) => { finished: Promise<void> };

/** Runs a state change as a view transition, so named elements morph between the two states. */
export function transition(change: () => void) {
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition;
  if (!start || prefersReducedMotion() || document.hidden) {
    change();
    return;
  }
  start.call(document, () => flushSync(change));
}

/* ---- Elastic glass ------------------------------------------------------------------- */

const ZONE = 90; // px around the element where it starts to react
let pointer: { x: number; y: number } | null = null;
let pressed: HTMLElement | null = null;
let frame = 0;

function update() {
  frame = 0;
  const els = document.querySelectorAll<HTMLElement>('.elastic');
  for (const el of els) {
    if (el.matches(':disabled')) continue;
    const k = Number(el.dataset.elastic || 1); // per-element strength
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    let tx = 0;
    let ty = 0;
    let sx = 1;
    let sy = 1;
    if (pointer) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = pointer.x - cx;
      const dy = pointer.y - cy;
      const ex = Math.max(0, Math.abs(dx) - r.width / 2);
      const ey = Math.max(0, Math.abs(dy) - r.height / 2);
      const edge = Math.hypot(ex, ey);
      if (edge < ZONE) {
        const fade = 1 - edge / ZONE;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const stretch = Math.min(dist / 240, 1) * 0.18 * fade * k;
        // Lean toward the pointer, and stretch along the direction it is in.
        const size = Math.min(1, 60 / Math.max(r.width, r.height));
        tx = dx * 0.06 * fade * k * size;
        ty = dy * 0.06 * fade * k * size;
        sx = 1 + Math.abs(nx) * stretch * 0.3 - Math.abs(ny) * stretch * 0.15;
        sy = 1 + Math.abs(ny) * stretch * 0.3 - Math.abs(nx) * stretch * 0.15;
      }
    }
    if (pressed && (el === pressed || el.contains(pressed))) {
      // Liquid squish: wider and shorter under the finger.
      sx *= 1 + 0.06 * k;
      sy *= 1 - 0.08 * k;
    }
    el.style.setProperty('--ex', `${tx.toFixed(2)}px`);
    el.style.setProperty('--ey', `${ty.toFixed(2)}px`);
    el.style.setProperty('--esx', sx.toFixed(4));
    el.style.setProperty('--esy', sy.toFixed(4));
  }
}

const schedule = () => {
  if (!frame) frame = requestAnimationFrame(update);
};

export function installElasticGlass() {
  if (prefersReducedMotion()) return;
  window.addEventListener('pointermove', (e) => ((pointer = { x: e.clientX, y: e.clientY }), schedule()), { passive: true });
  window.addEventListener('pointerdown', (e) => ((pressed = (e.target as Element).closest?.('.elastic') as HTMLElement | null), schedule()), { passive: true });
  const release = () => ((pressed = null), schedule());
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });
  document.addEventListener('pointerleave', () => ((pointer = null), release()));
  window.addEventListener('blur', () => ((pointer = null), release()));
}
