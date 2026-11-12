/*
 * Turns a videoId into audio the renderer's <audio> element can play.
 *
 * 1. Resolve: ask YouTube for the track's player response through a walk of
 *    InnerTube clients, VISIONOS first. As measured by BitChord (Oct 2026),
 *    VISIONOS answers with direct audio URLs and needs no PO token; the others
 *    are fallbacks. A client that refuses a track sits out for 10 minutes.
 * 2. Serve: the renderer plays `ytstream://track/<videoId>?q=high`. The
 *    handler answers the media element's range requests by fetching
 *    googlevideo in chunks, so no single upstream request is large enough to
 *    be throttled, and a URL that expires or is refused mid-track is
 *    re-resolved and the stream continues from the same byte.
 */
import type { Innertube } from 'youtubei.js';
import type { AudioQuality, StreamInfo } from '../shared/types';
import { getInnertube, resetInnertube } from './youtube';
import { serveSourceSong } from './addons';
import { findLosslessMatch, forgetMatch, refineFormat, type LosslessMatch } from './lossless';
import type { LosslessSource } from '../shared/types';
import { serveFile, serveServerSong } from './media';
import { log } from './log';

type ClientName = 'VISIONOS' | 'ANDROID_VR' | 'TV' | 'IOS' | 'YTMUSIC' | 'WEB';

const CLIENT_ORDER: ClientName[] = ['VISIONOS', 'ANDROID_VR', 'TV', 'IOS', 'YTMUSIC', 'WEB'];
const CLIENT_ATTEMPTS = 4;
const EXCLUDE_MS = 10 * 60_000;
const UNPLAYABLE_TTL_MS = 10 * 60_000;
/** Upstream chunk size. googlevideo slows down or refuses very large single ranges. */
const CHUNK = 1024 * 1024 * 2;

/** User agents the media requests carry, matching the client that minted the URL. */
const USER_AGENTS: Partial<Record<ClientName, string>> = {
  VISIONOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  ANDROID_VR:
    'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
  IOS: 'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
  TV: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
};
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

/** Itags in order of preference, per quality setting (audio-only formats). */
type YouTubeQuality = Exclude<AudioQuality, 'lossless'>;
/** What a stream is for: the song's audio at a quality, or a music video's picture (no sound) up to a height. */
type StreamKind = AudioQuality | `video-${number}`;
/** Where Auto opens: the top of YouTube's H.264 ladder. */
export const AUTO_VIDEO_HEIGHT = 1080;
/** The heights each music video offers, and the one playing: for the quality menu. */
const videoHeightsOf = new Map<string, { heights: number[]; active?: number }>();
export const videoHeights = (videoId: string) => videoHeightsOf.get(videoId) ?? null;
const ITAG_PREFERENCE: Record<YouTubeQuality, number[]> = {
  // Opus ~160 kbps, AAC 128 kbps, then the smaller ones.
  high: [251, 140, 250, 249, 139],
  normal: [140, 250, 251, 249, 139],
  low: [249, 139, 250, 140, 251],
};

export class UnplayableError extends Error {
  override name = 'UnplayableError';
}

export interface ResolvedStream {
  videoId: string;
  client: ClientName;
  codec: string;
  sampleRate?: number;
  url: string;
  itag: number;
  mimeType: string;
  bitrate?: number;
  contentLength: number;
  /** Unix ms after which the URL stops working. */
  expiresAt: number;
  userAgent: string;
  loudnessDb?: number;
  /** A music video's picture, not a song's audio. */
  video?: boolean;
}

const resolved = new Map<string, ResolvedStream>();
const inflight = new Map<string, Promise<ResolvedStream>>();
const excluded = new Map<string, Map<ClientName, number>>();
const unplayable = new Map<string, { reason: string; at: number }>();

const keyOf = (videoId: string, quality: StreamKind) => `${videoId}:${quality}`;

function excludeClient(videoId: string, client: ClientName, why: string) {
  log.warn(`[${videoId}] ${client} refused: ${why}`);
  let entries = excluded.get(videoId);
  if (!entries) {
    if (excluded.size > 200) excluded.clear();
    entries = new Map();
    excluded.set(videoId, entries);
  }
  entries.set(client, Date.now() + EXCLUDE_MS);
}

function clientsFor(videoId: string): ClientName[] {
  const entries = excluded.get(videoId);
  const now = Date.now();
  return CLIENT_ORDER.filter((c) => (entries?.get(c) ?? 0) <= now);
}

const AGE_GATE = /confirm your age|age-restricted|inappropriate for some users|sign in to confirm/i;

