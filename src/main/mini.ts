// The mini player: a small window that stays on top of other apps, so the song can be changed
// without bringing Sonara back. It only shows and controls; playback stays in the main window.
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import type { PlaybackState } from '../shared/types';
import { log } from './log';

const WIDTH = 340;
const HEIGHT = 84;
const MARGIN = 20;

let mini: BrowserWindow | null = null;
let latest: PlaybackState = { playing: false };
/** Shown because the main window went away (not by hand), so it goes when the window returns. */
let autoShown = false;

const positionFile = () => path.join(app.getPath('userData'), 'mini-player.json');

/** Where it was left, if that's still on a screen; otherwise above the taskbar, bottom right. */
function position(): { x: number; y: number } {
  try {
    const saved = JSON.parse(fs.readFileSync(positionFile(), 'utf8')) as { x: number; y: number };
    const area = screen.getDisplayMatching({ x: saved.x, y: saved.y, width: WIDTH, height: HEIGHT }).workArea;
    if (saved.x >= area.x && saved.y >= area.y && saved.x + WIDTH <= area.x + area.width && saved.y + HEIGHT <= area.y + area.height) return saved;
  } catch {
    /* first time, or the file is gone */
  }
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - WIDTH - MARGIN, y: area.y + area.height - HEIGHT - MARGIN };
}

function create(options: { preload: string; url: string; icon: Electron.NativeImage }) {
  const at = position();
  mini = new BrowserWindow({
    ...at,
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    title: 'Sonara mini player',
    icon: options.icon,
    webPreferences: { preload: options.preload, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  // Above ordinary windows, including full-screen ones on macOS.
  mini.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') mini.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mini.on('moved', () => {
    if (!mini) return;
    const [x, y] = mini.getPosition();
    try {
      fs.writeFileSync(positionFile(), JSON.stringify({ x, y }));
    } catch (error) {
      log.warn(`mini player position not saved: ${String(error)}`);
    }
  });
  mini.on('closed', () => (mini = null));
  mini.webContents.on('did-finish-load', () => mini?.webContents.send('mini:state', latest));
  mini.webContents.on('will-navigate', (event) => event.preventDefault());
  mini.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void mini.loadURL(options.url);
}

export function initMiniPlayer(options: { preload: string; url: string; icon: Electron.NativeImage }) {
  const ensure = () => {
    if (!mini) create(options);
    return mini!;
  };
  return {
    show(auto = false) {
      const window = ensure();
      autoShown = auto && (autoShown || !window.isVisible());
      if (!auto) autoShown = false;
      window.showInactive();
    },
    /** Hides it only if it came up by itself, unless asked outright. */
    hide(onlyIfAuto = false) {
      if (!mini || (onlyIfAuto && !autoShown)) return;
      autoShown = false;
      mini.hide();
    },
    toggle() {
      if (mini?.isVisible()) this.hide();
      else this.show();
    },
    isVisible: () => !!mini?.isVisible(),
    setState(state: PlaybackState) {
      latest = state;
      mini?.webContents.send('mini:state', state);
    },
    hasSong: () => !!latest.title,
    /** With the main window gone, it goes too (so the app can quit). */
    destroy() {
      mini?.destroy();
      mini = null;
    },
  };
}
