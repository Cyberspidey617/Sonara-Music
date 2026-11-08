// Covers for offline listening: a copy of each downloaded song's cover, kept on this PC, so the
// cover (and the accent read from it) is there with no connection. The app asks for covers
// through media://cover/?u=<the cover's address>; one is served from the copy when there is one.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { log } from './log';

let dir = '';

/** YouTube Music's image CDN resizes on request: the same cover at any size is one cover. */
const RESIZABLE = /googleusercontent\.com|ggpht\.com/;
function base(url: string): string {
  if (RESIZABLE.test(url)) return url.replace(/=[^/=]*$/, '');
  // i.ytimg.com/vi/<id>/<size>.jpg: any size is the same cover.
  const yt = url.match(/i\.ytimg\.com\/vi(?:_webp)?\/([^/]+)\//);
  if (yt) return `ytimg:${yt[1]}`;
  return url.split('?')[0]!;
}
const fileFor = (url: string) => path.join(dir, crypto.createHash('sha1').update(base(url)).digest('hex') + '.jpg');

/** The address to fetch for a copy: big enough for the full-screen player, small enough to keep. */
function fetchable(url: string): string {
  if (RESIZABLE.test(url)) return `${base(url)}=w544-h544-l90-rj`;
  const yt = url.match(/i\.ytimg\.com\/vi(?:_webp)?\/([^/]+)\//);
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`;
  return url;
}

export function openCovers(dataDir: string) {
  dir = path.join(dataDir, 'covers');
  fs.mkdirSync(dir, { recursive: true });
}

/** Keeps a copy of a cover (once). Quietly does nothing when there's no connection. */
export async function keepCover(url: string | undefined): Promise<void> {
  if (!url || !/^https?:/.test(url) || !dir) return;
  const file = fileFor(url);
  if (fs.existsSync(file)) return;
  try {
    const response = await fetch(fetchable(url), { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return;
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    log.warn(`cover not kept (${String(error)})`);
  }
}

/** Covers for songs downloaded before covers were kept, a few at a time. */
export async function keepCovers(urls: (string | undefined)[]) {
  const todo = urls.filter((u): u is string => !!u && !fs.existsSync(fileFor(u)));
  for (let i = 0; i < todo.length; i += 4) await Promise.all(todo.slice(i, i + 4).map(keepCover));
}

/** media://cover/?u=… — the kept copy (readable by the accent's canvas), or not found. */
export function serveCover(request: Request): Response {
  const url = new URL(request.url).searchParams.get('u') ?? '';
  const file = url && dir ? fileFor(url) : '';
  if (!file || !fs.existsSync(file)) return new Response('No copy of this cover', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=86400' } });
}
