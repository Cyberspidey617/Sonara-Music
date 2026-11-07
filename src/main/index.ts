import { cancelDownload, downloadedFile, downloadInfo, downloadsFolder, listDownloads, openDownloads, queueDownloads, removeDownload } from './downloads';
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, protocol, screen, session, shell, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isYouTubeId, type AppCommand, type MiniGrow, type MiniLayout, type LibraryData, type LibraryScanState, type PlaybackState, type ServerLogin, type Track, type DownloadQuality } from '../shared/types';
import { initMiniPlayer } from './mini';
import { importSpotify, isSpotifyLink } from './spotify';
import { checkForUpdate, downloadUpdate, installUpdate, updateState, watchForUpdates } from './update';
import { attachMusicVideo, musicVideoUrl, removeMusicVideo, serveMusicVideo } from './videos';
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
// Renamed to Sonara: keep reading the library from the folder the app has always used.
app.setPath('userData', path.join(app.getPath('appData'), 'Obsidian Music'));
// A plain Chrome user agent: some lyric providers refuse "Electron".
app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/[\d.]+/, '').replace(/\s?obsidian-music-pc\/[\d.]+/i, '');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let playback: PlaybackState = { playing: false };
let miniPlayer: ReturnType<typeof initMiniPlayer> | null = null;

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

function send(command: AppCommand) {
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
  const label = playback.title ? `${playback.title}${playback.artist ? ` — ${playback.artist}` : ''}` : 'Sonara';
  tray.setToolTip(label.length > 120 ? `${label.slice(0, 117)}…` : label);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label, enabled: false },
      { type: 'separator' },
      { label: playback.playing ? 'Pause' : 'Play', click: () => send('play-pause') },
      { label: 'Next', click: () => send('next') },
      { label: 'Previous', click: () => send('previous') },
      { type: 'separator' },
      { label: 'Mini player', type: 'checkbox', checked: miniPlayer?.isVisible() ?? false, click: () => (miniPlayer?.toggle(), updateTray()) },
      { label: 'Show Sonara', click: showWindow },
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


function createWindow() {
  const state = loadWindowState();
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && { x: state.x, y: state.y }),
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Sonara',
    backgroundColor: '#0e0e10',
    icon: icon(process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    // No system caption buttons: the app draws its own, in the theme (shell/WindowControls).
    titleBarStyle: 'hidden',
    // macOS keeps its own traffic lights (Windows and Linux get the app's buttons instead).
    ...(process.platform === 'darwin' && { trafficLightPosition: { x: 20, y: 18 } }),
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
  win.on('maximize', () => win?.webContents.send('app:maximized', true));
  win.on('unmaximize', () => win?.webContents.send('app:maximized', false));
  win.on('close', (event) => {
    saveWindowState();
    if (!quitting && getLibrary().settings.closeToTray && tray) {
      event.preventDefault();
      win?.hide();
    }
  });
  // Away from the window while a song is loaded, the mini player floats up so it can still be
  // controlled, and goes again when the window is back. "Away" is minimised or in the tray, or (by
  // default) any time another app is in use: after a moment, so passing clicks don't flash it.
  const miniWhen = () => getLibrary().settings.miniPlayerWhen ?? 'away';
  let awayTimer: ReturnType<typeof setTimeout> | null = null;
  const floatMini = () => {
    if (miniWhen() !== 'off' && miniPlayer?.hasSong()) miniPlayer.show(true);
    updateTray();
  };
  // The taskbar button's icon, named outright: Sonara.exe's own icon when installed (Windows can hold
  // on to a stale icon for the app ID otherwise), and for development copies, which run as
  // electron.exe, Sonara's icon file under their own app ID so they don't group with an installed one.
  if (process.platform === 'win32') {
    win.setAppDetails(
      app.isPackaged
        ? { appId: 'com.obsidian.music.pc', appIconPath: process.execPath, appIconIndex: 0 }
        : { appId: 'com.obsidian.music.pc.dev', appIconPath: path.join(resources, 'icon.ico'), appIconIndex: 0 },
    );
  }
  win.on('minimize', floatMini);
  win.on('hide', floatMini);
  win.on('blur', () => {
    if (miniWhen() !== 'away') return;
    if (awayTimer) clearTimeout(awayTimer);
    awayTimer = setTimeout(() => {
      awayTimer = null;
      if (win && !win.isDestroyed() && !win.isFocused()) floatMini();
    }, 700);
  });
  for (const back of ['restore', 'show', 'focus'] as const)
    win.on(back as 'show', () => {
      if (awayTimer) clearTimeout(awayTimer);
      awayTimer = null;
      miniPlayer?.hide(true);
      updateTray();
    });
  win.on('closed', () => {
    win = null;
    miniPlayer?.destroy();
  });

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
    if (url.hostname === 'video') return serveMusicVideo(request);
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
  handleFrom<A, R>(channel, (_sender, ...args) => fn(...args));
}

