// Pointing at a song for a moment finds its stream ahead of time, so pressing play starts it at
// once. Each song once per session, and not while offline.
import type { PointerEvent } from 'react';
import { isYouTubeId } from '@shared/types';
import { api } from './api';
import { useOnline } from '@/state/online';

const done = new Set<string>();
let timer = 0;

/** Pointer handlers for a song's row. */
export function prefetchOnHover(videoId: string) {
  return {
    onPointerEnter: (_e: PointerEvent) => {
      window.clearTimeout(timer);
      if (done.has(videoId) || !isYouTubeId(videoId) || !useOnline.getState().online) return;
      timer = window.setTimeout(() => {
        done.add(videoId);
        void api.prefetch(videoId).catch(() => undefined);
      }, 300);
    },
    onPointerLeave: () => window.clearTimeout(timer),
  };
}
