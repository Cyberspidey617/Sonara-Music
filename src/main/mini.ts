// The mini player: a small window that stays on top of other apps, so the song can be changed
// without bringing Sonara back. It only shows and controls; playback stays in the main window.
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import { MINI_SIZES as SIZES, type MiniGrow, type MiniLayout, type PlaybackState } from '../shared/types';
import { log } from './log';

const MARGIN = 20;
/**
 * Where clicks can pass through its see-through part (Windows, macOS), the window keeps the Up Next
 * size and only the pill inside it changes: a resized window shows a stale frame first, which jumps.
 * Elsewhere (Linux) it resizes, as an always-on-top window there would block clicks around the bar.
 */
const fixed = process.platform !== 'linux';
const FULL = SIZES.queue;

let mini: BrowserWindow | null = null;
let latest: PlaybackState = { playing: false };
let layout: MiniLayout = 'bar';
/** While Up Next is open (resizing): where the bar was, so it goes back there; and which way the list opens. */
let bar: Electron.Rectangle | null = null;
let grow: MiniGrow = 'up';
/** Shown because the main window went away (not by hand), so it goes when the window returns. */
let autoShown = false;
let keepOnTop: ReturnType<typeof setInterval> | null = null;
/** While it's being dragged: following the cursor from where the drag began. */
let dragging: ReturnType<typeof setInterval> | null = null;

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

/** The bar's own rectangle on screen (in a fixed window, the pill sits at its top or bottom). */
function barRect(): Electron.Rectangle {
  const b = mini!.getBounds();
  if (!fixed) return layout === 'queue' && bar ? bar : b;
  return { x: b.x, y: grow === 'up' ? b.y + b.height - SIZES.bar.height : b.y, width: b.width, height: SIZES.bar.height };
}

/** A fixed window holding the bar at `r`: Up Next opens above it, or below it with no room above. */
function fixedBounds(r: { x: number; y: number; width: number; height: number }) {
  const area = screen.getDisplayMatching(r).workArea;
  const next: MiniGrow = r.y + r.height - FULL.height >= area.y ? 'up' : 'down';
  return { grow: next, bounds: { x: r.x + r.width - FULL.width, y: next === 'up' ? r.y + r.height - FULL.height : r.y, ...FULL } };
}

function initialBounds() {
  const at = boundsFor('bar');
  if (!fixed) return at;
  const placed = fixedBounds(at);
  grow = placed.grow;
  return placed.bounds;
}

/**
 * Keeps it "on top" if something took that away, without pushing in front of other on-top windows:
 * the taskbar's menus and a screenshot tool's overlay belong above it while they're open.
 */
function stayOnTop() {
  if (!mini || mini.isDestroyed() || !mini.isVisible() || mini.isAlwaysOnTop()) return;
  mini.setAlwaysOnTop(true, 'floating');
}

function savePosition() {
  if (!mini) return;
  const b = barRect();
  try {
    fs.writeFileSync(positionFile(), JSON.stringify({ right: b.x + b.width, bottom: b.y + b.height }));
  } catch (error) {
    log.warn(`mini player position not saved: ${String(error)}`);
  }
}

