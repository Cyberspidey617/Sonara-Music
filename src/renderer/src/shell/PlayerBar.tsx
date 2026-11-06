import { Ellipsis, ListMusic, Maximize2, MicVocal, PictureInPicture2, Repeat, Repeat1, Shuffle, SlidersVertical } from 'lucide-react';
import { api, isElectron } from '@/lib/api';
import { Artwork } from '@/components/Artwork';
import { ExplicitBadge, LogoMark, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from '@/components/icons';
import { LikeButton } from '@/components/LikeButton';
import { ArtistLinks } from '@/components/Links';
import { trackMenu } from '@/components/trackActions';
import { NowPlayingQuality } from '@/components/QualityBadge';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { largeArtwork } from '@/lib/artwork';
import { preloadArtwork } from '@/components/Artwork';
import { useLiquidLens } from '@/lib/glass';
import { openMenuAt, useMenu } from '@/state/menu';
import { albumRoute, go } from '@/state/nav';
import { usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { useLibrary } from '@/state/library';
import { SleepTimerButton } from './SleepTimer';
import { useScrubber } from './useScrubber';
import { VolumeIcon, VolumeSlider } from './VolumeControl';
import { useWaveStops, Waveform } from '@/components/Waveform';

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

/**
 * Pebble style (Settings › Layout › Player): the player rests as a small pebble — controls and
 * cover — and opens into the full bar while the pointer or keyboard focus is on it, or while
 * one of its menus (sleep timer, "…") is open.
 */
function usePebble(pill: RefObject<HTMLDivElement | null>): boolean {
  const enabled = useLibrary((s) => (s.settings.playerStyle ?? 'pebble') === 'pebble');
  const menuOpen = useMenu((s) => s.entries !== null);
  const [open, setOpen] = useState(false);
  const inside = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intent = (next: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    // Opens almost at once; turns back into the pebble 1.5 s after the pointer leaves.
    timer.current = setTimeout(() => setOpen(next), next ? 60 : 1500);
  };

  useEffect(() => {
    const el = pill.current;
    if (!el || !enabled) return;
    const enter = () => {
      inside.current = true;
      intent(true);
    };
    const leave = () => {
      inside.current = false;
      if (!useMenu.getState().entries) intent(false);
    };
    const focusIn = (e: FocusEvent) => (e.target as Element).matches(':focus-visible') && intent(true);
    const focusOut = (e: FocusEvent) => !el.contains(e.relatedTarget as Node) && !inside.current && intent(false);
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('focusin', focusIn);
    el.addEventListener('focusout', focusOut);
    return () => {
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('focusin', focusIn);
      el.removeEventListener('focusout', focusOut);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pill, enabled]);

  // A menu opened from the bar keeps it open; once it closes, the bar follows the pointer again.
  useEffect(() => {
    if (enabled && !menuOpen && !inside.current && open) intent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  return enabled && !open;
}

/** The resting player: the cover, a hairline, and a waveform that moves with the music. */
function Pebble({ shown }: { shown: boolean }) {
  const track = usePlayer((s) => s.queue[s.index]?.track ?? null);
  const playing = usePlayer((s) => s.status === 'playing');
  const settings = useLibrary((s) => s.settings);
  const stops = useWaveStops(settings);
  const setFullScreen = useUi((s) => s.setFullScreen);
  return (
    <div
      className={`absolute inset-y-0 left-0 flex w-[248px] items-center pr-3.5 pl-2.5 transition-opacity ease-out ${shown ? 'opacity-100 delay-[380ms] duration-[400ms]' : 'pointer-events-none opacity-0 duration-100'}`}
      inert={!shown || undefined}
    >
      {track ? (
        <button className="relative size-10 flex-none overflow-hidden rounded-[10px] shadow-[0_2px_10px_rgb(0_0_0/0.4)]" aria-label="Open the full-screen player" onClick={() => setFullScreen(true)}>
          <Artwork key={track.videoId} url={track.thumbnail} size={40} radius="sm" className="size-full animate-glyph rounded-[10px]" />
        </button>
      ) : (
        <span className="grid size-10 flex-none place-items-center text-tertiary">
          <LogoMark size={24} />
        </span>
      )}
      <span aria-hidden="true" className="mx-3 h-7 w-px flex-none bg-white/15" />
      <Waveform active={shown && !!track} playing={playing} options={settings} stops={stops} className="h-9 min-w-0 flex-1" />
    </div>
  );
}

/**
 * The full bar's three parts fade in one after another as the capsule widens, and out
 * one after another (right to left) as it slowly narrows back into the pebble.
 */
const reveal = (pebble: boolean, openDelay: string, closeDelay: string) =>
  `transition-[opacity,translate] ${pebble ? `opacity-0 -translate-x-1 duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${closeDelay}` : `opacity-100 translate-x-0 duration-300 ease-out ${openDelay}`}`;

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
  const pebble = usePebble(pill);

  return (
    <div
      className="@container pointer-events-none absolute right-0 bottom-(--player-bottom-offset) left-(--content-left) z-40 flex justify-center px-5 transition-[padding] duration-(--duration-panel) ease-panel data-[panel=true]:pr-[calc(var(--side-panel-width)+20px)]"
      data-panel={sidePanel !== null}
    >
      {/* The pill's size lives on this wrapper: the glass's elastic motion owns the pill's own transitions. */}
      {/* Widening: a quick ease-out (~300 ms), the parts fading in as it grows. Narrowing: a slow ease-in-out (700 ms). */}
      <div className={`relative flex justify-center transition-[width] ${pebble ? 'w-[248px] duration-[700ms] ease-[cubic-bezier(0.65,0,0.35,1)]' : 'w-[min(860px,100%)] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] @min-[1400px]:w-[980px]'}`}>
      {/* The player: one capsule of Liquid Glass, refracting what scrolls beneath it. */}
      <div
        ref={pill}
        data-elastic="0.25"
        data-pebble={pebble || undefined}
        className="glass glow elastic group/pill pointer-events-auto relative h-(--player-pill-height) w-full overflow-hidden rounded-pill"
        style={lens}
        role="region"
        aria-label="Player"
        // A double-click on the bar itself (not a control) opens the full-screen player.
        onDoubleClick={(e) => {
          if (!(e.target instanceof Element) || e.target.closest('button, a, input, [role="slider"]')) return;
          useUi.getState().setFullScreen(true);
        }}
      >
        <Pebble shown={pebble} />
        {/* The full bar; it crossfades with the pebble as the capsule grows and shrinks. */}
        <div className={`absolute inset-0 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center px-3 ${pebble ? 'pointer-events-none' : ''}`} inert={pebble || undefined}>
        <div className={`flex items-center justify-between gap-2 pr-2 @min-[760px]:w-[208px] @min-[760px]:gap-0 ${reveal(pebble, 'delay-[60ms]', 'delay-[140ms]')}`}>
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

        <div className={`h-full min-w-0 px-3 ${reveal(pebble, 'delay-[110ms]', 'delay-[70ms]')}`}>
          <Lcd />
        </div>

        <div className={`flex items-center justify-end gap-0.5 pl-2 ${reveal(pebble, 'delay-[160ms]', 'delay-0')}`}>
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
          {isElectron && (
            <button className={`${action} @max-[760px]:hidden`} aria-label="Mini player" title="Mini player: floats over other apps (Ctrl+Alt+M)" onClick={() => api.toggleMiniPlayer()}>
              <PictureInPicture2 size={17} strokeWidth={2} />
            </button>
          )}
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
      </div>
    </div>
  );
}
