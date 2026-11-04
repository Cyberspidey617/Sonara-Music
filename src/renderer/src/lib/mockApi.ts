/*
 * A stand-in for the main process when the UI is opened in a plain browser
 * (development only). It answers from YouTube Music responses captured to
 * fixtures and run through the real normalizers. Artwork is replaced with
 * generated gradients, so the UI can be checked without network access.
 */
import type { AlbumPage, ArtistPage, HomeFeed, LibraryData, ObsidianApi, PlaylistPage, SearchResults, Track } from '@shared/types';
import { DEFAULT_SETTINGS, migrateSettings, type DownloadItem } from '@shared/types';
import raw from './mock-data.json';

const PALETTES = [
  ['#7a3b10', '#e0a040', '#2a0f05'],
  ['#14324f', '#4aa3df', '#081420'],
  ['#4a1036', '#e05a8c', '#1a0614'],
  ['#1d3b22', '#7bc47f', '#0a170c'],
  ['#3b2a5c', '#a98be0', '#120a20'],
  ['#5c1d1d', '#ef6b4f', '#1f0808'],
  ['#2e2e2e', '#bdbdbd', '#0c0c0c'],
];

function hash(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function art(seed: string): string {
  const [a, b, c] = PALETTES[hash(seed) % PALETTES.length]!;
  const angle = hash(seed + 'x') % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><radialGradient id="r" cx=".3" cy=".3" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="${180 + (hash(seed) % 240)}" cy="${200 + (hash(seed + 'y') % 200)}" r="${120 + (hash(seed) % 90)}" fill="url(#r)"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** Every thumbnail URL replaced by a gradient seeded from it. */
function withArt<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (key, v) => (key === 'thumbnail' && typeof v === 'string' ? art(v) : v)) as T;
}

const data = withArt(raw as unknown as {
  home: HomeFeed;
  search: SearchResults;
  suggest: string[];
  album: AlbumPage;
  artist: ArtistPage;
  playlist: PlaylistPage;
  radio: Track[];
});

const delay = <T>(value: T, ms = 250) => new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));

const LIBRARY_KEY = 'obsidian:mock-library';

let mockFolders: string[] = [];
function mockLocal() {
  const tracks: Track[] = mockFolders.length
    ? data.album.tracks.map((t, i) => ({
        ...t,
        videoId: `loc_mock${i}`,
        album: { name: data.album.title, id: 'lal_mock' },
        source: 'local' as const,
        format: i % 3 === 0 ? { codec: 'FLAC', lossless: true, bitDepth: 24, sampleRate: 96000 } : { codec: 'FLAC', lossless: true, bitDepth: 16, sampleRate: 44100 },
      }))
    : [];
  return {
    folders: mockFolders,
    tracks,
    albums: mockFolders.length ? [{ id: 'lal_mock', title: data.album.title, artist: 'Radiohead', year: 1997, trackCount: tracks.length, lossless: true, thumbnail: data.album.thumbnail }] : [],
    scan: { scanning: false, scanned: tracks.length, total: tracks.length, unsupported: 0 },
  };
}

