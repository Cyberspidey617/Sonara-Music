/*
 * Lossless sources: servers that speak the open "addon" protocol Echo Music and BitChord use.
 *
 * An addon is an ordinary HTTP server you add by its address; nothing it sends is run here. It
 * answers three GETs with JSON:
 *
 *   /manifest.json      { id, name, version, resources?, settings? }
 *   /search?q=…         { tracks: [{ id, title, artist, album?, duration?, format?, audioQuality?, streamURL? }] }
 *   /stream/<id>        { url, format?, quality?, codec?, manifest?: 'none'|'hls'|'dash', sampleRate?, bitDepth?, bitrate?, error? }
 *
 * Sonara asks a source for a song only when it is set to Lossless and has no copy of its own, and
 * plays the source's file only when its title, artist and length match the YouTube song. A source
 * that answers with a DASH manifest (how some hi-res catalogues are served) has its pieces put
 * together into one file first, since Chromium plays a file but not a manifest.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AudioFormat, LosslessSource } from '../shared/types';
import { log } from './log';
import { proxy, serveFile } from './media';

interface Manifest {
  id?: string;
  name?: string;
  version?: string;
  resources?: string[];
  settings?: { key?: string; default?: unknown; options?: { value?: unknown }[] }[];
}

export interface AddonTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  format?: string;
  audioQuality?: string;
  audioMode?: string;
  audioModes?: string[];
  atmos?: boolean;
  streamURL?: string;
}

interface AddonStream {
  url?: string;
  format?: string;
  quality?: string;
  streamQuality?: string;
  audioQuality?: string;
  codec?: string;
  manifest?: string;
  mediaType?: string;
  encrypted?: unknown;
  sampleRate?: number;
  bitDepth?: number;
  bitrate?: number;
  error?: string;
}

/** Addon requests sit in front of a song starting, so an unreachable source gives up quickly. */
const TIMEOUT = 9000;

export function normalizeBase(raw: string): string {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '').replace(/\/manifest\.json$/i, '');
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
  return (await res.json()) as T;
}

const manifests = new Map<string, { at: number; manifest: Manifest }>();
async function manifestOf(base: string): Promise<Manifest | null> {
  const hit = manifests.get(base);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.manifest;
  const manifest = await getJson<Manifest>(`${base}/manifest.json`).catch(() => null);
  if (manifest) manifests.set(base, { at: Date.now(), manifest });
  return manifest;
}

/** The parameters every request carries: the source's own defaults, then the best quality it offers. */
async function paramsFor(base: string): Promise<URLSearchParams> {
  const params = new URLSearchParams();
  const settings = (await manifestOf(base))?.settings ?? [];
  for (const s of settings) {
    if (s.key && (typeof s.default === 'string' || typeof s.default === 'number' || typeof s.default === 'boolean')) params.set(s.key, String(s.default));
  }
  // A source with a quality picker lists its options best first; one without one takes the word.
  const options = settings.find((s) => s.key === 'quality')?.options?.map((o) => String(o.value ?? '')).filter(Boolean) ?? [];
  params.set('quality', options.find((o) => /hi[-_ ]?res/i.test(o)) ?? options.find((o) => /lossless|flac/i.test(o)) ?? options[0] ?? 'LOSSLESS');
  return params;
}

/** Checks an address before it's added: its name from the manifest, or why it can't be used. */
export async function testSource(raw: string): Promise<{ ok: true; name: string; url: string } | { ok: false; error: string }> {
  const url = normalizeBase(raw);
  try {
    new URL(url);
  } catch {
    return { ok: false, error: 'That isn’t a web address.' };
  }
  manifests.delete(url);
  const manifest = await manifestOf(url);
  if (manifest?.resources?.length && !manifest.resources.some((r) => /search/i.test(r))) return { ok: false, error: 'This source can’t be searched, so Sonara can’t find songs on it.' };
  if (manifest?.name || manifest?.id) return { ok: true, name: manifest.name || manifest.id!, url };
  // No manifest: still a source if its search answers.
  try {
    const res = await getJson<{ tracks?: unknown[] }>(`${url}/search?q=test`);
    if (Array.isArray(res.tracks)) return { ok: true, name: new URL(url).hostname, url };
    return { ok: false, error: 'That address answered, but not like a lossless source.' };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return { ok: false, error: /fetch failed|ENOTFOUND|ECONN|timeout|aborted/i.test(raw) ? 'Can’t reach that address.' : `That address answered with ${raw}.` };
  }
}

