// Music videos attached to songs: a video file on this PC, picked by you for a song, shown in the
// full-screen player in time with the song. Only files you've attached are ever served.
import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, type BrowserWindow } from 'electron';
import { log } from './log';
import { serveFile } from './media';

type Attached = Record<string, { path: string; attachedAt: number }>;

const file = () => path.join(app.getPath('userData'), 'music-videos.json');
let attached: Attached | null = null;

function load(): Attached {
  if (attached) return attached;
  try {
    attached = JSON.parse(fs.readFileSync(file(), 'utf8')) as Attached;
  } catch {
    attached = {};
  }
  return attached;
}

function save() {
  try {
    fs.writeFileSync(file(), JSON.stringify(attached ?? {}, null, 1));
  } catch (error) {
    log.warn(`music videos not saved: ${String(error)}`);
  }
}

/** The address the player loads a song's video from, or null when it has none (or the file is gone). */
export function musicVideoUrl(key: string): string | null {
  const entry = load()[key];
  if (!entry) return null;
  try {
    const stat = fs.statSync(entry.path);
    return `media://video/${encodeURIComponent(key)}?v=${Math.round(stat.mtimeMs)}`;
  } catch {
    return null;
  }
}

/** Asks for a video file and attaches it to the song. */
export async function attachMusicVideo(win: BrowserWindow | null, key: string, title: string): Promise<string | null> {
  const options = {
    title: `Choose a music video for “${title}”`,
    properties: ['openFile' as const],
    filters: [{ name: 'Videos', extensions: ['mp4', 'm4v', 'webm', 'mkv', 'mov'] }],
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  const picked = result.filePaths[0];
  if (result.canceled || !picked) return null;
  load()[key] = { path: picked, attachedAt: Date.now() };
  save();
  return musicVideoUrl(key);
}

export function removeMusicVideo(key: string) {
  if (!load()[key]) return;
  delete load()[key];
  save();
}

/** media://video/<song> serves that song's attached video, with ranges so it can seek. */
export function serveMusicVideo(request: Request): Promise<Response> | Response {
  const key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''));
  const entry = load()[key];
  if (!entry) return new Response('No video attached to this song.', { status: 404 });
  return serveFile(entry.path, request.headers.get('range'));
}
