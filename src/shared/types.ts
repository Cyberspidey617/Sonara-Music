// Types shared by the main process (which talks to YouTube Music) and the
// renderer (which draws them). Everything here is plain JSON so it can cross
// Electron's IPC boundary unchanged.

export interface ArtistRef {
  name: string;
  id?: string;
}

export interface AlbumRef {
  name: string;
  id?: string;
}

export interface Track {
  videoId: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  /** Seconds. */
  duration?: number;
  thumbnail?: string;
  explicit?: boolean;
  /** A music video rather than an audio track (16:9 artwork). */
  isVideo?: boolean;
  /** Where it plays from. Absent means YouTube Music. */
  source?: TrackSource;
  /** For files on this PC or a server: what the audio is. */
  format?: AudioFormat;
}

export type TrackSource = 'youtube' | 'local' | 'server' | 'download';

export interface AudioFormat {
  codec: string;
  lossless: boolean;
  bitDepth?: number;
  sampleRate?: number;
  /** Bits per second. */
  bitrate?: number;
}

/** YouTube video ids are 11 characters; local and server tracks carry a prefix. */
export const isYouTubeId = (id: string) => /^[\w-]{11}$/.test(id);

export type LockupKind = 'album' | 'playlist' | 'artist' | 'song' | 'video' | 'localAlbum' | 'serverAlbum';

/** A tile in a shelf or a search result: something that opens a page or plays. */
export interface Lockup {
  kind: LockupKind;
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  /** For songs and videos: the track to play. */
  track?: Track;
}

export interface Shelf {
  title: string;
  /** "songs" shelves draw as a compact grid of rows, the rest as square tiles. */
  layout: 'songs' | 'tiles';
  items: Lockup[];
}

export interface HomeFeed {
  shelves: Shelf[];
}

export interface SearchResults {
  query: string;
  correctedQuery?: string;
  top?: Lockup;
  songs: Track[];
  videos: Track[];
  albums: Lockup[];
  artists: Lockup[];
  playlists: Lockup[];
}

export interface AlbumPage {
  id: string;
  title: string;
  artists: ArtistRef[];
  subtitle?: string;
  year?: string;
  description?: string;
  thumbnail?: string;
  tracks: Track[];
  /** The album's audio playlist (OLAK5uy_…), for radio and sharing. */
  playlistId?: string;
  more: Shelf[];
}

export interface ArtistPage {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  subscribers?: string;
  topSongs: Track[];
  shelves: Shelf[];
}

export interface PlaylistPage {
  id: string;
  title: string;
  author?: string;
  subtitle?: string;
  description?: string;
  thumbnail?: string;
  tracks: Track[];
}

export interface Lyrics {
  /** Plain text, one line per line. */
  text: string;
  source?: string;
}

export interface ImportResult {
  title: string;
  tracks: Track[];
  thumbnail?: string;
}

// ---- Local library (stored on disk by the main process) -------------------

export interface LocalPlaylist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
  /** Where it came from, when imported from YouTube. */
  sourceId?: string;
}

/** "lossless" plays a matching lossless copy from your folders or server, else YouTube's best. */
export type AudioQuality = 'lossless' | 'high' | 'normal' | 'low';

export type PageTone = 'obsidian' | 'graphite' | 'black' | 'midnight' | 'forest' | 'wine' | 'mocha';
export type LyricsFont = 'inter' | 'dm-sans' | 'system' | 'serif' | 'rounded';
export type GlassStyle = 'clear' | 'tinted';
export type Backdrop = 'mesh' | 'artwork' | 'solid';
export type StartPage = 'home' | 'liked' | 'music' | 'last';
export type PageBackground = 'plain' | 'gradient' | 'artwork';
export type PlayerStyle = 'pebble' | 'full';
/** The pebble waveform's colour: from the playing song, the accent, the lavender gradient, or one you pick. */
export type WaveColor = 'song' | 'accent' | 'lavender' | 'custom';

export interface Settings {
  quality: AudioQuality;
  autoplay: boolean;
  /** Seconds of crossfade between tracks; 0 is off. */
  crossfade: number;
  volume: number;
  /** Even out loudness between tracks with YouTube's loudness data. */
  normalize: boolean;
  closeToTray: boolean;
  /** Show the floating mini player when Sonara is minimised or closed to the tray. */
  miniPlayerAuto: boolean;
  /** System-wide shortcuts (Ctrl+Alt+…, ⌘+Alt+… on a Mac) that work while other apps are in front. */
  globalShortcuts: boolean;