function permanentReason(reason: string): string | null {
  if (AGE_GATE.test(reason)) return 'This track is age-restricted, and YouTube won’t play it without a signed-in account.';
  if (/country|region/i.test(reason)) return 'This track isn’t available in your country.';
  if (/private/i.test(reason)) return 'This track is private.';
  if (/terminated/i.test(reason)) return 'The channel behind this track was terminated.';
  if (/premium/i.test(reason)) return 'This track needs YouTube Music Premium.';
  if (/removed|no longer available|does not exist/i.test(reason)) return 'This track was removed from YouTube.';
  return null;
}

async function contentLengthOf(url: string, userAgent: string): Promise<number> {
  const response = await fetch(url, { headers: { Range: 'bytes=0-0', 'User-Agent': userAgent } });
  const total = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1];
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok || !total) throw new Error(`length probe answered ${response.status}`);
  return Number(total);
}

async function resolveWith(yt: Innertube, videoId: string, client: ClientName, quality: StreamKind, itag?: number): Promise<ResolvedStream | string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info: any = await yt.getBasicInfo(videoId, { client: client as never });
  const status: string | undefined = info.playability_status?.status;
  const reason: string = info.playability_status?.reason ?? status ?? 'no status';
  if (status !== 'OK') return `${status}: ${reason}`;
  const video = quality.startsWith('video-');
  const maxHeight = video ? Number(quality.slice(6)) || 1080 : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formats: any[] = (info.streaming_data?.adaptive_formats ?? []).filter((f: any) => (video ? f.has_video && !f.has_audio : f.has_audio && !f.has_video));
  if (!formats.length) return `no ${video ? 'video' : 'audio'} formats in the response`;
  // Prefer the original-language, non-DRC track.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usable = formats.filter((f: any) => !f.is_drc && (f.audio_track ? f.audio_track.audio_is_default !== false : true));
  const pool = usable.length ? usable : formats;
  // A video: the tallest picture up to the chosen height; at a height, 30 frames a second before 60 (half
  // the data, plenty for a music video), and H.264 before VP9 before AV1 (easier to decode).
  const codecRank = (f: { mime_type?: string }) => (/avc1/.test(String(f.mime_type)) ? 0 : /vp0?9/.test(String(f.mime_type)) ? 1 : 2);
  const videoOrder = video
    ? pool
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((f: any) => (f.height ?? 0) <= maxHeight && (f.url || f.signature_cipher || f.cipher))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => (b.height ?? 0) - (a.height ?? 0) || Number((a.fps ?? 30) > 30) - Number((b.fps ?? 30) > 30) || codecRank(a) - codecRank(b) || (b.bitrate ?? 0) - (a.bitrate ?? 0))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f: any) => f.itag as number)
    : [];
  const order = itag ? [itag] : video ? videoOrder : ITAG_PREFERENCE[quality === 'lossless' ? 'high' : (quality as YouTubeQuality)];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let format: any = null;
  for (const wanted of order) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    format = pool.find((f: any) => f.itag === wanted);
    if (format) break;
  }
  if (!format && itag) return `itag ${itag} not offered`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format ??= pool
    .slice()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((f: any) => !video || (f.height ?? 0) <= maxHeight)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
  if (!format) return `no video format up to ${maxHeight}p`;
  if (!format.url && !format.signature_cipher && !format.cipher) return 'only SABR streams (no direct URL)';
  if (video) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heights = [...new Set(pool.map((f: any) => Number(f.height) || 0).filter((h: number) => h >= 144))].sort((a, b) => b - a);
    videoHeightsOf.set(videoId, { heights, active: Number(format.height) || undefined });
    if (videoHeightsOf.size > 100) videoHeightsOf.delete(videoHeightsOf.keys().next().value!);
  }
  const url = await format.decipher(yt.session.player);
  if (!url) return 'decipher produced no URL';
  const userAgent = USER_AGENTS[client] ?? DESKTOP_UA;
  const contentLength = Number(format.content_length) || (await contentLengthOf(url, userAgent));
  const expire = Number(new URL(url).searchParams.get('expire'));
  return {
    videoId,
    client,
    url,
    itag: format.itag,
    mimeType: String(format.mime_type ?? (video ? 'video/mp4' : 'audio/webm')).split(';')[0]!,
    ...(video && { video: true }),
    codec: video ? 'Video' : /opus/i.test(String(format.mime_type)) ? 'Opus' : /mp4a|mp4/i.test(String(format.mime_type)) ? 'AAC' : 'Audio',
    sampleRate: Number(format.audio_sample_rate) || undefined,
    bitrate: format.bitrate,
    contentLength,
    expiresAt: expire ? expire * 1000 : Date.now() + 5 * 3600_000,
    userAgent,
    loudnessDb: info.player_config?.audio_config?.loudness_db,
  };
}

