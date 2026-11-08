/*
 * Counts your listening for Wrapped. A song counts once you've listened for 30 seconds (as Spotify
 * counts it); the listen is sent then, again every 30 seconds while it goes on, and when it ends, so
 * the minutes are right. Playing it again from the start (repeat) is a new listen.
 */
import { api } from './api';
import { getPlayhead, usePlayer } from '@/state/player';
import type { Track } from '@shared/types';

const COUNTS_AT = 30;

let session: { id: string; uid: string; track: Track; at: number; seconds: number; sent: number; last: number } | null = null;

function send() {
  if (!session || session.seconds < COUNTS_AT || session.seconds === session.sent) return;
  session.sent = session.seconds;
  api.recordPlay({ id: session.id, track: session.track, at: session.at, seconds: session.seconds });
}

function end() {
  send();
  session = null;
}

let started = false;

export function startListeningLog() {
  if (started) return;
  started = true;
  setInterval(() => {
    const state = usePlayer.getState();
    const entry = state.queue[state.index];
    if (state.status !== 'playing' || !entry) return;
    const at = getPlayhead();
    // Another song, or this one again from the top.
    if (session && (session.uid !== entry.uid || (at < 3 && session.last > at + 10))) end();
    session ??= { id: crypto.randomUUID(), uid: entry.uid, track: entry.track, at: Date.now(), seconds: 0, sent: 0, last: at };
    session.seconds++;
    session.last = at;
    if (session.seconds === COUNTS_AT || session.seconds - session.sent >= 30) send();
  }, 1000);
  window.addEventListener('beforeunload', end);
}
