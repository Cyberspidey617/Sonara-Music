/*
 * Your YouTube Music account, for one thing: YouTube Music's own Song/Video pairing (the switch its
 * app shows), which it gives only to a signed-in request. With it, a song's music video is the one
 * YouTube Music itself links to the song, with how the two line up (song time → video time), not a
 * search's guess. It also lets an age-restricted video play.
 *
 * Two ways in, and Sonara never sees your password in either:
 *  - In a window: Google's own sign-in page (presented as Firefox, since Google turns away windows it
 *    takes for an embedded browser). Sonara keeps the session's cookies.
 *  - With a code: Sonara shows a code, you enter it at google.com/device in your own browser and
 *    allow it (the way a TV signs in). Sonara keeps the sign-in's tokens.
 * Either is kept encrypted by the system, in this folder only, and goes only to YouTube. Signing
 * out deletes it (and revokes a code sign-in).
 */
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, safeStorage, session } from 'electron';
import { Innertube } from 'youtubei.js';
import type { AccountStatus } from '../shared/types';
import { log } from './log';
import type { FoundVideo } from './youtube';

/** A code sign-in's tokens, as the library keeps them. */
type Tokens = NonNullable<Parameters<Innertube['session']['signIn']>[0]>;

const PARTITION = 'persist:ytmusic-account';
/** Google refuses its sign-in to windows it takes for an embedded browser; as Firefox it allows it. */
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
let file = '';
let cookie: string | null = null;
let tokens: Tokens | null = null;
let name: string | undefined;
let signed: Promise<Innertube> | null = null;

const seal = (text: string) => (safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(text).toString('base64')}` : text);
const unseal = (text: string) => (text.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(text.slice(4), 'base64')) : text);

export function openAccount(dataDir: string) {
  file = path.join(dataDir, 'youtube-account.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as { cookie?: string; tokens?: string; encrypted?: boolean; name?: string };
    // (An earlier format kept the cookie with a separate "encrypted" flag.)
    if (saved.cookie) cookie = saved.encrypted ? safeStorage.decryptString(Buffer.from(saved.cookie, 'base64')) : unseal(saved.cookie);
    if (saved.tokens) tokens = JSON.parse(unseal(saved.tokens)) as Tokens;
    name = saved.name;
  } catch {
    cookie = null;
    tokens = null;
  }
}

export const accountStatus = (): AccountStatus => ({ signedIn: !!(cookie || tokens), ...(name && { name }) });

function save() {
  if (!cookie && !tokens) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.writeFileSync(file, JSON.stringify({ ...(cookie && { cookie: seal(cookie) }), ...(tokens && { tokens: seal(JSON.stringify(tokens)) }), ...(name && { name }) }));
}

const options = () => ({ fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init), retrieve_player: true });

/** The signed-in session (only when you've signed in). */
function signedInnertube(): Promise<Innertube> | null {
  if (!cookie && !tokens) return null;
  signed ??= (async () => {
    if (cookie) return Innertube.create({ ...options(), cookie });
    const yt = await Innertube.create(options());
    // Refreshed tokens are kept, so the sign-in lasts.
    yt.session.on('update-credentials', ({ credentials }) => {
      if (credentials) {
        tokens = credentials;
        save();
      }
    });
    await yt.session.signIn(tokens!);
    return yt;
  })().catch((error: unknown) => {
    signed = null;
    log.warn(`YouTube Music session failed: ${String(error)}`);
    throw error;
  });
  return signed;
}
export const signedInSession = signedInnertube;

/** Opens Google's sign-in page; resolves when you're signed in to YouTube Music (or the window is closed). */
export function signIn(parent: BrowserWindow | null): Promise<AccountStatus> {
  return new Promise((resolve) => {
    const ses = session.fromPartition(PARTITION);
    ses.setUserAgent(FIREFOX_UA);
    const win = new BrowserWindow({
      width: 480,
      height: 680,
      title: 'Sign in to YouTube Music',
      autoHideMenuBar: true,
      ...(parent && { parent, modal: true }),
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    win.webContents.setUserAgent(FIREFOX_UA);
    let done = false;
    const check = async () => {
      if (done) return;
      const url = win.webContents.getURL();
      if (!/^https:\/\/music\.youtube\.com\//.test(url)) return;
      const cookies = await ses.cookies.get({ domain: '.youtube.com' });
      if (!cookies.some((c) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID')) return;
      done = true;
      cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      tokens = null;
      signed = null;
      // The account's name, from the page's own data (best effort).
      name = await win.webContents
        .executeJavaScript(`(() => { try { return ytcfg.get('LOGGED_IN_USER_NAME') || document.querySelector('#account-name')?.textContent || ''; } catch { return ''; } })()`)
        .then((n: unknown) => String(n || '').trim() || undefined)
        .catch(() => undefined);
      save();
      log.info('signed in to YouTube Music (window)');
      win.close();
    };
    win.webContents.on('did-navigate', () => void check());
    win.webContents.on('did-navigate-in-page', () => void check());
    win.webContents.on('did-finish-load', () => void check());
    win.on('closed', () => resolve(accountStatus()));
    void win.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=' + encodeURIComponent('https://music.youtube.com/'), { userAgent: FIREFOX_UA });
  });
}

let codeSignIn: Innertube | null = null;
/**
 * Signs in with a code, as a TV does: [onCode] gets the code and the address to enter it at (in your
 * own browser); resolves once you've allowed it there, or when the code runs out.
 */
export async function signInWithCode(onCode: (code: { code: string; url: string; expiresIn: number }) => void): Promise<AccountStatus> {
  const yt = await Innertube.create(options());
  codeSignIn = yt;
  return new Promise((resolve) => {
    const finish = () => {
      if (codeSignIn === yt) codeSignIn = null;
      resolve(accountStatus());
    };
    yt.session.on('auth-pending', (data) => onCode({ code: data.user_code, url: data.verification_url, expiresIn: data.expires_in }));
    yt.session.on('auth', ({ credentials }) => {
      // A code you cancelled doesn't sign you in, even if allowed later.
      if (credentials && codeSignIn === yt) {
        tokens = credentials;
        cookie = null;
        name = undefined;
        signed = Promise.resolve(yt);
        save();
        log.info('signed in to YouTube Music (code)');
      }
      finish();
    });
    yt.session.on('auth-error', (error) => {
      log.warn(`code sign-in failed: ${String(error)}`);
      finish();
    });
    yt.session.on('update-credentials', ({ credentials }) => {
      if (credentials) {
        tokens = credentials;
        save();
      }
    });
    yt.session.signIn().catch((error: unknown) => {
      log.warn(`code sign-in failed: ${String(error)}`);
      finish();
    });
  });
}

/** Stops waiting for a code sign-in you didn't finish. */
export function cancelCodeSignIn() {
  codeSignIn?.session.emit('auth-error', new Error('cancelled') as never);
  codeSignIn = null;
}

export async function signOut(): Promise<AccountStatus> {
  const wasCode = !!tokens;
  const yt = signed ? await signed.catch(() => null) : null;
  cookie = null;
  tokens = null;
  name = undefined;
  signed = null;
  save();
  // A code sign-in is withdrawn from your account too.
  if (wasCode && yt) await yt.session.signOut().catch(() => undefined);
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
      ...(segments.length && { timeMap: segments }),
    };
  }
  return null;
}
