/*
 * Scrobbling: what you listen to, sent to ListenBrainz and Last.fm.
 *
 * A song is "now playing" as it starts and is scrobbled once you've heard half of it or four
 * minutes, whichever comes first (and at least 30 seconds): the rule both services ask for.
 * Scrobbles that can't be sent (offline) wait and go with the next one.
 *
 * ListenBrainz needs your user token. Last.fm needs an API key and secret (free, from
 * last.fm/api/account/create), then your approval in the browser. Tokens and session keys are
 * kept encrypted by the system, in the main process only.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage, shell } from 'electron';
import type { PlayRecord, ScrobbleStatus, Track } from '../shared/types';
import { log } from './log';

interface Saved {
  lb?: { token: string; user: string };
  lfm?: { key: string; secret: string; session?: string; user?: string; pendingToken?: string };
  pending?: Scrobble[];
}
interface Scrobble {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  at: number;
}

let file = '';
let saved: Saved = {};
const done = new Set<string>();

const seal = (text: string) => (safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(text).toString('base64')}` : text);
const unseal = (text: string) => (text.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(text.slice(4), 'base64')) : text);

export function openScrobbler(dataDir: string) {
  file = path.join(dataDir, 'scrobbling.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Saved;
    saved = {
      ...raw,
      ...(raw.lb && { lb: { ...raw.lb, token: unseal(raw.lb.token) } }),
      ...(raw.lfm && { lfm: { ...raw.lfm, secret: unseal(raw.lfm.secret), ...(raw.lfm.session && { session: unseal(raw.lfm.session) }) } }),
    };
  } catch {
    saved = {};
  }
}

function save() {
  const out: Saved = {
    ...saved,
    ...(saved.lb && { lb: { ...saved.lb, token: seal(saved.lb.token) } }),
    ...(saved.lfm && { lfm: { ...saved.lfm, secret: seal(saved.lfm.secret), ...(saved.lfm.session && { session: seal(saved.lfm.session) }) } }),
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
}

export function scrobbleStatus(): ScrobbleStatus {
  return {
    listenBrainz: saved.lb ? { user: saved.lb.user } : null,
    lastFm: saved.lfm?.session ? { user: saved.lfm.user ?? '' } : null,
    lastFmWaiting: !!saved.lfm?.pendingToken,
    pending: saved.pending?.length ?? 0,
  };
}

// ---- What gets sent -----------------------------------------------------------------

/** The song as the services know it: without YouTube's "(Official Video)" and "- Topic". */
function describe(track: Track): Omit<Scrobble, 'at'> | null {
  const artist = (track.artists?.[0]?.name ?? '').replace(/\s*-\s*Topic$/i, '').trim();
  const title = track.title
    .replace(/\s*[([](official|lyrics?|lyric video|audio|video|visuali[sz]er|hd|hq|4k|full video|video song)[^)\]]*[)\]]/gi, '')
    .replace(/\s*\|.*$/, '')
    .trim();
  if (!artist || !title) return null;
  return { artist, title, ...(track.album?.name && { album: track.album.name }), ...(track.duration && { duration: Math.round(track.duration) }) };
}

// ---- ListenBrainz -------------------------------------------------------------------

const LB = 'https://api.listenbrainz.org/1';

export async function connectListenBrainz(token: string): Promise<ScrobbleStatus> {
  const res = await fetch(`${LB}/validate-token`, { headers: { Authorization: `Token ${token.trim()}` }, signal: AbortSignal.timeout(10_000) });
  const body = (await res.json().catch(() => ({}))) as { valid?: boolean; user_name?: string };
  if (!body.valid) throw new Error('ListenBrainz didn’t accept that token. Copy it again from listenbrainz.org/settings.');
  saved.lb = { token: token.trim(), user: body.user_name ?? '' };
  save();
  return scrobbleStatus();
}

