// Downloads: songs saved to a folder on this PC, played from there afterwards
// (so they work offline). The audio is saved exactly as delivered, never
// re-encoded, because converting a lossy stream can only lose quality.
//
//   best        YouTube's best: Opus ~160 kbps (.webm), falling back to AAC
//   compatible  AAC 128 kbps (.m4a), which every player and phone opens
//   small       Opus ~50–70 kbps (.webm), for saving space
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isYouTubeId, type AudioFormat, type DownloadItem, type DownloadQuality, type StreamInfo, type Track } from '../shared/types';
import { getEntry } from './library';
import { log } from './log';
import { serveServerSong } from './media';
import { resolveStream, type ResolvedStream } from './stream';

const ITAGS: Record<DownloadQuality, number[]> = {
  best: [251, 140, 250],
  compatible: [140, 139],
  small: [250, 249, 139],
};
const CHUNK = 4 * 1024 * 1024;
const PARALLEL = 2;

let indexFile = '';
let items = new Map<string, DownloadItem>();
let folder = () => path.join(os.homedir(), 'Music', 'Obsidian Music');
let notify: (items: DownloadItem[]) => void = () => undefined;
const running = new Map<string, AbortController>();

export function openDownloads(dataDir: string, getFolder: () => string, onChange: (items: DownloadItem[]) => void) {
  indexFile = path.join(dataDir, 'downloads.json');
  folder = () => getFolder() || path.join(os.homedir(), 'Music', 'Obsidian Music');
  notify = onChange;
  try {
    const saved = JSON.parse(fs.readFileSync(indexFile, 'utf8')) as DownloadItem[];
    items = new Map(saved.map((d) => [d.videoId, d]));
    // Anything cut off by the app closing can be retried.
    for (const d of items.values()) if (d.state === 'queued' || d.state === 'downloading') Object.assign(d, { state: 'error', error: 'Interrupted. Retry to finish it.' });
    // Files deleted outside the app are forgotten.
    for (const d of [...items.values()]) if (d.state === 'done' && (!d.path || !fs.existsSync(d.path))) items.delete(d.videoId);
  } catch {
    items = new Map();
  }
}

export const downloadsFolder = () => folder();
export const listDownloads = () => [...items.values()].sort((a, b) => b.at - a.at);

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
function changed(now = false) {
  if (!saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null;
      fs.promises.writeFile(indexFile, JSON.stringify(listDownloads())).catch((e) => log.error(`downloads index: ${e}`));
    }, 800);
  if (now) {
    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = null;
    notify(listDownloads());
  } else if (!notifyTimer) {
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      notify(listDownloads());
    }, 250);
  }
}

/** A downloaded file to play instead of streaming, if there is one. */
export function downloadedFile(videoId: string): DownloadItem | null {
  const d = items.get(videoId);
  return d?.state === 'done' && d.path && fs.existsSync(d.path) ? d : null;
}

export function downloadInfo(videoId: string): StreamInfo | null {
  const d = downloadedFile(videoId);
  if (!d) return null;
  return { videoId, source: 'download', mimeType: mimeFor(d.path!), format: d.format, contentLength: d.total };
}

const mimeFor = (file: string) => ({ '.webm': 'audio/webm', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg' })[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/** "Artist - Title.ext", safe for Windows, never overwriting another file. */
function targetPath(track: Track, ext: string): string {
  const clean = (s: string) =>
    s
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/, '')
      .trim()
      .slice(0, 120);
  const artists = track.artists.map((a) => a.name).join(', ');
  const base = clean(artists ? `${artists} - ${track.title}` : track.title) || track.videoId;
  const dir = folder();
  let file = path.join(dir, `${base}${ext}`);
  for (let n = 2; fs.existsSync(file) || fs.existsSync(`${file}.part`); n++) file = path.join(dir, `${base} (${n})${ext}`);
  return file;
}

export function queueDownloads(tracks: Track[], quality: DownloadQuality) {
  for (const track of tracks) {
    const existing = items.get(track.videoId);
    if (existing && (existing.state === 'queued' || existing.state === 'downloading')) continue;
    if (existing?.state === 'done' && existing.quality === quality && downloadedFile(track.videoId)) continue;
    items.set(track.videoId, { videoId: track.videoId, track, quality, state: 'queued', received: 0, total: 0, at: Date.now() });
  }
  changed(true);
  pump();
}

function pump() {
  if (running.size >= PARALLEL) return;
  const next = [...items.values()].filter((d) => d.state === 'queued').sort((a, b) => a.at - b.at)[0];
  if (!next) return;
  const controller = new AbortController();
  running.set(next.videoId, controller);
  next.state = 'downloading';
  changed(true);
  run(next, controller.signal)
    .then(() => {
      next.state = 'done';
      next.error = undefined;
      log.info(`[${next.videoId}] downloaded (${next.quality}) → ${next.path}`);
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) return;
      next.state = 'error';
      next.error = error instanceof Error ? error.message : String(error);
      if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONN|ETIMEDOUT/i.test(next.error)) next.error = 'Can’t reach YouTube. Check your internet connection.';
      log.error(`[${next.videoId}] download failed: ${next.error}`);
    })
    .finally(() => {
      running.delete(next.videoId);
      changed(true);
      pump();
    });
  pump();
}

