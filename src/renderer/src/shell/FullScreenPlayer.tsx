import { usePowerSaving } from '@/lib/power';
import { hasViewTransitions, transition } from '@/lib/motion';
import { markStep } from '@/lib/checklist';
import { ShuffleGlyph } from '@/components/ShuffleGlyph';
import { ChevronDown, Clapperboard, Ellipsis, Proportions, ListMusic, Maximize, MicVocal, Minimize, Plus, Repeat, Repeat1, SlidersVertical, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { Artwork } from '@/components/Artwork';
import { ExplicitBadge, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from '@/components/icons';
import { LikeButton } from '@/components/LikeButton';
import { ArtistLinks } from '@/components/Links';
import { trackMenu } from '@/components/trackActions';
import { api } from '@/lib/api';
import { largeArtwork } from '@/lib/artwork';
import { openMenuAt } from '@/state/menu';
import { albumRoute, go } from '@/state/nav';
import { usePlayer } from '@/state/player';
import { toast, useUi } from '@/state/ui';
import { NowPlayingQuality } from '@/components/QualityBadge';
import { rgb, tintFor } from '@/lib/palette';
import { useLibrary } from '@/state/library';
import { useOnline } from '@/state/online';
import type { OnlineMusicVideo, VideoQuality } from '@shared/types';
import { LyricsView } from './LyricsView';
import { MusicVideo } from './MusicVideo';
import { ArtworkBackdrop, MeshBackdrop, SolidBackdrop } from './MeshBackdrop';
import { SleepCountdown, SleepTimerButton } from './SleepTimer';
import { PlaybackSpeedButton } from './PlaybackSpeed';
import { UpNext } from './UpNext';
import { useScrubber } from './useScrubber';
import { SeekTrack, useSeekLook } from '@/components/SeekTrack';
import { VolumeIcon, VolumeSlider } from './VolumeControl';

/** The seek bar: a thick rounded track that thickens further under the pointer. */
/** The full-screen player's seek bar (and the music video's), in the look chosen in Settings. */
function Scrubber() {
  const { bar, elapsed, remaining, dragging, handlers } = useScrubber();
  const look = useSeekLook();
  const playing = usePlayer((s) => s.status === 'playing');
  return (
    <div className="group/scrub mt-5" data-dragging={dragging || undefined}>
      <div className="relative flex cursor-pointer touch-none items-center" {...handlers}>
        <SeekTrack look={look} playing={playing} barRef={bar} />
      </div>
      <div className={`mt-1 flex justify-between type-[500_12px/14px] tabular-nums text-tertiary ${look.times ? '' : 'hidden'}`}>
        <span ref={elapsed} />
        <span ref={remaining} />
      </div>
    </div>
  );
}

const round = 'relative grid place-items-center rounded-full transition-[background-color,scale,color] duration-150 enabled:active:scale-90 disabled:opacity-35';
/** Buttons inside the clear-glass action capsule: glyphs that light up when on. */
// On (Up Next, Lyrics, Equalizer): the glyph lights up with a small dot beneath, as in the player bar; no extra bubble.
const actionButton = `${round} size-10 text-secondary hover:bg-white/10 hover:text-primary aria-pressed:text-primary aria-pressed:after:absolute aria-pressed:after:bottom-0.5 aria-pressed:after:size-1 aria-pressed:after:rounded-full aria-pressed:after:bg-current`;
/** A free-standing clear-glass circle (Liquid Glass's clear variant, made for controls over media). */
const glassCircle = `glass glow elastic ${round} text-primary`;

function Transport() {
  const track = usePlayer((s) => s.queue[s.index]?.track ?? null);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'loading');
  const hasNext = usePlayer((s) => s.index + 1 < s.queue.length || s.repeat === 'all' || s.radioLoading);
  const shuffle = usePlayer((s) => s.shuffle);
  const smart = usePlayer((s) => s.smart);
  const repeat = usePlayer((s) => s.repeat);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat } = usePlayer.getState();
  return (
    <div className="mx-auto mt-3 flex w-full max-w-[400px] items-center justify-between">
<button className={`${round} size-11 text-tertiary hover:text-primary aria-pressed:text-primary`} aria-label={smart ? 'Smart Shuffle' : 'Shuffle'} aria-pressed={shuffle} title={smart ? 'Smart Shuffle: recommendations mixed in (click to turn off)' : shuffle ? 'Shuffle (click again for Smart Shuffle)' : 'Shuffle (S)'} onClick={toggleShuffle}>
            <ShuffleGlyph smart={smart} size={20} />
          </button>
      {/* Clear glass over the artwork's colours; play is the one filled, primary control. */}
      <button className={`${glassCircle} size-14`} disabled={!track} aria-label="Previous" onClick={previous}>
        <PreviousGlyph size={24} className="relative z-1" />
      </button>
      <button
        data-elastic="0.8"
        className={`${round} elastic size-[72px] bg-white/90 text-black shadow-[0_10px_34px_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.9),inset_0_-1px_1px_rgb(0_0_0/0.12)] hover:bg-white`}
        disabled={!track}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={togglePlay}
      >
        {playing ? <PauseGlyph key="pause" size={30} className="animate-glyph" /> : <PlayGlyph key="play" size={30} className="animate-glyph" />}
      </button>
      <button className={`${glassCircle} size-14`} disabled={!track || !hasNext} aria-label="Next" onClick={next}>
        <NextGlyph size={24} className="relative z-1" />
      </button>
      <button className={`${round} size-11 text-tertiary hover:text-primary aria-pressed:text-primary`} aria-label={`Repeat ${repeat}`} aria-pressed={repeat !== 'off'} onClick={cycleRepeat}>
        {repeat === 'one' ? <Repeat1 size={20} strokeWidth={2.2} /> : <Repeat size={20} strokeWidth={2.2} />}
      </button>
    </div>
  );
}

