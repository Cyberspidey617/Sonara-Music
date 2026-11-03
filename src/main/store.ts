// The local library (liked songs, playlists, history, settings) as one JSON
// file in the app's data folder, written atomically and debounced.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, migrateSettings, type LibraryData } from '../shared/types';
import { log } from './log';

let file = '';
let data: LibraryData = { liked: [], playlists: [], history: [], settings: { ...DEFAULT_SETTINGS } };
let timer: NodeJS.Timeout | null = null;

export function openStore(dir: string): LibraryData {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'library.json');
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<LibraryData>;
      data = {
        liked: Array.isArray(parsed.liked) ? parsed.liked : [],
        playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
        settings: { ...DEFAULT_SETTINGS, ...migrateSettings((parsed.settings ?? {}) as Record<string, unknown>) },
      };
    }
  } catch (error) {
    log.error(`library.json unreadable, keeping a copy and starting fresh: ${String(error)}`);
    try {
      fs.copyFileSync(file, `${file}.broken-${Date.now()}`);
    } catch {
      /* nothing to keep */
    }
  }
  return data;
}

export function getLibrary(): LibraryData {
  return data;
}

export function patchLibrary(patch: Partial<LibraryData>) {
  data = { ...data, ...patch, settings: { ...data.settings, ...(patch.settings ?? {}) } };
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

export function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!file) return;
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch (error) {
    log.error(`couldn't save the library: ${String(error)}`);
  }
}
