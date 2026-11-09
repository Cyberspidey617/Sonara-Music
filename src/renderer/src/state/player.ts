/*
 * The player: the queue and its order, and the audio engine that plays it.
 *
 * Two <audio> decks. The next track is loaded on the idle deck ahead of time,
 * so a track change is near-gapless, and with crossfade on, the two decks
 * overlap for the crossfade's length. Only the active deck's events count.
 */
import { attachEqualizer } from '@/lib/equalizer';
import { markOffline } from './online';
import { create } from 'zustand';
import { isYouTubeId, seekLookOf, type AudioFormat, type Track, type TrackSource } from '@shared/types';
import { api, isElectron } from '@/lib/api';
import { artworkAtPixels, largeArtwork } from '@/lib/artwork';
import { artistLine, uid } from '@/lib/format';
import { streamUrl } from '@/lib/stream';
import { recommendable, recommendForPlaylist } from '@/lib/taste';
import { useLibrary } from './library';
import { toast } from './ui';

export type RepeatMode = 'off' | 'all' | 'one';
export type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface QueueItem {
  track: Track;
  uid: string;
  /** Added by autoplay (the radio that follows the queue). */
  auto?: boolean;
  /** Added with Play Next or Add to Queue: it plays before the rest of the album, playlist or radio. */
  queued?: boolean;
  /** A Smart Shuffle recommendation, mixed in among your songs. */
  smart?: boolean;
}

export interface PlaySource {
  label: string;
}

interface Sleep {
  endsAt: number | null;
  endOfTrack: boolean;
}

interface PlayerState {
  queue: QueueItem[];
  index: number;
  original: QueueItem[] | null;
  status: Status;
  error: string | null;
  position: number;
  duration: number;
  shuffle: boolean;
  /** Smart Shuffle: shuffled, with recommendations like your songs mixed in. */
  smart: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
  source: PlaySource | null;
  sleep: Sleep;
  radioLoading: boolean;
  /** What the current track is actually playing as (YouTube Opus, or your FLAC). */
  playingAs: { source: TrackSource; format?: AudioFormat } | null;

  playTracks: (tracks: Track[], start?: number, options?: { shuffle?: boolean; source?: PlaySource }) => void;
  startRadio: (track: Track) => void;
  playNext: (tracks: Track[]) => void;
  addToQueue: (tracks: Track[]) => void;
  jumpTo: (index: number) => void;
  removeAt: (index: number) => void;
  move: (from: number, to: number) => void;
  clearUpcoming: () => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setSleepTimer: (minutes: number | null) => void;
  setSleepEndOfTrack: () => void;
}

const item = (track: Track, kind?: 'auto' | 'queued'): QueueItem => ({ track, uid: uid(), ...(kind && { [kind]: true }) });

function shuffled<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ---- The decks -------------------------------------------------------------------------

const decks = [new Audio(), new Audio()] as const;
let active = 0;
const gains = [1, 1];
/** What the idle deck has loaded ahead, if anything. */
let preloaded: { uid: string; deck: number } | null = null;
let fading: { timer: ReturnType<typeof setInterval> } | null = null;
let consecutiveErrors = 0;
let lastPositionState = 0;

for (const deck of decks) {
  deck.preload = 'auto';
  deck.crossOrigin = 'anonymous';
}
attachEqualizer(decks);
/** Both decks, for listeners that only read the sound (the waveform); playback stays here. */
export const audioDecks: readonly HTMLAudioElement[] = decks;

const activeDeck = () => decks[active]!;
const idleIndex = () => 1 - active;

/**
 * While a music video that isn't the same length as the song plays with its own sound, the video is
 * the song: the seek bar shows its time, seeking moves it, and the next song comes when it ends (the
 * song, silent meanwhile, ending first changes nothing).
 */
export interface VideoClock {
  time: () => number;
  duration: () => number;
  seek: (seconds: number) => void;
}
let videoClock: VideoClock | null = null;
/** The song reached its end while a video was the clock: it moves on once the video is gone. */
let songEndedUnderVideo = false;

export function setVideoClock(clock: VideoClock | null) {
  videoClock = clock;
  if (!clock && songEndedUnderVideo) {
    songEndedUnderVideo = false;
    onEnded();
  }
}

/** The video (being the song) is over: on to the next song. */
export function videoEnded() {
  videoClock = null;
  songEndedUnderVideo = false;
  onEnded();
}

