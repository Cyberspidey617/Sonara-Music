import { cancelDownload, downloadedFile, downloadInfo, downloadsFolder, listDownloads, openDownloads, queueDownloads, removeDownload } from './downloads';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, screen, session, shell, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isYouTubeId, type LibraryData, type LibraryScanState, type PlaybackState, type ServerLogin, type Track, type DownloadQuality } from '../shared/types';
import { getScanState, localAlbum, localAlbums, localTracks, openLibrary, scan, searchLocal } from './library';
import { clearMatches } from './lossless';
import { handleMediaRequest, serveFile } from './media';
import { checkServer, connect, disconnect, openServer, searchServer, serverAlbum, serverAlbums } from './subsonic';
import { configureLog, log } from './log';
import { flush, getLibrary, openStore, patchLibrary } from './store';
import { handleStreamRequest, resolveStream, streamInfo } from './stream';
import { losslessInfo } from './lossless';
import {
  configureYouTube,
  getAlbum,
  getArtist,
  getHome,
  getInnertube,
  getLyrics,
  getPlaylist,
  getTrack,
  getUpNext,
  findOnYouTube,
  importPlaylist,
  search,
  suggest,
} from './youtube';

const APP_ORIGIN = 'app://obsidian';
const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL'];

// Both schemes must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true } },
  { scheme: 'ytstream', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
]);

app.setAppUserModelId('com.obsidian.music.pc');
// A plain Chrome user agent: some lyric providers refuse "Electron".
app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/[\d.]+/, '').replace(/\s?obsidian-music-pc\/[\d.]+/i, '');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let playback: PlaybackState = { playing: false };

const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../resources');
const icon = (name: string) => nativeImage.createFromPath(path.join(resources, name));

// ---- Window state ------------------------------------------------------------------

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

function windowStateFile() {
  return path.join(app.getPath('userData'), 'window.json');
}

function loadWindowState(): WindowState {
  try {
    const state = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8')) as WindowState;
    // Ignore a position that's no longer on any display.
    if (state.x !== undefined && state.y !== undefined) {
      const visible = screen.getAllDisplays().some(({ workArea: a }) => state.x! >= a.x - 50 && state.y! >= a.y - 50 && state.x! < a.x + a.width && state.y! < a.y + a.height);
      if (!visible) delete state.x, delete state.y;
    }
    return state;
  } catch {
    return { width: 1320, height: 860 };
  }
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getNormalBounds();
  try {
    fs.writeFileSync(windowStateFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }));
  } catch {
    /* best-effort */
  }
}

// ---- Taskbar and tray ---------------------------------------------------------------

function send(command: 'play-pause' | 'next' | 'previous') {
  win?.webContents.send('app:command', command);
}

function updateThumbar() {
  if (!win || process.platform !== 'win32') return;
  win.setThumbarButtons([
    { tooltip: 'Previous', icon: icon('thumbar/previous.png'), click: () => send('previous') },
    playback.playing
      ? { tooltip: 'Pause', icon: icon('thumbar/pause.png'), click: () => send('play-pause') }
      : { tooltip: 'Play', icon: icon('thumbar/play.png'), click: () => send('play-pause') },
    { tooltip: 'Next', icon: icon('thumbar/next.png'), click: () => send('next') },
  ]);
}

function updateTray() {
  if (!tray) return;
  const label = playback.title ? `${playback.title}${playback.artist ? ` — ${playback.artist}` : ''}` : 'Obsidian Music';
  tray.setToolTip(label.length > 120 ? `${label.slice(0, 117)}…` : label);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label, enabled: false },
      { type: 'separator' },
      { label: playback.playing ? 'Pause' : 'Play', click: () => send('play-pause') },
      { label: 'Next', click: () => send('next') },
      { label: 'Previous', click: () => send('previous') },
      { type: 'separator' },
      { label: 'Show Obsidian', click: showWindow },
      { label: 'Quit', click: () => ((quitting = true), app.quit()) },
    ]),
  );
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ---- The window ----------------------------------------------------------------------