function create(options: { preload: string; url: string; icon: Electron.NativeImage }) {
  mini = new BrowserWindow({
    ...initialBounds(),
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'Sonara mini player',
    icon: options.icon,
    webPreferences: { preload: options.preload, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  // Above ordinary windows, full-screen ones on macOS too, but below menus and system overlays.
  mini.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') mini.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Clicks on the see-through part go to whatever is behind; the page says when the pointer is on the pill.
  if (fixed) mini.setIgnoreMouseEvents(true, { forward: true });
  mini.on('always-on-top-changed', (_event, onTop) => !onTop && stayOnTop());
  mini.on('moved', savePosition);
  mini.on('show', () => {
    if (!keepOnTop) keepOnTop = setInterval(stayOnTop, 2500);
  });
  mini.on('hide', () => {
    if (keepOnTop) clearInterval(keepOnTop);
    keepOnTop = null;
  });
  mini.on('closed', () => {
    if (keepOnTop) clearInterval(keepOnTop);
    if (dragging) clearInterval(dragging);
    keepOnTop = dragging = null;
    mini = null;
  });
  mini.webContents.on('did-finish-load', () => mini?.webContents.send('mini:state', latest, layout, grow));
  mini.webContents.on('will-navigate', (event) => event.preventDefault());
  mini.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void mini.loadURL(`${options.url}${fixed ? '&fixed' : ''}`);
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
    /**
     * The bar, or the bar with Up Next. The bar stays where it is: the list opens above it, or below
     * when there isn't room above (near the top of the screen), and closing puts the bar back.
     */
    setLayout(next: MiniLayout, wanted?: MiniGrow) {
      if (!SIZES[next] || next === layout) return;
      layout = next;
      if (!mini) return;
      if (fixed) return void mini.webContents.send('mini:state', latest, layout, grow);
      const animate = process.platform === 'darwin';
      if (next === 'queue') {
        const b = mini.getBounds();
        const { width, height } = SIZES.queue;
        const area = screen.getDisplayMatching(b).workArea;
        bar = b;
        const fitsUp = b.y + b.height - height >= area.y;
        grow = wanted === 'up' || wanted === 'down' ? wanted : fitsUp ? 'up' : 'down';
        const y = grow === 'up' ? b.y + b.height - height : Math.max(area.y, Math.min(b.y, area.y + area.height - height));
        mini.setBounds({ x: b.x + b.width - width, y, width, height }, animate);
      } else {
        mini.setBounds(bar ?? boundsFor(next), animate);
        bar = null;
      }
      mini.webContents.send('mini:state', latest, layout, grow);
    },
    /**
     * Dragged from the page (so a double-click can reach it), it follows the real cursor: the page's
     * own screen coordinates lag while its window moves. The size is set with each move, since
     * moving alone can grow a see-through window on scaled Windows displays.
     */
    moveStart() {
      if (!mini || dragging) return;
      const from = screen.getCursorScreenPoint();
      const start = mini.getBounds();
      const startBar = bar;
      dragging = setInterval(() => {
        const at = screen.getCursorScreenPoint();
        if (!mini || mini.isDestroyed()) return this.moveEnd();
        const x = start.x + at.x - from.x;
        const y = start.y + at.y - from.y;
        // Moved with Up Next open, the bar comes back where it was carried to.
        if (startBar) bar = { ...startBar, x: startBar.x + at.x - from.x, y: startBar.y + at.y - from.y };
        const now = mini.getBounds();
        if (now.x !== x || now.y !== y) mini.setBounds({ x, y, ...(fixed ? FULL : SIZES[layout]) });
      }, 8);
    },
    moveEnd() {
      if (!dragging) return;
      clearInterval(dragging);
      dragging = null;
      // Dropped near the top (or back down), Up Next's side changes: the window moves so the bar stays.
      if (fixed && mini && layout === 'bar') {
        const placed = fixedBounds(barRect());
        if (placed.grow !== grow) {
          grow = placed.grow;
          mini.setBounds(placed.bounds);
          mini.webContents.send('mini:state', latest, layout, grow);
        }
      }
      savePosition();
    },
    /** In a fixed window: whether the pointer is on the pill (it takes clicks) or not (they pass through). */
    setInteractive(on: boolean) {
      if (fixed && mini && !mini.isDestroyed()) mini.setIgnoreMouseEvents(!on, { forward: true });
    },
    setState(state: PlaybackState) {
      latest = state;
      mini?.webContents.send('mini:state', state, layout, grow);
    },
    hasSong: () => !!latest.title,
    /** With the main window gone, it goes too (so the app can quit). */
    destroy() {
      mini?.destroy();
      mini = null;
    },
  };
}
