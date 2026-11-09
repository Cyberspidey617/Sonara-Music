// Your listening, for Wrapped: every song you listened to for 30 seconds or more, one file per
// month (userData/plays/YYYY-MM.json), and each song's genre from Apple's iTunes search.
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { ListeningProfile, PlayRecord, Track, Wrapped, WrappedArtist, WrappedSong } from '../shared/types';
import { keepCover } from './covers';
import { log } from './log';

interface Play {
  id: string;
  /** The song, slimmed. */
  track: Track;
  /** When it started (ms). */
  at: number;
  /** Seconds listened. */
  s: number;
}

const dir = () => path.join(app.getPath('userData'), 'plays');
const months = new Map<string, Play[]>();
const dirty = new Set<string>();
let saveTimer: NodeJS.Timeout | null = null;

/** The month a time falls in, on this PC's calendar: 'YYYY-MM'. */
function monthOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function load(month: string): Play[] {
  let list = months.get(month);
  if (list) return list;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir(), `${month}.json`), 'utf8')) as unknown;
    list = Array.isArray(parsed) ? (parsed as Play[]).filter((p) => p && typeof p.id === 'string' && p.track?.videoId && Number.isFinite(p.at)) : [];
  } catch {
    list = [];
  }
  months.set(month, list);
  return list;
}

/** Writes the months that changed (to a temporary file first, so a crash can't leave half a file). */
export function flushPlays() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty.size) return;
  try {
    fs.mkdirSync(dir(), { recursive: true });
    for (const month of dirty) {
      const file = path.join(dir(), `${month}.json`);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(months.get(month) ?? []));
      fs.renameSync(`${file}.tmp`, file);
    }
    dirty.clear();
  } catch (error) {
    log.warn(`plays not saved: ${String(error)}`);
  }
}

function slim(t: Track): Track {
  const { videoId, title, artists, album, duration, thumbnail, isVideo } = t;
  return {
    videoId: String(videoId),
    title: String(title ?? ''),
    artists: (Array.isArray(artists) ? artists : []).map((a) => ({ name: String(a?.name ?? ''), ...(a?.id && { id: String(a.id) }) })).filter((a) => a.name),
    ...(album?.name && { album: { name: String(album.name), ...(album.id && { id: String(album.id) }) } }),
    ...(Number(duration) > 0 && { duration: Number(duration) }),
    ...(thumbnail && { thumbnail: String(thumbnail) }),
    ...(isVideo && { isVideo: true }),
  };
}

/** A listen: added the first time (at 30 seconds), then updated with how long it went on. */
export function recordPlay(record: PlayRecord) {
  if (!record?.id || !record.track?.videoId || !Number.isFinite(record.at) || !(record.seconds >= 30)) return;
  const month = monthOf(record.at);
  const list = load(month);
  // The listen being updated is one of the last few.
  let play: Play | undefined;
  for (let i = list.length - 1; i >= Math.max(0, list.length - 50); i--) if (list[i]!.id === record.id) play = list[i];
  if (play) play.s = Math.max(play.s, Math.round(record.seconds));
  else {
    list.push({ id: String(record.id), track: slim(record.track), at: record.at, s: Math.round(record.seconds) });
    queueGenre(record.track);
    // Its cover too, for offline.
    if (record.track.thumbnail) void keepCover(String(record.track.thumbnail));
  }
  dirty.add(month);
  saveTimer ??= setTimeout(flushPlays, 5000);
}

/** Months with listening, newest first. */
function playMonths(): string[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir()).filter((n) => /^\d{4}-\d{2}\.json$/.test(n)).map((n) => n.slice(0, 7));
  } catch {
    // None yet.
  }
  for (const [month, list] of months) if (list.length && !names.includes(month)) names.push(month);
  return names.filter((m) => load(m).length).sort().reverse();
}

// ---- Genres ---------------------------------------------------------------------------

const genresFile = () => path.join(app.getPath('userData'), 'genres.json');
let genres: Record<string, string | null> | null = null;
const genreQueue: Track[] = [];
let genreBusy = false;

