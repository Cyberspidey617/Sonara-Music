// Spotify import: reads a playlist, album or song from Spotify's public embed page (no account or
// key needed), so its songs can be found on YouTube Music. Only titles, artists and lengths are read.

import type { ImportResult, Track } from '../shared/types';
import { log } from './log';
import { matchSong } from './youtube';

/** A song as Spotify lists it. */
export interface SpotifySong {
  title: string;
  artists: string[];
  /** Milliseconds. */
  duration?: number;
}

export interface SpotifyList {
  kind: 'playlist' | 'album' | 'track';
  title: string;
  /** Who made it: the playlist's owner, or the album's artist. */
  by?: string;
  thumbnail?: string;
  songs: SpotifySong[];
  /** The embed page lists at most this many songs; a longer playlist is cut there. */
  limit: number;
}

/** The most songs Spotify's embed page lists. */
const EMBED_LIMIT = 100;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

type Kind = SpotifyList['kind'];

/** A Spotify playlist, album or song link (open.spotify.com, spotify: URIs, spotify.link short links). */
export function isSpotifyLink(input: string): boolean {
  return /^\s*(spotify:(playlist|album|track):|https?:\/\/(open\.spotify\.com|spotify\.link|spotify\.app\.link)\/)/i.test(input);
}

function parse(input: string): { kind: Kind; id: string } | null {
  const trimmed = input.trim();
  const uri = trimmed.match(/^spotify:(playlist|album|track):([A-Za-z0-9]{22})$/i);
  if (uri) return { kind: uri[1]!.toLowerCase() as Kind, id: uri[2]! };
  try {
    const url = new URL(trimmed);
    if (url.hostname !== 'open.spotify.com') return null;
    // /playlist/ID, /intl-de/album/ID, /embed/track/ID
    const path = url.pathname.match(/\/(playlist|album|track)\/([A-Za-z0-9]{22})/);
    return path ? { kind: path[1] as Kind, id: path[2]! } : null;
  } catch {
    return null;
  }
}

/** Short links (spotify.link/…) redirect to the open.spotify.com page. */
async function resolve(input: string): Promise<{ kind: Kind; id: string } | null> {
  const direct = parse(input);
  if (direct) return direct;
  const response = await fetch(input.trim(), { redirect: 'follow', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) });
  return parse(response.url);
}

/** Spotify joins artists with a comma and a no-break space. */
const splitArtists = (value: unknown): string[] =>
  String(value ?? '')
    .split(',')
    .map((name) => name.replace(/ /g, ' ').trim())
    .filter(Boolean);

function bestImage(cover: unknown): string | undefined {
  const sources = (cover as { sources?: { url?: string; width?: number }[] } | undefined)?.sources ?? [];
  return [...sources].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
}

type Entity = {
  type?: string;
  name?: string;
  title?: string;
  subtitle?: string;
  duration?: number;
  coverArt?: unknown;
  visualIdentity?: { image?: { url?: string; maxWidth?: number }[] };
  artists?: { name?: string }[];
  trackList?: { title?: string; subtitle?: string; duration?: number; entityType?: string }[];
};

export async function readSpotify(input: string): Promise<SpotifyList> {
  const link = await resolve(input).catch(() => null);
  if (!link) throw new Error('That doesn’t look like a Spotify playlist, album or song link.');
  const response = await fetch(`https://open.spotify.com/embed/${link.kind}/${link.id}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) throw new Error('Spotify couldn’t find that. It may be private or deleted.');
  if (!response.ok) throw new Error(`Spotify didn’t answer (${response.status}). Try again in a moment.`);
  const html = await response.text();
  const data = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  let entity: Entity | undefined;
  try {
    entity = data ? (JSON.parse(data) as { props?: { pageProps?: { state?: { data?: { entity?: Entity } } } } }).props?.pageProps?.state?.data?.entity : undefined;
  } catch {
    entity = undefined;
  }
  if (!entity) throw new Error('Spotify’s page has changed and couldn’t be read.');

  const thumbnail = bestImage(entity.coverArt) ?? [...(entity.visualIdentity?.image ?? [])].sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0))[0]?.url;
  const title = entity.name || entity.title || 'Spotify import';
  if (link.kind === 'track') {
    const artists = (entity.artists ?? []).map((a) => String(a.name ?? '').trim()).filter(Boolean);
    return { kind: 'track', title, ...(thumbnail && { thumbnail }), songs: [{ title, artists, ...(entity.duration && { duration: entity.duration }) }], limit: EMBED_LIMIT };
  }
  const songs = (entity.trackList ?? [])
    .filter((t) => t.title && (t.entityType ?? 'track') === 'track')
    .map((t) => ({ title: String(t.title), artists: splitArtists(t.subtitle), ...(t.duration && { duration: t.duration }) }));
  if (!songs.length) throw new Error('That Spotify list is empty, or only has podcasts.');
  return { kind: link.kind, title, ...(entity.subtitle && { by: entity.subtitle }), ...(thumbnail && { thumbnail }), songs, limit: EMBED_LIMIT };
}

/** Songs looked up on YouTube Music at once: quick, without flooding it. */
const AT_ONCE = 5;

/**
 * A Spotify playlist, album or song as a playlist of YouTube Music songs, in Spotify's order.
 * Songs with no close match are left out and named, rather than replaced by a wrong song.
 */
export async function importSpotify(input: string, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const list = await readSpotify(input);
  const found: (Track | null)[] = new Array(list.songs.length).fill(null);
  let next = 0;
  let done = 0;
  onProgress?.(0, list.songs.length);
  const worker = async () => {
    while (next < list.songs.length) {
      const i = next++;
      const song = list.songs[i]!;
      try {
        found[i] = await matchSong(song.title, song.artists, song.duration ? song.duration / 1000 : undefined);
      } catch (error) {
        log.warn(`spotify import: no match for "${song.title}": ${String(error)}`);
      }
      onProgress?.(++done, list.songs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, list.songs.length) }, worker));
  const tracks = found.filter((t): t is Track => t !== null);
  if (!tracks.length) throw new Error('None of these songs could be found on YouTube Music.');
  const missing = list.songs.filter((_, i) => !found[i]).map((s) => (s.artists[0] ? `${s.title} — ${s.artists[0]}` : s.title));
  return {
    title: list.title,
    tracks,
    ...(list.thumbnail && { thumbnail: list.thumbnail }),
    ...(missing.length && { missing }),
    ...(list.kind === 'playlist' && list.songs.length >= list.limit && { limitedTo: list.limit }),
  };
}
