// Help when something goes wrong: a problem report (what you'd paste into an issue), clearing the
// caches, and putting the settings back to how they were at install.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, session } from 'electron';
import { DEFAULT_SETTINGS } from '../shared/types';
import { backupNow } from './backup';
import { flush, getLibrary, patchLibrary } from './store';
import { log } from './log';

export const ISSUES_URL = 'https://github.com/Cyberspidey617/Sonara-Music/issues/new';

/**
 * A problem report: the versions and system, then the end of the log. Paths with your user name are
 * shortened to ~, and nothing is sent anywhere: you see it, and copy it or open an issue yourself.
 */
export function problemReport(): string {
  const home = os.homedir();
  let tail = '';
  try {
    const file = path.join(app.getPath('userData'), 'logs', 'obsidian.log');
    tail = fs.readFileSync(file, 'utf8').split('\n').slice(-80).join('\n');
  } catch {
    tail = '(no log yet)';
  }
  const lines = [
    `Sonara ${app.getVersion()} (Electron ${process.versions.electron}, Chromium ${process.versions.chrome})`,
    `${os.type()} ${os.release()} ${process.arch}${process.platform === 'linux' ? ` · ${process.env['XDG_CURRENT_DESKTOP'] ?? 'unknown desktop'} · ${process.env['XDG_SESSION_TYPE'] ?? ''}` : ''}`,
    `Memory ${Math.round(os.totalmem() / 2 ** 30)} GB · ${os.cpus().length} cores`,
    '',
    'Last lines of the log:',
    tail,
  ];
  return lines.join('\n').split(home).join('~');
}

/** Empties the caches (web cache, YouTube's player scripts); your music and settings stay. */
export async function clearCaches(): Promise<void> {
  await session.defaultSession.clearCache();
  try {
    fs.rmSync(path.join(app.getPath('userData'), 'yt-cache'), { recursive: true, force: true });
  } catch (error) {
    log.warn(`yt-cache not cleared: ${String(error)}`);
  }
  log.info('caches cleared');
}

/**
 * Settings back to how they were at install (after a backup), keeping what's yours: your music
 * taste, folders, server, downloads folder and the guide/What's New you've seen. Then a restart.
 */
export function resetSettings() {
  backupNow('before reset');
  const now = getLibrary().settings;
  patchLibrary({
    settings: {
      ...DEFAULT_SETTINGS,
      taste: now.taste,
      tasteSeen: now.tasteSeen,
      guideSeen: now.guideSeen,
      lastSeenVersion: now.lastSeenVersion,
      musicFolders: now.musicFolders,
      downloadFolder: now.downloadFolder,
      volume: now.volume,
    },
  });
  flush();
  log.info('settings reset');
  app.relaunch();
  app.exit(0);
}