const ATMOS = /atmos|dolby|eac3|ec-?3|360ra/i;
const LOSSLESS = /flac|alac|lossless|hi[-_ ]?res|wav|pcm|24[-_ ]?bit/i;

/** What a row or stream says it is, from its fields or its quality label. */
export function formatFrom(text: string, fields: { codec?: string; sampleRate?: number; bitDepth?: number; bitrate?: number } = {}): AudioFormat {
  const codec = (fields.codec || text.match(/\b(flac|alac|wav|aac|mp3|opus)\b/i)?.[1] || (LOSSLESS.test(text) ? 'flac' : 'aac')).toUpperCase();
  const rate = fields.sampleRate && fields.sampleRate > 0 ? (fields.sampleRate < 1000 ? fields.sampleRate * 1000 : fields.sampleRate) : Number(text.match(/([\d.]+)\s*khz/i)?.[1]) * 1000 || undefined;
  const bits = fields.bitDepth && fields.bitDepth > 0 ? fields.bitDepth : Number(text.match(/(\d{2})\s*-?\s*bit/i)?.[1]) || undefined;
  const lossless = LOSSLESS.test(`${text} ${codec}`);
  return {
    codec,
    lossless,
    ...(bits && { bitDepth: bits }),
    ...(rate && { sampleRate: Math.round(rate) }),
    ...(fields.bitrate && fields.bitrate > 0 && { bitrate: fields.bitrate > 3000 ? fields.bitrate : fields.bitrate * 1000 }),
    // A hi-res row that doesn't say its resolution is at least 24-bit.
    ...(!bits && /hi[-_ ]?res/i.test(text) && { bitDepth: 24 }),
  };
}

/** Stereo, playable rows a source holds for a query. */
export async function searchSource(source: LosslessSource, query: string): Promise<AddonTrack[]> {
  const base = normalizeBase(source.url);
  const params = await paramsFor(base);
  params.set('q', query);
  const res = await getJson<{ tracks?: AddonTrack[] }>(`${base}/search?${params}`);
  return (res.tracks ?? []).filter((t) => t?.id && t.title && !t.atmos && !ATMOS.test(`${t.audioQuality ?? ''} ${t.audioMode ?? ''} ${(t.audioModes ?? []).join(' ')}`));
}

interface Resolved {
  url: string;
  dash: boolean;
  format: AudioFormat;
  at: number;
}
const resolved = new Map<string, Resolved>();
/** Links from a source expire; a found one is reused for a few minutes (the player asks many times while seeking). */
const LINK_TTL = 4 * 60_000;

export async function resolveSourceStream(source: LosslessSource, trackId: string, rowStreamUrl?: string): Promise<Resolved> {
  const key = `${source.id}:${trackId}`;
  const hit = resolved.get(key);
  if (hit && Date.now() - hit.at < LINK_TTL) return hit;
  const base = normalizeBase(source.url);
  let answer: AddonStream;
  if (rowStreamUrl) answer = { url: rowStreamUrl };
  else {
    const params = await paramsFor(base);
    answer = await getJson<AddonStream>(`${base}/stream/${encodeURIComponent(trackId)}?${params}`);
  }
  if (!answer.url) throw new Error(answer.error || 'The source had no audio for this song.');
  const encrypted = typeof answer.encrypted === 'string' ? !/^(false|none|)$/i.test(answer.encrypted) : answer.encrypted === true;
  if (encrypted) throw new Error('The source sent protected audio, which Sonara can’t play.');
  const text = `${answer.quality ?? ''} ${answer.streamQuality ?? ''} ${answer.audioQuality ?? ''} ${answer.format ?? ''}`;
  if (ATMOS.test(`${text} ${answer.codec ?? ''}`)) throw new Error('The source sent a Dolby Atmos mix, which Sonara can’t play.');
  const transport = (answer.manifest || answer.mediaType || answer.format || '').toLowerCase();
  if (/hls|m3u8|mpegurl/.test(transport)) throw new Error('The source sent an HLS stream, which Sonara can’t play yet.');
  const dash = /dash|mpd/.test(transport) || /\.mpd(\?|$)/i.test(answer.url) || answer.url.startsWith('data:application/dash+xml');
  const r: Resolved = { url: answer.url, dash, format: formatFrom(text, answer), at: Date.now() };
  resolved.set(key, r);
  if (resolved.size > 200) resolved.delete(resolved.keys().next().value!);
  return r;
}