const TITLEBAR = { page: '#00000000', immersive: '#00000000' };

function createWindow() {
  const state = loadWindowState();
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && { x: state.x, y: state.y }),
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Obsidian Music',
    backgroundColor: '#0e0e10',
    icon: icon(process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin' && { titleBarOverlay: { color: TITLEBAR.page, symbolColor: '#ffffffd9', height: 40 } }),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  if (state.maximized) win.maximize();

  win.once('ready-to-show', () => {
    win?.show();
    updateThumbar();
  });
  win.on('enter-full-screen', () => win?.webContents.send('app:fullscreen', true));
  win.on('leave-full-screen', () => win?.webContents.send('app:fullscreen', false));
  win.on('close', (event) => {
    saveWindowState();
    if (!quitting && getLibrary().settings.closeToTray && tray) {
      event.preventDefault();
      win?.hide();
    }
  });
  win.on('closed', () => (win = null));

  // Links leave for the browser; the window never navigates away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN) && !(isDev && url.startsWith(process.env['ELECTRON_RENDERER_URL']!))) event.preventDefault();
  });

  if (isDev) void win.loadURL(process.env['ELECTRON_RENDERER_URL']!);
  else void win.loadURL(`${APP_ORIGIN}/index.html`);
}

// ---- Protocols -------------------------------------------------------------------------

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: media:",
  "media-src 'self' ytstream: media: blob:",
  "connect-src 'self' https: ytstream: media:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
].join('; ');

function registerProtocols() {
  const root = path.join(__dirname, '../renderer');
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const target = path.normalize(path.join(root, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
    if (!target.startsWith(root)) return new Response('forbidden', { status: 403 });
    const response = await net.fetch(pathToFileURL(target).toString());
    if (!target.endsWith('.html')) return response;
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', CSP);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    return new Response(response.body, { status: response.status, headers });
  });
  // A downloaded song plays from its file (offline, and exactly the quality you saved).
  protocol.handle('ytstream', (request) => {
    const id = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, '')).split('/')[0] ?? '';
    const saved = downloadedFile(id);
    return saved ? serveFile(saved.path!, request.headers.get('range')) : handleStreamRequest(request, () => getLibrary().settings.quality);
  });
  protocol.handle('media', (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'server') {
      const saved = downloadedFile(`srv_${decodeURIComponent(url.pathname.replace(/^\/+/, ''))}`);
      if (saved) return serveFile(saved.path!, request.headers.get('range'));
    }
    return handleMediaRequest(request);
  });
}

/*
 * A safety net for cross-origin reads the renderer makes directly: the lyric
 * providers am-lyrics asks, and YouTube's image hosts (the artwork colours are
 * read from a canvas). Most already send CORS headers; this fills in for those
 * that don't, so lyrics and backdrops don't depend on them.
 */
const CORS_HOSTS = [
  '*://lrc.red/*',
  '*://*.lrc.red/*',
  '*://*.binimum.org/*',
  '*://lrclib.net/*',
  '*://unison.boidu.dev/*',
  '*://*.vercel.app/*',
  '*://*.workers.dev/*',
  '*://api.spicylyrics.org/*',
  '*://translate.googleapis.com/*',
  '*://i.ytimg.com/*',
  '*://*.googleusercontent.com/*',
  '*://*.ggpht.com/*',
];

function installCorsSafetyNet() {
  session.defaultSession.webRequest.onHeadersReceived({ urls: CORS_HOSTS }, (details, callback) => {
    const headers = { ...(details.responseHeaders ?? {}) };
    const has = (name: string) => Object.keys(headers).some((k) => k.toLowerCase() === name);
    if (!has('access-control-allow-origin')) headers['Access-Control-Allow-Origin'] = ['*'];
    if (details.method === 'OPTIONS') {
      if (!has('access-control-allow-headers')) headers['Access-Control-Allow-Headers'] = ['*'];
      if (!has('access-control-allow-methods')) headers['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
      callback({ responseHeaders: headers, statusLine: 'HTTP/1.1 204 No Content' });
      return;
    }
    callback({ responseHeaders: headers });
  });
}

// ---- IPC ------------------------------------------------------------------------------

/** Network failures, in words a listener can act on. */
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|network/i.test(`${message} ${cause}`)) {
    return 'Can’t reach YouTube Music. Check your internet connection and try again.';
  }
  return message;
}

