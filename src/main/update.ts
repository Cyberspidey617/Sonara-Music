// Updates. A few seconds after launch (and every few hours) Sonara looks for a newer release.
// Where it can update itself (Windows when installed with the setup, Linux AppImage), the update is
// downloaded inside the app (checked against the release's SHA-512) and installed on restart.
// Elsewhere (macOS, which only lets signed apps replace themselves; the portable zip; .deb) it
// says so and links the release page, as before.
import fs from 'node:fs';
import path from 'node:path';
import { app, Notification, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../shared/types';
import { log } from './log';

const LATEST = 'https://api.github.com/repos/Cyberspidey617/Sonara-Music/releases/latest';
const RELEASES = 'https://github.com/Cyberspidey617/Sonara-Music/releases/latest';
/** How often a running Sonara looks again. */
const EVERY = 6 * 60 * 60_000;

/** Whether this copy can replace itself: the Windows setup's install, or an AppImage. */
function canInstall(): boolean {
  if (process.env['SONARA_UPDATE_TEST']) return true; // a local test against dev-app-update.yml
  if (!app.isPackaged) return false;
  if (process.platform === 'win32') return fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Sonara.exe'));
  if (process.platform === 'linux') return !!process.env['APPIMAGE'];
  return false;
}

let state: UpdateState = { phase: 'idle', current: app.getVersion(), canInstall: false, url: RELEASES };
let tell: (s: UpdateState) => void = () => undefined;
const set = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch };
  tell(state);
};
export const updateState = () => state;

/** "v2.1.0" or "2.1.0" as numbers; pre-release tags ("2.2.0-beta") are skipped. */
function parseVersion(tag: string): number[] | null {
  const m = tag.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function newer(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/** The release page check, for copies that can't install updates themselves. */
async function checkReleasePage(): Promise<void> {
  const response = await fetch(LATEST, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Sonara/${app.getVersion()}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub didn’t answer (${response.status}). Try again later.`);
  const release = (await response.json()) as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean };
  const latest = parseVersion(release.tag_name ?? '');
  const mine = parseVersion(app.getVersion());
  const available = !!latest && !!mine && !release.draft && !release.prerelease && newer(latest, mine);
  set({ phase: available ? 'available' : 'none', latest: latest ? latest.join('.') : state.current, canInstall: false, url: release.html_url ?? RELEASES });
}

export async function checkForUpdate(): Promise<UpdateState> {
  if (state.phase === 'downloading' || state.phase === 'ready') return state;
  set({ phase: 'checking', error: undefined });
  try {
    if (canInstall()) {
      const result = await autoUpdater.checkForUpdates();
      // electron-updater answers through its events; this is only the no-answer case.
      if (!result?.isUpdateAvailable && state.phase === 'checking') set({ phase: 'none', latest: result?.updateInfo.version ?? state.current, canInstall: true });
    } else await checkReleasePage();
  } catch (error) {
    // A release without the update files (made before in-app updates): still say there's a new one.
    log.warn(`update check failed: ${String(error)}`);
    try {
      await checkReleasePage();
    } catch (again) {
      set({ phase: 'error', error: again instanceof Error ? again.message : String(again) });
    }
  }
  return state;
}

export async function downloadUpdate(): Promise<void> {
  if (!state.canInstall || state.phase !== 'available') {
    if (state.phase === 'available') void shell.openExternal(state.url);
    return;
  }
  set({ phase: 'downloading', percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    set({ phase: 'error', error: `The download failed: ${error instanceof Error ? error.message : String(error)}` });
  }
}

/** Quits, installs the downloaded update quietly, and opens the new version. */
export function installUpdate() {
  if (state.phase !== 'ready') return;
  autoUpdater.quitAndInstall(true, true);
}

/** The version already announced, so each release is announced once, not on every launch. */
const noticeFile = () => path.join(app.getPath('userData'), 'update-notice.json');
function announced(): string | null {
  try {
    return (JSON.parse(fs.readFileSync(noticeFile(), 'utf8')) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

/** Starts the checks (a little after launch, then every few hours) while `enabled()` says so. */
export function watchForUpdates(options: { enabled: () => boolean; tell: (s: UpdateState) => void; icon?: Electron.NativeImage }) {
  tell = options.tell;
  state = { ...state, canInstall: canInstall() };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true; // downloaded but not restarted: it installs when you quit
  autoUpdater.logger = { info: (m) => log.info(`updater: ${String(m)}`), warn: (m) => log.warn(`updater: ${String(m)}`), error: (m) => log.error(`updater: ${String(m)}`), debug: () => undefined };
  if (process.env['SONARA_UPDATE_TEST']) autoUpdater.forceDevUpdateConfig = true;
  autoUpdater.on('update-available', (info) => set({ phase: 'available', latest: info.version, canInstall: true }));
  autoUpdater.on('update-not-available', (info) => set({ phase: 'none', latest: info.version, canInstall: true }));
  autoUpdater.on('download-progress', (p) => set({ phase: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => set({ phase: 'ready', latest: info.version, percent: 100 }));

  const look = async () => {
    if (!options.enabled()) return;
    const s = await checkForUpdate();
    if (s.phase !== 'available' || !s.latest || announced() === s.latest) return;
    fs.writeFileSync(noticeFile(), JSON.stringify({ version: s.latest }));
    if (Notification.isSupported()) {
      const note = new Notification({
        title: `Sonara ${s.latest} is available`,
        body: s.canInstall ? `You have ${s.current}. Open Sonara to download it and restart.` : `You have ${s.current}. Click to see what's new and download it.`,
        ...(options.icon && { icon: options.icon }),
      });
      note.on('click', () => (s.canInstall ? undefined : void shell.openExternal(s.url)));
      note.show();
    }
  };
  setTimeout(() => void look(), 6_000);
  setInterval(() => void look(), EVERY);
}
