/*
 * The local music library: folders of audio files on this PC, read for their
 * tags and artwork, kept in an index so a rescan only reads what changed.
 *
 * Files play through `media://local/<id>` (see media.ts). Chromium decodes
 * FLAC, WAV, MP3, AAC/M4A, Ogg Vorbis and Opus; ALAC and the rest are listed
 * as unsupported rather than failing at play time.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AlbumPage, AudioFormat, LibraryScanState, LocalAlbum, Track } from '../shared/types';
import { log } from './log';

const EXTENSIONS = new Set(['.flac', '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.webm']);
const UNSUPPORTED = new Set(['.alac', '.aiff', '.aif', '.ape', '.wv', '.dsf', '.dff', '.wma', '.mka', '.tta']);
const COVER_NAMES = ['cover', 'folder', 'front', 'album', 'artwork'];
const INDEX_VERSION = 2;

export const MIME: Record<string, string> = {
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.webm': 'audio/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  // Music videos attached to songs (see videos.ts).
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
};

export interface LocalEntry {
  id: string;
  path: string;
  mtimeMs: number;
  size: number;
  title: string;
  artists: string[];
  album?: string;
  albumArtist?: string;
  track?: number;
  disc?: number;
  year?: number;
  duration?: number;
  format: AudioFormat;
  /** Key of the artwork in the artwork map, if any. */
  art?: string;
}

interface IndexFile {
  version: number;
  entries: LocalEntry[];
  art: Record<string, string>;
}

let dataDir = '';
let artDir = '';
let entries = new Map<string, LocalEntry>();
/** Artwork key → image file (an extracted cover, or a cover.jpg beside the music). */
let artFiles: Record<string, string> = {};
let state: LibraryScanState = { scanning: false, scanned: 0, total: 0, unsupported: 0 };
let onProgress: (state: LibraryScanState) => void = () => undefined;

const hash = (text: string, n = 16) => crypto.createHash('sha1').update(text).digest('hex').slice(0, n);
export const localId = (file: string) => `loc_${hash(path.resolve(file).toLowerCase())}`;
const albumKey = (e: LocalEntry) => `lal_${hash(`${(e.albumArtist || e.artists[0] || '').toLowerCase()}|${(e.album || '').toLowerCase()}|${path.dirname(e.path).toLowerCase()}`, 14)}`;

export function openLibrary(dir: string, progress: (s: LibraryScanState) => void) {
  dataDir = dir;
  artDir = path.join(dir, 'artwork');
  onProgress = progress;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'local-index.json'), 'utf8')) as IndexFile;
    if (raw.version === INDEX_VERSION) {
      entries = new Map(raw.entries.map((e) => [e.id, e]));
      artFiles = raw.art ?? {};
    }
  } catch {
    /* no index yet */
  }
}

function saveIndex() {
  try {
    const file = path.join(dataDir, 'local-index.json');
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ version: INDEX_VERSION, entries: [...entries.values()], art: artFiles } satisfies IndexFile));
    fs.renameSync(`${file}.tmp`, file);
  } catch (error) {
    log.error(`couldn't save the music index: ${String(error)}`);
  }
}

export function getScanState(): LibraryScanState {
  return { ...state };
}

/** Every supported audio file under the folders. */
async function walk(folders: string[], unsupported: { count: number }): Promise<string[]> {
  const files: string[] = [];
  const visit = async (dir: string, depth: number) => {
    if (depth > 12) return;
    let items: fs.Dirent[];
    try {
      items = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (item.name.startsWith('.') || item.name.startsWith('$')) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await visit(full, depth + 1);
      else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (EXTENSIONS.has(ext)) files.push(full);
        else if (UNSUPPORTED.has(ext)) unsupported.count++;
      }
    }
  };
  for (const folder of folders) await visit(folder, 0);
  return files;
}

function folderCover(dir: string): string | undefined {
  try {
    const names = fs.readdirSync(dir);
    for (const want of COVER_NAMES) {
      const found = names.find((n) => {
        const ext = path.extname(n).toLowerCase();
        return path.basename(n, ext).toLowerCase() === want && ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
      });
      if (found) return path.join(dir, found);
    }
  } catch {
    /* unreadable folder */
  }
  return undefined;
}

