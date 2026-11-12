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

export type TrackSource = 'youtube' | 'local' | 'server' | 'download' | 'addon';

/** A lossless source: a server speaking the open addon protocol, added by its address. */
export interface LosslessSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

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

/** Where an update stands. */
export interface UpdateState {
  phase: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error';
  current: string;
  /** The newest release's version, once known. */
  latest?: string;
  /** Download progress, 0–100. */
  percent?: number;
  /** This copy can download and install updates itself (the Windows setup's install, a Linux AppImage). */
  canInstall: boolean;
  /** The release page, for copies that can't install themselves. */
  url: string;
  error?: string;
}

/** Search-as-you-type: words to search for, then the music they most likely mean. */
export interface Suggestions {
  queries: string[];
  items: Lockup[];
}

/** YouTube Music's Moods & genres. */
export interface Moods {
  sections: { title: string; items: { title: string; params: string; color?: string }[] }[];
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
  /** From another service (Spotify): songs that couldn't be found on YouTube Music, as "Title — Artist". */
  missing?: string[];
  /** Only this many songs could be read (a longer Spotify playlist is cut there). */
  limitedTo?: number;
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
/** A song's lyric timing as you adjusted it, in ms (+ is later): the whole song, then single lines on top. */
export interface LyricsTiming {
  offset?: number;
  /** By line number. */
  lines?: Record<string, number>;
}

/** A song's music video found on YouTube. */
export interface OnlineMusicVideo {
  videoId: string;
  /** As long as the song, so it plays in time with it; otherwise it may not. */
  synced: boolean;
  title: string;
  channel: string;
  /** YouTube Music's own line-up of song and video: song-time → video-time stretches (seconds). */
  timeMap?: { from: number; to: number; length: number }[];
}

/** Your YouTube Music account (for its Song/Video pairing). */
export interface AccountStatus {
  signedIn: boolean;
  name?: string;
}

/** Music video quality: Auto (Full HD), or a height the video offers (up to 4K). */
export type VideoQuality = 'auto' | number;
export type VideoFit = 'fit' | 'fill' | '75' | '50';

/** Off: as before. System: everything through the system's proxy. Custom: through the one you give. */
export type ProxyMode = 'off' | 'system' | 'custom';

/** The automatic backups. */
export interface BackupInfo {
  folder: string;
  /** When the newest was written (ms), or null. */
  latest: number | null;
  count: number;
}

/** A line of lyrics you timed yourself (ms from the start). */
export interface TimedLyric {
  t: number;
  text: string;
}

/** How the seek bars look: Rounded (thick), Line (thin) or Wave (the played part a moving wave). */
export type SeekStyle = 'rounded' | 'line' | 'wave' | 'capsule' | 'expressive';
export type SeekColor = 'white' | 'accent' | 'custom';
/** When the knob shows: on hover, always, or only while dragging. */
export type SeekKnob = 'hover' | 'always' | 'drag';
export interface SeekLook {
  style: SeekStyle;
  color: SeekColor;
  custom: string;
  /** A factor of the style's own thickness. */
  thickness: number;
  knob: SeekKnob;
  /** The elapsed and remaining times beside it. */
  times: boolean;
}

/** A listen of 30 seconds or more, sent again as it goes on (same id). */
/** A song's story from Wikipedia, or its artist's when the song has no article. */
export interface SongAbout {
  kind: 'song' | 'artist';
  title: string;
  description?: string;
  text: string;
  image?: string;
  url: string;
}

/** Who you scrobble to. */
export interface ScrobbleStatus {
  listenBrainz: { user: string } | null;
  lastFm: { user: string } | null;
  /** Last.fm's approval page was opened; waiting for you to allow Sonara there. */
  lastFmWaiting: boolean;
  /** Scrobbles waiting to be sent (offline). */
  pending: number;
}

export interface PlayRecord {
  id: string;
  track: Track;
  /** When it started (ms). */
  at: number;
  seconds: number;
}

export interface WrappedSong {
  track: Track;
  plays: number;
  minutes: number;
}

export interface WrappedArtist {
  name: string;
  id?: string;
  plays: number;
  minutes: number;
  /** The artwork of their most played song. */
  thumbnail?: string;
}

/** A month of your listening, added up. */
export interface Wrapped {
  /** 'YYYY-MM'. */
  month: string;
  /** Months with listening (and this one), newest first. */
  months: string[];
  /** This month: still going. */
  partial: boolean;
  plays: number;
  minutes: number;
  /** Different songs and artists. */
  songs: number;
  artists: number;
  topSongs: WrappedSong[];
  topArtists: WrappedArtist[];
  /** Genres by share of listens (of the songs whose genre is known). */
  genres: { name: string; share: number }[];
  /** Songs whose genre is still being looked up. */
  genresPending: number;
  /** Listens by hour of the day (0–23). */
  hours: number[];
  /** Minutes by day of the month. */
  days: number[];
  topDay?: { day: number; minutes: number };
}

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
  /** Spatial audio: virtual speakers around you (headphones), or a wider stage (speakers). */
  spatialAudio: SpatialAudio;
  closeToTray: boolean;
  /** When the floating mini player comes up by itself: Sonara not in use, minimised (or in the tray), or never. */
  miniPlayerWhen: MiniPlayerWhen;
  /** System-wide shortcuts (Ctrl+Alt+…, ⌘+Alt+… on a Mac) that work while other apps are in front. */
  globalShortcuts: boolean;
  /** Look for a newer Sonara on GitHub now and then, and say so when there is one. */
  updateNotices: boolean;