export function getPlayhead(): number {
  if (videoClock) return videoClock.time() || 0;
  return activeDeck().currentTime || 0;
}

export function getDuration(): number {
  if (videoClock) {
    const v = videoClock.duration();
    if (Number.isFinite(v) && v > 0) return v;
  }
  const d = activeDeck().duration;
  return Number.isFinite(d) ? d : usePlayer.getState().duration;
}

export function getBuffered(): number {
  const deck = activeDeck();
  const ranges = deck.buffered;
  const t = deck.currentTime;
  for (let i = 0; i < ranges.length; i++) if (ranges.start(i) <= t + 0.5 && ranges.end(i) >= t) return ranges.end(i);
  return t;
}

function settings() {
  return useLibrary.getState().settings;
}

/** While a music video plays its own sound, the song keeps playing, silently. */
let silenced = false;

export function setSongSilenced(on: boolean) {
  if (silenced === on) return;
  silenced = on;
  applyVolume();
}

/** The volume you set (0–1, as heard), for sound played alongside the song, like a music video's. */
export function listeningVolume(): number {
  const { volume, muted } = usePlayer.getState();
  return muted ? 0 : Math.max(0, Math.min(1, volume * volume));
}

function targetVolume(deckIndex: number): number {
  const { volume, muted } = usePlayer.getState();
  if (muted || silenced) return 0;
  return Math.max(0, Math.min(1, volume * volume * (settings().normalize ? gains[deckIndex]! : 1)));
}

function applyVolume() {
  if (fading) return;
  activeDeck().volume = targetVolume(active);
}

function resetDeck(index: number) {
  const deck = decks[index]!;
  deck.pause();
  deck.removeAttribute('src');
  deck.load();
  gains[index] = 1;
  if (preloaded?.deck === index) preloaded = null;
}

function stopFade() {
  if (!fading) return;
  clearInterval(fading.timer);
  fading = null;
  resetDeck(idleIndex());
  applyVolume();
}

async function readLoudness(deckIndex: number, track: Track) {
  const videoId = track.videoId;
  if (track.source === 'local' || track.source === 'server' || !isYouTubeId(videoId)) {
    gains[deckIndex] = 1;
    if (deckIndex === active) usePlayer.setState({ playingAs: { source: track.source ?? 'local', format: track.format } });
    applyVolume();
    return;
  }
  try {
    const info = await api.streamInfo(videoId);
    if (deckIndex === active && usePlayer.getState().queue[usePlayer.getState().index]?.track.videoId === videoId) {
      usePlayer.setState({ playingAs: info ? { source: info.source, format: info.format } : null });
    }
    // A lossless copy has no YouTube loudness data: leave it as mastered.
    const loudness = info?.source === 'youtube' ? info?.loudnessDb : undefined;
    // Only ever turn loud tracks down; the element can't go above 1.
    gains[deckIndex] = typeof loudness === 'number' && loudness > 0 ? Math.pow(10, -loudness / 20) : 1;
  } catch {
    gains[deckIndex] = 1;
  }
  if (deckIndex === active) applyVolume();
}

/** Why a stream failed: the stream protocol puts the reason in a header. */
async function streamError(track: Track): Promise<string> {
  if (!isElectron) return 'Playback failed.';
  try {
    const response = await fetch(streamUrl(track, settings().quality), { headers: { Range: 'bytes=0-1' } });
    const reason = response.headers.get('X-Obsidian-Error');
    await response.body?.cancel();
    if (!response.ok) return reason ? decodeURIComponent(reason) : `The stream failed (${response.status}).`;
  } catch {
    /* fall through */
  }
  return 'This track couldn’t be played right now.';
}

// ---- Media Session (Windows media overlay, media keys, lock screen) --------------------

function updateMediaSession(track: Track | null) {
  if (!('mediaSession' in navigator)) return;
  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }
  const art = track.thumbnail;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: artistLine(track),
    album: track.album?.name ?? '',
    artwork: art
      ? [96, 256, 512].map((px) => ({ src: /googleusercontent|ggpht/.test(art) ? artworkAtPixels(art, px) : (largeArtwork(art) ?? art), sizes: `${px}x${px}`, type: 'image/jpeg' }))
      : [],
  });
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const deck = activeDeck();
  if (!Number.isFinite(deck.duration) || deck.duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({ duration: deck.duration, position: Math.min(deck.currentTime, deck.duration), playbackRate: 1 });
  } catch {
    /* ignore */
  }
}