export function createMockApi(): ObsidianApi {
  let library: LibraryData = { liked: [], playlists: [], history: [], settings: { ...DEFAULT_SETTINGS } };
  try {
    const saved = localStorage.getItem(LIBRARY_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as LibraryData;
      library = { ...library, ...parsed, settings: { ...DEFAULT_SETTINGS, ...migrateSettings((parsed.settings ?? {}) as unknown as Record<string, unknown>) } };
    }
  } catch {
    /* fresh */
  }
  // Downloads, simulated: progress ticks up so the UI can be previewed.
  const downloads = new Map<string, DownloadItem>();
  const dlListeners = new Set<(items: DownloadItem[]) => void>();
  const emit = () => dlListeners.forEach((h) => h([...downloads.values()].sort((a, b) => b.at - a.at)));
  setInterval(() => {
    let any = false;
    for (const d of downloads.values()) {
      if (d.state === 'queued') d.state = 'downloading';
      if (d.state === 'downloading') {
        d.received = Math.min(d.total, d.received + d.total * 0.12);
        if (d.received >= d.total) Object.assign(d, { state: 'done', path: `C:\\Users\\you\\Music\\Obsidian Music\\${d.track.title}.webm` });
        any = true;
      }
    }
    if (any) emit();
  }, 400);
  return {
    platform: 'browser',
    downloadTracks: async (tracks, quality) => {
      for (const track of tracks) downloads.set(track.videoId, { videoId: track.videoId, track, quality, state: 'queued', received: 0, total: quality === 'small' ? 1.6e6 : 4.2e6, at: Date.now(), format: { codec: quality === 'compatible' ? 'AAC' : 'Opus', lossless: false, bitrate: quality === 'small' ? 64000 : 160000 } });
      emit();
    },
    cancelDownload: async (id) => void (downloads.delete(id), emit()),
    removeDownload: async (id) => void (downloads.delete(id), emit()),
    listDownloads: async () => [...downloads.values()],
    downloadsFolder: async () => 'C:\\Users\\you\\Music\\Obsidian Music',
    chooseDownloadsFolder: async () => 'C:\\Users\\you\\Music\\Obsidian Music',
    openDownloadsFolder: async () => undefined,
    showDownload: async () => undefined,
    onDownloadsChanged: (h) => (dlListeners.add(h), () => void dlListeners.delete(h)),
    home: () => delay(data.home),
    search: (query) => delay({ ...data.search, query }),
    suggest: (query) => delay(data.suggest.filter((s) => s.includes(query.toLowerCase().slice(0, 3))), 80),
    album: (id) => delay({ ...data.album, id }),
    artist: (id) => delay({ ...data.artist, id }),
    playlist: (id) => delay({ ...data.playlist, id }),
    upNext: () => delay(data.radio),
    lyrics: () => delay({ text: 'Lyrics come from YouTube Music when no synced source has them.\nThis is the mock.', source: 'Mock' }),
    track: (videoId) => delay(data.radio.find((t) => t.videoId === videoId) ?? null),
    importPlaylist: () => delay({ title: data.playlist.title, tracks: data.playlist.tracks, thumbnail: data.playlist.thumbnail }, 800),
    prefetch: async () => undefined,
    streamInfo: async (videoId) => ({ videoId, source: 'youtube', client: 'MOCK', mimeType: 'audio/webm', loudnessDb: 0, format: { codec: 'Opus', lossless: false, bitrate: 160000, sampleRate: 48000 } }),
    loadLibrary: () => delay(library, 10),
    saveLibrary: async (patch) => {
      library = { ...library, ...patch, settings: { ...library.settings, ...(patch.settings ?? {}) } };
      try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
      } catch {
        /* ignore */
      }
    },
    openExternal: async (url) => void window.open(url, '_blank'),
    setPlaybackState: () => undefined,
    minimizeWindow: () => undefined,
    toggleMaximizeWindow: () => undefined,
    closeWindow: () => undefined,
    isWindowMaximized: async () => false,
    onMaximizedChange: () => () => undefined,
    toggleMiniPlayer: () => undefined,
    miniCommand: () => undefined,
    openMainWindow: () => undefined,
    hideMiniPlayer: () => undefined,
    onMiniState: () => () => undefined,
    setMiniLayout: () => undefined,
    miniJumpTo: () => undefined,
    onJumpTo: () => () => undefined,
    toggleFullScreen: async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen().catch(() => undefined);
      return !!document.fullscreenElement;
    },
    setZoom: (factor) => void (document.body.style.zoom = String(factor)),
    localLibrary: () => delay(mockLocal()),
    addMusicFolder: async () => {
      mockFolders = ['D:\\Music\\FLAC'];
      return mockFolders;
    },
    removeMusicFolder: async () => (mockFolders = []),
    rescanMusic: async () => undefined,
    localAlbum: () => delay({ ...data.album, id: 'lal_mock', description: 'On this PC · FLAC 24-bit 96 kHz', tracks: mockLocal().tracks }),
    onScanProgress: () => () => undefined,
    serverStatus: async () => ({ configured: false }),
    connectServer: async () => {
      throw new Error('No server in the browser preview.');
    },
    disconnectServer: async () => undefined,
    serverAlbums: async () => [],
    serverAlbum: () => delay(data.album),
    searchYourMusic: async () => (mockFolders.length ? mockLocal().tracks.slice(0, 2) : []),
    findOnYouTube: async () => data.radio[0]?.videoId ?? null,
    onCommand: () => () => undefined,
    onFullScreenChange: () => () => undefined,
    dataPath: async () => '(browser preview)',
  };
}