/** Over a music video: the song, play / pause and skip, and the seek bar, on one piece of glass. */
function VideoControls({ hidden }: { hidden: boolean }) {
  const track = usePlayer((s) => s.queue[s.index]?.track ?? null);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'loading');
  const hasNext = usePlayer((s) => s.index + 1 < s.queue.length || s.repeat === 'all' || s.radioLoading);
  const { togglePlay, next, previous } = usePlayer.getState();
  if (!track) return null;
  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-30 bg-[linear-gradient(transparent,rgb(0_0_0/0.55))] px-[clamp(16px,4vw,48px)] pt-16 pb-5 transition-opacity duration-500 ${hidden ? 'pointer-events-none opacity-0' : ''}`}
    >
      <div className="glass mx-auto max-w-[920px] rounded-[24px] px-5 pt-3 pb-2">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="truncate type-body-emphasized text-primary">{track.title}</div>
            <div className="truncate type-callout text-secondary">{track.artists.map((a) => a.name).join(', ')}</div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <button className={`${round} size-10 text-primary hover:bg-white/10`} aria-label="Previous" onClick={previous}>
              <PreviousGlyph size={20} />
            </button>
            <button className={`${round} size-12 bg-white/90 text-black hover:bg-white`} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
              {playing ? <PauseGlyph key="pause" size={22} className="animate-glyph" /> : <PlayGlyph key="play" size={22} className="animate-glyph" />}
            </button>
            <button className={`${round} size-10 text-primary hover:bg-white/10`} disabled={!hasNext} aria-label="Next" onClick={next}>
              <NextGlyph size={20} />
            </button>
          </div>
          <div className="flex-1" />
        </div>
        <div className="-mt-3">
          <Scrubber />
        </div>
      </div>
    </div>
  );
}

/** Narrow or portrait windows get the one-column layout. */
function useStacked() {
  const test = () => window.innerWidth < 960 || window.innerWidth / window.innerHeight < 1.05;
  const [stacked, setStacked] = useState(test);
  useEffect(() => {
    const onResize = () => setStacked(test());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return stacked;
}

/** How a video height is named: 4K, 2K, Full HD, HD, else its height. */
function qualityName(h: number): string {
  const name = h >= 4320 ? '8K' : h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 1080 ? 'Full HD' : h >= 720 ? 'HD' : '';
  return name ? `${h}p (${name})` : `${h}p`;
}

/**
 * The immersive player: artwork, names, seek bar and transport on the left;
 * lyrics or the queue on the right; all over a moving mesh of the artwork's colours.
 */
export function FullScreenPlayer() {
  const track = usePlayer((s) => s.queue[s.index]?.track ?? null);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'loading');
  const status = usePlayer((s) => s.status);
  const error = usePlayer((s) => s.error);
  const setFullScreen = useUi((s) => s.setFullScreen);
  const [panel, setPanel] = useState<'lyrics' | 'queue' | null>('lyrics');
  const stacked = useStacked();
  const [windowFull, setWindowFull] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const eqOn = useLibrary((s) => s.settings.eq.enabled);
  const backdrop = useLibrary((s) => s.settings.backdrop);
  // Windows' "Animation effects" off holds the backdrop still.
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saving = usePowerSaving();
  const motion = useLibrary((s) => (reduceMotion || saving ? 0 : s.settings.backdropMotion));
  const artScale = useLibrary((s) => s.settings.artworkScale) || 1;
  const [solid, setSolid] = useState<string | null>(null);
  // This song's music video: one you attached, or else its video on YouTube; and whether it's on screen.
  const [attachedUrl, setAttachedUrl] = useState<string | null>(null);
  const [found, setFound] = useState<OnlineMusicVideo | null>(null);
  // Video mode is the app's, not this screen's: closing the player and coming back keeps it, and the
  // next song shows its video too when it has one.
  const videoMode = useUi((s) => s.videoMode);
  const setShowVideo = (on: boolean | ((was: boolean) => boolean)) => useUi.getState().setVideoMode(typeof on === 'function' ? on(useUi.getState().videoMode) : on);
  // On while video mode is, for a song that has a video.
  const showVideo = videoMode && !!(attachedUrl || found);
  // Once opened, the video stays loaded (paused while hidden), so switching back is instant.
  const [videoLoaded, setVideoLoaded] = useState(false);
  useEffect(() => {
    if (showVideo) setVideoLoaded(true);
  }, [showVideo]);
  const videoQuality = useLibrary((s) => s.settings.videoQuality) ?? 'auto';
  // A height above Full HD that won't play here steps down to Full HD once (for that video).
  const [steppedDown, setSteppedDown] = useState<string | null>(null);
  // Auto: Full HD, or 480p when saving data (Low audio quality, or the system's data saver).
  const savingData = useLibrary((s) => s.settings.quality === 'low') || !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const wantedHeight = videoQuality === 'auto' ? (savingData ? 480 : 1080) : steppedDown === found?.videoId ? Math.min(videoQuality, 1080) : videoQuality;
  const videoAttached = !!attachedUrl;
  const videoUrl = attachedUrl ?? (found ? `ytstream://track/${encodeURIComponent(found.videoId)}?q=video&h=${wantedHeight}` : null);
  // What the playing video offers, and the height on screen (known once it has loaded).
  const [heights, setHeights] = useState<{ heights: number[]; active?: number } | null>(null);
  useEffect(() => {
    setHeights(null);
    if (!showVideo || !found) return;
    let stop = false;
    const look = () => void api.videoHeights(found.videoId).then((h) => !stop && h && setHeights(h));
    const timers = [1500, 4000, 9000].map((ms) => window.setTimeout(look, ms));
    return () => {
      stop = true;
      timers.forEach(clearTimeout);
    };
  }, [showVideo, found, wantedHeight]);
  const videoKey = track?.videoId;
  const online = useOnline((s) => s.online);
  // The "may not be in sync" note: shown when the video opens, then it fades away.
  const unsynced = showVideo && !videoAttached && !!found && !found.synced;
  const videoFit = useLibrary((s) => s.settings.videoFit) || 'fit';
  // While the video is on, the controls (and the pointer) fade away when the mouse rests.
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    setIdle(false);
    if (!showVideo) return;
    let timer = window.setTimeout(() => setIdle(true), 2500);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2500);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [showVideo]);
  const hidden = showVideo && idle;
  useEffect(() => {
    // The window's own buttons fade too.
    if (hidden) document.documentElement.dataset.videoIdle = '';
    else delete document.documentElement.dataset.videoIdle;
    return () => void delete document.documentElement.dataset.videoIdle;
  }, [hidden]);
  const [syncNote, setSyncNote] = useState(false);
  useEffect(() => {
    setSyncNote(unsynced);
    if (!unsynced) return;
    const timer = setTimeout(() => setSyncNote(false), 6000);
    return () => clearTimeout(timer);
  }, [unsynced, found?.videoId]);
  useEffect(() => {
    setVideoLoaded(false);
    setAttachedUrl(null);
    setFound(null);
    if (!videoKey) return;
    let alive = true;
    void (async () => {
      const attached = await api.musicVideo(videoKey).catch(() => null);
      if (!alive) return;
      if (attached) {
        setAttachedUrl(attached);
        return;
      }
      const song = usePlayer.getState().queue[usePlayer.getState().index]?.track;
      if (!online || !song || song.videoId !== videoKey) return;
      const found = await api.onlineMusicVideo(song).catch(() => null);
      if (alive) setFound(found);
    })();
    return () => {
      alive = false;
    };
  }, [videoKey, online]);
  const artUrl = track ? (largeArtwork(track.thumbnail) ?? track.thumbnail) : undefined;

  useEffect(() => {
    if (backdrop !== 'solid' || !track?.thumbnail) return;
    let alive = true;
    tintFor(track.thumbnail).then((c) => alive && setSolid(rgb(c)), () => undefined);
    return () => {
      alive = false;
    };
  }, [backdrop, track?.thumbnail]);

  useEffect(() => api.onFullScreenChange(setWindowFull), []);

  useEffect(() => {
    if (!track) setFullScreen(false);
  }, [track, setFullScreen]);

  if (!track) return null;
  const column = panel !== null;
  // Opening, closing or switching the panel is a view transition: the player column glides between
  // its places, lyrics fade in from the side and Up Next rises from below. The parts are named only
  // for this transition, so closing the full-screen player itself stays one clean crossfade.
  const toggle = (p: 'lyrics' | 'queue') => {
    const root = document.documentElement;
    root.dataset.panelMotion = '';
    transition(() => setPanel((on) => (on === p ? null : p)));
    window.setTimeout(() => delete root.dataset.panelMotion, 900);
  };
  const close = () => {
    if (windowFull) void api.toggleFullScreen();
    setFullScreen(false);
  };

  return (
    <div
      className={`fixed inset-0 z-50 isolate ${hasViewTransitions ? '' : 'animate-enter'} overflow-hidden text-primary ${
        stacked
          ? '[--art:max(200px,min(calc(88vw*var(--art-scale)),calc(100vh-420px),calc(520px*var(--art-scale))))] [--col:min(92vw,500px)]'
          : '[--art:max(240px,min(calc(36vw*var(--art-scale)),calc(100vh-404px),calc(640px*var(--art-scale))))] [--col:max(var(--art),340px)]'
      }`}
      style={{ '--art-scale': artScale } as CSSProperties}
      data-immersive
      data-cursor-hidden={hidden || undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
    >
      {/* Under the video the backdrop is kept but not drawn (and stands still): hidden, not removed, so
          switching back to it is instant. */}
      <div className={showVideo && videoUrl ? 'invisible contents' : 'contents'}>
        {backdrop === 'artwork' ? (
          <ArtworkBackdrop artworkUrl={artUrl} speed={playing && !showVideo ? motion : 0} />
        ) : backdrop === 'solid' ? (
          <SolidBackdrop color={solid} />
        ) : (
          <MeshBackdrop artworkUrl={artUrl} playing={playing && !showVideo} speed={motion} />
        )}
      </div>
      {videoLoaded && videoUrl && (
        <MusicVideo
          active={showVideo}
          url={videoUrl}
          // In time with the song: the song is heard, as before. Not in time: the video's own sound,
          // with the song going on silently.
          audioUrl={!videoAttached && found && !found.synced ? `ytstream://track/${encodeURIComponent(found.videoId)}?q=high` : null}
          fit={videoFit}
          {...(!videoAttached && found?.timeMap && { timeMap: found.timeMap })}
          onClose={() => setShowVideo(false)}
          onError={() => {
            if (found && wantedHeight > 1080 && steppedDown !== found.videoId) {
              setSteppedDown(found.videoId);
              toast('That quality won’t play here: showing Full HD');
              return;
            }
            setShowVideo(false);
            toast('The music video couldn’t be loaded');
          }}
        />
      )}
      {showVideo && videoUrl && <VideoControls hidden={hidden} />}
      {unsynced && found && (
        <div className={`pointer-events-none absolute inset-x-0 top-[60px] z-30 flex justify-center px-4 transition-opacity duration-700 ${syncNote ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!syncNote}>
          <div className="glass max-w-[560px] animate-rise rounded-pill px-4 py-1.5 text-center type-callout text-secondary">
            The {found.kind === 'lyric' ? 'lyric video' : 'official video'}{found.channel ? ` from ${found.channel}` : ''} isn’t the same length as the song, so it plays with its own sound.
          </div>
        </div>
      )}
      {/* The window's drag strip, with the close, music video and full-screen buttons. */}
      <div className={`app-drag absolute inset-x-0 top-0 z-30 flex h-[52px] items-center pl-3 transition-opacity duration-500 ${hidden ? 'pointer-events-none opacity-0' : ''}`}>
        {/* Related controls share one piece of glass. */}
        <div className="glass app-no-drag relative flex items-center gap-0.5 rounded-pill p-[3px]">
        <button className="relative grid size-8 place-items-center rounded-full text-secondary hover:bg-white/12 hover:text-primary" aria-label="Close (Esc)" title="Close (Esc)" onClick={close}>
          <ChevronDown size={22} />
        </button>
        {videoUrl && (
          <button
            className="relative grid size-8 animate-glyph place-items-center rounded-full text-secondary hover:bg-white/12 hover:text-primary aria-pressed:bg-white/16 aria-pressed:text-primary"
            aria-label={showVideo ? 'Hide the music video' : 'Show the music video'}
            aria-pressed={showVideo}
            title={
              showVideo
                ? 'Hide the music video (Esc)'
                : !videoAttached && found?.kind === 'lyric'
                  ? `Lyric video${found.synced ? '' : ' (may not be in sync with the song)'}`
                  : !videoAttached && found && !found.synced
                    ? 'Official music video (may not be in sync with the song)'
                    : 'Music video'
            }
            onClick={() => (markStep('video'), setShowVideo((v) => !v))}
          >
            <Clapperboard size={16} />
          </button>
        )}
        {showVideo && !videoAttached && found && (
          <button
            className="relative flex h-8 animate-glyph items-center gap-1 rounded-full pr-2 pl-2.5 type-callout-emphasized text-secondary tabular-nums hover:bg-white/12 hover:text-primary"
            aria-label={`Video quality: ${videoQuality === 'auto' ? 'Auto' : qualityName(videoQuality)}`}
            title="Video quality"
            onClick={(e) => {
              const set = (videoQuality: VideoQuality) => {
                setSteppedDown(null);
                useLibrary.getState().updateSettings({ videoQuality });
              };
              // Every height this video offers, largest first (or the usual ones until it has loaded).
              const offered = heights?.heights.length ? heights.heights : [1080, 720, 480, 360];
              openMenuAt(
                e.currentTarget,
                [
                  { header: 'Video quality' },
                  { label: `Auto${videoQuality === 'auto' && heights?.active ? ` (${qualityName(heights.active)})` : ' (up to Full HD)'}`, hint: videoQuality === 'auto' ? '✓' : undefined, onSelect: () => set('auto') },
                  ...offered.map((q) => ({ label: qualityName(q), hint: q === videoQuality ? '✓' : undefined, onSelect: () => set(q) })),
                ],
                'below-start',
              );
            }}
          >
            {videoQuality === 'auto' ? `Auto${heights?.active ? ` · ${heights.active}p` : ''}` : `${videoQuality}p`} <ChevronDown size={13} className="opacity-70" />
          </button>
        )}
        {showVideo && (
          <>
            <button
              className="relative grid size-8 animate-glyph place-items-center rounded-full text-secondary hover:bg-white/12 hover:text-primary"
              aria-label="Video size"
              title="Video size"
              onClick={(e) =>
                openMenuAt(
                  e.currentTarget,
                  [
                    { header: 'Video size' },
                    ...(
                      [
                        ['fit', 'Original ratio (the whole video, as large as fits)'],
                        ['fill', 'Fill the screen (crops the edges)'],
                        ['75', '75%'],
                        ['50', '50%'],
                      ] as const
                    ).map(([value, label]) => ({
                      label,
                      hint: value === videoFit ? '✓' : undefined,
                      onSelect: () => useLibrary.getState().updateSettings({ videoFit: value }),
                    })),
                  ],
                  'below-start',
                )
              }
            >
              <Proportions size={16} />
            </button>
          </>
        )}
        <button
          className="relative grid size-8 place-items-center rounded-full text-secondary hover:bg-white/12 hover:text-primary"
          aria-label={windowFull ? 'Exit full screen' : 'Full screen'}
          title={windowFull ? 'Exit full screen (F11)' : 'Full screen (F11)'}
          onClick={() => void api.toggleFullScreen().then(setWindowFull)}
        >
          {windowFull ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
        </div>
      </div>

      {/* Wide windows: player and lyrics side by side, centred. Narrow or portrait windows:
          one column, and the lyrics or queue take the artwork's place. Not drawn under a video. */}
      <div
        className={
          (showVideo && videoUrl ? 'invisible ' : '') +
          (stacked
            ? 'flex h-full flex-col items-center justify-center gap-5 px-5 pt-14 pb-8'
            : `grid h-full items-center justify-center gap-x-[clamp(40px,6vw,120px)] px-[clamp(28px,6vw,120px)] pt-14 pb-10 ${column ? 'grid-cols-[var(--col)_minmax(0,760px)]' : 'grid-cols-[var(--col)]'}`)
        }
      >
        <section className={`np-column flex w-(--col) min-w-0 flex-none flex-col ${stacked && column ? 'order-2' : ''}`} aria-label="Player">
          {/* A touch smaller while paused. */}
          {/* view-transition-name: the artwork grows out of the mini player's and shrinks back into it. */}
          <div className={`relative mx-auto aspect-square w-(--art) transition-[scale] duration-500 ${stacked && column ? 'hidden' : ''} ease-[cubic-bezier(0.34,1.3,0.64,1)] ${playing ? '' : 'scale-[0.93]'}`} style={{ viewTransitionName: 'np-art' }}>
            <img
              src={largeArtwork(track.thumbnail) ?? track.thumbnail}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 -z-1 size-full translate-y-4 scale-95 rounded-[16px] object-cover opacity-55 blur-[34px] saturate-200"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
            <Artwork url={largeArtwork(track.thumbnail) ?? track.thumbnail} size={620} radius="lg" className="size-full rounded-[16px] shadow-[0_24px_60px_rgb(0_0_0/0.45)]" />
          </div>

          <div className="mt-[clamp(18px,3vh,30px)] flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center">
                <button
                  className="truncate type-[700_24px/30px] tracking-apple hover:underline"
                  onClick={() => {
                    if (track.album?.id) {
                      setFullScreen(false);
                      go(albumRoute(track.album.id));
                    }
                  }}
                >
                  {track.title}
                </button>
                {track.explicit && <ExplicitBadge />}
              </div>
              {status === 'error' ? (
                <span className="truncate type-title-3 text-key">{error}</span>
              ) : (
                <span className="truncate type-title-3 text-secondary" onClick={() => setFullScreen(false)}>
                  <ArtistLinks artists={track.artists} />
                  {track.album?.name && <span className="text-tertiary"> — {track.album.name}</span>}
                </span>
              )}
              <NowPlayingQuality detailed className="mt-1" />
              <SleepCountdown className="type-callout-medium text-tertiary" />
            </div>
            <LikeButton track={track} size={19} className="glass elastic relative size-10 flex-none rounded-full text-primary aria-pressed:text-key" />
            <button
              className={`${glassCircle} size-10 flex-none`}
              aria-label="More"
              onClick={(e) =>
                openMenuAt(
                  e.currentTarget,
                  [
                    ...trackMenu(track),
                    { separator: true },
                    {
                      label: videoAttached ? 'Change music video…' : 'Attach a music video…',
                      icon: <Clapperboard size={16} />,
                      onSelect: () =>
                        void api.attachMusicVideo(track.videoId, track.title).then((url) => {
                          if (!url) return;
                          setAttachedUrl(url);
                          setShowVideo(true);
                          toast(`Music video attached to “${track.title}”`);
                        }),
                    },
                    ...(videoAttached
                      ? [
                          {
                            label: 'Remove music video',
                            destructive: true,
                            onSelect: () =>
                              void api.removeMusicVideo(track.videoId).then(() => {
                                setShowVideo(false);
                                setAttachedUrl(null);
                              }),
                          },
                        ]
                      : []),
                  ],
                  'above-end',
                )
              }
            >
              <Ellipsis size={19} className="relative z-1" />
            </button>
          </div>

          <Scrubber />
          <Transport />

          {/* The action row: queue, lyrics, add to playlist, sleep timer — and the volume.
              Volume doesn't pop up over anything: the same piece of glass morphs into a slider,
              the way Apple's controls change shape in place, and morphs back when the pointer
              leaves or you press ✕. */}
          <div className="glass relative mx-auto mt-5 flex h-12 w-full max-w-[400px] items-center rounded-pill p-1" onPointerLeave={() => setVolumeOpen(false)}>
            {volumeOpen ? (
              <div key="volume" className="flex w-full animate-fade-in items-center gap-2">
                <button
                  className={`${actionButton} flex-none`}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  title={muted ? 'Unmute' : 'Mute'}
                  onClick={() => usePlayer.getState().toggleMute()}
                >
                  <VolumeIcon size={20} />
                </button>
                <VolumeSlider thick className="min-w-0 flex-1" />
                <span className="w-8 flex-none text-right type-[500_12px/14px] text-tertiary tabular-nums">{muted ? 0 : Math.round(volume * 100)}</span>
                <button className={`${actionButton} flex-none`} aria-label="Done" title="Done" autoFocus onClick={() => setVolumeOpen(false)}>
                  <X size={19} />
                </button>
              </div>
            ) : (
              <div key="actions" className="flex w-full animate-fade-in items-center justify-between">
                <button className={actionButton} aria-label="Up Next" aria-pressed={panel === 'queue'} title="Up Next" onClick={() => toggle('queue')}>
                  <ListMusic size={20} />
                </button>
                <button className={actionButton} aria-label="Lyrics" aria-pressed={panel === 'lyrics'} title="Lyrics" onClick={() => toggle('lyrics')}>
                  <MicVocal size={19} />
                </button>
                <button className={actionButton} aria-label="Add to playlist" title="Add to playlist" onClick={() => useUi.getState().openDialog({ kind: 'add-to-playlist', tracks: [track] })}>
                  <Plus size={21} />
                </button>
                <PlaybackSpeedButton className={actionButton} size={19} />
                <SleepTimerButton className={actionButton} size={19} />
                <button className={actionButton} aria-label="Equalizer" aria-pressed={eqOn} title="Equalizer" onClick={() => useUi.getState().openDialog({ kind: 'equalizer' })}>
                  <SlidersVertical size={19} />
                </button>
                <button className={actionButton} aria-label="Volume" aria-expanded={false} title="Volume" onClick={() => setVolumeOpen(true)}>
                  <VolumeIcon size={20} />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Under a music video the lyrics (with their Translate and Pronunciation controls) aren't drawn. */}
        {panel === 'lyrics' && !showVideo && (
          <section className={`np-lyrics flex min-h-0 ${stacked ? 'order-1 w-full max-w-[620px] flex-1' : 'h-full'}`} aria-label="Lyrics">
            <LyricsView full />
          </section>
        )}
        {panel === 'queue' && (
          <section className={`np-queue flex min-h-0 flex-col pt-4 ${stacked ? 'order-1 w-full max-w-[620px] flex-1' : 'h-full'}`} style={{ maskImage: 'linear-gradient(180deg,#000 calc(100% - 80px),transparent)' }} aria-label="Up Next">
            <h2 className="mb-3 px-4 type-title-1-emphasized">Up Next</h2>
            <UpNext />
          </section>
        )}
      </div>
    </div>
  );
}
