import { transition } from '@/lib/motion';
import { create } from 'zustand';

export type Route =
  | { name: 'home' }
  | { name: 'search'; q: string }
  | { name: 'album'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'playlist'; id: string }
  | { name: 'liked' }
  | { name: 'recent' }
  | { name: 'local'; id: string }
  | { name: 'music'; tab?: 'songs' | 'albums' | 'server' }
  | { name: 'musicAlbum'; source: 'local' | 'server'; id: string }
  | { name: 'downloads' }
  | { name: 'settings'; tab?: SettingsTab };

export type SettingsTab = 'playback' | 'equalizer' | 'music' | 'appearance' | 'lyrics' | 'player' | 'layout' | 'about';

/** Where an album id leads: YouTube Music, your folders (lal_) or your server (sal_). */
export function albumRoute(id: string): Route {
  if (id.startsWith('lal_')) return { name: 'musicAlbum', source: 'local', id };
  if (id.startsWith('sal_')) return { name: 'musicAlbum', source: 'server', id };
  return { name: 'album', id };
}

interface Entry {
  route: Route;
  key: number;
  scroll: number;
}

interface NavState {
  stack: Entry[];
  index: number;
  current: () => Entry;
  go: (route: Route, options?: { replace?: boolean; tab?: boolean }) => void;
  back: () => void;
  forward: () => void;
  saveScroll: (top: number) => void;
}

let keys = 0;
const same = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b);

export const useNav = create<NavState>((set, get) => ({
  stack: [{ route: { name: 'home' }, key: keys++, scroll: 0 }],
  index: 0,
  current: () => get().stack[get().index]!,
  // Every navigation is a view transition: the page crossfades and the sidebar's
  // selection slides to the new item.
  go: (route, options) => {
    const { stack, index } = get();
    if (same(stack[index]!.route, route) && !options?.replace) return;
    // A tab switch inside the same page keeps the page mounted (its tab bar slides; no crossfade).
    if (options?.tab && stack[index]!.route.name === route.name) {
      const next = stack.slice();
      next[index] = { ...stack[index]!, route };
      set({ stack: next });
      return;
    }
    const entry = { route, key: keys++, scroll: 0 };
    transition(() => {
      if (options?.replace) {
        const next = stack.slice();
        next[index] = entry;
        set({ stack: next });
      } else {
        set({ stack: [...stack.slice(0, index + 1), entry].slice(-50), index: Math.min(index + 1, 49) });
      }
    });
  },
  back: () => transition(() => set((s) => ({ index: Math.max(0, s.index - 1) }))),
  forward: () => transition(() => set((s) => ({ index: Math.min(s.stack.length - 1, s.index + 1) }))),
  saveScroll: (top) =>
    set((s) => {
      const stack = s.stack.slice();
      const entry = stack[s.index];
      if (entry) stack[s.index] = { ...entry, scroll: top };
      return { stack };
    }),
}));

export const go = (route: Route, options?: { replace?: boolean; tab?: boolean }) => useNav.getState().go(route, options);

const LAST_KEY = 'obsidian:last-route';
useNav.subscribe((state) => {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(state.stack[state.index]!.route));
  } catch {
    /* storage unavailable */
  }
});

export function lastRoute(): Route | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as Route) : null;
  } catch {
    return null;
  }
}
