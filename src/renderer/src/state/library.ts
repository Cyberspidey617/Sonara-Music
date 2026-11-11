import { create } from 'zustand';
import { DEFAULT_SETTINGS, type LibraryData, type LocalPlaylist, type Settings, type Track } from '@shared/types';
import { api } from '@/lib/api';
import { uid } from '@/lib/format';

const HISTORY_LIMIT = 300;

interface LibraryState extends LibraryData {
  loaded: boolean;
  load: () => Promise<void>;
  isLiked: (videoId: string) => boolean;
  toggleLike: (track: Track) => boolean;
  likeAll: (tracks: Track[]) => void;
  addToHistory: (track: Track) => void;
  /** Removes one song from the history; returns a function that puts it back (for Undo). */
  removeFromHistory: (videoId: string) => () => void;
  clearHistory: () => void;
  createPlaylist: (name: string, tracks?: Track[], sourceId?: string) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, tracks: Track[]) => number;
  removeFromPlaylist: (id: string, index: number) => void;
  moveInPlaylist: (id: string, from: number, to: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

/** Strips a track to what the library needs to keep. */
function slim(track: Track): Track {
  const { videoId, title, artists, album, duration, thumbnail, explicit, isVideo } = track;
  return { videoId, title, artists, ...(album && { album }), ...(duration && { duration }), ...(thumbnail && { thumbnail }), ...(explicit && { explicit }), ...(isVideo && { isVideo }) };
}

export const useLibrary = create<LibraryState>((set, get) => {
  const save = (patch: Partial<LibraryData>) => void api.saveLibrary(patch).catch(() => undefined);
  const setPlaylists = (playlists: LocalPlaylist[]) => {
    set({ playlists });
    save({ playlists });
  };

  return {
    liked: [],
    playlists: [],
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    loaded: false,

    load: async () => {
      const data = await api.loadLibrary();
      set({ ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings }, loaded: true });
    },

    isLiked: (videoId) => get().liked.some((t) => t.videoId === videoId),

    toggleLike: (track) => {
      const liked = get().liked;
      const has = liked.some((t) => t.videoId === track.videoId);
      const next = has ? liked.filter((t) => t.videoId !== track.videoId) : [slim(track), ...liked];
      set({ liked: next });
      save({ liked: next });
      return !has;
    },

    likeAll: (tracks) => {
      const have = new Set(get().liked.map((t) => t.videoId));
      const fresh = tracks.filter((t) => !have.has(t.videoId)).map(slim);
      if (!fresh.length) return;
      const next = [...fresh, ...get().liked];
      set({ liked: next });
      save({ liked: next });
    },

    addToHistory: (track) => {
      // Incognito: what you play leaves no trace.
      if (get().settings.incognito) return;
      const next = [slim(track), ...get().history.filter((t) => t.videoId !== track.videoId)].slice(0, HISTORY_LIMIT);
      set({ history: next });
      save({ history: next });
    },

    removeFromHistory: (videoId) => {
      const before = get().history;
      const index = before.findIndex((t) => t.videoId === videoId);
      if (index < 0) return () => undefined;
      const next = before.filter((t) => t.videoId !== videoId);
      set({ history: next });
      save({ history: next });
      return () => {
        // Played again since: it's already back at the top.
        const now = get().history;
        if (now.some((t) => t.videoId === videoId)) return;
        const restored = [...now.slice(0, index), before[index]!, ...now.slice(index)].slice(0, HISTORY_LIMIT);
        set({ history: restored });
        save({ history: restored });
      };
    },

    clearHistory: () => {
      set({ history: [] });
      save({ history: [] });
    },

    createPlaylist: (name, tracks = [], sourceId) => {
      const playlist: LocalPlaylist = { id: uid(), name: name.trim() || 'New Playlist', tracks: tracks.map(slim), createdAt: Date.now(), ...(sourceId && { sourceId }) };
      setPlaylists([playlist, ...get().playlists]);
      return playlist.id;
    },

    renamePlaylist: (id, name) => setPlaylists(get().playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))),

    deletePlaylist: (id) => setPlaylists(get().playlists.filter((p) => p.id !== id)),

    addToPlaylist: (id, tracks) => {
      let added = 0;
      setPlaylists(
        get().playlists.map((p) => {
          if (p.id !== id) return p;
          const have = new Set(p.tracks.map((t) => t.videoId));
          const fresh = tracks.filter((t) => !have.has(t.videoId)).map(slim);
          added = fresh.length;
          return { ...p, tracks: [...p.tracks, ...fresh] };
        }),
      );
      return added;
    },

    removeFromPlaylist: (id, index) =>
      setPlaylists(get().playlists.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((_, i) => i !== index) } : p))),

    moveInPlaylist: (id, from, to) =>
      setPlaylists(
        get().playlists.map((p) => {
          if (p.id !== id) return p;
          const tracks = p.tracks.slice();
          const [moved] = tracks.splice(from, 1);
          if (moved) tracks.splice(to, 0, moved);
          return { ...p, tracks };
        }),
      ),

    updateSettings: (patch) => {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      save({ settings: patch as Settings });
    },
  };
});

/** After a lossless source is added: turn on "Lossless when available" if quality was the default High. */
export function enableLosslessIfHigh(toast: (message: string) => void) {
  const { settings, updateSettings } = useLibrary.getState();
  if (settings.quality !== 'high') return;
  updateSettings({ quality: 'lossless' });
  toast('Audio quality set to Lossless when available');
}