  // Your music (lossless sources)
  musicFolders: string[];
  /** Lossless sources, asked in order after your own files and server. */
  losslessSources: LosslessSource[];

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
  /** Lyric timing you adjusted, per song (by videoId). */
  lyricsTiming: Record<string, LyricsTiming>;
  /** Playback speed, 0.5–2 (1 is normal); the pitch stays the same. */
  playbackSpeed: number;
  /** Keep music videos out of Home and search (songs only). */
  hideVideos: boolean;
  /** Incognito: nothing you play is kept (history, Wrapped, scrobbles, skips) or shapes your recommendations. */
  incognito: boolean;
  /** Eco mode: fewer frames and simpler glass, to use less of the PC. Auto: while on battery. */
  powerSaver: 'auto' | 'on' | 'off';
  /** Music videos: the highest quality to stream. */
  videoQuality: VideoQuality;
  /** Music videos: fit the screen, fill it (cropping the edges), or a smaller size. */
  videoFit: VideoFit;
  // Seek bars (all of them: full-screen, video, player bar, mini player)
  seekStyle: SeekStyle;
  seekColor: SeekColor;
  seekCustomColor: string;
  seekThickness: number;
  seekKnob: SeekKnob;
  seekTimes: boolean;

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
  /** Your music taste, for Home's "Made for you" (picked after the guide; Settings › Playback). */
  taste: Taste;
  /** Songs not to recommend (videoIds). */
  notInterested: string[];
  /** Artists not to recommend. */
  notInterestedArtists: ArtistRef[];
  /** Songs whose listens don't shape your recommendations (videoIds). */
  tasteExcluded: string[];
  /** Songs you skipped early, and how often (by videoId): ones you keep skipping aren't recommended. */
  skipCounts: Record<string, number>;
  /** "I want more of…": notes that become Home shelves. */
  tasteNotes: string[];
  /** The shuffle button also offers Smart Shuffle (recommendations mixed into the queue). */
  smartShuffle: boolean;
  proxy: ProxyMode;
  /** For a custom proxy: e.g. http://10.0.0.1:3128 or socks5://127.0.0.1:1080. */
  proxyUrl: string;
  /** Getting started: the steps you've done (by name), and whether the card was put away. */
  checklist: Record<string, boolean>;
  checklistHidden: boolean;
  /** Lyrics you timed yourself, by song (videoId). */
  userLyrics: Record<string, TimedLyric[]>;
  /** The taste picker was finished or skipped. */
  tasteSeen: boolean;
  /** The version whose What's New you've seen (shown once after each update). */
  lastSeenVersion: string;
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

export type SpatialAudio = 'off' | 'headphones' | 'speakers';
export type MiniPlayerWhen = 'away' | 'minimised' | 'off';

/** The languages, kinds of songs and artists you like. */
export interface Taste {
  languages: string[];
  genres: string[];
  artists: { id: string; name: string; thumbnail?: string }[];
}

/** What you've listened to lately (30 seconds or more), for recommendations. */
export interface ListeningProfile {
  /** Listens counted. */
  plays: number;
  /** Most played first. */
  songs: { track: Track; plays: number; lastAt: number }[];
  artists: { name: string; id?: string; plays: number }[];
  /** Listens by hour of the day (0–23). */
  hours: number[];
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
  const { compact, density, miniPlayerAuto, ...rest } = saved;
  const settings = rest as Partial<Settings> & Record<string, unknown>;
  // "Compact song lists" (on/off), then three row densities, became a row height.
  if (typeof settings.rowHeight !== 'number' && (compact === true || typeof density === 'string'))
    settings.rowHeight = ({ compact: 44, comfortable: 56, spacious: 66 } as Record<string, number>)[compact === true ? 'compact' : String(density)] ?? 56;
  // The old default, 1080p, is what Auto plays.
  if (settings.videoQuality === (1080 as never)) settings.videoQuality = 'auto';
  // Lossless downloads were removed; a saved default of Lossless becomes Best.
  if (settings.downloadQuality === ('lossless' as string)) settings.downloadQuality = 'best';
  // The mini player's on/off became when it comes up; off stays off.
  if (!settings.miniPlayerWhen && miniPlayerAuto === false) settings.miniPlayerWhen = 'off';
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
  spatialAudio: 'off',
  closeToTray: false,
  miniPlayerWhen: 'away',
  updateNotices: true,
  globalShortcuts: true,
  musicFolders: [],
  losslessSources: [],
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
  lyricsTiming: {},
  playbackSpeed: 1,
  hideVideos: false,
  incognito: false,
  powerSaver: 'auto',
  videoQuality: 'auto',
  videoFit: 'fit',
  seekStyle: 'rounded',
  seekColor: 'white',
  seekCustomColor: '#a78bfa',
  seekThickness: 1,
  seekKnob: 'hover',
  seekTimes: true,
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
  taste: { languages: [], genres: [], artists: [] },
  notInterested: [],
  notInterestedArtists: [],
  tasteExcluded: [],
  skipCounts: {},
  tasteNotes: [],
  smartShuffle: true,
  proxy: 'off',
  proxyUrl: '',
  checklist: {},
  checklistHidden: false,
  userLyrics: {},
  tasteSeen: false,
  lastSeenVersion: '',
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
  /** How the seek bar looks, for the mini player's. */
  seek?: SeekLook;
  /** The songs after this one (up to 20), with their places in the queue, for the mini player's Up Next. */
  upNext?: { index: number; title: string; artist: string; thumbnail?: string }[];
}

/** The mini player's shapes: the bar, or the bar with Up Next below it. */
export type MiniLayout = 'bar' | 'queue';
/** Which way Up Next opened from the bar: above it, or below it near the top of the screen. */
export type MiniGrow = 'up' | 'down';
/** The mini player's window for each layout (a see-through margin goes round the pill). */
export const MINI_SIZES: Record<MiniLayout, { width: number; height: number }> = {
  bar: { width: 424, height: 84 },
  queue: { width: 424, height: 360 },
};

/** What the taskbar, tray, mini player and system-wide shortcuts can ask the player to do. */
/** What system-wide shortcuts and the command line (Sonara.exe --next) can do. */
export const APP_COMMANDS = ['play-pause', 'next', 'previous', 'volume-up', 'volume-down', 'like'] as const;
export type AppCommand = (typeof APP_COMMANDS)[number];

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
  /** For a lossless source: its name. */
  sourceName?: string;
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
  suggest(query: string): Promise<Suggestions>;
  album(id: string): Promise<AlbumPage>;
  artist(id: string): Promise<ArtistPage>;
  playlist(id: string): Promise<PlaylistPage>;
  upNext(videoId: string, playlistId?: string): Promise<Track[]>;
  lyrics(videoId: string): Promise<Lyrics | null>;
  track(videoId: string): Promise<Track | null>;
  /** A YouTube or YouTube Music playlist, or a Spotify playlist, album or song (matched on YouTube Music). */
  importPlaylist(urlOrId: string): Promise<ImportResult>;
  /** While a Spotify import matches its songs: how many are done. */
  onImportProgress(handler: (done: number, total: number) => void): () => void;
  /** A song's attached music video (its address for the player), or null. Keyed by the song's id. */
  musicVideo(key: string): Promise<string | null>;
  /** The song's music video on YouTube, or null. */
  onlineMusicVideo(track: Track): Promise<OnlineMusicVideo | null>;
  /** A listen of 30 seconds or more, for Wrapped. */
  recordPlay(record: PlayRecord): void;
  /** A song started: tell your scrobbling services it's playing. */
  nowPlaying(track: Track): void;
  scrobbleStatus(): Promise<ScrobbleStatus>;
  aboutSong(title: string, artist: string): Promise<SongAbout | null>;
  connectListenBrainz(token: string): Promise<ScrobbleStatus>;
  beginLastFm(key: string, secret: string): Promise<ScrobbleStatus>;
  finishLastFm(): Promise<ScrobbleStatus>;
  disconnectScrobbling(service: 'listenbrainz' | 'lastfm'): Promise<ScrobbleStatus>;
  /** A month of your listening (the latest one with listening when none is given). */
  wrapped(month?: string): Promise<Wrapped>;
  /** YouTube Music's Moods & genres, and one of them (by its params). */
  moods(): Promise<Moods>;
  mood(params: string): Promise<Shelf[]>;
  /** What you've listened to in the last `days` days, for recommendations. */
  listeningProfile(days?: number): Promise<ListeningProfile>;
  /** Backups: the automatic ones, one now, one where you choose, or restoring one (then a restart). */
  backups(): Promise<BackupInfo>;
  backupNow(): Promise<string | null>;
  exportBackup(): Promise<string | null>;
  importBackup(): Promise<{ restored: boolean; error?: string }>;
  openBackups(): Promise<void>;
  /** What to paste into a problem report (versions, system, the end of the log). */
  problemReport(): Promise<{ text: string; issuesUrl: string }>;
  clearCaches(): Promise<void>;
  /** Settings back to how they were at install (your music taste and folders kept), then a restart. */
  resetSettings(): Promise<void>;
  /** Whether a custom proxy address is one Sonara can use. */
  validProxy(url: string): Promise<boolean>;
  /** Asks for a video file and attaches it to the song; null if cancelled. */
  attachMusicVideo(key: string, title: string): Promise<string | null>;
  removeMusicVideo(key: string): Promise<void>;
  updateState(): Promise<UpdateState>;
  /** System-wide shortcuts the system kept for itself (e.g. 'CommandOrControl+Alt+Right'). */
  takenShortcuts(): Promise<string[]>;
  /** Whether YouTube Music can be reached right now. */
  isOnline(): Promise<boolean>;
  /** Looks for a newer release now (Settings › About). */
  checkForUpdate(): Promise<UpdateState>;
  /** Downloads the update inside the app (or opens the release page where it can't install itself). */
  downloadUpdate(): Promise<void>;
  /** Restarts into the downloaded update. */
  installUpdate(): void;
  onUpdateState(handler: (state: UpdateState) => void): () => void;
  /** The mini player was opened with its shortcut (for Getting started). */
  onMiniOpened(handler: () => void): () => void;
  /** Finds a song's stream ahead of playing it (when you point at it), so it starts at once. */
  prefetch(videoId: string): Promise<void>;
  streamInfo(videoId: string): Promise<StreamInfo | null>;
  /** Checks a lossless source's address: its name, or why it can't be used. */
  /** The heights a music video offers (largest first) and the one playing, once it has loaded. */
  accountStatus(): Promise<AccountStatus>;
  signIn(): Promise<AccountStatus>;
  signOut(): Promise<AccountStatus>;
  /** Signs in with a code entered at google.com/device in your own browser; resolves when done or given up. */
  signInWithCode(): Promise<AccountStatus>;
  cancelCodeSignIn(): Promise<void>;
  /** The code to enter, while a code sign-in waits for you. */
  onAccountCode(handler: (code: { code: string; url: string; expiresIn: number }) => void): () => void;
  videoHeights(videoId: string): Promise<{ heights: number[]; active?: number } | null>;
  testLosslessSource(url: string): Promise<{ ok: true; name: string; url: string } | { ok: false; error: string }>;
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
  onMiniState(handler: (state: PlaybackState, layout: MiniLayout, grow: MiniGrow) => void): () => void;
  /** Up Next opens above the bar, or below it (`grow`) when there isn't room above. */
  setMiniLayout(layout: MiniLayout, grow?: MiniGrow): void;
  /** Plays the song at that place in the queue (from the mini player's Up Next). */
  miniJumpTo(index: number): void;
  onJumpTo(handler: (index: number) => void): () => void;
  /** Moves the playing song to that many seconds in (from the mini player's progress line). */
  miniSeek(seconds: number): void;
  onSeekTo(handler: (seconds: number) => void): () => void;
  /** Drags the mini player with the cursor until the button is let go; where it was left is kept. */
  miniMoveStart(): void;
  /** Whether the pointer is on the mini player's pill, so its see-through surround lets clicks through. */
  miniInteractive(on: boolean): void;
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

/** The seek bars' look, from the settings (or a draft of them). */
export function seekLookOf(s: Partial<Settings>): SeekLook {
  return {
    style: s.seekStyle ?? DEFAULT_SETTINGS.seekStyle,
    color: s.seekColor ?? DEFAULT_SETTINGS.seekColor,
    custom: s.seekCustomColor ?? DEFAULT_SETTINGS.seekCustomColor,
    thickness: s.seekThickness ?? DEFAULT_SETTINGS.seekThickness,
    knob: s.seekKnob ?? DEFAULT_SETTINGS.seekKnob,
    times: s.seekTimes ?? DEFAULT_SETTINGS.seekTimes,
  };
}
