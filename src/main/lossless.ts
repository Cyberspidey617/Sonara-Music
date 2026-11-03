/*
 * "Lossless when available": for a YouTube song, find the same recording in
 * your own lossless files (folders on this PC first, then your server) and
 * play that instead. A match needs the same title once the usual YouTube
 * decorations are stripped, a shared artist, and, when both are known, a
 * duration within a few seconds (so live, acoustic and extended versions
 * don't stand in for the studio track).
 */
import type { AudioFormat, StreamInfo } from '../shared/types';
import { allEntries, type LocalEntry } from './library';
import { log } from './log';
import { isServerConfigured, searchServer, songInfo } from './subsonic';

export interface MatchQuery {
  videoId: string;
  title: string;
  artist: string;
  duration?: number;
}

export type LosslessMatch =
  | { source: 'local'; entry: LocalEntry; format: AudioFormat }
  | { source: 'server'; id: string; suffix?: string; format: AudioFormat };

const strip = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export function normalizeTitle(title: string): string {
  return strip(title)
    .replace(/\s*[([](feat|ft|featuring|with|prod)\.?\s[^)\]]*[)\]]/g, '')
    .replace(/\s+(feat|ft|featuring)\.?\s.*$/, '')
    .replace(/\s*[([](official|lyrics?|lyric video|audio|video|visuali[sz]er|hd|hq|4k|explicit|clean|from [^)\]]*)[^)\]]*[)\]]/g, '')
    .replace(/\s*[-–—]\s*(\d{4}\s*)?(digital(ly)?\s*)?remaster(ed)?(\s*\d{4})?(\s*version)?\s*$/, '')
    .replace(/\s*[([](\d{4}\s*)?(digital(ly)?\s*)?remaster(ed)?[^)\]]*[)\]]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function artistTokens(artist: string): string[] {
  return strip(artist)
    .replace(/\s*-\s*topic$/, '')
    .split(/\s*(?:,|&|\/|;|\bx\b|\band\b|\bfeat\.?|\bft\.?|\bwith\b)\s*/)
    .map((a) => a.replace(/^the\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim())
    .filter(Boolean);
}

function artistsMatch(wanted: string, candidate: string[]): boolean {
  const want = artistTokens(wanted);
  const have = candidate.flatMap(artistTokens);
  if (!want.length || !have.length) return false;
  return want.some((w) => have.some((h) => h === w || (w.length > 3 && h.includes(w)) || (h.length > 3 && w.includes(h))));
}

function durationOk(a: number | undefined, b: number | undefined, exactTitle: boolean): boolean {
  if (!a || !b) return true;
  const delta = Math.abs(a - b);
  return delta <= 4 || (exactTitle && delta <= 8);
}

function score(q: MatchQuery, title: string, artists: string[], duration: number | undefined, format: AudioFormat): number {
  if (!format.lossless) return 0;
  const want = normalizeTitle(q.title);
  const have = normalizeTitle(title);
  if (!want || !have) return 0;
  const exact = want === have;
  const close = exact || (Math.min(want.length, have.length) / Math.max(want.length, have.length) > 0.8 && (want.includes(have) || have.includes(want)));
  if (!close || !artistsMatch(q.artist, artists) || !durationOk(q.duration, duration, exact)) return 0;
  // Prefer exact titles, closer durations, then higher resolution.
  const delta = q.duration && duration ? Math.abs(q.duration - duration) : 2;
  return (exact ? 100 : 60) - delta * 2 + (format.bitDepth ?? 16) / 8 + (format.sampleRate ?? 44100) / 48000;
}

const cache = new Map<string, { match: LosslessMatch | null; at: number }>();
const MISS_TTL = 10 * 60_000;

export function clearMatches() {
  cache.clear();
}

export async function findLosslessMatch(q: MatchQuery): Promise<LosslessMatch | null> {
  const known = cache.get(q.videoId);
  if (known && (known.match || Date.now() - known.at < MISS_TTL)) return known.match;

  let best: { score: number; match: LosslessMatch } | null = null;
  for (const e of allEntries()) {
    const s = score(q, e.title, e.artists.length ? e.artists : e.albumArtist ? [e.albumArtist] : [], e.duration, e.format);
    if (s > 0 && (!best || s > best.score)) best = { score: s, match: { source: 'local', entry: e, format: e.format } };
  }
  if (!best && isServerConfigured()) {
    try {
      const results = await searchServer(`${normalizeTitle(q.title)} ${artistTokens(q.artist)[0] ?? ''}`.trim(), 15);
      const more = results.length ? [] : await searchServer(normalizeTitle(q.title), 15);
      for (const t of [...results, ...more]) {
        if (!t.format) continue;
        const s = score(q, t.title, t.artists.map((a) => a.name), t.duration, t.format);
        if (s > 0 && (!best || s > best.score)) {
          const id = t.videoId.replace(/^srv_/, '');
          const info = await songInfo(id).catch(() => null);
          best = { score: s, match: { source: 'server', id, suffix: info?.suffix, format: t.format } };
        }
      }
    } catch (error) {
      log.warn(`server lookup for "${q.title}" failed: ${String(error)}`);
    }
  }
  const match = best?.match ?? null;
  if (cache.size > 500) cache.clear();
  cache.set(q.videoId, { match, at: Date.now() });
  if (match) log.info(`[${q.videoId}] lossless copy found (${match.source}, ${match.format.codec}${match.format.bitDepth ? ` ${match.format.bitDepth}-bit` : ''})`);
  return match;
}

/** What's playing for a YouTube id that was swapped for a lossless copy. */
export function losslessInfo(videoId: string): StreamInfo | null {
  const match = cache.get(videoId)?.match;
  if (!match) return null;
  return { videoId, source: match.source, mimeType: `audio/${match.format.codec.toLowerCase()}`, format: match.format };
}