function reportPlayback() {
  const { queue, index, status, position, duration } = usePlayer.getState();
  const track = queue[index]?.track;
  api.setPlaybackState({
    playing: status === 'playing' || status === 'loading',
    title: track?.title,
    artist: track ? artistLine(track) : undefined,
    // For the mini player, which floats over other apps.
    thumbnail: track?.thumbnail ? artworkAtPixels(track.thumbnail, 160) : undefined,
    position,
    duration,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--keyColor').trim() || undefined,
    seek: seekLookOf(useLibrary.getState().settings),
    upNext: queue.slice(index + 1, index + 21).map((q, i) => ({ index: index + 1 + i, title: q.track.title, artist: artistLine(q.track), thumbnail: q.track.thumbnail ? artworkAtPixels(q.track.thumbnail, 96) : undefined })),
  });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none';
}

// The mini player draws its seek bar in the chosen look: tell it when the look changes.
useLibrary.subscribe((s, before) => {
  if (JSON.stringify(seekLookOf(s.settings)) !== JSON.stringify(seekLookOf(before.settings))) reportPlayback();
});

// ---- Queue helpers ---------------------------------------------------------------------

/**
 * The songs played before the current one, most recent last: Previous returns to them, whatever
 * the queue now holds (shuffled, unshuffled, or replaced by a new list).
 */
const played: QueueItem[] = [];
let nowPlaying: QueueItem | null = null;
let goingBack = false;

/** Called whenever a song becomes the current one. */
function becameCurrent(entry: QueueItem) {
  if (!goingBack && nowPlaying && nowPlaying.uid !== entry.uid) {
    played.push(nowPlaying);
    if (played.length > 200) played.shift();
  }
  nowPlaying = entry;
}

function nextIndex(natural: boolean): number | null {
  const { queue, index, repeat } = usePlayer.getState();
  if (natural && repeat === 'one') return index;
  if (index + 1 < queue.length) return index + 1;
  if (repeat === 'all' && queue.length) return 0;
  return null;
}

let radioFor: string | null = null;

/** Autoplay: when the queue runs out, YouTube Music's radio for the last track follows. */
async function fillRadio(seed: Track, replaceUpcoming = false) {
  if (radioFor === seed.videoId) return;
  radioFor = seed.videoId;
  usePlayer.setState({ radioLoading: true });
  try {
    // Radio is YouTube Music's: a song from your files is looked up there first.
    const ytId = isYouTubeId(seed.videoId) ? seed.videoId : await api.findOnYouTube(seed.title, seed.artists[0]?.name ?? '');
    if (!ytId) return;
    const tracks = await api.upNext(ytId, `RDAMVM${ytId}`);
    const state = usePlayer.getState();
    const have = new Set(state.queue.map((q) => q.track.videoId));
    const { notInterested = [], notInterestedArtists = [] } = settings();
    const fresh = tracks.filter((t) => !have.has(t.videoId) && recommendable(t, { notInterested, notInterestedArtists })).slice(0, 40).map((t) => item(t, 'auto'));
    if (!fresh.length) return;
    // A fresh radio replaces what autoplay found before, but keeps songs you've queued meanwhile.
    const base = replaceUpcoming ? state.queue.filter((q, i) => i <= state.index || !q.auto) : state.queue;
    usePlayer.setState({ queue: [...base, ...fresh], original: state.original ? [...state.original, ...fresh] : null });
  } catch (error) {
    console.warn('autoplay radio failed', error);
    radioFor = null;
  } finally {
    usePlayer.setState({ radioLoading: false });
  }
}

/** Bumped whenever Smart Shuffle's picks no longer apply (turned off, or something else played). */
let smartFor = 0;

/**
 * Smart Shuffle: songs like the ones in the queue (YouTube Music's radio for a few of them), mixed in
 * after every third of your songs, each marked as a recommendation.
 */
