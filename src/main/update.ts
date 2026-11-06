// Update notices: asks GitHub for Sonara's latest release and says when it's newer than this one.
// It only tells you and links the release page; nothing is downloaded or installed by itself.
import fs from 'node:fs';
import path from 'node:path';
import { app, Notification, shell } from 'electron';
import type { UpdateInfo } from '../shared/types';
import { log } from './log';

const LATEST = 'https://api.github.com/repos/Cyberspidey617/Sonara-Music/releases/latest';
/** How often a running Sonara looks again. */
const EVERY = 6 * 60 * 60_000;

/** "v2.1.0" or "2.1.0" as numbers; pre-release tags ("2.2.0-beta") are skipped. */
function parseVersion(tag: string): number[] | null {
  const m = tag.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function newer(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/** The latest release, and whether it's newer than this copy. */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion();
  const response = await fetch(LATEST, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Sonara/${current}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub didn’t answer (${response.status}). Try again later.`);
  const release = (await response.json()) as { tag_name?: string; html_url?: string; name?: string; draft?: boolean; prerelease?: boolean };
  const latest = parseVersion(release.tag_name ?? '');
  const mine = parseVersion(current);
  const available = !!latest && !!mine && !release.draft && !release.prerelease && newer(latest, mine);
  return {
    current,
    latest: latest ? latest.join('.') : current,
    available,
    url: release.html_url ?? 'https://github.com/Cyberspidey617/Sonara-Music/releases/latest',
  };
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

/**
 * Looks now (a little after start) and every few hours while `enabled()` says so. A newer release is
 * announced once: to the window (an in-app notice) and as a system notification.
 */
export function watchForUpdates(options: { enabled: () => boolean; tell: (info: UpdateInfo) => void; icon?: Electron.NativeImage }) {
  const look = async () => {
    if (!options.enabled()) return;
    try {
      const info = await checkForUpdate();
      if (!info.available || announced() === info.latest) return;
      fs.writeFileSync(noticeFile(), JSON.stringify({ version: info.latest }));
      options.tell(info);
      if (Notification.isSupported()) {
        const note = new Notification({ title: `Sonara ${info.latest} is available`, body: `You have ${info.current}. Click to see what's new and download it.`, ...(options.icon && { icon: options.icon }) });
        note.on('click', () => void shell.openExternal(info.url));
        note.show();
      }
    } catch (error) {
      log.warn(`update check failed: ${String(error)}`);
    }
  };
  setTimeout(() => void look(), 8_000);
  setInterval(() => void look(), EVERY);
}
