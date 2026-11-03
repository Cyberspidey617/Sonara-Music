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

export type PageTone = 'obsidian' | 'graphite' | 'black';
export type LyricsFont = 'inter' | 'dm-sans' | 'system' | 'serif' | 'rounded';
export type GlassStyle = 'clear' | 'tinted';
export type Backdrop = 'mesh' | 'artwork' | 'solid';
export type StartPage = 'home' | 'liked' | 'music' | 'last';

export interface Settings {
  quality: AudioQuality;
  autoplay: boolean;
  /** Seconds of crossfade between tracks; 0 is off. */
  crossfade: number;
  volume: number;
  /** Even out loudness between tracks with YouTube's loudness data. */
  normalize: boolean;
  /** Launch straight into the immersive full-screen player when playback starts. */
  immersiveOnPlay: boolean;
  closeToTray: boolean;

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

  // Layout
  zoom: number;
  compact: boolean;
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

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  autoplay: true,
  crossfade: 0,
  volume: 0.8,
  normalize: true,
  immersiveOnPlay: false,
  closeToTray: false,
  musicFolders: [],
  accent: '#fa586a',
  dynamicAccent: false,
  pageTone: 'obsidian',
  ambientGlow: false,
  glassStyle: 'clear',
  designVersion: 1,
  lyricsScale: 1,
  lyricsFont: 'inter',
  lyricsAlign: 'left',
  lyricsBlur: true,
  lyricsControls: true,
  lyricsMotion: 'staggered',
  lyricsPronunciation: false,
  lyricsTranslation: false,
  lyricsTranslateTo: 'en',
  backdrop: 'mesh',
  backdropMotion: 1,
  artworkScale: 1,
  zoom: 1,
  compact: false,
  startPage: 'home',
  sidebarSearch: true,
  sidebarRecent: true,
  sidebarMusic: true,
  sidebarMode: 'compact',
  downloadFolder: '',
  downloadQuality: 'ask',
  eq: { enabled: false, preset: 'flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0, autoPreamp: true, mode: 'basic', saved: [] },
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
}

// ---- Downloads ----------------------------------------------------------------

/**
 * What to save. YouTube's own formats are saved as they are (no re-encoding,
 * which could only lose quality); lossless comes from your own files or server.
 */
export type DownloadQuality = 'best' | 'compatible' | 'small' | 'lossless';

export interface DownloadItem {
  videoId: string;
  track: Track;
  quality: DownloadQuality;
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
  setTitleBarTheme(theme: 'page' | 'immersive'): void;
  toggleFullScreen(): Promise<boolean>;
  onCommand(handler: (command: 'play-pause' | 'next' | 'previous') => void): () => void;
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
