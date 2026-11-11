/*
 * Counts your listening for Wrapped. A song counts once you've listened for 30 seconds (as Spotify
 * counts it); the listen is sent then, again every 30 seconds while it goes on, and when it ends, so
 * the minutes are right. Playing it again from the start (repeat) is a new listen.
 */
import { api } from './api';
import { getPlayhead, usePlayer } from '@/state/player';
import type { Track } from '@shared/types';
import { useLibrary } from '@/state/library';

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

/**
 * A skip: another song came on before 30 seconds of this one, early in it (not near its end). Kept
 * per song, so one you keep skipping stops being recommended; hearing it through takes one back.
 */
function noteSkip(s: NonNullable<typeof session>) {
  const length = s.track.duration ?? 0;
  const { settings, updateSettings } = useLibrary.getState();
  const counts = { ...(settings.skipCounts ?? {}) };
  const id = s.track.videoId;
  if (s.seconds < COUNTS_AT && s.last < COUNTS_AT && length > 60) counts[id] = (counts[id] ?? 0) + 1;
  else if (s.seconds >= length * 0.8 && counts[id]) counts[id] -= 1;
  else return;
  if (!counts[id]) delete counts[id];
  // The most recent few hundred are plenty.
  const keys = Object.keys(counts);
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete counts[k];
  updateSettings({ skipCounts: counts });
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
    if (session && (session.uid !== entry.uid || (at < 3 && session.last > at + 10))) {
      if (session.uid !== entry.uid) noteSkip(session);
      end();
    }
    if (!session) {
      session = { id: crypto.randomUUID(), uid: entry.uid, track: entry.track, at: Date.now(), seconds: 0, sent: 0, last: at };
      api.nowPlaying(entry.track);
    }
    session.seconds++;
    session.last = at;
    if (session.seconds === COUNTS_AT || session.seconds - session.sent >= 30) send();
  }, 1000);
  window.addEventListener('beforeunload', end);
}
