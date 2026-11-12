import { useEffect, useRef, type CSSProperties, type Ref } from 'react';
import { seekLookOf, type SeekLook } from '@shared/types';
import { useLibrary } from '@/state/library';
import { onScreen, powerSaving } from '@/lib/power';

/** The seek bars' look, as Settings › Player › Seek bar has it. */
export function useSeekLook(): SeekLook {
  const s = useLibrary((l) => l.settings);
  return seekLookOf(s);
}

/** Line thickness (px) at thickness 1, by size and style. */
const BASE = { large: { rounded: 6, line: 3, wave: 2.5, capsule: 7, expressive: 4 }, small: { rounded: 4, line: 2, wave: 2, capsule: 4, expressive: 2.5 } } as const;
/** The bar's own height (px): room for the wave and the knob. */
const BOX = { large: 20, small: 12 } as const;
/** One wavelength of the wave (px), and how many go by each second while music plays. */
const WAVE = 24;
const WAVES_PER_SECOND = 1.1;

/**
 * The played part as a wave: one continuous line from the start to the playing point, drawn each
 * frame. It flattens out over its last few pixels, so it meets the flat line of what's still to play
 * at the playing point, and it moves along while music plays.
 */
function WavePath({
  box,
  amplitude,
  stroke,
  color,
  playing,
  className,
  gap = 0,
  expressive = false,
}: {
  box: number;
  amplitude: number;
  stroke: number;
  color: string;
  playing: boolean;
  className: string;
  /** Room left before the playing point (for a handle). */
  gap?: number;
  /** Material 3 Expressive: the full wave right up to the gap, settling flat while paused. */
  expressive?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const moving = useRef(playing);
  moving.current = playing;
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    let width = el.clientWidth;
    const resize = new ResizeObserver(() => (width = el.clientWidth));
    resize.observe(el);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mid = box / 2;
    let phase = 0;
    // Expressive: how much of the wave shows, easing to flat while paused and back while playing.
    let level = moving.current ? 1 : 0;
    let last = performance.now();
    let drawn = '';
    let frame = 0;
    // The bar's progress, as the scrubber writes it: on the bar's host, or a wrapper (the mini player,
    // the Settings preview set it further out). Read from where it's set, without restyling the page.
    const holder = (): HTMLElement | null => {
      for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) if (n.style.getPropertyValue('--progress')) return n;
      return null;
    };
    let source = holder();
    const progressNow = () => {
      if (!source?.isConnected || !source.style.getPropertyValue('--progress')) source = holder();
      const raw = source ? source.style.getPropertyValue('--progress') : getComputedStyle(el).getPropertyValue('--progress');
      return parseFloat(raw) || 0;
    };
    let lastLook = 0;
    const draw = (now: number) => {
      // Paused, the bar only moves if you seek: a look four times a second is enough.
      // Moving, 30 frames a second are plenty for the wave; unseen (hidden, under the full-screen player), none.
      const minGap = moving.current && !el.closest('[data-dragging]') ? 1000 / 31 : !moving.current && !expressive && !el.closest('[data-dragging]') ? 250 : 0;
      if (powerSaving() && (now - lastLook < minGap || !onScreen(el, now))) {
        frame = requestAnimationFrame(draw);
        return;
      }
      lastLook = now;
      if (moving.current && !still) phase = (phase + (Math.min(100, now - last) / 1000) * WAVES_PER_SECOND * 2 * Math.PI) % (2 * Math.PI);
      const step = Math.min(100, now - last) / 1000;
      last = now;
      if (expressive) level = moving.current && !still ? Math.min(1, level + step * 3) : Math.max(0, level - step * 3);
      const progress = Math.min(1, Math.max(0, progressNow()));
      const end = Math.max(0, progress * width - gap);
      const key = `${end.toFixed(1)}:${phase.toFixed(3)}:${width}:${level.toFixed(2)}`;
      if (key !== drawn && path.current) {
        drawn = key;
        let d = `M0 ${mid}`;
        for (let x = 2; x < end; x += 2) {
          // Rises in over the first pixels and settles over the last, meeting the flat line.
          const a = expressive ? amplitude * level * Math.min(1, x / 6, (end - x) / 3) : amplitude * Math.min(1, x / 6, (end - x) / 12);
          d += ` L${x} ${(mid + a * Math.sin((x / WAVE) * 2 * Math.PI - phase)).toFixed(2)}`;
        }
        d += ` L${end.toFixed(1)} ${mid}`;
        path.current.setAttribute('d', end > 0.5 ? d : '');
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
    };
  }, [box, amplitude, gap, expressive]);
  return (
    <svg ref={svg} className={`absolute inset-0 size-full overflow-visible ${className}`} aria-hidden="true">
      <path ref={path} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: color, strokeWidth: stroke }} />
    </svg>
  );
}

/**
 * A seek bar's track, fill and knob, in the chosen look: Rounded (a thick rounded bar), Line (a thin
 * one) or Wave (the played part a wave, moving while music plays). It reads `--progress` (0–1)
 * from itself or a parent; hovering and dragging come from a `group/scrub` parent
 * (`data-dragging` while dragging). Every seek bar in Sonara draws its bar with this.
 */