async function addSmartPicks() {
  const ticket = ++smartFor;
  const { queue } = usePlayer.getState();
  const mine = queue.filter((q) => !q.auto && !q.smart).map((q) => q.track);
  const { notInterested = [], notInterestedArtists = [] } = settings();
  const picks = await recommendForPlaylist(shuffled(mine).slice(0, 12), { notInterested, notInterestedArtists }).catch(() => [] as Track[]);
  if (ticket !== smartFor || !usePlayer.getState().smart) return;
  if (!picks.length) {
    toast('No recommendations found for Smart Shuffle');
    return;
  }
  const state = usePlayer.getState();
  const head = state.queue.slice(0, state.index + 1);
  const upcoming = state.queue.slice(state.index + 1).filter((q) => !q.smart);
  const out: QueueItem[] = [];
  let used = 0;
  upcoming.forEach((q, i) => {
    out.push(q);
    // After every third of your songs (not among songs you queued to play next, nor autoplay's).
    if (!q.queued && !q.auto && (i + 1) % 3 === 0 && used < picks.length) out.push({ ...item(picks[used++]!), smart: true });
  });
  usePlayer.setState({ queue: [...head, ...out] });
  toast('Added Smart Shuffle recommendations to the queue');
}

function maybeFillRadio() {
  const { queue, index, repeat } = usePlayer.getState();
  if (!settings().autoplay || repeat !== 'off') return;
  if (index >= queue.length - 2 && queue[index]) void fillRadio(queue[queue.length - 1]!.track);
}

// ---- Loading a track ------------------------------------------------------------------

function load(index: number, autoplay = true) {
  stopFade();
  const state = usePlayer.getState();
  const entry = state.queue[index];
  if (!entry) return;
  const track = entry.track;

  if (preloaded && preloaded.uid === entry.uid) {
    // The idle deck already has it: swap.
    const previous = active;
    active = preloaded.deck;
    preloaded = null;
    resetDeck(previous);
  } else {
    resetDeck(idleIndex());
    const deck = activeDeck();
    deck.pause();
    deck.src = streamUrl(track, settings().quality);
    gains[active] = 1;
  }
  const deck = activeDeck();
  if (deck.currentTime > 0.1) deck.currentTime = 0;
  applyVolume();
  becameCurrent(entry);
  usePlayer.setState({ index, status: autoplay ? 'loading' : 'paused', error: null, position: 0, duration: track.duration ?? 0, playingAs: null });
  if (autoplay) {
    deck.play().catch((error: unknown) => {
      if ((error as Error)?.name === 'AbortError') return;
      console.warn('play() rejected', error);
    });
  }
  updateMediaSession(track);
  reportPlayback();
  useLibrary.getState().addToHistory(track);
  void readLoudness(active, track);
  maybeFillRadio();
  persistSoon();
}

/** Loads the next track onto the idle deck, so the change is instant. */
function preloadNext() {
  if (preloaded || fading) return;
  const ni = nextIndex(true);
  const state = usePlayer.getState();
  if (ni === null || ni === state.index) return;
  const entry = state.queue[ni];
  if (!entry) return;
  const idle = idleIndex();
  const deck = decks[idle]!;
  deck.src = streamUrl(entry.track, settings().quality);
  deck.volume = 0;
  gains[idle] = 1;
  preloaded = { uid: entry.uid, deck: idle };
  void readLoudness(idle, entry.track);
}

function startCrossfade(ni: number, seconds: number) {
  const entry = usePlayer.getState().queue[ni];
  if (!entry || !preloaded || preloaded.uid !== entry.uid) return false;
  const from = active;
  const to = preloaded.deck;
  preloaded = null;
  const toDeck = decks[to]!;
  const fromDeck = decks[from]!;
  toDeck.volume = 0;
  void toDeck.play().catch(() => undefined);
  active = to;
  const started = performance.now();
  const timer = setInterval(() => {
    const k = Math.min(1, (performance.now() - started) / (seconds * 1000));
    // Equal-power curves keep the loudness even through the overlap.
    fromDeck.volume = targetVolume(from) * Math.cos((k * Math.PI) / 2);
    toDeck.volume = targetVolume(to) * Math.sin((k * Math.PI) / 2);
    if (k >= 1) {
      clearInterval(timer);
      fading = null;
      resetDeck(from);
      applyVolume();
    }
  }, 50);
  fading = { timer };
  becameCurrent(entry);
  const track = entry.track;
  usePlayer.setState({ index: ni, status: 'playing', error: null, position: 0, duration: track.duration ?? 0 });
  updateMediaSession(track);
  reportPlayback();
  useLibrary.getState().addToHistory(track);
  maybeFillRadio();
  persistSoon();
  return true;
}