const LOSSLESS_CODECS = /flac|pcm|wav|alac|lossless/i;

async function readFile(file: string, stat: fs.Stats): Promise<LocalEntry | null> {
  const { parseFile } = await import('music-metadata');
  const meta = await parseFile(file, { duration: true, skipCovers: false });
  const ext = path.extname(file).toLowerCase();
  const codec = meta.format.codec ?? ext.slice(1).toUpperCase();
  if (/alac/i.test(codec)) return null; // Chromium can't decode ALAC.
  const common = meta.common;
  const artists = (common.artists?.length ? common.artists : common.artist ? [common.artist] : []).flatMap((a) => a.split(/\s*;\s*/)).filter(Boolean);
  const entry: LocalEntry = {
    id: localId(file),
    path: file,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    title: common.title?.trim() || path.basename(file, ext).replace(/^\d+[\s.-]+/, ''),
    artists: artists.length ? artists : [],
    album: common.album || undefined,
    albumArtist: common.albumartist || undefined,
    track: common.track?.no ?? undefined,
    disc: common.disk?.no ?? undefined,
    year: common.year ?? undefined,
    duration: meta.format.duration ? Math.round(meta.format.duration) : undefined,
    format: {
      codec: codec.replace(/^MPEG 1 Layer 3$/i, 'MP3').replace(/^PCM$/i, 'WAV'),
      lossless: meta.format.lossless ?? LOSSLESS_CODECS.test(codec),
      ...(meta.format.bitsPerSample && { bitDepth: meta.format.bitsPerSample }),
      ...(meta.format.sampleRate && { sampleRate: meta.format.sampleRate }),
      ...(meta.format.bitrate && { bitrate: Math.round(meta.format.bitrate) }),
    },
  };
  const picture = common.picture?.[0];
  if (picture?.data?.length) {
    const key = hash(Buffer.from(picture.data).toString('base64'), 16);
    if (!artFiles[key]) {
      const ext2 = /png/i.test(picture.format) ? '.png' : '.jpg';
      const out = path.join(artDir, `${key}${ext2}`);
      fs.mkdirSync(artDir, { recursive: true });
      if (!fs.existsSync(out)) fs.writeFileSync(out, picture.data);
      artFiles[key] = out;
    }
    entry.art = key;
  } else {
    const cover = folderCover(path.dirname(file));
    if (cover) {
      const key = `f${hash(cover.toLowerCase(), 15)}`;
      artFiles[key] = cover;
      entry.art = key;
    }
  }
  return entry;
}

let scanning: Promise<void> | null = null;