/** Errors cross IPC as plain messages the UI can show. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...(args as A));
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      log.error(`${channel} failed: ${raw}`);
      throw new Error(friendlyError(error));
    }
  });
}

function registerIpc() {
  handle('yt:home', () => getHome());
  handle('yt:search', (query: string) => search(String(query).slice(0, 200)));
  handle('yt:suggest', (query: string) => suggest(String(query).slice(0, 200)));
  handle('yt:album', (id: string) => getAlbum(String(id)));
  handle('yt:artist', (id: string) => getArtist(String(id)));
  handle('yt:playlist', (id: string) => getPlaylist(String(id)));
  handle('yt:upnext', (videoId: string, playlistId?: string) => getUpNext(String(videoId), playlistId ? String(playlistId) : undefined));
  handle('yt:lyrics', (videoId: string) => getLyrics(String(videoId)));
  handle('yt:track', (videoId: string) => getTrack(String(videoId)));
  handle('yt:import', (input: string) => importPlaylist(String(input)));
  handle('stream:prefetch', async (videoId: string) => {
    await resolveStream(String(videoId), getLibrary().settings.quality).catch(() => undefined);
  });
  handle('stream:info', (videoId: string) => {
    const id = String(videoId);
    if (!isYouTubeId(id)) return null;
    return downloadInfo(id) ?? losslessInfo(id) ?? streamInfo(id);
  });
  handle('library:load', () => getLibrary());

  // Downloads
  handle('downloads:add', (tracks: Track[], quality: DownloadQuality) => {
    const q: DownloadQuality = ['best', 'compatible', 'small', 'lossless'].includes(quality) ? quality : 'best';
    queueDownloads((Array.isArray(tracks) ? tracks : []).slice(0, 2000), q);
  });
  handle('downloads:cancel', (videoId: string) => cancelDownload(String(videoId)));
  handle('downloads:remove', (videoId: string, deleteFile: boolean) => removeDownload(String(videoId), !!deleteFile));
  handle('downloads:list', () => listDownloads());
  handle('downloads:folder', () => downloadsFolder());
  handle('downloads:choose-folder', async () => {
    if (!win) return downloadsFolder();
    const result = await dialog.showOpenDialog(win, { title: 'Save downloads in', defaultPath: downloadsFolder(), properties: ['openDirectory', 'createDirectory'] });
    if (!result.canceled && result.filePaths[0]) patchLibrary({ settings: { ...getLibrary().settings, downloadFolder: result.filePaths[0] } });
    return downloadsFolder();
  });
  handle('downloads:open-folder', async () => {
    const dir = downloadsFolder();
    await fs.promises.mkdir(dir, { recursive: true });
    await shell.openPath(dir);
  });
  handle('downloads:show', (videoId: string) => {
    const saved = downloadedFile(String(videoId));
    if (saved?.path) shell.showItemInFolder(saved.path);
  });
  handle('library:save', (patch: Partial<LibraryData>) => {
    patchLibrary(patch);
    if (patch.settings && 'closeToTray' in patch.settings) ensureTray();
  });
  handle('app:open-external', async (url: string) => {
    if (/^https:\/\//.test(url)) await shell.openExternal(url);
  });
  handle('app:toggle-fullscreen', () => {
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  });
  handle('app:data-path', () => app.getPath('userData'));

  // Your music: folders on this PC and a self-hosted server.
  const folders = () => getLibrary().settings.musicFolders ?? [];
  const setFolders = (list: string[]) => {
    patchLibrary({ settings: { ...getLibrary().settings, musicFolders: list } });
    clearMatches();
    void scan(list).then(clearMatches);
    return list;
  };
  handle('music:library', () => ({ folders: folders(), tracks: localTracks(), albums: localAlbums(), scan: getScanState() }));
  handle('music:add-folder', async () => {
    if (!win) return folders();
    const result = await dialog.showOpenDialog(win, { title: 'Add a music folder', properties: ['openDirectory', 'multiSelections'] });
    if (result.canceled || !result.filePaths.length) return folders();
    const merged = [...new Set([...folders(), ...result.filePaths])];
    return setFolders(merged);
  });
  handle('music:remove-folder', (folder: string) => setFolders(folders().filter((f) => f !== folder)));
  handle('music:rescan', async () => {
    await scan(folders());
    clearMatches();
  });
  handle('music:local-album', (id: string) => localAlbum(String(id)));
  handle('music:server-status', () => checkServer());
  handle('music:server-connect', async (login: ServerLogin) => {
    const status = await connect({ url: String(login?.url ?? ''), username: String(login?.username ?? ''), password: String(login?.password ?? '') });
    clearMatches();
    return status;
  });
  handle('music:server-disconnect', () => {
    disconnect();
    clearMatches();
  });
  handle('music:server-albums', () => serverAlbums());
  handle('music:server-album', (id: string) => serverAlbum(String(id)));
  handle('music:search', async (query: string): Promise<Track[]> => {
    const q = String(query).slice(0, 200);
    const local = searchLocal(q, 12);
    const remote = await searchServer(q, 12).catch(() => []);
    return [...local, ...remote];
  });
  handle('yt:find', (title: string, artist: string) => findOnYouTube(String(title), String(artist ?? '')));

  ipcMain.on('app:playback-state', (_event, state: PlaybackState) => {
    playback = { playing: !!state?.playing, title: state?.title, artist: state?.artist };
    if (win) win.setTitle(playback.title ? `${playback.title} — ${playback.artist ?? ''} · Obsidian Music` : 'Obsidian Music');
    updateThumbar();
    updateTray();
  });
  ipcMain.on('app:titlebar-theme', (_event, theme: 'page' | 'immersive') => {
    if (!win || process.platform === 'darwin') return;
    try {
      win.setTitleBarOverlay({ color: TITLEBAR[theme] ?? TITLEBAR.page, symbolColor: '#ffffffd9' });
    } catch {
      /* older platforms */
    }
  });
}