function onEnded() {
  const { sleep } = usePlayer.getState();
  if (sleep.endOfTrack) {
    usePlayer.setState({ sleep: { endsAt: null, endOfTrack: false }, status: 'paused' });
    reportPlayback();
    toast('Sleep timer ended. Good night.');
    const ni = nextIndex(false);
    if (ni !== null) load(ni, false);
    return;
  }
  const ni = nextIndex(true);
  if (ni === null) {
    usePlayer.setState({ status: 'paused', position: 0 });
    activeDeck().currentTime = 0;
    reportPlayback();
    return;
  }
  // Repeat one (ni is this song): loaded again from the start, which works for every source;
  // rewinding a stream that has ended doesn't always.
  load(ni, true);
}

for (const [i, deck] of decks.entries()) {
  const mine = () => i === active;
  deck.addEventListener('playing', () => {
    if (!mine()) return;
    consecutiveErrors = 0;
    usePlayer.setState({ status: 'playing', error: null });
    reportPlayback();
  });
  deck.addEventListener('pause', () => {
    if (!mine() || deck.ended) return;
    if (usePlayer.getState().status !== 'error') usePlayer.setState({ status: 'paused' });
    reportPlayback();
  });
  deck.addEventListener('waiting', () => {
    if (mine() && !deck.paused) usePlayer.setState({ status: 'loading' });
  });
  deck.addEventListener('loadedmetadata', () => {
    if (!mine()) return;
    if (Number.isFinite(deck.duration)) usePlayer.setState({ duration: deck.duration });
    // The stream is resolved by now, so what it is (and its loudness) is known.
    const track = usePlayer.getState().queue[usePlayer.getState().index]?.track;
    if (track) void readLoudness(i, track);
  });
  deck.addEventListener('timeupdate', () => {
    if (!mine()) return;
    const position = getPlayhead();
    const duration = getDuration();
    usePlayer.setState({ position });
    if (performance.now() - lastPositionState > 1000) {
      lastPositionState = performance.now();
      updatePositionState();
      reportPlayback(); // keeps the mini player's progress line current
      persistSoon();
    }
    // Under a video that's the clock, the song's own end doesn't start the next one.
    if (!duration || videoClock) return;
    const remaining = duration - position;
    if (remaining < 30) preloadNext();
    const crossfade = settings().crossfade;
    if (crossfade > 0 && !fading && remaining <= crossfade && remaining > 0.3 && !usePlayer.getState().sleep.endOfTrack) {
      const ni = nextIndex(true);
      if (ni !== null && ni !== usePlayer.getState().index) startCrossfade(ni, Math.min(crossfade, remaining));
    }
  });
  deck.addEventListener('ended', () => {
    if (!mine()) return;
    if (videoClock) songEndedUnderVideo = true;
    else onEnded();
  });
  deck.addEventListener('error', () => {
    if (!deck.getAttribute('src')) return;
    if (!mine()) {
      if (preloaded?.deck === i) resetDeck(i);
      return;
    }
    const state = usePlayer.getState();
    const track = state.queue[state.index]?.track;
    if (!track) return;
    consecutiveErrors++;
    void streamError(track).then((message) => {
      if (usePlayer.getState().queue[usePlayer.getState().index]?.track.videoId !== track.videoId) return;
      usePlayer.setState({ status: 'error', error: message });
      if (message.startsWith('Check your internet connection')) markOffline();
      reportPlayback();
      const ni = nextIndex(false);
      if (ni !== null && consecutiveErrors < 4) {
        toast(`Skipped “${track.title}”: ${message}`);
        setTimeout(() => {
          const now = usePlayer.getState();
          if (now.status === 'error' && now.queue[now.index]?.track.videoId === track.videoId) load(ni, true);
        }, 1200);
      } else {
        toast(message);
      }
    });
  });
}

// ---- Sleep timer ------------------------------------------------------------------------

