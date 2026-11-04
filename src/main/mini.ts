// The mini player: a small window that stays on top of other apps, so the song can be changed
// without bringing Sonara back. It only shows and controls; playback stays in the main window.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import type { MiniLayout, PlaybackState } from '../shared/types';
import { log } from './log';

/** Window sizes for each layout: the bar, the bar with Up Next below it, and the minimised pebble. */
const SIZES: Record<MiniLayout, { width: number; height: number }> = {
  bar: { width: 420, height: 84 },
  queue: { width: 420, height: 360 },
  pebble: { width: 160, height: 84 },
};
const MARGIN = 20;

/**
 * Glass that blurs what's really behind it is drawn by the system: acrylic on Windows 11 (22H2,
 * build 22621, and later), vibrancy on macOS. Elsewhere the window is see-through and the page
 * draws a translucent pebble itself.
 */
export type MiniGlass = 'acrylic' | 'vibrancy' | 'none';
const glass: MiniGlass =
  process.platform === 'darwin' ? 'vibrancy' : process.platform === 'win32' && Number(os.release().split('.')[2] ?? 0) >= 22621 ? 'acrylic' : 'none';

let mini: BrowserWindow | null = null;
let latest: PlaybackState = { playing: false };
let layout: MiniLayout = 'bar';
/** Shown because the main window went away (not by hand), so it goes when the window returns. */
let autoShown = false;
let keepOnTop: ReturnType<typeof setInterval> | null = null;

const positionFile = () => path.join(app.getPath('userData'), 'mini-player.json');

/** Where its bottom-right corner was left, if that's still on a screen; otherwise above the taskbar. */
function anchor(): { right: number; bottom: number } {
  try {
    const saved = JSON.parse(fs.readFileSync(positionFile(), 'utf8')) as { right: number; bottom: number };
    const area = screen.getDisplayNearestPoint({ x: saved.right - 10, y: saved.bottom - 10 }).workArea;
    if (saved.right > area.x + 40 && saved.right <= area.x + area.width && saved.bottom > area.y + 40 && saved.bottom <= area.y + area.height) return saved;
  } catch {
    /* first time, or the file is gone */
  }
  const area = screen.getPrimaryDisplay().workArea;
  return { right: area.x + area.width - MARGIN, bottom: area.y + area.height - MARGIN };
}

/** The window's bounds for a layout, keeping its bottom-right corner where it is (so it grows up and left). */
function boundsFor(next: MiniLayout, corner = anchor()) {
  const { width, height } = SIZES[next];
  const area = screen.getDisplayNearestPoint({ x: corner.right - 10, y: corner.bottom - 10 }).workArea;
  return {
    x: Math.max(area.x, corner.right - width),
    y: Math.max(area.y, corner.bottom - height),
    width,
    height,
  };
}

/** Other always-on-top windows (a screenshot tool's overlay, say) can take its place: take it back. */
function stayOnTop() {
  if (!mini || mini.isDestroyed() || !mini.isVisible()) return;
  mini.setAlwaysOnTop(true, 'screen-saver');
  mini.moveTop();
}

function create(options: { preload: string; url: string; icon: Electron.NativeImage }) {
  mini = new BrowserWindow({
    ...boundsFor(layout),
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'Sonara mini player',
    icon: options.icon,
    ...(glass === 'acrylic' && { backgroundMaterial: 'acrylic', backgroundColor: '#00000000', hasShadow: true }),
    ...(glass === 'vibrancy' && { vibrancy: 'hud', visualEffectState: 'active', transparent: true, hasShadow: true }),
    ...(glass === 'none' && { transparent: true, hasShadow: false }),
    webPreferences: { preload: options.preload, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  // The highest level, above ordinary windows and other "on top" ones, full-screen ones on macOS too.
  mini.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') mini.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mini.on('blur', () => setTimeout(stayOnTop, 150));
  mini.on('always-on-top-changed', (_event, onTop) => !onTop && stayOnTop());
  mini.on('moved', () => {
    if (!mini) return;
    const b = mini.getBounds();
    try {
      fs.writeFileSync(positionFile(), JSON.stringify({ right: b.x + b.width, bottom: b.y + b.height }));
    } catch (error) {
      log.warn(`mini player position not saved: ${String(error)}`);
    }
  });
  mini.on('show', () => {
    if (!keepOnTop) keepOnTop = setInterval(stayOnTop, 2500);
  });
  mini.on('hide', () => {
    if (keepOnTop) clearInterval(keepOnTop);
    keepOnTop = null;
  });
  mini.on('closed', () => {
    if (keepOnTop) clearInterval(keepOnTop);
    keepOnTop = null;
    mini = null;
  });
  mini.webContents.on('did-finish-load', () => mini?.webContents.send('mini:state', latest, layout));
  mini.webContents.on('will-navigate', (event) => event.preventDefault());
  mini.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void mini.loadURL(`${options.url}&glass=${glass}`);
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
      stayOnTop();
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
    /** The bar, the bar with Up Next, or the minimised pebble: the window resizes around its corner. */
    setLayout(next: MiniLayout) {
      if (!SIZES[next]) return;
      layout = next;
      if (!mini) return;
      const b = mini.getBounds();
      mini.setBounds(boundsFor(next, { right: b.x + b.width, bottom: b.y + b.height }), process.platform === 'darwin');
      mini.webContents.send('mini:state', latest, layout);
    },
    setState(state: PlaybackState) {
      latest = state;
      mini?.webContents.send('mini:state', state, layout);
    },
    hasSong: () => !!latest.title,
    /** With the main window gone, it goes too (so the app can quit). */
    destroy() {
      mini?.destroy();
      mini = null;
    },
  };
}
