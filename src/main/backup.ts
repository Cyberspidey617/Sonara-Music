// Backups: one file holding everything that's yours (liked songs, playlists, history, settings and
// your listening log), written by hand from Settings or by itself once a week, and restorable.
import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, type BrowserWindow } from 'electron';
import type { BackupInfo, LibraryData } from '../shared/types';
import { exportPlays, flushPlays, importPlays } from './plays';
import { flush, getLibrary, patchLibrary } from './store';
import { log } from './log';

interface BackupFile {
  app: 'Sonara';
  format: 1;
  version: string;
  createdAt: number;
  library: LibraryData;
  /** The listening log, by month ('YYYY-MM'). */
  plays: Record<string, unknown[]>;
}

const KEEP = 8;
const WEEK = 7 * 86_400_000;
const folder = () => path.join(app.getPath('userData'), 'backups');

function snapshot(): BackupFile {
  flush();
  flushPlays();
  return { app: 'Sonara', format: 1, version: app.getVersion(), createdAt: Date.now(), library: getLibrary(), plays: exportPlays() };
}

function write(file: string, backup: BackupFile) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(backup));
  fs.renameSync(tmp, file);
}

/** The automatic backups, newest first. */
export function listBackups(): BackupInfo {
  let files: { name: string; at: number; bytes: number }[] = [];
  try {
    files = fs
      .readdirSync(folder())
      .filter((n) => /^sonara-backup-.*\.json$/.test(n))
      .map((name) => {
        const stat = fs.statSync(path.join(folder(), name));
        return { name, at: stat.mtimeMs, bytes: stat.size };
      })
      .sort((a, b) => b.at - a.at);
  } catch {
    // None yet.
  }
  return { folder: folder(), latest: files[0]?.at ?? null, count: files.length };
}

/** Writes an automatic backup (keeping the last few). */
export function backupNow(reason: string): string | null {
  try {
    fs.mkdirSync(folder(), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(folder(), `sonara-backup-${stamp}.json`);
    write(file, snapshot());
    const old = fs
      .readdirSync(folder())
      .filter((n) => /^sonara-backup-.*\.json$/.test(n))
      .sort()
      .reverse()
      .slice(KEEP);
    for (const name of old) fs.rmSync(path.join(folder(), name), { force: true });
    log.info(`backup written (${reason}): ${file}`);
    return file;
  } catch (error) {
    log.warn(`backup failed (${reason}): ${String(error)}`);
    return null;
  }
}

/** Once a week, a little after start. */
export function scheduleBackups() {
  setTimeout(() => {
    const { latest } = listBackups();
    if (!latest || Date.now() - latest > WEEK) backupNow('weekly');
  }, 60_000);
}

/** Saves a backup where you choose. */
export async function exportBackup(win: BrowserWindow | null): Promise<string | null> {
  const name = `Sonara backup ${new Date().toISOString().slice(0, 10)}.json`;
  const options = { title: 'Back up Sonara', defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'Sonara backup', extensions: ['json'] }] };
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  write(result.filePath, snapshot());
  return result.filePath;
}

function parse(text: string): BackupFile {
  const data = JSON.parse(text) as Partial<BackupFile>;
  if (data?.app !== 'Sonara' || data.format !== 1 || !data.library || typeof data.library !== 'object') throw new Error('This isn’t a Sonara backup.');
  const lib = data.library as Partial<LibraryData>;
  if (!Array.isArray(lib.liked) || !Array.isArray(lib.playlists) || !Array.isArray(lib.history) || typeof lib.settings !== 'object')
    throw new Error('This backup is incomplete.');
  return { ...(data as BackupFile), plays: data.plays && typeof data.plays === 'object' ? data.plays : {} };
}

/**
 * Restores a backup you pick, replacing what's here (which is backed up first), then restarts
 * Sonara so everything reads the restored data.
 */
export async function importBackup(win: BrowserWindow | null): Promise<{ restored: boolean; error?: string }> {
  const options = { title: 'Restore a Sonara backup', properties: ['openFile' as const], filters: [{ name: 'Sonara backup', extensions: ['json'] }], defaultPath: folder() };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  const picked = result.filePaths[0];
  if (result.canceled || !picked) return { restored: false };
  let backup: BackupFile;
  try {
    backup = parse(fs.readFileSync(picked, 'utf8'));
  } catch (error) {
    return { restored: false, error: error instanceof Error ? error.message : String(error) };
  }
  const confirm = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Restore and restart', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: 'Restore backup',
    message: `Restore the backup from ${new Date(backup.createdAt).toLocaleString()}?`,
    detail: `It replaces your liked songs, playlists, history, settings and listening log here (${backup.library.liked.length} liked songs, ${backup.library.playlists.length} playlists). What's here now is backed up first, so you can go back.`,
  });
  if (confirm.response !== 0) return { restored: false };
  backupNow('before restore');
  patchLibrary({ liked: backup.library.liked, playlists: backup.library.playlists, history: backup.library.history, settings: backup.library.settings });
  flush();
  importPlays(backup.plays);
  log.info(`restored backup ${picked}`);
  app.relaunch();
  app.exit(0);
  return { restored: true };
}