setInterval(() => {
  const { sleep, status } = usePlayer.getState();
  if (!sleep.endsAt) return;
  const left = sleep.endsAt - Date.now();
  if (left <= 0) {
    usePlayer.setState({ sleep: { endsAt: null, endOfTrack: false } });
    if (status === 'playing' || status === 'loading') {
      // Drift off: fade out over eight seconds, then pause.
      const deck = activeDeck();
      const from = deck.volume;
      const started = performance.now();
      const timer = setInterval(() => {
        const k = Math.min(1, (performance.now() - started) / 8000);
        deck.volume = from * (1 - k);
        if (k >= 1) {
          clearInterval(timer);
          deck.pause();
          applyVolume();
          toast('Sleep timer ended. Good night.');
        }
      }, 100);
    }
  }
}, 1000);

// ---- Persisting the queue between launches -----------------------------------------------

const QUEUE_KEY = 'obsidian:queue';
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const { queue, index, shuffle, repeat, original } = usePlayer.getState();
    try {
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify({ queue: queue.slice(Math.max(0, index - 50), index + 200), index: Math.min(index, 50), position: getPlayhead(), shuffle, repeat, hasOriginal: !!original }),
      );
    } catch {
      /* storage may be unavailable */
    }
  }, 1500);
}

export function restoreQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { queue: QueueItem[]; index: number; position: number; shuffle: boolean; repeat: RepeatMode };
    if (!Array.isArray(saved.queue) || !saved.queue[saved.index]) return;
    usePlayer.setState({ queue: saved.queue, index: saved.index, shuffle: !!saved.shuffle, repeat: saved.repeat ?? 'off' });
    nowPlaying = saved.queue[saved.index]!;
    const track = saved.queue[saved.index]!.track;
    const deck = activeDeck();
    deck.src = streamUrl(track, settings().quality);
    deck.preload = 'metadata';
    if (saved.position > 0) {
      const seekOnce = () => {
        deck.currentTime = Math.min(saved.position, (deck.duration || saved.position) - 1);
        deck.removeEventListener('loadedmetadata', seekOnce);
        deck.preload = 'auto';
      };
      deck.addEventListener('loadedmetadata', seekOnce);
    }
    usePlayer.setState({ status: 'paused', position: saved.position || 0, duration: track.duration ?? 0 });
    updateMediaSession(track);
    void readLoudness(active, track);
  } catch {
    /* a broken saved queue is ignored */
  }
}

