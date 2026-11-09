import { transition } from '@/lib/motion';
import { markStep } from '@/lib/checklist';
import { create } from 'zustand';
import type { Track } from '@shared/types';

export type Dialog =
  | { kind: 'add-to-playlist'; tracks: Track[] }
  | { kind: 'new-playlist'; tracks?: Track[] }
  | { kind: 'rename-playlist'; id: string }
  | { kind: 'import' }
  | { kind: 'shortcuts' }
  | { kind: 'equalizer' }
  | { kind: 'download'; tracks: Track[] };

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface UiState {
  fullScreen: boolean;
  sidePanel: 'lyrics' | 'queue' | null;
  dialog: Dialog | null;
  toasts: Toast[];
  searchFocusTick: number;
  setFullScreen: (open: boolean) => void;
  toggleSidePanel: (panel: 'lyrics' | 'queue') => void;
  setSidePanel: (panel: 'lyrics' | 'queue' | null) => void;
  openDialog: (dialog: Dialog) => void;
  closeDialog: () => void;
  toast: (message: string, action?: Toast['action']) => void;
  dismissToast: (id: number) => void;
  focusSearch: () => void;
}

let toastId = 0;

export const useUi = create<UiState>((set, get) => ({
  fullScreen: false,
  sidePanel: null,
  dialog: null,
  toasts: [],
  searchFocusTick: 0,
  // The artwork morphs between the mini player and the full-screen player.
  setFullScreen: (fullScreen) => {
    if (fullScreen === useUi.getState().fullScreen) return;
    transition(() => set({ fullScreen }));
  },
  toggleSidePanel: (panel) => set((s) => ({ sidePanel: s.sidePanel === panel ? null : panel })),
  setSidePanel: (sidePanel) => set({ sidePanel }),
  openDialog: (dialog) => {
    if (dialog.kind === 'shortcuts') markStep('shortcuts');
    set({ dialog });
  },
  closeDialog: () => set({ dialog: null }),
  toast: (message, action) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-2), { id, message, action }] });
    setTimeout(() => get().dismissToast(id), action ? 6000 : 3200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  focusSearch: () => set((s) => ({ searchFocusTick: s.searchFocusTick + 1 })),
}));

export const toast = (message: string, action?: Toast['action']) => useUi.getState().toast(message, action);