export function SeekTrack({
  look,
  size = 'large',
  playing,
  loading,
  accent,
  barRef,
}: {
  look: SeekLook;
  size?: 'large' | 'small';
  playing: boolean;
  loading?: boolean;
  /** The accent colour, where the page's own isn't set (the mini player's window). */
  accent?: string;
  /** Gets `--progress` from the scrubber each frame. */
  barRef?: Ref<HTMLDivElement>;
}) {
  const k = Math.min(2, Math.max(0.5, look.thickness || 1));
  const fill = look.color === 'accent' ? (accent ?? 'var(--keyColor)') : look.color === 'custom' ? look.custom : '#ffffff';
  const line = Math.max(1, Math.round(BASE[size][look.style] * k * 2) / 2);
  const box = BOX[size];
  // White rests a little dimmer and brightens under the pointer; a colour stays as chosen.
  const tone = look.color === 'white' ? 'opacity-75 transition-opacity group-hover/scrub:opacity-100 group-data-dragging/scrub:opacity-100' : '';
  const knob = size === 'large' ? 12 : 9;
  const knobShown =
    look.knob === 'always' ? 'scale-100' : look.knob === 'drag' ? 'scale-0 group-data-dragging/scrub:scale-100' : 'scale-0 group-hover/scrub:scale-100 group-data-dragging/scrub:scale-100';
  const amplitude = Math.min(box / 2 - line, (size === 'large' ? 3.5 : 2.5) * Math.sqrt(k));
  // Expressive's handle is an upright bar, with a little room either side of it.
  const gap = size === 'large' ? 6 : 4;

  if (look.style === 'expressive')
    return (
      <div className="relative flex w-full items-center" style={{ height: box }} data-progress-host>
        {/* Still to play: flat, starting just past the handle. */}
        <div
          ref={barRef}
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-quaternary"
          style={{ height: line, clipPath: `inset(-4px 0 -4px calc(var(--progress) * 100% + ${gap}px))` }}
        />
        {/* Played: a wave right up to the handle, flattening out while paused. */}
        <WavePath box={box} amplitude={Math.min(box / 2 - line, amplitude * 1.15)} stroke={line} color={fill} playing={playing && !loading} gap={gap} expressive className={`${tone} ${loading ? 'animate-pulse' : ''}`} />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 left-[calc(var(--progress)*100%)] -translate-x-1/2 -translate-y-1/2 rounded-full transition-[height,width,scale] duration-200 ease-(--ease-spring) group-data-dragging/scrub:w-[6px] ${knobShown} ${tone}`}
          style={{ background: fill, width: size === 'large' ? 4 : 3, height: box }}
        />
      </div>
    );

  if (look.style === 'capsule') {
    // Apple Music's scrubber (as BitChord draws it): a capsule with no knob, thicker under the pointer.
    const grown = Math.round(line * 1.7);
    return (
      <div className="relative flex w-full items-center" style={{ height: Math.max(box, grown) }} data-progress-host>
        <div
          className="relative h-(--h) w-full overflow-hidden rounded-full bg-white/[0.22] transition-[height] duration-300 ease-(--ease-spring) group-hover/scrub:h-(--hh) group-data-dragging/scrub:h-(--hh)"
          style={{ '--h': `${line}px`, '--hh': `${grown}px` } as CSSProperties}
        >
          <div ref={barRef} className={`size-full origin-left scale-x-(--progress) ${loading ? 'animate-pulse' : ''}`} style={{ background: fill, opacity: look.color === 'white' ? 0.92 : 1 }} />
        </div>
        {/* The knob, as chosen in Settings (the capsule itself has none). */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 left-[calc(var(--progress)*100%)] h-(--k) w-(--k) -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)] transition-[scale] duration-300 ease-(--ease-spring) ${knobShown}`}
          style={{ '--k': `${knob + 2}px` } as CSSProperties}
        />
      </div>
    );
  }

  return (
    <div className="relative flex w-full items-center" style={{ height: box }} data-progress-host>
      {look.style === 'wave' ? (
        <>
          {/* Still to play: a flat line from the knob on. */}
          <div
            ref={barRef}
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-quaternary [clip-path:inset(-4px_0_-4px_calc(var(--progress)*100%))]"
            style={{ height: line }}
          />
          {/* Played: the wave, moving along while music plays. */}
          <WavePath box={box} amplitude={amplitude} stroke={line} color={fill} playing={playing && !loading} className={`${tone} ${loading ? 'animate-pulse' : ''}`} />
        </>
      ) : (
        <div
          className="relative h-(--h) w-full overflow-hidden rounded-full bg-quaternary transition-[height] duration-150 group-hover/scrub:h-(--hh) group-data-dragging/scrub:h-(--hh)"
          style={{ '--h': `${line}px`, '--hh': `${look.style === 'line' ? line + 1 : Math.round(line * 1.6)}px` } as CSSProperties}
        >
          <div ref={barRef} className={`size-full origin-left scale-x-(--progress) rounded-full ${tone} ${loading ? 'animate-pulse' : ''}`} style={{ background: fill }} />
        </div>
      )}
      {/* The knob: as chosen (on hover, always, or while dragging); while dragging, on the large bar,
          a capsule of clear glass that magnifies the track beneath it (iOS 26's sliders). */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 left-[calc(var(--progress)*100%)] h-(--k) w-(--k) -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.4)] transition-[scale,width,height,background-color,box-shadow] duration-300 ease-(--ease-spring) ${knobShown} ${
          size === 'large'
            ? 'group-data-dragging/scrub:h-[26px] group-data-dragging/scrub:w-[42px] group-data-dragging/scrub:bg-white/15 group-data-dragging/scrub:shadow-[inset_0_1px_0_rgb(255_255_255/0.6),inset_0_-1px_1px_rgb(255_255_255/0.2),0_6px_18px_rgb(0_0_0/0.3)] group-data-dragging/scrub:backdrop-blur-[1px] group-data-dragging/scrub:backdrop-brightness-125 group-data-dragging/scrub:backdrop-saturate-150'
            : ''
        }`}
        style={{ '--k': `${knob}px` } as CSSProperties}
      />
    </div>
  );
}