// ---- The store ------------------------------------------------------------------------------

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: -1,
  original: null,
  status: 'idle',
  error: null,
  position: 0,
  duration: 0,
  shuffle: false,
  smart: false,
  repeat: 'off',
  volume: 0.8,
  muted: false,
  source: null,
  sleep: { endsAt: null, endOfTrack: false },
  radioLoading: false,
  playingAs: null,

  playTracks: (tracks, start = 0, options = {}) => {
    if (!tracks.length) return;
    radioFor = null;
    smartFor += 1;
    set({ smart: false });
    const items = tracks.map((t) => item(t));
    if (options.shuffle) {
      const order = shuffled(items);
      set({ queue: order, original: items, shuffle: true, source: options.source ?? null });
      load(0);
      return;
    }
    if (get().shuffle) {
      const first = items[start]!;
      const rest = shuffled(items.filter((_, i) => i !== start));
      set({ queue: [first, ...rest], original: items, source: options.source ?? null });
      load(0);
      return;
    }
    set({ queue: items, original: null, source: options.source ?? null });
    load(Math.min(start, items.length - 1));
  },

  startRadio: (track) => {
    radioFor = null;
    smartFor += 1;
    set({ queue: [item(track)], original: null, shuffle: false, smart: false, source: { label: `${track.title} Radio` } });
    load(0);
    void fillRadio(track, true);
  },

  playNext: (tracks) => {
    const { queue, index, original } = get();
    if (index < 0) return get().playTracks(tracks);
    const items = tracks.map((t) => item(t, 'queued'));
    set({ queue: [...queue.slice(0, index + 1), ...items, ...queue.slice(index + 1)], original: original ? [...original, ...items] : null });
    preloaded && resetDeck(preloaded.deck);
  },

  addToQueue: (tracks) => {
    const { queue, index, original } = get();
    if (index < 0) return get().playTracks(tracks);
    const items = tracks.map((t) => item(t, 'queued'));
    // After what's already queued, before the rest of the album, playlist or the autoplay songs.
    let at = index + 1;
    while (queue[at]?.queued) at++;
    set({ queue: [...queue.slice(0, at), ...items, ...queue.slice(at)], original: original ? [...original, ...items] : null });
    if (at === index + 1 && preloaded) resetDeck(preloaded.deck);
  },

  jumpTo: (index) => {
    if (get().queue[index]) load(index, true);
  },

  removeAt: (index) => {
    const { queue, index: current, original } = get();
    if (index === current) return;
    const removed = queue[index];
    const next = queue.filter((_, i) => i !== index);
    set({ queue: next, index: index < current ? current - 1 : current, original: original && removed ? original.filter((q) => q.uid !== removed.uid) : original });
    if (preloaded?.uid === removed?.uid) resetDeck(preloaded!.deck);
  },

  move: (from, to) => {
    const { queue, index } = get();
    if (from === index || to <= index) return;
    const next = queue.slice();
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    set({ queue: next });
    if (preloaded) resetDeck(preloaded.deck);
  },

  clearUpcoming: () => {
    const { queue, index } = get();
    set({ queue: queue.slice(0, index + 1), original: null });
    if (preloaded) resetDeck(preloaded.deck);
  },

  togglePlay: () => {
    const { status, index } = get();
    if (index < 0) return;
    if (status === 'playing' || status === 'loading') get().pause();
    else get().play();
  },

  play: () => {
    const { index, status } = get();
    if (index < 0) return;
    if (status === 'error') {
      load(index, true);
      return;
    }
    const deck = activeDeck();
    if (!deck.getAttribute('src')) {
      load(index, true);
      return;
    }
    stopFade();
    applyVolume();
    set({ status: 'loading' });
    deck.play().catch(() => set({ status: 'paused' }));
  },

  pause: () => {
    stopFade();
    activeDeck().pause();
    set({ status: 'paused' });
    reportPlayback();
  },

  next: () => {
    const ni = nextIndex(false);
    if (ni !== null) load(ni, true);
    else if (get().radioLoading) toast('Finding what to play next…');
  },

  previous: () => {
    const { index, queue } = get();
    if (getPlayhead() > 3) {
      get().seek(0);
      return;
    }
    // The song played before this one, wherever it is in the queue now.
    const back = played.pop();
    if (!back) {
      if (index <= 0) get().seek(0);
      else load(index - 1, true);
      return;
    }
    let at = queue.findIndex((q) => q.uid === back.uid);
    if (at < 0) {
      // No longer in the queue (a new list replaced it): back just before the current song.
      set({ queue: [...queue.slice(0, index), back, ...queue.slice(index)] });
      if (preloaded) resetDeck(preloaded.deck);
      at = index;
    }
    goingBack = true;
    try {
      load(at, true);
    } finally {
      goingBack = false;
    }
  },

  seek: (seconds) => {
    if (videoClock) {
      videoClock.seek(Math.max(0, seconds));
      set({ position: seconds });
      return;
    }
    const deck = activeDeck();
    stopFade();
    const duration = getDuration();
    deck.currentTime = Math.max(0, Math.min(seconds, duration ? duration - 0.25 : seconds));
    set({ position: deck.currentTime });
    updatePositionState();
  },

  setVolume: (volume) => {
    const v = Math.max(0, Math.min(1, volume));
    set({ volume: v, muted: false });
    applyVolume();
    volumeSaveSoon(v);
  },

  toggleMute: () => {
    set((s) => ({ muted: !s.muted }));
    applyVolume();
  },

  toggleShuffle: () => {
    // Off → Shuffle → Smart Shuffle (when it's on in Settings) → off.
    if (get().shuffle && !get().smart && settings().smartShuffle !== false && isElectron && navigator.onLine) {
      set({ smart: true });
      void addSmartPicks();
      return;
    }
    if (get().smart) {
      smartFor += 1;
      const { queue, index } = get();
      const current = queue[index];
      const kept = queue.filter((q, i) => !q.smart || i === index);
      set({ smart: false, queue: kept, index: current ? kept.indexOf(current) : index });
      toast('Removed Smart Shuffle recommendations');
    }
    const { shuffle, queue, index, original } = get();
    if (preloaded) resetDeck(preloaded.deck);
    if (!shuffle) {
      // Songs you queued stay next, in order; the rest is shuffled, with autoplay's still last.
      const upcoming = queue.slice(index + 1);
      const rest = [...shuffled(upcoming.filter((q) => !q.queued && !q.auto)), ...shuffled(upcoming.filter((q) => q.auto))];
      set({ shuffle: true, original: queue, queue: [...queue.slice(0, index + 1), ...upcoming.filter((q) => q.queued), ...rest] });
    } else {
      const current = queue[index];
      if (original && current) {
        // Back to the original order, with the songs you queued (still to come) right after this one.
        const queuedUp = queue.slice(index + 1).filter((q) => q.queued);
        const moving = new Set(queuedUp.map((q) => q.uid));
        if (current.queued) moving.add(current.uid);
        const rest = original.filter((q) => !moving.has(q.uid));
        // Where to pick up: this song's place, or (for a queued one) the last song played before it.
        let at = -1;
        for (let i = index; i >= 0 && at < 0; i--) at = moving.has(queue[i]!.uid) ? -1 : rest.findIndex((q) => q.uid === queue[i]!.uid);
        const head = rest.slice(0, at + 1);
        const next = current.queued ? [...head, current, ...queuedUp, ...rest.slice(at + 1)] : [...head, ...queuedUp, ...rest.slice(at + 1)];
        set({ shuffle: false, queue: next, index: next.indexOf(current), original: null });
      } else {
        set({ shuffle: false });
      }
    }
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ['off', 'all', 'one'];
    const repeat = order[(order.indexOf(get().repeat) + 1) % order.length]!;
    if (repeat === 'all') {
      // Repeat all loops the songs you chose: the radio autoplay added after them, not yet played, goes.
      // A radio (one song you picked, the rest autoplay) keeps its list and loops that.
      const { queue, index, original } = get();
      const chosen = queue.filter((q) => !q.auto).length;
      const kept = chosen > 1 ? queue.filter((q, i) => i <= index || !q.auto) : queue;
      if (kept.length !== queue.length) {
        const keep = new Set(kept.map((q) => q.uid));
        set({ queue: kept, original: original ? original.filter((q) => keep.has(q.uid)) : null });
        radioFor = null;
      }
    }
    set({ repeat });
    if (preloaded) resetDeck(preloaded.deck);
    if (repeat === 'off') maybeFillRadio();
  },

  setSleepTimer: (minutes) => {
    set({ sleep: { endsAt: minutes ? Date.now() + minutes * 60_000 : null, endOfTrack: false } });
    if (minutes) toast(`Sleep timer set for ${minutes >= 60 ? `${minutes / 60} hour${minutes > 60 ? 's' : ''}` : `${minutes} minutes`}.`);
  },

  setSleepEndOfTrack: () => {
    set({ sleep: { endsAt: null, endOfTrack: true } });
    toast('Playback will stop at the end of this track.');
  },
}));