/** Rescans the folders: new and changed files are read, removed ones dropped. */
export function scan(folders: string[]): Promise<void> {
  scanning ??= (async () => {
    const started = Date.now();
    const unsupported = { count: 0 };
    state = { scanning: true, scanned: 0, total: 0, unsupported: 0 };
    onProgress(getScanState());
    const files = await walk(folders, unsupported);
    state.total = files.length;
    state.unsupported = unsupported.count;
    onProgress(getScanState());
    const next = new Map<string, LocalEntry>();
    let read = 0;
    let index = 0;
    const worker = async () => {
      while (index < files.length) {
        const file = files[index++]!;
        try {
          const stat = await fs.promises.stat(file);
          const known = entries.get(localId(file));
          if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) {
            next.set(known.id, known);
          } else {
            const entry = await readFile(file, stat);
            read++;
            if (entry) next.set(entry.id, entry);
            else state.unsupported++;
          }
        } catch (error) {
          log.warn(`couldn't read ${file}: ${String(error)}`);
        }
        state.scanned++;
        if (state.scanned % 25 === 0) onProgress(getScanState());
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    entries = next;
    // Forget artwork no entry uses any more.
    const used = new Set([...entries.values()].map((e) => e.art).filter(Boolean));
    for (const key of Object.keys(artFiles)) if (!used.has(key)) delete artFiles[key];
    saveIndex();
    state = { scanning: false, scanned: files.length, total: files.length, unsupported: state.unsupported, lastScan: Date.now() };
    onProgress(getScanState());
    log.info(`music library: ${entries.size} tracks (${read} read) in ${Date.now() - started}ms`);
  })().finally(() => {
    scanning = null;
  });
  return scanning;
}

export function getEntry(id: string): LocalEntry | undefined {
  return entries.get(id);
}

export function getArtFile(key: string): string | undefined {
  return artFiles[key];
}

export function allEntries(): LocalEntry[] {
  return [...entries.values()];
}

export function toTrack(e: LocalEntry): Track {
  const artists = (e.artists.length ? e.artists : e.albumArtist ? [e.albumArtist] : ['Unknown Artist']).map((name) => ({ name }));
  return {
    videoId: e.id,
    title: e.title,
    artists,
    ...(e.album && { album: { name: e.album, id: albumKey(e) } }),
    ...(e.duration && { duration: e.duration }),
    ...(e.art && { thumbnail: `media://art/local/${e.art}` }),
    source: 'local',
    format: e.format,
  };
}

function sortTracks(list: LocalEntry[]): LocalEntry[] {
  return list.sort((a, b) => (a.disc ?? 1) - (b.disc ?? 1) || (a.track ?? 999) - (b.track ?? 999) || a.title.localeCompare(b.title));
}

export function localTracks(): Track[] {
  return allEntries()
    .sort((a, b) => (a.artists[0] ?? '').localeCompare(b.artists[0] ?? '') || (a.album ?? '').localeCompare(b.album ?? '') || (a.track ?? 0) - (b.track ?? 0))
    .map(toTrack);
}

export function localAlbums(): LocalAlbum[] {
  const groups = new Map<string, LocalEntry[]>();
  for (const e of entries.values()) {
    if (!e.album) continue;
    const key = albumKey(e);
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([id, list]) => {
      const first = list[0]!;
      const art = list.find((e) => e.art)?.art;
      return {
        id,
        title: first.album!,
        artist: first.albumArtist || first.artists[0] || 'Unknown Artist',
        year: list.find((e) => e.year)?.year,
        trackCount: list.length,
        lossless: list.every((e) => e.format.lossless),
        ...(art && { thumbnail: `media://art/local/${art}` }),
      };
    })
    .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
}

export function localAlbum(id: string): AlbumPage {
  const list = sortTracks([...entries.values()].filter((e) => e.album && albumKey(e) === id));
  if (!list.length) throw new Error('This album is no longer in your music folders.');
  const first = list[0]!;
  const art = list.find((e) => e.art)?.art;
  const formats = new Set(list.map((e) => describeFormat(e.format)));
  return {
    id,
    title: first.album!,
    artists: [{ name: first.albumArtist || first.artists[0] || 'Unknown Artist' }],
    subtitle: `Album${first.year ? ` • ${first.year}` : ''}`,
    year: first.year ? String(first.year) : undefined,
    description: `On this PC · ${[...formats].join(', ')}`,
    ...(art && { thumbnail: `media://art/local/${art}` }),
    tracks: list.map(toTrack),
    more: [],
  };
}

export function describeFormat(f: AudioFormat): string {
  const parts = [f.codec];
  if (f.lossless && f.bitDepth) parts.push(`${f.bitDepth}-bit`);
  if (f.sampleRate) parts.push(`${+(f.sampleRate / 1000).toFixed(1)} kHz`);
  if (!f.lossless && f.bitrate) parts.push(`${Math.round(f.bitrate / 1000)} kbps`);
  return parts.join(' ');
}

export function searchLocal(query: string, limit = 12): Track[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out: LocalEntry[] = [];
  for (const e of entries.values()) {
    const hay = `${e.title} ${e.artists.join(' ')} ${e.album ?? ''} ${e.albumArtist ?? ''}`.toLowerCase();
    if (terms.every((t) => hay.includes(t))) out.push(e);
    if (out.length >= limit) break;
  }
  return out.map(toTrack);
}
