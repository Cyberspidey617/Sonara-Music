import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { formatTime } from '@/lib/format';
import { getDuration, getPlayhead, usePlayer } from '@/state/player';
import { onScreen } from '@/lib/power';

/**
 * A seek bar driven by the media clock each frame (no React state per frame),
 * with press-and-drag seeking. The bar reads `--progress` (0..1).
 */
export function useScrubber() {
  const bar = useRef<HTMLDivElement>(null);
  const elapsed = useRef<HTMLSpanElement>(null);
  const remaining = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLElement | null>(null);
  const drag = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const hasTrack = usePlayer((s) => s.index >= 0);

  useEffect(() => {
    let frame = 0;
    let shown = '';
    let times = '';
    let lastCheck = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Paused and not dragging, nothing moves: a look four times a second is enough (a seek still shows).
      const still = drag.current === null && usePlayer.getState().status !== 'playing';
      if (still && now - lastCheck < 250) return;
      if (drag.current === null && !onScreen(bar.current, now)) return;
      lastCheck = now;
      const duration = getDuration();
      const position = drag.current !== null ? drag.current * duration : getPlayhead();
      const k = duration > 0 ? Math.min(1, position / duration) : 0;
      // Only what changed is written: an unchanged bar costs no style work or repaint.
      const progress = k.toFixed(4);
      if (progress !== shown) {
        shown = progress;
        bar.current?.style.setProperty('--progress', progress);
        // Also for a thumb drawn outside the clipped track.
        (bar.current?.closest('[data-progress-host]') as HTMLElement | null)?.style.setProperty('--progress', progress);
      }
      const e = hasTrack ? formatTime(position) : '';
      const r = hasTrack && duration > 0 ? `-${formatTime(Math.max(0, duration - position))}` : '';
      if (e + r !== times) {
        times = e + r;
        if (elapsed.current) elapsed.current.textContent = e;
        if (remaining.current) remaining.current.textContent = r;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hasTrack]);

  const ratio = (e: PointerEvent<HTMLElement>) => {
    const r = (track.current ?? e.currentTarget).getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!hasTrack || e.button !== 0) return;
      track.current = e.currentTarget;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = ratio(e);
      setDragging(true);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (drag.current !== null) drag.current = ratio(e);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (drag.current === null) return;
      const k = ratio(e);
      drag.current = null;
      setDragging(false);
      usePlayer.getState().seek(k * getDuration());
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragging(false);
    },
  };

  return { bar, elapsed, remaining, dragging, handlers };
}