let volumeTimer: ReturnType<typeof setTimeout> | null = null;
function volumeSaveSoon(volume: number) {
  if (volumeTimer) clearTimeout(volumeTimer);
  volumeTimer = setTimeout(() => useLibrary.getState().updateSettings({ volume }), 600);
}

// Media keys, the Windows media overlay and the taskbar buttons all land here.
if ('mediaSession' in navigator) {
  const s = () => usePlayer.getState();
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => s().play()],
    ['pause', () => s().pause()],
    ['previoustrack', () => s().previous()],
    ['nexttrack', () => s().next()],
    ['stop', () => s().pause()],
    ['seekto', (d) => d.seekTime !== undefined && s().seek(d.seekTime)],
    ['seekbackward', (d) => s().seek(getPlayhead() - (d.seekOffset ?? 10))],
    ['seekforward', (d) => s().seek(getPlayhead() + (d.seekOffset ?? 10))],
  ];
  for (const [action, handler] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* unsupported action */
    }
  }
}

// A song picked in the mini player's Up Next.
api.onJumpTo((index) => usePlayer.getState().jumpTo(index));
api.onSeekTo((seconds) => usePlayer.getState().seek(seconds));

api.onCommand((command) => {
  const s = usePlayer.getState();
  if (command === 'play-pause') s.togglePlay();
  else if (command === 'next') s.next();
  else if (command === 'previous') s.previous();
  else if (command === 'volume-up') s.setVolume(s.volume + 0.05);
  else if (command === 'volume-down') s.setVolume(s.volume - 0.05);
  else if (command === 'like') {
    const track = s.queue[s.index]?.track;
    if (track) toast(useLibrary.getState().toggleLike(track) ? `Liked “${track.title}”` : `Removed “${track.title}” from Liked Songs`);
  }
});