  // Your music (lossless sources)
  musicFolders: string[];

  // Appearance
  accent: string;
  /** Take the accent from the playing song's artwork. */
  dynamicAccent: boolean;
  pageTone: PageTone;
  /** A soft glow of the artwork's colour behind the whole app. */
  ambientGlow: boolean;
  /** Apple's Liquid Glass look: Clear (more transparent) or Tinted (frostier). */
  glassStyle: GlassStyle;
  /** How strongly glass blurs what's behind it, as a factor of the design's own blur (0 = none). */
  glassBlur: number;
  /** Behind the pages: the plain page colour, a gradient in the accent, or the playing artwork blurred. */
  pageBackground: PageBackground;
  /** The typeface for the whole app (lyrics have their own). */
  uiFont: LyricsFont;
  /** Corner roundness, as a factor of the design's radii (0 = square). */
  corners: number;
  /** Bumped when a redesign changes defaults that existing settings should pick up. */
  designVersion: number;

  // Lyrics
  lyricsScale: number;
  lyricsFont: LyricsFont;
  lyricsAlign: 'left' | 'center';
  lyricsBlur: boolean;
  lyricsControls: boolean;
  lyricsMotion: 'staggered' | 'uniform' | 'instant';
  lyricsPronunciation: boolean;
  lyricsTranslation: boolean;
  /** Google Translate language code, e.g. 'en'. */
  lyricsTranslateTo: string;

  // Full-screen player
  backdrop: Backdrop;
  /** 0 still, 0.4 slow, 1 normal. */
  backdropMotion: number;
  artworkScale: number;

  // The pebble's waveform
  waveColor: WaveColor;
  waveCustomColor: string;
  waveBars: number;
  /** Bar width, as a share of each bar's slot. */
  waveThickness: number;
  /** How tall the bars reach for the same sound. */
  waveHeight: number;
  /** 0 follows the music tightly; 1 glides. */
  waveSmoothing: number;
  /** How strongly the bars answer quiet sounds (0.5 is neutral). */
  waveSensitivity: number;
  /** Learns each song's loudness as it plays, so quiet songs move and loud ones don't max out. */
  waveAutoLevel: boolean;
  /** Balanced: small at the ends, tallest in the middle. Even: one height across. */
  waveShape: 'balanced' | 'even';
  /** Mirrored around the centre line, or rising from the bottom. */
  waveStyle: 'mirrored' | 'rising';
  /** A soft breathing while paused (otherwise still). */
  waveIdle: boolean;

  // Layout
  zoom: number;
  /** Song-list row height in px. */
  rowHeight: number;
  /** Artwork size in sideways rows, as a factor of each row's own size. */
  coverSize: number;
  /** Pebble: the player rests as a small pebble and opens into the full bar under the pointer. */
  playerStyle: PlayerStyle;
  /** The first-run guide was finished or skipped. */
  guideSeen: boolean;
  startPage: StartPage;
  sidebarSearch: boolean;
  sidebarRecent: boolean;
  sidebarMusic: boolean;
  /** Compact: an icon rail that opens as glass over the page on hover. */
  sidebarMode: 'compact' | 'expanded';

  // Downloads
  /** Empty: Music\\Obsidian Music. */
  downloadFolder: string;
  downloadQuality: DownloadQuality | 'ask';

  // Equalizer
  eq: EqSettings;
}

/** A 10-band graphic equalizer (32 Hz – 16 kHz), in dB. */
export interface EqSettings {
  enabled: boolean;
  /** A built-in preset id, `custom:<name>` for a saved one, or 'custom'. */
  preset: string;
  bands: number[];
  /** Manual preamp in dB (Advanced), used when `autoPreamp` is off. */
  preamp: number;
  /** Lower the level by the largest boost, so boosting never clips. */
  autoPreamp: boolean;
  mode: 'basic' | 'advanced';
  saved: { name: string; bands: number[] }[];
}

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export interface LibraryData {
  liked: Track[];
  playlists: LocalPlaylist[];
  history: Track[];
  settings: Settings;
}

