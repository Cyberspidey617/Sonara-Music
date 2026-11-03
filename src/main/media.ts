/*
 * The media:// protocol: your own music.
 *
 *   media://local/<id>             a file in your music folders (byte ranges)
 *   media://server/<id>            a song on your server, proxied (byte ranges)
 *   media://art/local/<key>        artwork extracted from tags, or cover.jpg
 *   media://art/server/<coverId>   artwork from your server
 *
 * Server credentials stay in the main process; the renderer only sees these URLs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getArtFile, getEntry, MIME } from './library';
import { log } from './log';
import { coverUrl, songInfo, streamUrlFor } from './subsonic';

const CORS = { 'Access-Control-Allow-Origin': '*' };

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header?.match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;
  if (!m[1]) {
    const suffix = Number(m[2]);
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  return { start: Number(m[1]), end: m[2] ? Math.min(Number(m[2]), size - 1) : size - 1 };
}

export async function serveFile(file: string, rangeHeader: string | null, cacheable = false): Promise<Response> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(file);
  } catch {
    return new Response('This file is no longer there. Rescan your music folders.', { status: 404, headers: { ...CORS, 'X-Obsidian-Error': encodeURIComponent('This file was moved or deleted. Rescan your music folders in Settings.') } });
  }
  const size = stat.size;
  const mime = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = parseRange(rangeHeader, size);
  if (range && range.start >= size) return new Response(null, { status: 416, headers: { ...CORS, 'Content-Range': `bytes */${size}` } });
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
  const headers: Record<string, string> = {
    ...CORS,
    'Content-Type': mime,
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheable ? 'max-age=86400' : 'no-store',
  };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: range ? 206 : 200, headers });
}

/** Proxies a server URL, passing the player's Range through. */
export async function proxy(url: string, rangeHeader: string | null, cacheable = false): Promise<Response> {
  const upstream = await fetch(url, { headers: rangeHeader ? { Range: rangeHeader } : {} });
  const type = upstream.headers.get('content-type') ?? '';
  // Subsonic reports errors as a JSON/XML body with 200.
  if (/json|xml/.test(type) && !/audio|image/.test(type)) {
    const text = await upstream.text();
    const message = text.match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? 'Your server refused the request.';
    return new Response(message, { status: 502, headers: { ...CORS, 'X-Obsidian-Error': encodeURIComponent(message) } });
  }
  const headers = new Headers(CORS);
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('Cache-Control', cacheable ? 'max-age=86400' : 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function serveServerSong(id: string, rangeHeader: string | null): Promise<Response> {
  const info = await songInfo(id).catch(() => null);
  return proxy(streamUrlFor(id, info?.suffix), rangeHeader);
}

export async function handleMediaRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/+/, '').split('/').map(decodeURIComponent);
  const range = request.headers.get('range');
  try {
    switch (url.hostname) {
      case 'local': {
        const entry = getEntry(parts[0] ?? '');
        if (!entry) return new Response('not in the library', { status: 404, headers: { ...CORS, 'X-Obsidian-Error': encodeURIComponent('This song is no longer in your music folders.') } });
        return serveFile(entry.path, range);
      }
      case 'server':
        return serveServerSong(parts[0] ?? '', range);
      case 'art': {
        if (parts[0] === 'local') {
          const file = getArtFile(parts[1] ?? '');
          return file ? serveFile(file, null, true) : new Response(null, { status: 404, headers: CORS });
        }
        if (parts[0] === 'server') return proxy(coverUrl(parts[1] ?? '', Number(url.searchParams.get('size')) || 600), null, true);
        return new Response(null, { status: 404, headers: CORS });
      }
      default:
        return new Response(null, { status: 404, headers: CORS });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`media request ${request.url} failed: ${message}`);
    const friendly = /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message) ? 'Can’t reach your music server.' : message;
    return new Response(friendly, { status: 502, headers: { ...CORS, 'X-Obsidian-Error': encodeURIComponent(friendly) } });
  }
}