async function walkClients(videoId: string, quality: StreamKind, itag?: number): Promise<ResolvedStream> {
  const known = unplayable.get(videoId);
  if (known && Date.now() - known.at < UNPLAYABLE_TTL_MS) throw new UnplayableError(known.reason);

  let yt = await getInnertube();
  const candidates = clientsFor(videoId).slice(0, CLIENT_ATTEMPTS);
  if (!candidates.length) candidates.push(...CLIENT_ORDER.slice(0, 2));
  let lastReason = 'No YouTube client would play this track.';
  let permanent: string | null = null;
  for (const client of candidates) {
    const started = Date.now();
    try {
      const result = await resolveWith(yt, videoId, client, quality, itag);
      if (typeof result !== 'string') {
        log.info(`[${videoId}] ${client} → itag ${result.itag} (${result.mimeType}, ${Math.round((result.bitrate ?? 0) / 1000)} kbps) in ${Date.now() - started}ms`);
        return result;
      }
      lastReason = result;
      permanent ??= permanentReason(result);
      excludeClient(videoId, client, result);
    } catch (error) {
      lastReason = String(error instanceof Error ? error.message : error);
      excludeClient(videoId, client, `request failed: ${lastReason}`);
      // A broken session (stale player script) fails every client the same way.
      if (/decipher|player/i.test(lastReason)) {
        resetInnertube();
        yt = await getInnertube();
      }
    }
  }
  if (permanent) {
    unplayable.set(videoId, { reason: permanent, at: Date.now() });
    throw new UnplayableError(permanent);
  }
  throw new Error(lastReason);
}

