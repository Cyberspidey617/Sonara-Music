import { hasViewTransitions, transition } from '@/lib/motion';
import { ChevronDown, Clapperboard, Ellipsis, ListMusic, Maximize, MicVocal, Minimize, Plus, Repeat, Repeat1, Shuffle, SlidersVertical, X } from 'lucide-react';
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
import { LyricsView } from './LyricsView';
import { MusicVideo } from './MusicVideo';
import { ArtworkBackdrop, MeshBackdrop, SolidBackdrop } from './MeshBackdrop';
import { SleepCountdown, SleepTimerButton } from './SleepTimer';
import { UpNext } from './UpNext';
import { useScrubber } from './useScrubber';
import { VolumeIcon, VolumeSlider } from './VolumeControl';

/** Obsidian's seek bar: a thick rounded track that thickens further under the pointer. */
function Scrubber() {
  const { bar, elapsed, remaining, dragging, handlers } = useScrubber();
  return (
    <div className="group/scrub mt-5" data-dragging={dragging || undefined}>
      <div className="relative flex h-5 cursor-pointer touch-none items-center [--progress:0]" data-progress-host {...handlers}>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-quaternary transition-[height] duration-150 group-hover/scrub:h-2.5 group-data-dragging/scrub:h-2.5">
          <div ref={bar} className="size-full origin-left scale-x-(--progress) rounded-full bg-secondary transition-colors [--progress:0] group-hover/scrub:bg-primary group-data-dragging/scrub:bg-primary" />
        </div>
        {/* The thumb: hidden at rest, a small knob on hover, and while dragging a capsule
            of clear glass that magnifies the track beneath it (iOS 26's sliders). */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-[calc(var(--progress)*100%)] h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)] transition-[scale,width,height,background-color,box-shadow] duration-300 ease-(--ease-spring) group-hover/scrub:scale-100 group-data-dragging/scrub:h-[26px] group-data-dragging/scrub:w-[42px] group-data-dragging/scrub:scale-100 group-data-dragging/scrub:bg-white/15 group-data-dragging/scrub:shadow-[inset_0_1px_0_rgb(255_255_255/0.6),inset_0_-1px_1px_rgb(255_255_255/0.2),0_6px_18px_rgb(0_0_0/0.3)] group-data-dragging/scrub:backdrop-blur-[1px] group-data-dragging/scrub:backdrop-brightness-125 group-data-dragging/scrub:backdrop-saturate-150"
        />
      </div>
      <div className="mt-1 flex justify-between type-[500_12px/14px] tabular-nums text-tertiary">
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
  const repeat = usePlayer((s) => s.repeat);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat } = usePlayer.getState();
  return (
    <div className="mx-auto mt-3 flex w-full max-w-[400px] items-center justify-between">
      <button className={`${round} size-11 text-tertiary hover:text-primary aria-pressed:text-primary`} aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle}>
        <Shuffle size={20} strokeWidth={2.2} />
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

/**
 * The immersive player (Obsidian's full-screen player, laid out as BitChord's
 * desktop one): artwork, names, seek bar and transport on the left; lyrics or
 * the queue on the right; all over a moving mesh of the artwork's colours.
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
  const motion = useLibrary((s) => (reduceMotion ? 0 : s.settings.backdropMotion));
  const artScale = useLibrary((s) => s.settings.artworkScale) || 1;
  const [solid, setSolid] = useState<string | null>(null);
  // This song's music video, if one is attached, and whether it's on screen.
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const videoKey = track?.videoId;
  useEffect(() => {
    setShowVideo(false);
    setVideoUrl(null);
    if (!videoKey) return;
    let alive = true;
    void api.musicVideo(videoKey).then((url) => alive && setVideoUrl(url));
    return () => {
      alive = false;
    };
  }, [videoKey]);
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
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
    >
      {backdrop === 'artwork' ? (
        <ArtworkBackdrop artworkUrl={artUrl} speed={playing ? motion : 0} />
      ) : backdrop === 'solid' ? (
        <SolidBackdrop color={solid} />
      ) : (
        <MeshBackdrop artworkUrl={artUrl} playing={playing} speed={motion} />
      )}
      {showVideo && videoUrl && <MusicVideo url={videoUrl} onClose={() => setShowVideo(false)} />}
      {/* The window's drag strip, with the close, music video and full-screen buttons. */}
      <div className="app-drag absolute inset-x-0 top-0 z-30 flex h-[52px] items-center pl-3">
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
            title={showVideo ? 'Hide the music video (Esc)' : 'Music video'}
            onClick={() => setShowVideo((v) => !v)}
          >
            <Clapperboard size={16} />
          </button>
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
          one column, and the lyrics or queue take the artwork's place. */}
      <div
        className={
          stacked
            ? 'flex h-full flex-col items-center justify-center gap-5 px-5 pt-14 pb-8'
            : `grid h-full items-center justify-center gap-x-[clamp(40px,6vw,120px)] px-[clamp(28px,6vw,120px)] pt-14 pb-10 ${column ? 'grid-cols-[var(--col)_minmax(0,760px)]' : 'grid-cols-[var(--col)]'}`
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
                      label: videoUrl ? 'Change music video…' : 'Attach a music video…',
                      icon: <Clapperboard size={16} />,
                      onSelect: () =>
                        void api.attachMusicVideo(track.videoId, track.title).then((url) => {
                          if (!url) return;
                          setVideoUrl(url);
                          setShowVideo(true);
                          toast(`Music video attached to “${track.title}”`);
                        }),
                    },
                    ...(videoUrl
                      ? [
                          {
                            label: 'Remove music video',
                            destructive: true,
                            onSelect: () =>
                              void api.removeMusicVideo(track.videoId).then(() => {
                                setShowVideo(false);
                                setVideoUrl(null);
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

          {/* Obsidian's action row: queue, lyrics, add to playlist, sleep timer — and the volume.
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

        {panel === 'lyrics' && (
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