function ensureTray() {
  if (tray || process.platform === 'darwin') return;
  tray = new Tray(icon(process.platform === 'win32' ? 'icon.ico' : 'icon.png'));
  tray.on('click', showWindow);
  updateTray();
}

// ---- Lifecycle --------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    const dataDir = app.getPath('userData');
    configureLog(path.join(dataDir, 'logs'));
    log.info(`Obsidian Music ${app.getVersion()} on ${process.platform}-${process.arch}, Electron ${process.versions.electron}`);
    openStore(dataDir);
    openLibrary(dataDir, (state: LibraryScanState) => win?.webContents.send('music:scan-progress', state));
    openServer(dataDir);
    openDownloads(dataDir, () => getLibrary().settings.downloadFolder ?? '', (items) => win?.webContents.send('downloads:changed', items));
    const country = (() => {
      try {
        return app.getLocaleCountryCode() || undefined;
      } catch {
        return undefined;
      }
    })();
    configureYouTube({ cacheDir: path.join(dataDir, 'yt-cache'), location: country, language: 'en' });
    Menu.setApplicationMenu(null);
    registerProtocols();
    installCorsSafetyNet();
    registerIpc();
    createWindow();
    ensureTray();
    // Warm the YouTube session while the window paints.
    void getInnertube().catch(() => undefined);
    // Pick up music added to the folders since last time.
    const musicFolders = getLibrary().settings.musicFolders ?? [];
    if (musicFolders.length) setTimeout(() => void scan(musicFolders).then(clearMatches), 4000);
  });

  app.on('before-quit', () => {
    quitting = true;
    saveWindowState();
    flush();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (!win) createWindow();
  });
}