function genreCache(): Record<string, string | null> {
  if (genres) return genres;
  try {
    genres = JSON.parse(fs.readFileSync(genresFile(), 'utf8')) as Record<string, string | null>;
  } catch {
    genres = {};
  }
  return genres;
}

const words = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** A song's genre on Apple Music (iTunes search: free, no account), or null when it isn't there. */
async function lookUpGenre(track: Track): Promise<string | null> {
  const artist = track.artists[0]?.name ?? '';
  const title = words(track.title);
  const url = `https://itunes.apple.com/search?entity=song&limit=5&term=${encodeURIComponent(`${title} ${artist}`.trim())}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`iTunes answered ${response.status}`);
  const { results } = (await response.json()) as { results?: { trackName?: string; artistName?: string; primaryGenreName?: string }[] };
  const who = words(artist);
  const best =
    results?.find((r) => words(r.trackName ?? '').includes(title) && (!who || words(r.artistName ?? '').includes(who))) ??
    results?.find((r) => words(r.trackName ?? '').includes(title)) ??
    null;
  return best?.primaryGenreName ?? null;
}

function queueGenre(track: Track) {
  if (track.videoId in genreCache() || genreQueue.some((t) => t.videoId === track.videoId)) return;
  genreQueue.push(slim(track));
  void drainGenres();
}

/** One lookup at a time, a little apart: iTunes allows about 20 a minute. */
async function drainGenres() {
  if (genreBusy) return;
  genreBusy = true;
  try {
    while (genreQueue.length) {
      const track = genreQueue.shift()!;
      try {
        genreCache()[track.videoId] = await lookUpGenre(track);
        fs.writeFileSync(genresFile(), JSON.stringify(genreCache()));
      } catch (error) {
        log.warn(`genre of ${track.videoId} not found: ${String(error)}`);
      }
      await new Promise((r) => setTimeout(r, 3200));
    }
  } finally {
    genreBusy = false;
  }
}

// ---- Wrapped --------------------------------------------------------------------------

/** A month of listening, added up. */
export function wrapped(month?: string): Wrapped {
  const available = playMonths();
  const now = monthOf(Date.now());
  const which = month && /^\d{4}-\d{2}$/.test(month) ? month : (available[0] ?? now);
  const plays = load(which);

  const songs = new Map<string, WrappedSong>();
  const artists = new Map<string, WrappedArtist>();
  const hours = Array<number>(24).fill(0);
  const [y, m] = which.split('-').map(Number) as [number, number];
  const days = Array<number>(new Date(y, m, 0).getDate()).fill(0);
  let seconds = 0;
  for (const play of plays) {
    const minutes = play.s / 60;
    seconds += play.s;
    const when = new Date(play.at);
    hours[when.getHours()]! += 1;
    days[when.getDate() - 1]! += minutes;
    const song = songs.get(play.track.videoId) ?? { track: play.track, plays: 0, minutes: 0 };
    song.plays++;
    song.minutes += minutes;
    song.track = play.track; // the latest details
    songs.set(play.track.videoId, song);
    // Each artist on a song gets the listen.
    for (const a of play.track.artists) {
      const key = a.id ?? a.name.toLowerCase();
      const artist = artists.get(key) ?? { name: a.name, ...(a.id && { id: a.id }), plays: 0, minutes: 0 };
      artist.plays++;
      artist.minutes += minutes;
      if (!artist.thumbnail && play.track.thumbnail) artist.thumbnail = play.track.thumbnail;
      artists.set(key, artist);
    }
  }
  const byPlays = <T extends { plays: number; minutes: number }>(a: T, b: T) => b.plays - a.plays || b.minutes - a.minutes;
  const topSongs = [...songs.values()].sort(byPlays);
  const topArtists = [...artists.values()].sort(byPlays);
  // An artist's picture: the artwork of their most played song.
  for (const artist of topArtists.slice(0, 10)) {
    const best = topSongs.find((s) => s.track.artists.some((a) => (artist.id ? a.id === artist.id : a.name.toLowerCase() === artist.name.toLowerCase())));
    if (best?.track.thumbnail) artist.thumbnail = best.track.thumbnail;
  }

  // Genres, by listens; songs whose genre isn't known yet are looked up for next time.
  const cache = genreCache();
  const counts = new Map<string, number>();
  let known = 0;
  for (const song of topSongs) {
    if (!(song.track.videoId in cache)) {
      queueGenre(song.track);
      continue;
    }
    const genre = cache[song.track.videoId];
    if (!genre) continue;
    counts.set(genre, (counts.get(genre) ?? 0) + song.plays);
    known += song.plays;
  }
  const genreList = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, share: n / known }));
  const unknownSongs = topSongs.filter((s) => !(s.track.videoId in cache)).length;

  const top = days.reduce((best, minutes, i) => (minutes > best.minutes ? { day: i + 1, minutes } : best), { day: 0, minutes: 0 });
  return {
    month: which,
    months: available.includes(now) ? available : [now, ...available],
    partial: which === now,
    plays: plays.length,
    minutes: Math.round(seconds / 60),
    songs: songs.size,
    artists: artists.size,
    topSongs: topSongs.slice(0, 10).map((s) => ({ ...s, minutes: Math.round(s.minutes) })),
    topArtists: topArtists.slice(0, 10).map((a) => ({ ...a, minutes: Math.round(a.minutes) })),
    genres: genreList.slice(0, 8),
    genresPending: unknownSongs,
    hours,
    days: days.map((d) => Math.round(d)),
    ...(top.day && { topDay: { day: top.day, minutes: Math.round(top.minutes) } }),
  };
}

/** Your listening in the last `days` days: the songs and artists you play most, and when. */
export function listeningProfile(days = 60): ListeningProfile {
  const since = Date.now() - days * 86_400_000;
  const months = new Set<string>();
  for (let t = since; t <= Date.now() + 86_400_000; t += 20 * 86_400_000) months.add(monthOf(t));
  months.add(monthOf(Date.now()));
  const songs = new Map<string, { track: Track; plays: number; lastAt: number }>();
  const artists = new Map<string, { name: string; id?: string; plays: number }>();
  const hours = Array<number>(24).fill(0);
  let plays = 0;
  for (const month of months) {
    for (const play of load(month)) {
      if (play.at < since) continue;
      plays++;
      hours[new Date(play.at).getHours()]! += 1;
      const song = songs.get(play.track.videoId) ?? { track: play.track, plays: 0, lastAt: 0 };
      song.plays++;
      song.lastAt = Math.max(song.lastAt, play.at);
      song.track = play.track;
      songs.set(play.track.videoId, song);
      for (const a of play.track.artists) {
        const key = a.id ?? a.name.toLowerCase();
        const artist = artists.get(key) ?? { name: a.name, ...(a.id && { id: a.id }), plays: 0 };
        artist.plays++;
        artists.set(key, artist);
      }
    }
  }
  return {
    plays,
    songs: [...songs.values()].sort((a, b) => b.plays - a.plays || b.lastAt - a.lastAt).slice(0, 80),
    artists: [...artists.values()].sort((a, b) => b.plays - a.plays).slice(0, 25),
    hours,
  };
}

/** The whole listening log, by month, for a backup. */
export function exportPlays(): Record<string, Play[]> {
  const out: Record<string, Play[]> = {};
  for (const month of playMonths()) out[month] = load(month);
  return out;
}

/** Replaces the listening log with a backup's (months the backup doesn't have are emptied). */
export function importPlays(backup: Record<string, unknown[]>) {
  const valid = (p: unknown): p is Play => {
    const x = p as Play;
    return !!x && typeof x.id === 'string' && !!x.track?.videoId && Number.isFinite(x.at) && Number.isFinite(x.s);
  };
  const incoming = Object.entries(backup).filter(([month, list]) => /^\d{4}-\d{2}$/.test(month) && Array.isArray(list));
  for (const month of playMonths()) if (!incoming.some(([m]) => m === month)) (months.set(month, []), dirty.add(month));
  for (const [month, list] of incoming) {
    months.set(month, list.filter(valid));
    dirty.add(month);
  }
  flushPlays();
}
