/*
 * Power saver: fewer frames and simpler glass, to go easy on the PC (and its battery).
 * Auto turns it on while the PC runs on battery; On and Off are as they say.
 */
import { useEffect, useState } from 'react';
import { useLibrary } from '@/state/library';

let onBattery = false;
const listeners = new Set<() => void>();

type Battery = { charging: boolean; addEventListener: (type: 'chargingchange', fn: () => void) => void };
void (navigator as Navigator & { getBattery?: () => Promise<Battery> }).getBattery?.().then((b) => {
  const update = () => {
    onBattery = !b.charging;
    listeners.forEach((fn) => fn());
  };
  update();
  b.addEventListener('chargingchange', update);
});

/** Whether to save power right now. */
export function powerSaving(): boolean {
  const mode = useLibrary.getState().settings.powerSaver ?? 'auto';
  return mode === 'on' || (mode === 'auto' && onBattery);
}

/** As `powerSaving`, re-rendering when it changes. */
export function usePowerSaving(): boolean {
  const mode = useLibrary((s) => s.settings.powerSaver ?? 'auto');
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  return mode === 'on' || (mode === 'auto' && onBattery);
}

const looked = new WeakMap<Element, { at: number; seen: boolean }>();
/**
 * Whether an element can be seen (not hidden, not under the full-screen player): animations that
 * can't be seen skip their frames. Checked a few times a second, not every frame.
 */
export function onScreen(el: Element | null, now = performance.now()): boolean {
  if (!el) return false;
  const last = looked.get(el);
  if (last && now - last.at < 300) return last.seen;
  const seen = typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) : true;
  looked.set(el, { at: now, seen });
  return seen;
}