/** Settings saved by earlier versions, in their newer shapes. */
export function migrateSettings(saved: Record<string, unknown>): Partial<Settings> {
  const { compact, density, ...rest } = saved;
  const settings = rest as Partial<Settings> & Record<string, unknown>;
  // "Compact song lists" (on/off), then three row densities, became a row height.
  if (typeof settings.rowHeight !== 'number' && (compact === true || typeof density === 'string'))
    settings.rowHeight = ({ compact: 44, comfortable: 56, spacious: 66 } as Record<string, number>)[compact === true ? 'compact' : String(density)] ?? 56;
  // Lossless downloads were removed; a saved default of Lossless becomes Best.
  if (settings.downloadQuality === ('lossless' as string)) settings.downloadQuality = 'best';
  // Step choices became sliders.
  const steps: [keyof Settings, Record<string, number>][] = [
    ['glassBlur', { off: 0, soft: 0.5, default: 1, strong: 1.7 }],
    ['corners', { sharp: 0.35, default: 1, round: 1.45 }],
    ['coverSize', { small: 0.82, medium: 1, large: 1.22 }],
  ];
  for (const [key, values] of steps) {
    const value = settings[key];
    if (typeof value === 'string') settings[key] = (values[value] ?? 1) as never;
  }
  return settings;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  autoplay: true,
  crossfade: 0,
  volume: 1,
  normalize: false,
  closeToTray: false,
  miniPlayerAuto: true,
  globalShortcuts: true,
  musicFolders: [],
  accent: '#fa586a',
  dynamicAccent: true,
  pageTone: 'black',
  ambientGlow: true,
  glassStyle: 'clear',
  glassBlur: 0.1,
  pageBackground: 'gradient',
  uiFont: 'inter',
  corners: 1.2,
  designVersion: 2,
  lyricsScale: 1,
  lyricsFont: 'inter',
  lyricsAlign: 'left',
  lyricsBlur: true,
  lyricsControls: true,
  lyricsMotion: 'staggered',
  lyricsPronunciation: true,
  lyricsTranslation: true,
  lyricsTranslateTo: 'en',
  backdrop: 'artwork',
  backdropMotion: 1,
  artworkScale: 1,
  waveColor: 'song',
  waveCustomColor: '#a78bfa',
  waveBars: 30,
  waveThickness: 0.5,
  waveHeight: 1,
  waveSmoothing: 0.5,
  waveSensitivity: 0.35,
  waveAutoLevel: true,
  waveShape: 'balanced',
  waveStyle: 'mirrored',
  waveIdle: true,
  zoom: 1.05,
  rowHeight: 56,
  coverSize: 1,
  playerStyle: 'pebble',
  guideSeen: false,
  startPage: 'home',
  sidebarSearch: true,
  sidebarRecent: true,
  sidebarMusic: true,
  sidebarMode: 'compact',
  downloadFolder: '',
  downloadQuality: 'ask',
  eq: { enabled: false, preset: 'flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0, autoPreamp: true, mode: 'advanced', saved: [] },
};

// ---- Your music: folders on this PC and a self-hosted server ---------------

export interface LibraryScanState {
  scanning: boolean;
  scanned: number;
  total: number;
  /** Files found that can't be played (ALAC, AIFF, APE, DSD…). */
  unsupported: number;
  lastScan?: number;
}

export interface LocalAlbum {
  id: string;
  title: string;
  artist: string;
  year?: number;
  trackCount: number;
  lossless: boolean;
  thumbnail?: string;
}

export interface LocalLibrary {
  folders: string[];
  tracks: Track[];
  albums: LocalAlbum[];
  scan: LibraryScanState;
}

export interface ServerStatus {
  configured: boolean;
  url?: string;
  username?: string;
  /** The server's own name and version, from the last successful ping. */
  serverName?: string;
  ok?: boolean;
  error?: string;
}

export interface ServerLogin {
  url: string;
  username: string;
  password: string;
}

// ---- The API the preload script exposes on window.obsidian ----------------

export interface PlaybackState {
  playing: boolean;
  title?: string;
  artist?: string;
  /** For the mini player: the artwork, where the song is, and the accent to tint it with. */
  thumbnail?: string;
  position?: number;
  duration?: number;
  accent?: string;
  /** The songs after this one (up to 20), with their places in the queue, for the mini player's Up Next. */
  upNext?: { index: number; title: string; artist: string; thumbnail?: string }[];
}

/** The mini player's shapes: the bar, or the bar with Up Next below it. */
export type MiniLayout = 'bar' | 'queue';

/** What the taskbar, tray, mini player and system-wide shortcuts can ask the player to do. */
export type AppCommand = 'play-pause' | 'next' | 'previous' | 'volume-up' | 'volume-down' | 'like';

// ---- Downloads ----------------------------------------------------------------

/**
 * What to save. YouTube's own formats are saved as they are (no re-encoding,
 * which could only lose quality); lossless comes from your own files or server.
 */
export type DownloadQuality = 'best' | 'compatible' | 'small';
/** A download's quality; 'lossless' copies were made by earlier versions and stay listed as such. */
export type SavedDownloadQuality = DownloadQuality | 'lossless';

export interface DownloadItem {
  videoId: string;
  track: Track;
  quality: SavedDownloadQuality;
  state: 'queued' | 'downloading' | 'done' | 'error';
  received: number;
  total: number;
  path?: string;
  error?: string;
  format?: AudioFormat;
  at: number;
}

export interface StreamInfo {
  videoId: string;
  /** Where the audio actually came from: YouTube, or your lossless copy. */
  source: TrackSource;
  client?: string;
  mimeType: string;
  bitrate?: number;
  itag?: number;
  contentLength?: number;
  loudnessDb?: number;
  format?: AudioFormat;
}

export interface ObsidianApi {
  platform: string;
  home(): Promise<HomeFeed>;
  search(query: string): Promise<SearchResults>;
  suggest(query: string): Promise<string[]>;
  album(id: string): Promise<AlbumPage>;
  artist(id: string): Promise<ArtistPage>;
  playlist(id: string): Promise<PlaylistPage>;
  upNext(videoId: string, playlistId?: string): Promise<Track[]>;
  lyrics(videoId: string): Promise<Lyrics | null>;
  track(videoId: string): Promise<Track | null>;
  importPlaylist(urlOrId: string): Promise<ImportResult>;
  prefetch(videoId: string): Promise<void>;
  streamInfo(videoId: string): Promise<StreamInfo | null>;
  loadLibrary(): Promise<LibraryData>;
  saveLibrary(patch: Partial<LibraryData>): Promise<void>;
  openExternal(url: string): Promise<void>;
  setPlaybackState(state: PlaybackState): void;
  /** The app's own window buttons (the system's caption buttons are hidden). */
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  isWindowMaximized(): Promise<boolean>;
  onMaximizedChange(handler: (maximized: boolean) => void): () => void;
  toggleFullScreen(): Promise<boolean>;
  onCommand(handler: (command: AppCommand) => void): () => void;
  /** The mini player (shell/MiniPlayer, its own small window). */
  toggleMiniPlayer(): void;
  miniCommand(command: AppCommand): void;
  openMainWindow(): void;
  hideMiniPlayer(): void;
  onMiniState(handler: (state: PlaybackState, layout: MiniLayout) => void): () => void;
  setMiniLayout(layout: MiniLayout): void;
  /** Plays the song at that place in the queue (from the mini player's Up Next). */
  miniJumpTo(index: number): void;
  onJumpTo(handler: (index: number) => void): () => void;
  /** Moves the playing song to that many seconds in (from the mini player's progress line). */
  miniSeek(seconds: number): void;
  onSeekTo(handler: (seconds: number) => void): () => void;
  /** Drags the mini player with the cursor until the button is let go; where it was left is kept. */
  miniMoveStart(): void;
  miniMoveEnd(): void;
  onFullScreenChange(handler: (fullScreen: boolean) => void): () => void;
  dataPath(): Promise<string>;
  setZoom(factor: number): void;

  // Your music
  localLibrary(): Promise<LocalLibrary>;
  addMusicFolder(): Promise<string[]>;
  removeMusicFolder(folder: string): Promise<string[]>;
  rescanMusic(): Promise<void>;
  downloadTracks(tracks: Track[], quality: DownloadQuality): Promise<void>;
  cancelDownload(videoId: string): Promise<void>;
  removeDownload(videoId: string, deleteFile: boolean): Promise<void>;
  listDownloads(): Promise<DownloadItem[]>;
  downloadsFolder(): Promise<string>;
  chooseDownloadsFolder(): Promise<string>;
  openDownloadsFolder(): Promise<void>;
  showDownload(videoId: string): Promise<void>;
  onDownloadsChanged(handler: (items: DownloadItem[]) => void): () => void;
  localAlbum(id: string): Promise<AlbumPage>;
  onScanProgress(handler: (state: LibraryScanState) => void): () => void;
  serverStatus(): Promise<ServerStatus>;
  connectServer(login: ServerLogin): Promise<ServerStatus>;
  disconnectServer(): Promise<void>;
  serverAlbums(): Promise<LocalAlbum[]>;
  serverAlbum(id: string): Promise<AlbumPage>;
  searchYourMusic(query: string): Promise<Track[]>;
  /** A YouTube video for a local or server song, so radio can follow it. */
  findOnYouTube(title: string, artist: string): Promise<string | null>;
}