// ---- DASH: put the pieces together into one file -------------------------------------

let cacheDir = '';
export function openAddons(dataDir: string) {
  cacheDir = path.join(dataDir, 'lossless-cache');
  // Kept between songs, not between runs.
  fs.rm(cacheDir, { recursive: true, force: true }, () => undefined);
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, '&');
}

/** The pieces of a DASH manifest's best audio, in order: its initialization, then each segment. */
export function dashPieces(xml: string, manifestUrl: string): string[] {
  const reps = [...xml.matchAll(/<Representation\b[^>]*>[\s\S]*?<\/Representation>|<Representation\b[^>]*\/>/g)].map((m) => m[0]);
  const best = reps.sort((a, b) => Number(attr(b, 'bandwidth') ?? 0) - Number(attr(a, 'bandwidth') ?? 0))[0];
  const scope = best && /<SegmentTemplate/.test(best) ? best : xml;
  const repId = best ? attr(best, 'id') ?? '' : '';
  const bandwidth = best ? attr(best, 'bandwidth') ?? '' : '';
  const template = scope.match(/<SegmentTemplate\b[^>]*>/)?.[0];
  const baseUrl = xml.match(/<BaseURL>([^<]+)<\/BaseURL>/)?.[1]?.trim();
  const root = manifestUrl.startsWith('data:') ? (baseUrl ?? '') : new URL(baseUrl ?? '', manifestUrl).href;
  const resolve = (u: string) => (/^https?:/i.test(u) ? u : new URL(u, root).href);
  const fill = (t: string, n?: number, time?: number) =>
    t
      .replace(/\$RepresentationID\$/g, repId)
      .replace(/\$Bandwidth\$/g, bandwidth)
      .replace(/\$Number(?:%0(\d+)d)?\$/g, (_, w) => (w ? String(n).padStart(Number(w), '0') : String(n)))
      .replace(/\$Time\$/g, String(time));
  if (!template) {
    // A single file, or a list of segments.
    const list = [...scope.matchAll(/<SegmentURL\b[^>]*media="([^"]+)"/g)].map((m) => resolve(m[1]!.replace(/&amp;/g, '&')));
    const init = scope.match(/<Initialization\b[^>]*sourceURL="([^"]+)"/)?.[1];
    if (list.length) return [...(init ? [resolve(init.replace(/&amp;/g, '&'))] : []), ...list];
    if (baseUrl) return [resolve(baseUrl)];
    throw new Error('The source’s DASH manifest has no segments Sonara understands.');
  }
  const init = attr(template, 'initialization');
  const media = attr(template, 'media');
  if (!media) throw new Error('The source’s DASH manifest has no segment address.');
  let number = Number(attr(template, 'startNumber') ?? 1);
  const pieces: string[] = init ? [resolve(fill(init))] : [];
  const timeline = scope.match(/<SegmentTimeline>([\s\S]*?)<\/SegmentTimeline>/)?.[1];
  if (timeline) {
    let time = 0;
    for (const s of timeline.matchAll(/<S\b[^>]*>/g)) {
      const t = attr(s[0], 't');
      if (t) time = Number(t);
      const d = Number(attr(s[0], 'd') ?? 0);
      const repeat = Number(attr(s[0], 'r') ?? 0);
      for (let i = 0; i <= repeat; i++) {
        pieces.push(resolve(fill(media, number++, time)));
        time += d;
      }
    }
  } else {
    const duration = Number(attr(template, 'duration'));
    const timescale = Number(attr(template, 'timescale') ?? 1);
    const total = xml.match(/mediaPresentationDuration="PT(?:(\d+)H)?(?:(\d+)M)?([\d.]+)S"/);
    const seconds = total ? Number(total[1] ?? 0) * 3600 + Number(total[2] ?? 0) * 60 + Number(total[3]) : 0;
    if (!duration || !seconds) throw new Error('The source’s DASH manifest doesn’t say how long the song is.');
    const count = Math.ceil(seconds / (duration / timescale));
    for (let i = 0; i < count; i++) pieces.push(resolve(fill(media, number++)));
  }
  return pieces;
}

