/*
 * A self-hosted music server speaking the Subsonic API (Navidrome, Gonic,
 * Airsonic, Ampache, …). Songs stream in their original format
 * (`format=raw`), so a FLAC library plays lossless.
 *
 * The password is never kept: Subsonic's token auth sends md5(password+salt),
 * and that token is stored encrypted with the OS (DPAPI on Windows).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { AlbumPage, AudioFormat, LocalAlbum, ServerLogin, ServerStatus, Track } from '../shared/types';
import { log } from './log';

interface Stored {
  url: string;
  username: string;
  salt: string;
  /** The token, encrypted when the OS offers it (base64), or plain. */
  token: string;
  encrypted: boolean;
  serverName?: string;
}

interface Config {
  url: string;
  username: string;
  salt: string;
  token: string;
  serverName?: string;
}

let file = '';
let config: Config | null = null;
let lastError: string | undefined;

const CLIENT = 'Sonara';
const API_VERSION = '1.16.1';

export function openServer(dir: string) {
  file = path.join(dir, 'server.json');
  try {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as Stored;
    const token = stored.encrypted ? safeStorage.decryptString(Buffer.from(stored.token, 'base64')) : stored.token;
    config = { url: stored.url, username: stored.username, salt: stored.salt, token, serverName: stored.serverName };
  } catch {
    config = null;
  }
}

function save(next: Config | null) {
  config = next;
  try {
    if (!next) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return;
    }
    const encrypted = safeStorage.isEncryptionAvailable();
    const stored: Stored = {
      url: next.url,
      username: next.username,
      salt: next.salt,
      token: encrypted ? safeStorage.encryptString(next.token).toString('base64') : next.token,
      encrypted,
      serverName: next.serverName,
    };
    fs.writeFileSync(file, JSON.stringify(stored));
  } catch (error) {
    log.error(`couldn't save the server settings: ${String(error)}`);
  }
}

export const isServerConfigured = () => config !== null;

function normalizeUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  // People paste the web UI's address; the API lives at the root.
  return url.replace(/\/(app|web|#.*)$/i, '');
}

function authParams(c: Config): URLSearchParams {
  return new URLSearchParams({ u: c.username, t: c.token, s: c.salt, v: API_VERSION, c: CLIENT, f: 'json' });
}

export function serverUrl(method: string, extra: Record<string, string | number> = {}, c: Config | null = config): string {
  if (!c) throw new Error('No music server is connected.');
  const params = authParams(c);
  for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  return `${c.url}/rest/${method}?${params}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: string, extra: Record<string, string | number> = {}, c: Config | null = config): Promise<any> {
  const response = await fetch(serverUrl(method, extra, c), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  const body = (await response.json())['subsonic-response'];
  if (!body) throw new Error('That address isn’t a Subsonic-compatible server.');
  if (body.status !== 'ok') throw new Error(body.error?.message ?? 'The server refused the request.');
  return body;
}

export async function connect(login: ServerLogin): Promise<ServerStatus> {
  const salt = crypto.randomBytes(8).toString('hex');
  const candidate: Config = {
    url: normalizeUrl(login.url),
    username: login.username.trim(),
    salt,
    token: crypto.createHash('md5').update(login.password + salt).digest('hex'),
  };
  try {
    const body = await call('ping', {}, candidate);
    candidate.serverName = [body.type ? body.type[0].toUpperCase() + body.type.slice(1) : 'Subsonic', body.serverVersion ?? body.version].filter(Boolean).join(' ');
    save(candidate);
    lastError = undefined;
    log.info(`connected to ${candidate.serverName} at ${candidate.url}`);
    return status(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const friendly = /fetch failed|ECONNREFUSED|ENOTFOUND|timeout|aborted/i.test(message)
      ? 'Couldn’t reach the server. Check the address (including http:// or https:// and the port).'
      : /wrong username or password|40/i.test(message)
        ? 'Wrong username or password.'
        : message;
    throw new Error(friendly);
  }
}

export function disconnect() {
  save(null);
}

export function status(ok?: boolean): ServerStatus {
  if (!config) return { configured: false };
  return { configured: true, url: config.url, username: config.username, serverName: config.serverName, ok, error: lastError };
}

export async function checkServer(): Promise<ServerStatus> {
  if (!config) return status();
  try {
    await call('ping');
    lastError = undefined;
    return status(true);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return status(false);
  }
}

// ---- Mapping ---------------------------------------------------------------------------

const LOSSLESS = /^(flac|wav|alac|aiff?|ape|wv|dsf|dff)$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatOf(song: any): AudioFormat {
  const suffix = String(song.suffix ?? '').toLowerCase();
  return {
    codec: suffix ? suffix.toUpperCase() : String(song.contentType ?? 'audio'),
    lossless: LOSSLESS.test(suffix),
    ...(song.bitDepth && { bitDepth: Number(song.bitDepth) }),
    ...(song.samplingRate && { sampleRate: Number(song.samplingRate) }),
    ...(song.bitRate && { bitrate: Number(song.bitRate) * 1000 }),
  };
}

/** Chromium can't decode these; the server is asked to convert them to FLAC. */
const NEEDS_TRANSCODE = /^(alac|aiff?|ape|wv|dsf|dff|wma)$/i;

export function streamUrlFor(id: string, suffix?: string): string {
  if (suffix && NEEDS_TRANSCODE.test(suffix)) return serverUrl('stream', { id, format: 'flac' });
  return serverUrl('stream', { id, format: 'raw' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trackFromSong(song: any): Track {
  return {
    videoId: `srv_${song.id}`,
    title: String(song.title ?? 'Untitled'),
    artists: (song.artists?.length ? song.artists : [{ name: song.artist ?? 'Unknown Artist' }]).map((a: { name: string }) => ({ name: a.name })),
    ...(song.album && { album: { name: String(song.album), ...(song.albumId && { id: `sal_${song.albumId}` }) } }),
    ...(song.duration && { duration: Number(song.duration) }),
    ...(song.coverArt && { thumbnail: `media://art/server/${encodeURIComponent(song.coverArt)}` }),
    source: 'server',
    format: formatOf(song),
  };
}

