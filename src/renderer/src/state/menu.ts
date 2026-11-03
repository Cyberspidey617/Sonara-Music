import { create } from 'zustand';
import type { ReactNode } from 'react';

export type MenuEntry =
  | { label: string; icon?: ReactNode; onSelect: () => void; destructive?: boolean; disabled?: boolean; hint?: string }
  | { separator: true }
  | { header: string };

export interface MenuAnchor {
  x: number;
  y: number;
  /** The element's box, when opened from a button: the menu aligns to it. */
  rect?: { top: number; bottom: number; left: number; right: number };
  placement?: 'below-end' | 'below-start' | 'above-end' | 'above-start';
}

interface MenuState {
  entries: MenuEntry[] | null;
  anchor: MenuAnchor | null;
  open: (entries: MenuEntry[], anchor: MenuAnchor) => void;
  close: () => void;
}

export const useMenu = create<MenuState>((set) => ({
  entries: null,
  anchor: null,
  open: (entries, anchor) => set({ entries, anchor }),
  close: () => set({ entries: null, anchor: null }),
}));

/** Opens a menu under (or above) a button. */
export function openMenuAt(element: HTMLElement, entries: MenuEntry[], placement: MenuAnchor['placement'] = 'below-end') {
  const r = element.getBoundingClientRect();
  useMenu.getState().open(entries, { x: r.left, y: r.bottom, rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right }, placement });
}

/** Opens a menu at the pointer (right-click). */
export function openContextMenu(event: { clientX: number; clientY: number; preventDefault: () => void }, entries: MenuEntry[]) {
  event.preventDefault();
  useMenu.getState().open(entries, { x: event.clientX, y: event.clientY });
}