const assembling = new Map<string, Promise<string>>();

async function assemble(key: string, manifestUrl: string): Promise<string> {
  const file = path.join(cacheDir, `${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}.m4a`);
  if (fs.existsSync(file)) return file;
  const running = assembling.get(file);
  if (running) return running;
  const job = (async () => {
    const xml = manifestUrl.startsWith('data:')
      ? Buffer.from(manifestUrl.slice(manifestUrl.indexOf(',') + 1), manifestUrl.includes(';base64,') ? 'base64' : 'utf8').toString('utf8')
      : await (await fetch(manifestUrl, { signal: AbortSignal.timeout(TIMEOUT) })).text();
    const pieces = dashPieces(xml, manifestUrl);
    const parts: Buffer[] = new Array(pieces.length);
    let next = 0;
    // A few pieces at once: one connection alone is slow.
    await Promise.all(
      Array.from({ length: Math.min(6, pieces.length) }, async () => {
        while (next < pieces.length) {
          const i = next++;
          for (let attempt = 0; ; attempt++) {
            try {
              const res = await fetch(pieces[i]!, { signal: AbortSignal.timeout(20_000) });
              if (!res.ok) throw new Error(`piece ${i} answered ${res.status}`);
              parts[i] = Buffer.from(await res.arrayBuffer());
              break;
            } catch (error) {
              if (attempt >= 2) throw error;
            }
          }
        }
      }),
    );
    await fs.promises.mkdir(cacheDir, { recursive: true });
    await fs.promises.writeFile(`${file}.part`, Buffer.concat(parts));
    await fs.promises.rename(`${file}.part`, file);
    // Keep the cache to the last dozen songs.
    const kept = (await fs.promises.readdir(cacheDir)).filter((f) => f.endsWith('.m4a')).map((f) => path.join(cacheDir, f));
    if (kept.length > 12) {
      const byAge = kept.map((f) => ({ f, t: fs.statSync(f).mtimeMs })).sort((a, b) => a.t - b.t);
      for (const { f } of byAge.slice(0, kept.length - 12)) fs.rm(f, { force: true }, () => undefined);
    }
    return file;
  })().finally(() => assembling.delete(file));
  assembling.set(file, job);
  return job;
}

/** Serves a source's song to the player: proxied with byte ranges, or put together from DASH first. */
export async function serveSourceSong(source: LosslessSource, trackId: string, rowStreamUrl: string | undefined, range: string | null): Promise<{ response: Response; format: AudioFormat }> {
  const r = await resolveSourceStream(source, trackId, rowStreamUrl);
  if (r.dash) {
    const file = await assemble(`${source.id}:${trackId}`, r.url);
    return { response: await serveFile(file, range), format: r.format };
  }
  const response = await proxy(r.url, range);
  if (!response.ok) {
    log.warn(`lossless source ${source.name}: stream answered ${response.status}`);
    resolved.delete(`${source.id}:${trackId}`);
  }
  return { response, format: r.format };
}