async function listenBrainz(kind: 'playing_now' | 'single' | 'import', items: Scrobble[]) {
  if (!saved.lb) return;
  const payload = items.map((s) => ({
    ...(kind !== 'playing_now' && { listened_at: Math.floor(s.at / 1000) }),
    track_metadata: {
      artist_name: s.artist,
      track_name: s.title,
      ...(s.album && { release_name: s.album }),
      additional_info: { media_player: 'Sonara', submission_client: 'Sonara', submission_client_version: app.getVersion(), ...(s.duration && { duration_ms: s.duration * 1000 }) },
    },
  }));
  const res = await fetch(`${LB}/submit-listens`, {
    method: 'POST',
    headers: { Authorization: `Token ${saved.lb.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ listen_type: kind, payload }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ListenBrainz answered ${res.status}`);
}

// ---- Last.fm ------------------------------------------------------------------------

const LFM = 'https://ws.audioscrobbler.com/2.0/';

function signed(params: Record<string, string>, secret: string): URLSearchParams {
  const sig = crypto
    .createHash('md5')
    .update(
      Object.keys(params)
        .sort()
        .map((k) => k + params[k])
        .join('') + secret,
      'utf8',
    )
    .digest('hex');
  return new URLSearchParams({ ...params, api_sig: sig, format: 'json' });
}

async function lastFmCall(params: Record<string, string>, post = false): Promise<any> {
  const lfm = saved.lfm!;
  const body = signed({ ...params, api_key: lfm.key }, lfm.secret);
  const res = post ? await fetch(LFM, { method: 'POST', body, signal: AbortSignal.timeout(10_000) }) : await fetch(`${LFM}?${body}`, { signal: AbortSignal.timeout(10_000) });
  const json = (await res.json().catch(() => ({}))) as { error?: number; message?: string };
  if (json.error) throw new Error(json.message ?? `Last.fm error ${json.error}`);
  return json;
}

/** Step 1: with your API key and secret, ask Last.fm for a token and open its approval page. */
export async function beginLastFm(key: string, secret: string): Promise<ScrobbleStatus> {
  saved.lfm = { key: key.trim(), secret: secret.trim() };
  try {
    const { token } = await lastFmCall({ method: 'auth.getToken' });
    saved.lfm.pendingToken = token;
    save();
    await shell.openExternal(`https://www.last.fm/api/auth/?api_key=${encodeURIComponent(saved.lfm.key)}&token=${encodeURIComponent(token)}`);
  } catch (error) {
    delete saved.lfm;
    save();
    throw new Error(`Last.fm didn’t accept that key and secret (${error instanceof Error ? error.message : String(error)}).`);
  }
  return scrobbleStatus();
}

/** Step 2: after you allowed Sonara in the browser, turn the token into a session. */
export async function finishLastFm(): Promise<ScrobbleStatus> {
  const lfm = saved.lfm;
  if (!lfm?.pendingToken) throw new Error('Start connecting first.');
  const { session } = await lastFmCall({ method: 'auth.getSession', token: lfm.pendingToken }).catch(() => {
    throw new Error('Last.fm hasn’t been allowed yet. Press “Yes, allow access” on the page that opened, then try again.');
  });
  saved.lfm = { key: lfm.key, secret: lfm.secret, session: session.key, user: session.name };
  save();
  return scrobbleStatus();
}

async function lastFm(kind: 'now' | 'scrobble', items: Scrobble[]) {
  if (!saved.lfm?.session) return;
  if (kind === 'now') {
    const s = items[0]!;
    await lastFmCall({ method: 'track.updateNowPlaying', sk: saved.lfm.session, artist: s.artist, track: s.title, ...(s.album && { album: s.album }), ...(s.duration && { duration: String(s.duration) }) }, true);
    return;
  }
  // Up to 50 a call.
  for (let i = 0; i < items.length; i += 50) {
    const params: Record<string, string> = { method: 'track.scrobble', sk: saved.lfm.session };
    items.slice(i, i + 50).forEach((s, n) => {
      params[`artist[${n}]`] = s.artist;
      params[`track[${n}]`] = s.title;
      params[`timestamp[${n}]`] = String(Math.floor(s.at / 1000));
      if (s.album) params[`album[${n}]`] = s.album;
      if (s.duration) params[`duration[${n}]`] = String(s.duration);
    });
    await lastFmCall(params, true);
  }
}

export function disconnect(service: 'listenbrainz' | 'lastfm'): ScrobbleStatus {
  if (service === 'listenbrainz') delete saved.lb;
  else delete saved.lfm;
  if (!saved.lb && !saved.lfm?.session) delete saved.pending;
  save();
  return scrobbleStatus();
}

// ---- From the player ----------------------------------------------------------------

const connected = () => !!saved.lb || !!saved.lfm?.session;

export function nowPlaying(track: Track) {
  const s = connected() ? describe(track) : null;
  if (!s) return;
  const item = { ...s, at: Date.now() };
  void listenBrainz('playing_now', [item]).catch((e) => log.warn(`ListenBrainz now playing: ${String(e)}`));
  void lastFm('now', [item]).catch((e) => log.warn(`Last.fm now playing: ${String(e)}`));
}

/** A listen's progress (from the plays log): scrobbled once it has been heard long enough. */
export function maybeScrobble(record: PlayRecord) {
  if (!connected() || done.has(record.id)) return;
  const s = describe(record.track);
  if (!s) return;
  const need = Math.max(30, Math.min(240, (s.duration ?? 60) / 2));
  if (record.seconds < need) return;
  done.add(record.id);
  if (done.size > 500) done.clear();
  saved.pending = [...(saved.pending ?? []), { ...s, at: record.at }].slice(-1000);
  save();
  void flush();
}

let flushing = false;
async function flush() {
  if (flushing || !saved.pending?.length) return;
  flushing = true;
  const batch = saved.pending.slice();
  try {
    await Promise.all([
      saved.lb ? listenBrainz(batch.length === 1 ? 'single' : 'import', batch) : null,
      saved.lfm?.session ? lastFm('scrobble', batch) : null,
    ]);
    saved.pending = saved.pending.slice(batch.length);
    save();
  } catch (error) {
    log.warn(`scrobbling ${batch.length} listen(s) failed, will retry: ${String(error)}`);
  } finally {
    flushing = false;
  }
}