/** As `handle`, for work that also reports back to the window that asked (progress). */
function handleFrom<A extends unknown[], R>(channel: string, fn: (sender: Electron.WebContents, ...args: A) => Promise<R> | R) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event.sender, ...(args as A));
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
  handleFrom('yt:import', (sender, input: string) =>
    isSpotifyLink(String(input))
      ? importSpotify(String(input), (done, total) => !sender.isDestroyed() && sender.send('import:progress', done, total))
      : importPlaylist(String(input)),
  );
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
    if (patch.settings && 'globalShortcuts' in patch.settings) registerShortcuts();
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
    playback = { playing: !!state?.playing, title: state?.title, artist: state?.artist, thumbnail: state?.thumbnail, position: state?.position, duration: state?.duration, accent: state?.accent, upNext: Array.isArray(state?.upNext) ? state.upNext.slice(0, 20) : undefined };
    miniPlayer?.setState(playback);
    if (win) win.setTitle(playback.title ? `${playback.title} — ${playback.artist ?? ''} · Sonara` : 'Sonara');
    updateThumbar();
    updateTray();
  });
  // The app's own window buttons. Closing goes through 'close', so close-to-tray still applies.
  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:toggle-maximize', () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on('window:close', () => win?.close());
  handle('window:is-maximized', () => win?.isMaximized() ?? false);
  // The mini player: its buttons act on the main window's player.
  const commands: AppCommand[] = ['play-pause', 'next', 'previous', 'volume-up', 'volume-down', 'like'];
  ipcMain.on('mini:command', (_event, command: AppCommand) => commands.includes(command) && send(command));
  ipcMain.on('mini:toggle', () => (miniPlayer?.toggle(), updateTray()));
  ipcMain.on('mini:hide', () => (miniPlayer?.hide(), updateTray()));
  ipcMain.on('mini:open-app', showWindow);
  ipcMain.on('mini:layout', (_event, layout: MiniLayout, grow?: MiniGrow) => miniPlayer?.setLayout(layout, grow));
  ipcMain.on('mini:jump', (_event, index: number) => Number.isInteger(index) && index >= 0 && win?.webContents.send('app:jump', index));
  ipcMain.on('mini:seek', (_event, seconds: number) => Number.isFinite(seconds) && seconds >= 0 && win?.webContents.send('app:seek', seconds));
  ipcMain.on('mini:move-start', () => miniPlayer?.moveStart());
  handle('app:check-update', () => checkForUpdate());
  handle('app:update-state', () => updateState());
  handle('app:update-download', () => downloadUpdate());
  ipcMain.on('app:update-install', () => installUpdate());
  handle('video:get', (key: string) => musicVideoUrl(String(key)));
  handle('video:attach', (key: string, title: string) => attachMusicVideo(win, String(key), String(title ?? '')));
  handle('video:remove', (key: string) => removeMusicVideo(String(key)));
  ipcMain.on('mini:interactive', (_event, on: boolean) => miniPlayer?.setInteractive(on === true));
  ipcMain.on('mini:move-end', () => miniPlayer?.moveEnd());
}

/**
 * System-wide shortcuts: they work while other apps are in front. A combination another app
 * already holds is skipped (and logged); the rest still register.
 */
function registerShortcuts() {
  globalShortcut.unregisterAll();
  if (getLibrary().settings.globalShortcuts === false) return;
  const keys: [string, () => void][] = [
    ['CommandOrControl+Alt+Space', () => send('play-pause')],
    // Ctrl+Alt+Space is often held by another app (input switchers, launchers): P always works too.
    ['CommandOrControl+Alt+P', () => send('play-pause')],
    ['CommandOrControl+Alt+Right', () => send('next')],
    ['CommandOrControl+Alt+Left', () => send('previous')],
    ['CommandOrControl+Alt+Up', () => send('volume-up')],
    ['CommandOrControl+Alt+Down', () => send('volume-down')],
    ['CommandOrControl+Alt+L', () => send('like')],
    ['CommandOrControl+Alt+M', () => (miniPlayer?.toggle(), updateTray())],
  ];
  for (const [accelerator, run] of keys) {
    try {
      if (!globalShortcut.register(accelerator, run)) log.warn(`shortcut ${accelerator} is taken by another app`);
    } catch (error) {
      log.warn(`shortcut ${accelerator} not registered: ${String(error)}`);
    }
  }
}

function ensureTray() {
  if (tray || process.platform === 'darwin') return;
  // The .ico carries its small sizes; on Linux the 512 px PNG is scaled to the panel.
  tray = new Tray(process.platform === 'win32' ? icon('icon.ico') : icon('icon.png').resize({ width: 22, quality: 'best' }));
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
    log.info(`Sonara ${app.getVersion()} on ${process.platform}-${process.arch}, Electron ${process.versions.electron}`);
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
    watchForUpdates({
      enabled: () => getLibrary().settings.updateNotices !== false,
      tell: (state) => win?.webContents.send('app:update-state', state),
      // Downloaded while minimised or away: back to the front, where the update window asks to restart.
      ready: () => {
        showWindow();
        win?.flashFrame(true);
      },
      icon: icon(process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    });
    miniPlayer = initMiniPlayer({
      preload: path.join(__dirname, '../preload/index.js'),
      url: isDev ? `${process.env['ELECTRON_RENDERER_URL']!}?mini` : `${APP_ORIGIN}/index.html?mini`,
      icon: icon(process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    });
    ensureTray();
    registerShortcuts();
    app.on('will-quit', () => globalShortcut.unregisterAll());
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
