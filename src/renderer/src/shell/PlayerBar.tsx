import { Ellipsis, ListMusic, Maximize2, MicVocal, Repeat, Repeat1, Shuffle, SlidersVertical } from 'lucide-react';
import { Artwork } from '@/components/Artwork';
import { ExplicitBadge, LogoMark, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from '@/components/icons';
import { LikeButton } from '@/components/LikeButton';
import { ArtistLinks } from '@/components/Links';
import { trackMenu } from '@/components/trackActions';
import { NowPlayingQuality } from '@/components/QualityBadge';
import { useEffect, useRef } from 'react';
import { largeArtwork } from '@/lib/artwork';
import { preloadArtwork } from '@/components/Artwork';
import { useLiquidLens } from '@/lib/glass';
import { openMenuAt } from '@/state/menu';
import { albumRoute, go } from '@/state/nav';
import { usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { useLibrary } from '@/state/library';
import { SleepTimerButton } from './SleepTimer';
import { useScrubber } from './useScrubber';
import { VolumeIcon, VolumeSlider } from './VolumeControl';

// Controls on the glass are glyphs only (no glass on glass): a light fill appears under the pointer.
const control = 'relative grid place-items-center rounded-full transition-[background-color,scale,color] duration-200 ease-(--ease-spring) hover:bg-white/[0.09] active:scale-90 disabled:opacity-35 disabled:hover:bg-transparent';
const toggle = `${control} size-9 text-secondary hover:text-primary aria-pressed:text-key`;
const transport = `${control} size-9 text-primary`;
const action = `${control} size-9 text-secondary hover:text-primary aria-pressed:text-key`;

/** The now-playing tile in the pill: artwork, names, and a thin progress line along its foot. */
function Lcd() {
  const track = usePlayer((s) => s.queue[s.index]?.track ?? null);
  // Fetch the large artwork ahead, so it's ready when it grows into the full-screen player.
  useEffect(() => {
    if (track?.thumbnail) preloadArtwork(largeArtwork(track.thumbnail) ?? track.thumbnail, 620);
  }, [track?.thumbnail]);
  const status = usePlayer((s) => s.status);
  const error = usePlayer((s) => s.error);
  const setFullScreen = useUi((s) => s.setFullScreen);
  const fullScreen = useUi((s) => s.fullScreen);
  const { bar, elapsed, remaining, dragging, handlers } = useScrubber();

  if (!track) {
    return (
      <div className="grid h-full place-items-center text-tertiary">
        <LogoMark size={26} />
      </div>
    );
  }
  return (
    <div className="group/lcd relative grid h-full grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3 pb-1.5">
      <button
        className="group/art relative size-[40px] overflow-hidden rounded-[9px]"
        style={fullScreen ? undefined : { viewTransitionName: 'np-art' }}
        aria-label="Open the full-screen player"
        onClick={() => setFullScreen(true)}
      >
        <Artwork key={track.videoId} url={track.thumbnail} size={40} radius="sm" className="size-full animate-glyph rounded-[9px]" />
        <span className="absolute inset-0 grid place-items-center bg-black/50 text-white opacity-0 transition-opacity group-hover/pill:opacity-100">
          <Maximize2 size={14} strokeWidth={2.25} />
        </span>
      </button>
      <div key={track.videoId} className={`flex min-w-0 animate-rise flex-col transition-[filter,opacity] ${dragging ? 'opacity-30 blur-[3px]' : 'group-has-[[data-scrubber]:hover]/lcd:opacity-30 group-has-[[data-scrubber]:hover]/lcd:blur-[3px]'}`}>
        <div className="flex min-w-0 items-center">
          <button className="truncate type-body-emphasized hover:underline" onClick={() => (track.album?.id ? go(albumRoute(track.album.id)) : setFullScreen(true))}>
            {track.title}
          </button>
          {track.explicit && <ExplicitBadge />}
          <NowPlayingQuality className="ml-1.5" />
        </div>
        {status === 'error' ? (
          <span className="truncate type-callout-medium text-key" title={error ?? ''}>
            {error}
          </span>
        ) : (
          <ArtistLinks artists={track.artists} className="truncate type-callout-medium text-secondary" />
        )}
      </div>
      <div className="group/scrub absolute inset-x-0 bottom-0 h-3.5 cursor-pointer touch-none" data-scrubber data-dragging={dragging || undefined} {...handlers}>
        <span ref={elapsed} className="pointer-events-none absolute bottom-[11px] left-0 type-[600_11px/13px] tabular-nums text-primary opacity-0 transition-opacity group-hover/scrub:opacity-100 group-data-dragging/scrub:opacity-100" />
        <span ref={remaining} className="pointer-events-none absolute right-0 bottom-[11px] type-[600_11px/13px] tabular-nums text-primary opacity-0 transition-opacity group-hover/scrub:opacity-100 group-data-dragging/scrub:opacity-100" />
        <div className="absolute inset-x-0 bottom-1.5 h-0.5 overflow-hidden rounded-[1px] bg-quaternary transition-[height,bottom] duration-100 group-hover/scrub:bottom-[5px] group-hover/scrub:h-1 group-data-dragging/scrub:bottom-[5px] group-data-dragging/scrub:h-1">
          <div ref={bar} className={`size-full origin-left scale-x-(--progress) [--progress:0] ${status === 'loading' ? 'animate-pulse bg-primary' : 'bg-secondary group-hover/scrub:bg-primary'}`} />
        </div>
      </div>
    </div>
  );
}

/** The floating glass player pill along the bottom of the window (BitChord's layout). */
export function PlayerBar() {
  const sidePanel = useUi((s) => s.sidePanel);
  const toggleSidePanel = useUi((s) => s.toggleSidePanel);
  const eqOn = useLibrary((s) => s.settings.eq.enabled);
  const track = usePlayer((s) => s.queue[s.index]?.track ?? null);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'loading');
  const hasNext = usePlayer((s) => s.index + 1 < s.queue.length || s.repeat === 'all' || s.radioLoading);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat, toggleMute } = usePlayer.getState();
  const pill = useRef<HTMLDivElement>(null);
  const lens = useLiquidLens(pill, { band: 20, strength: 44, blur: 18 });

  return (
    <div
      className="@container pointer-events-none absolute right-0 bottom-(--player-bottom-offset) left-(--content-left) z-40 flex justify-center px-5 transition-[padding] duration-(--duration-panel) ease-panel data-[panel=true]:pr-[calc(var(--side-panel-width)+20px)]"
      data-panel={sidePanel !== null}
    >
      {/* The player: one capsule of Liquid Glass, refracting what scrolls beneath it. */}
      <div
        ref={pill}
        data-elastic="0.25"
        className="glass glow elastic group/pill pointer-events-auto relative grid h-(--player-pill-height) w-[min(860px,100%)] grid-cols-[auto_minmax(0,1fr)_auto] items-center rounded-pill px-3 @min-[1400px]:w-[980px]"
        style={lens}
        role="region"
        aria-label="Player"
      >
        <div className="flex items-center justify-between gap-2 pr-2 @min-[760px]:w-[208px] @min-[760px]:gap-0">
          <button className={`${toggle} @max-[760px]:hidden`} aria-label="Shuffle" aria-pressed={shuffle} title="Shuffle (S)" onClick={toggleShuffle}>
            <Shuffle size={17} strokeWidth={2.2} />
          </button>
          <div className="flex items-center gap-1">
            <button className={transport} disabled={!track} aria-label="Previous" title="Previous (Ctrl+←)" onClick={previous}>
              <PreviousGlyph size={22} />
            </button>
            <button className={`${transport} size-10`} disabled={!track} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={togglePlay}>
              {playing ? <PauseGlyph key="pause" size={28} className="animate-glyph" /> : <PlayGlyph key="play" size={28} className="animate-glyph" />}
            </button>
            <button className={transport} disabled={!track || !hasNext} aria-label="Next" title="Next (Ctrl+→)" onClick={next}>
              <NextGlyph size={22} />
            </button>
          </div>
          <button className={`${toggle} @max-[760px]:hidden`} aria-label={`Repeat ${repeat}`} aria-pressed={repeat !== 'off'} title="Repeat (R)" onClick={cycleRepeat}>
            {repeat === 'one' ? <Repeat1 size={17} strokeWidth={2.2} /> : <Repeat size={17} strokeWidth={2.2} />}
          </button>
        </div>

        <div className="h-full min-w-0 px-3">
          <Lcd />
        </div>

        <div className="flex items-center justify-end gap-0.5 pl-2">
          <LikeButton track={track} size={17} className={`${action} @max-[560px]:hidden`} />
          <SleepTimerButton className={`${action} @max-[700px]:hidden`} />
          <button className={`${action} @max-[640px]:hidden`} aria-label="Lyrics" aria-pressed={sidePanel === 'lyrics'} title="Lyrics (L)" onClick={() => toggleSidePanel('lyrics')}>
            <MicVocal size={17} strokeWidth={2} />
          </button>
          <button className={action} aria-label="Up Next" aria-pressed={sidePanel === 'queue'} title="Up Next (Q)" onClick={() => toggleSidePanel('queue')}>
            <ListMusic size={18} strokeWidth={2} />
          </button>
          <button className={`${action} @max-[700px]:hidden`} aria-label="Equalizer" aria-pressed={eqOn} title="Equalizer" onClick={() => useUi.getState().openDialog({ kind: 'equalizer' })}>
            <SlidersVertical size={17} strokeWidth={2} />
          </button>
          <button className={action} disabled={!track} aria-label="More" onClick={(e) => track && openMenuAt(e.currentTarget, trackMenu(track), 'above-end')}>
            <Ellipsis size={18} />
          </button>
          <div className="ml-1 flex items-center gap-1.5">
            <button className={action} aria-label="Mute" title="Mute (M) · scroll to change volume" onClick={toggleMute} onWheel={(e) => usePlayer.getState().setVolume(usePlayer.getState().volume + (e.deltaY < 0 ? 0.05 : -0.05))}>
              <VolumeIcon size={18} />
            </button>
            <VolumeSlider className="w-[84px] @max-[900px]:hidden" />
          </div>
        </div>
      </div>
    </div>
  );
}