/** The stream for a track, reused while its URL is fresh. */
export async function resolveStream(videoId: string, quality: StreamKind, options: { fresh?: boolean; itag?: number } = {}): Promise<ResolvedStream> {
  const key = keyOf(videoId, quality);
  const cached = resolved.get(key);
  if (!options.fresh && cached && cached.expiresAt - Date.now() > 60_000 && (!options.itag || cached.itag === options.itag)) return cached;
  if (!options.fresh) {
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const task = walkClients(videoId, quality, options.itag)
    .then((stream) => {
      if (resolved.size > 100) resolved.clear();
      resolved.set(key, stream);
      return stream;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

export function streamInfo(videoId: string): StreamInfo | null {
  for (const stream of resolved.values()) {
    if (stream.videoId === videoId && !stream.video) {
      return {
        videoId,
        source: 'youtube',
        client: stream.client,
        mimeType: stream.mimeType,
        bitrate: stream.bitrate,
        itag: stream.itag,
        contentLength: stream.contentLength,
        loudnessDb: stream.loudnessDb,
        format: { codec: stream.codec, lossless: false, ...(stream.sampleRate && { sampleRate: stream.sampleRate }), ...(stream.bitrate && { bitrate: stream.bitrate }) },
      };
    }
  }
  return null;
}

export function loudnessOf(videoId: string): number | undefined {
  for (const stream of resolved.values()) if (stream.videoId === videoId && !stream.video) return stream.loudnessDb;
  return undefined;
}

// ---- The protocol handler ----------------------------------------------------------

function parseRange(header: string | null, length: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = header.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : length - 1;
  if (Number.isNaN(start)) {
    // A suffix range: the last N bytes.
    start = Math.max(0, length - end);
    end = length - 1;
  }
  return { start, end: Math.min(end, length - 1) };
}

async function fetchChunk(stream: ResolvedStream, start: number, end: number, signal: AbortSignal): Promise<Response> {
  return fetch(stream.url, {
    headers: { Range: `bytes=${start}-${end}`, 'User-Agent': stream.userAgent, Accept: '*/*' },
    signal,
  });
}

/**
 * The body for bytes [start, end] of a track: chunk after chunk from
 * googlevideo, re-resolving (same itag, next client) when a URL is refused.
 */
function chunkedBody(videoId: string, quality: StreamKind, first: ResolvedStream, start: number, end: number): ReadableStream<Uint8Array> {
  let stream = first;
  let position = start;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const controller = new AbortController();
  let refusals = 0;

  const openNext = async (): Promise<boolean> => {
    if (position > end) return false;
    const chunkEnd = Math.min(position + CHUNK - 1, end);
    for (;;) {
      if (stream.expiresAt - Date.now() < 30_000) stream = await resolveStream(videoId, quality, { fresh: true, itag: stream.itag });
      const response = await fetchChunk(stream, position, chunkEnd, controller.signal);
      if (response.ok && response.body) {
        reader = response.body.getReader();
        return true;
      }
      await response.body?.cancel().catch(() => undefined);
      refusals++;
      log.warn(`[${videoId}] googlevideo answered ${response.status} at byte ${position} (${stream.client})`);
      if (refusals > 3) throw new Error(`googlevideo kept refusing (${response.status})`);
      excludeClient(videoId, stream.client, `stream answered ${response.status}`);
      stream = await resolveStream(videoId, quality, { fresh: true, itag: stream.itag });
    }
  };

  // googlevideo sometimes drops a connection partway through a chunk ("terminated"): the stream
  // picks up again from the same byte instead of failing, which would make the player stall.
  let drops = 0;
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      for (;;) {
        try {
          if (!reader && !(await openNext())) {
            ctrl.close();
            return;
          }
          const { done, value } = await reader!.read();
          if (done) {
            reader = null;
            continue;
          }
          position += value.byteLength;
          drops = 0;
          ctrl.enqueue(value);
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (reader && drops < 4) {
            drops++;
            log.warn(`[${videoId}] connection dropped at byte ${position}; picking up again (${drops})`);
            reader.cancel().catch(() => undefined);
            reader = null;
            continue;
          }
          log.error(`[${videoId}] stream failed at byte ${position}: ${String(error)}`);
          ctrl.error(error);
          return;
        }
      }
    },
    cancel() {
      controller.abort();
      reader?.cancel().catch(() => undefined);
    },
  });
}

export async function handleStreamRequest(request: Request, defaultQuality: () => AudioQuality, sources: () => LosslessSource[] = () => []): Promise<Response> {
  const url = new URL(request.url);
  const videoId = decodeURIComponent(url.pathname.replace(/^\/+/, '')).split('/')[0] ?? '';
  const q = url.searchParams.get('q');
  // q=video: a music video's picture, for the full-screen player, up to h pixels high.
  const height = Number(url.searchParams.get('h'));
  let quality: StreamKind =
    q === 'video' ? `video-${height >= 144 && height <= 4320 ? Math.round(height) : AUTO_VIDEO_HEIGHT}` : q === 'normal' || q === 'low' || q === 'high' || q === 'lossless' ? q : defaultQuality();
  if (!/^[\w-]{11}$/.test(videoId)) return new Response('bad video id', { status: 400 });

  // Lossless when available: your own copy of the song, if you have one.
  if (quality === 'lossless') {
    const title = url.searchParams.get('t') ?? '';
    const artist = url.searchParams.get('a') ?? '';
    const duration = Number(url.searchParams.get('d')) || undefined;
    let match: LosslessMatch | null = null;
    if (title) match = await findLosslessMatch({ videoId, title, artist, duration }, sources()).catch(() => null);
    if (match) {
      const range = request.headers.get('range');
      let response: Response;
      try {
        if (match.source === 'addon') {
          const served = await serveSourceSong(match.addon, match.trackId, match.streamURL, range);
          refineFormat(videoId, served.format);
          response = served.response;
        } else response = match.source === 'local' ? await serveFile(match.entry.path, range) : await serveServerSong(match.id, range);
      } catch (error) {
        response = new Response(String(error), { status: 502 });
      }
      if (response.ok) return response;
      log.warn(`[${videoId}] lossless copy failed (${response.status}: ${await response.clone().text().catch(() => '')}); falling back to YouTube`);
      if (match.source === 'addon') forgetMatch(videoId);
    }
    quality = 'high';
  }

  let stream: ResolvedStream;
  try {
    stream = await resolveStream(videoId, quality);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const message = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONN|ETIMEDOUT|ENETUNREACH/i.test(raw) ? 'Check your internet connection.' : raw;
    log.error(`[${videoId}] unplayable: ${raw}`);
    // The renderer reads this header to explain the failure.
    return new Response(message, { status: error instanceof UnplayableError ? 451 : 502, headers: { 'X-Obsidian-Error': encodeURIComponent(message) } });
  }

  const length = stream.contentLength;
  const range = parseRange(request.headers.get('range'), length);
  const start = range?.start ?? 0;
  const end = range?.end ?? length - 1;
  if (start >= length) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } });
  }
  const headers = new Headers({
    'Content-Type': stream.mimeType,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${length}`);
  return new Response(chunkedBody(videoId, quality, stream, start, end), { status: range ? 206 : 200, headers });
}