/** Song metadata by id, for streaming (the suffix decides raw vs FLAC). */
const songCache = new Map<string, { suffix?: string; contentType?: string; format: AudioFormat }>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function remember(song: any) {
  songCache.set(String(song.id), { suffix: song.suffix, contentType: song.contentType, format: formatOf(song) });
}

export async function songInfo(id: string): Promise<{ suffix?: string; contentType?: string; format: AudioFormat }> {
  const known = songCache.get(id);
  if (known) return known;
  const body = await call('getSong', { id });
  remember(body.song);
  return songCache.get(id)!;
}

export async function searchServer(query: string, count = 20): Promise<Track[]> {
  if (!config || !query.trim()) return [];
  const body = await call('search3', { query, songCount: count, albumCount: 0, artistCount: 0 });
  const songs = body.searchResult3?.song ?? [];
  songs.forEach(remember);
  return songs.map(trackFromSong);
}

export async function serverAlbums(): Promise<LocalAlbum[]> {
  if (!config) return [];
  const out: LocalAlbum[] = [];
  for (let offset = 0; offset < 2000; offset += 500) {
    const body = await call('getAlbumList2', { type: 'alphabeticalByArtist', size: 500, offset });
    const albums = body.albumList2?.album ?? [];
    for (const a of albums) {
      out.push({
        id: `sal_${a.id}`,
        title: String(a.name ?? a.title ?? 'Untitled'),
        artist: String(a.artist ?? 'Unknown Artist'),
        ...(a.year && { year: Number(a.year) }),
        trackCount: Number(a.songCount ?? 0),
        lossless: false,
        ...(a.coverArt && { thumbnail: `media://art/server/${encodeURIComponent(a.coverArt)}` }),
      });
    }
    if (albums.length < 500) break;
  }
  return out;
}

export async function serverAlbum(id: string): Promise<AlbumPage> {
  const raw = id.replace(/^sal_/, '');
  const body = await call('getAlbum', { id: raw });
  const album = body.album;
  const songs = album.song ?? [];
  songs.forEach(remember);
  const tracks: Track[] = songs.map(trackFromSong);
  const formats = [...new Set(tracks.map((t) => t.format?.codec).filter(Boolean))];
  return {
    id,
    title: String(album.name),
    artists: [{ name: String(album.artist ?? 'Unknown Artist') }],
    subtitle: `Album${album.year ? ` • ${album.year}` : ''}`,
    year: album.year ? String(album.year) : undefined,
    description: `On ${config?.serverName ?? 'your server'} · ${formats.join(', ')}`,
    ...(album.coverArt && { thumbnail: `media://art/server/${encodeURIComponent(album.coverArt)}` }),
    tracks,
    more: [],
  };
}

export function coverUrl(coverId: string, size = 600): string {
  return serverUrl('getCoverArt', { id: coverId, size });
}