async function run(d: DownloadItem, signal: AbortSignal) {
  await fs.promises.mkdir(folder(), { recursive: true });
  const { track } = d;
  if (track.source === 'local') {
    // Already on this PC: point at the file instead of copying it.
    const entry = getEntry(track.videoId);
    if (!entry) throw new Error('This file is no longer in your music folders.');
    Object.assign(d, { path: entry.path, total: entry.size ?? 0, received: entry.size ?? 0, format: entry.format });
    return;
  }
  if (track.source === 'server') return saveResponse(d, await serveServerSong(track.videoId.replace(/^srv_/, ''), null), track.format, signal);
  if (!isYouTubeId(track.videoId)) throw new Error('This song can’t be downloaded.');

  // YouTube: the chosen format, fetched in pieces, re-resolving if a link expires.
  let stream: ResolvedStream | null = null;
  let lastError = '';
  // A lossless copy made by an earlier version is fetched again at Best.
  for (const itag of ITAGS[d.quality === 'lossless' ? 'best' : d.quality]) {
    try {
      stream = await resolveStream(track.videoId, 'high', { itag, fresh: true });
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!stream) throw new Error(lastError || 'No downloadable audio for this song.');
  const ext = stream.mimeType.includes('mp4') ? '.m4a' : '.webm';
  d.path = targetPath(track, ext);
  d.total = stream.contentLength;
  d.format = { codec: stream.codec, lossless: false, ...(stream.bitrate && { bitrate: stream.bitrate }), ...(stream.sampleRate && { sampleRate: stream.sampleRate }) };
  const part = `${d.path}.part`;
  const out = await fs.promises.open(part, 'w');
  try {
    let position = 0;
    let refusals = 0;
    while (position < d.total) {
      if (signal.aborted) throw new Error('Cancelled');
      if (stream.expiresAt - Date.now() < 30_000) stream = await resolveStream(track.videoId, 'high', { fresh: true, itag: stream.itag });
      const end = Math.min(position + CHUNK, d.total) - 1;
      const response = await fetch(stream.url, { headers: { Range: `bytes=${position}-${end}`, 'User-Agent': stream.userAgent }, signal });
      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => undefined);
        if (++refusals > 4) throw new Error(`YouTube refused the download (${response.status}).`);
        stream = await resolveStream(track.videoId, 'high', { fresh: true, itag: stream.itag });
        continue;
      }
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        await out.write(chunk);
        position += chunk.byteLength;
        d.received = position;
        changed();
      }
    }
  } catch (error) {
    await out.close();
    await fs.promises.rm(part, { force: true });
    throw error;
  }
  await out.close();
  await fs.promises.rename(part, d.path);
}

async function saveResponse(d: DownloadItem, response: Response, format: AudioFormat | undefined, signal: AbortSignal, extHint?: string) {
  if (!response.ok || !response.body) throw new Error(`Your server answered ${response.status}.`);
  const type = response.headers.get('content-type') ?? '';
  const ext = extHint ?? ({ 'audio/flac': '.flac', 'audio/x-flac': '.flac', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav', 'audio/ogg': '.ogg' } as Record<string, string>)[type.split(';')[0]!] ?? '.flac';
  d.path = targetPath(d.track, ext);
  d.total = Number(response.headers.get('content-length')) || 0;
  d.format = format;
  const part = `${d.path}.part`;
  const out = fs.createWriteStream(part);
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      if (signal.aborted) throw new Error('Cancelled');
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      d.received += chunk.byteLength;
      changed();
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
    await fs.promises.rename(part, d.path);
  } catch (error) {
    out.destroy();
    await fs.promises.rm(part, { force: true });
    throw error;
  }
}

export function cancelDownload(videoId: string) {
  running.get(videoId)?.abort();
  items.delete(videoId);
  changed(true);
  pump();
}

export async function removeDownload(videoId: string, deleteFile: boolean) {
  const d = items.get(videoId);
  running.get(videoId)?.abort();
  items.delete(videoId);
  // Never delete a file that lives in your own music folders.
  if (deleteFile && d?.path && d.track.source !== 'local' && path.resolve(d.path).startsWith(path.resolve(folder()))) {
    await fs.promises.rm(d.path, { force: true }).catch(() => undefined);
  }
  changed(true);
}
