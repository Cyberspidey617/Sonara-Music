/*
 * Your YouTube Music account, for one thing: YouTube Music's own Song/Video pairing (the switch its
 * app shows), which it gives only to a signed-in request. With it, a song's music video is the one
 * YouTube Music itself links to the song, with how the two line up (song time → video time), not a
 * search's guess. It also lets an age-restricted video play.
 *
 * You sign in on Google's own page in a Sonara window; Sonara never sees your password. What it
 * keeps is the session's cookies, encrypted by the system, in this folder only, and they go only to
 * YouTube. Signing out deletes them and the window's storage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, safeStorage, session } from 'electron';
import { Innertube } from 'youtubei.js';
import type { AccountStatus } from '../shared/types';
import { log } from './log';
import type { FoundVideo } from './youtube';

const PARTITION = 'persist:ytmusic-account';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
let file = '';
let cookie: string | null = null;
let name: string | undefined;
let signed: Promise<Innertube> | null = null;

export function openAccount(dataDir: string) {
  file = path.join(dataDir, 'youtube-account.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as { cookie: string; encrypted: boolean; name?: string };
    cookie = saved.encrypted ? safeStorage.decryptString(Buffer.from(saved.cookie, 'base64')) : saved.cookie;
    name = saved.name;
  } catch {
    cookie = null;
  }
}

export const accountStatus = (): AccountStatus => ({ signedIn: !!cookie, ...(name && { name }) });

function save() {
  if (!cookie) {
    fs.rmSync(file, { force: true });
    return;
  }
  const encrypted = safeStorage.isEncryptionAvailable();
  fs.writeFileSync(file, JSON.stringify({ cookie: encrypted ? safeStorage.encryptString(cookie).toString('base64') : cookie, encrypted, ...(name && { name }) }));
}

/** The signed-in session (only when you've signed in). */
function signedInnertube(): Promise<Innertube> | null {
  if (!cookie) return null;
  signed ??= Innertube.create({ cookie, fetch: (input, init) => globalThis.fetch(input, init), retrieve_player: true }).catch((error: unknown) => {
    signed = null;
    throw error;
  });
  return signed;
}
export const signedInSession = signedInnertube;

/** Opens Google's sign-in page; resolves when you're signed in to YouTube Music (or the window is closed). */
export function signIn(parent: BrowserWindow | null): Promise<AccountStatus> {
  return new Promise((resolve) => {
    const ses = session.fromPartition(PARTITION);
    ses.setUserAgent(CHROME_UA);
    const win = new BrowserWindow({
      width: 480,
      height: 680,
      title: 'Sign in to YouTube Music',
      autoHideMenuBar: true,
      ...(parent && { parent, modal: true }),
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    let done = false;
    const check = async () => {
      if (done) return;
      const url = win.webContents.getURL();
      if (!/^https:\/\/music\.youtube\.com\//.test(url)) return;
      const cookies = await ses.cookies.get({ domain: '.youtube.com' });
      if (!cookies.some((c) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID')) return;
      done = true;
      cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      signed = null;
      // The account's name, from the page's own data (best effort).
      name = await win.webContents
        .executeJavaScript(`(() => { try { return ytcfg.get('LOGGED_IN_USER_NAME') || document.querySelector('#account-name')?.textContent || ''; } catch { return ''; } })()`)
        .then((n: unknown) => String(n || '').trim() || undefined)
        .catch(() => undefined);
      save();
      log.info('signed in to YouTube Music');
      win.close();
    };
    win.webContents.on('did-navigate', () => void check());
    win.webContents.on('did-navigate-in-page', () => void check());
    win.webContents.on('did-finish-load', () => void check());
    win.on('closed', () => resolve(accountStatus()));
    void win.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=' + encodeURIComponent('https://music.youtube.com/'));
  });
}

export async function signOut(): Promise<AccountStatus> {
  cookie = null;
  name = undefined;
  signed = null;
  save();
  await session.fromPartition(PARTITION).clearStorageData().catch(() => undefined);
  log.info('signed out of YouTube Music');
  return accountStatus();
}

// ---- YouTube Music's Song/Video pairing --------------------------------------------------

type AnyNode = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function collect(o: unknown, key: string, out: AnyNode[] = []): AnyNode[] {
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o as AnyNode)) {
      if (k === key) out.push(v as AnyNode);
      else collect(v, key, out);
    }
  }
  return out;
}

const videoType = (r: AnyNode | undefined): string | undefined =>
  r?.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
const text = (t: AnyNode | undefined) => (t?.runs ?? []).map((r: AnyNode) => r.text).join('');
const seconds = (s: string) => s.split(':').reduce((a, p) => a * 60 + Number(p), 0) || undefined;

/**
 * The music video YouTube Music pairs with a song, read off a signed-in `next` response, with its
 * time map. The pair can come either way round (the song as the row, the video as its counterpart,
 * or the other way), in which case the map is turned round too. Null when it pairs nothing.
 */
export async function pairedVideo(songId: string, songDuration?: number): Promise<FoundVideo | null> {
  const ytPromise = signedInnertube();
  if (!ytPromise) return null;
  const yt = await ytPromise;
  const raw = (await yt.actions.execute('/next', { videoId: songId, client: 'YTMUSIC', isAudioOnly: true } as never)) as { data?: unknown };
  for (const wrapper of collect(raw.data, 'playlistPanelVideoWrapperRenderer')) {
    const primary = wrapper.primaryRenderer?.playlistPanelVideoRenderer as AnyNode | undefined;
    const counterparts = ((wrapper.counterpart ?? []) as AnyNode[]).filter((c) => c?.counterpartRenderer?.playlistPanelVideoRenderer);
    if (!primary) continue;
    let video: AnyNode | undefined;
    let pair: AnyNode | undefined;
    let inverted = false;
    if (primary.videoId === songId) {
      pair = counterparts.find((c) => videoType(c.counterpartRenderer.playlistPanelVideoRenderer) !== 'MUSIC_VIDEO_TYPE_ATV');
      video = pair?.counterpartRenderer.playlistPanelVideoRenderer;
    } else {
      pair = counterparts.find((c) => c.counterpartRenderer.playlistPanelVideoRenderer.videoId === songId);
      if (pair && videoType(primary) !== 'MUSIC_VIDEO_TYPE_ATV') {
        video = primary;
        inverted = true;
      }
    }
    if (!video?.videoId || !pair) continue;
    const segments = ((pair.segmentMap?.segment ?? []) as AnyNode[])
      .map((seg) => {
        const a = Number(seg.primaryVideoStartTimeMilliseconds) / 1000;
        const b = Number(seg.counterpartVideoStartTimeMilliseconds) / 1000;
        const length = Number(seg.durationMilliseconds) / 1000;
        return Number.isFinite(a) && Number.isFinite(b) && length > 0 ? { from: inverted ? b : a, to: inverted ? a : b, length } : null;
      })
      .filter((x): x is { from: number; to: number; length: number } => !!x);
    const duration = seconds(text(video.lengthText));
    const byline = text(video.longBylineText ?? video.shortBylineText);
    return {
      videoId: String(video.videoId),
      // Lined up by YouTube Music's own map, it plays in time with the song whatever its length.
      synced: segments.length > 0 || !!(duration && songDuration && Math.abs(duration - songDuration) <= 3),
      title: text(video.title),
      channel: byline.split(' • ')[0] ?? '',
      kind: 'official',
      ...(segments.length && { timeMap: segments }),
    };
  }
  return null;
}
