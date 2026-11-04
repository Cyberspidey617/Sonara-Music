import { ListMusic, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MiniGrow, MiniLayout, PlaybackState } from '@shared/types';
import { api } from '@/lib/api';
import { LogoMark, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from '@/components/icons';

const control = 'grid size-9 flex-none place-items-center rounded-full text-primary transition-[background-color,scale] duration-150 hover:bg-white/10 active:scale-90 disabled:opacity-35 aria-pressed:bg-white/15';
/** How long Up Next takes to fade away before the window shrinks back to the bar. */
const CLOSE_MS = 180;
/** Parts of the player that are pressed rather than dragged or double-clicked. */
const interactive = (target: EventTarget) => target instanceof Element && !!target.closest('button, [data-seek], [data-list]');

/**
 * The mini player: its own small window, on top of other apps. It mirrors what the main window
 * reports and sends its buttons back there. The page drags it itself, so a double-click anywhere
 * that isn't a button can open Sonara.
 */
export function MiniPlayer() {
  const [state, setState] = useState<PlaybackState & { at: number }>({ playing: false, at: performance.now() });
  const [layout, setLayout] = useState<MiniLayout>('bar');
  const [grow, setGrow] = useState<MiniGrow>('up');
  const [closing, setClosing] = useState(false);
  // Bumped each time the window comes back, to play its arrival again.
  const [shown, setShown] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(
    () =>
      api.onMiniState((next, nextLayout, nextGrow) => {
        setState({ ...next, at: performance.now() });
        if (nextLayout) setLayout(nextLayout);
        if (nextGrow) setGrow(nextGrow);
      }),
    [],
  );

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setShown((n) => n + 1);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // The progress line runs on between reports (about once a second while playing).
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const duration = state.duration || 0;
      const elapsed = (state.position || 0) + (state.playing ? (performance.now() - state.at) / 1000 : 0);
      if (bar.current) bar.current.style.transform = `scaleX(${duration ? Math.min(1, elapsed / duration) : 0})`;
      if (state.playing) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [state]);

  const queueOpen = layout === 'queue';
  const openQueue = () => {
    setLayout('queue');
    api.setMiniLayout('queue');
  };
  const closeQueue = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setLayout('bar');
      api.setMiniLayout('bar');
    }, CLOSE_MS);
  };

  // Clicking anywhere else folds Up Next back into the bar.
  const onBlur = useRef(() => undefined as void);
  onBlur.current = () => queueOpen && closeQueue();
  useEffect(() => {
    const listener = () => onBlur.current();
    window.addEventListener('blur', listener);
    return () => window.removeEventListener('blur', listener);
  }, []);

  // The window follows the cursor (in the main process) from press to release.
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || interactive(e.target)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    api.miniMoveStart();
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    api.miniMoveEnd();
  };

  const seek = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || !state.duration) return;
    const seconds = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * state.duration;
    api.miniSeek(seconds);
    setState((s) => ({ ...s, position: seconds, at: performance.now() }));
  };

  const accent = state.accent || 'rgb(250 88 106)';
  const has = !!state.title;
  return (
    <div className="group flex h-screen w-screen p-2 select-none">
      <div
        key={shown}
        className={`relative flex h-full w-full animate-mini-in flex-col overflow-hidden border border-white/12 shadow-[0_8px_24px_rgb(0_0_0/0.45)] transition-[border-radius] duration-300 ${queueOpen ? 'rounded-[24px]' : 'rounded-[34px]'}`}
        style={{ background: `linear-gradient(115deg, color-mix(in srgb, ${accent} 26%, transparent), transparent 62%), rgb(18 18 22 / 0.62)` }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => !interactive(e.target) && api.openMainWindow()}
      >
        <div className="relative flex h-[68px] flex-none items-center gap-3 pr-3 pl-2">
          {/* Hide sits on the cover's corner, clear of the controls. */}
          <button
            className="absolute top-1 left-1 z-10 grid size-5 place-items-center rounded-full bg-black/60 text-secondary opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
            aria-label="Hide the mini player"
            title="Hide (Ctrl+Alt+M)"
            onClick={() => api.hideMiniPlayer()}
          >
            <X size={11} strokeWidth={2.5} />
          </button>
          <button className="size-[52px] flex-none overflow-hidden rounded-[16px] bg-white/8 transition-[scale] duration-150 active:scale-95" title="Open Sonara" aria-label="Open Sonara" onClick={() => api.openMainWindow()}>
            {state.thumbnail ? <img key={state.thumbnail} src={state.thumbnail} alt="" draggable={false} className="size-full animate-fade-in object-cover" /> : <LogoMark size={30} className="m-auto" />}
          </button>
          <div key={state.title ?? ''} className="flex min-w-0 flex-1 animate-fade-in flex-col">
            <span className="truncate type-body-emphasized text-primary">{state.title ?? 'Nothing playing'}</span>
            <span className="truncate type-callout text-secondary">{has ? state.artist : 'Play something in Sonara'}</span>
          </div>
          <div className="flex flex-none items-center gap-0.5">
            <button className={control} disabled={!has} aria-label="Previous" title="Previous (Ctrl+Alt+←)" onClick={() => api.miniCommand('previous')}>
              <PreviousGlyph size={18} />
            </button>
            <button
              className="grid size-10 flex-none place-items-center rounded-full text-white transition-[scale,filter] duration-150 hover:brightness-110 active:scale-90 disabled:opacity-35"
              style={{ background: accent }}
              disabled={!has}
              aria-label={state.playing ? 'Pause' : 'Play'}
              title={`${state.playing ? 'Pause' : 'Play'} (Ctrl+Alt+Space or Ctrl+Alt+P)`}
              onClick={() => api.miniCommand('play-pause')}
            >
              <span key={String(state.playing)} className="grid animate-glyph place-items-center">
                {state.playing ? <PauseGlyph size={20} /> : <PlayGlyph size={20} className="translate-x-px" />}
              </span>
            </button>
            <button className={control} disabled={!has} aria-label="Next" title="Next (Ctrl+Alt+→)" onClick={() => api.miniCommand('next')}>
              <NextGlyph size={18} />
            </button>
            <button className={control} aria-pressed={queueOpen && !closing} aria-label="Up Next" title="Up Next" onClick={() => (queueOpen ? closeQueue() : openQueue())}>
              <ListMusic size={17} strokeWidth={2} />
            </button>
          </div>
          {/* The progress line: click (or drag along) it to move through the song. */}
          <div
            data-seek
            className={`group/seek absolute inset-x-4 bottom-0 h-3.5 ${state.duration ? 'cursor-pointer' : 'pointer-events-none'}`}
            role="slider"
            aria-label="Song position"
            aria-valuemin={0}
            aria-valuemax={Math.round(state.duration || 0)}
            aria-valuenow={Math.round(state.position || 0)}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seek(e.clientX);
            }}
            onPointerMove={(e) => e.buttons === 1 && seek(e.clientX)}
          >
            <div ref={track} className="absolute inset-x-2 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-white/10 transition-[height] duration-150 group-hover/seek:h-1">
              <div ref={bar} className="h-full origin-left" style={{ background: accent, transform: 'scaleX(0)' }} />
            </div>
          </div>
        </div>
        {queueOpen && (
          <div data-list className={`flex min-h-0 flex-1 flex-col border-white/10 bg-black/50 ${grow === 'up' ? 'order-first border-b' : 'border-t'} ${closing ? 'animate-mini-out' : 'animate-fade-in'}`}>
            <h2 className="px-4 pt-3 pb-1.5 type-callout-emphasized text-secondary">Up Next{state.upNext?.length ? ` · ${state.upNext.length}` : ''}</h2>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {state.upNext?.length ? (
                state.upNext.map((song, i) => (
                  <button
                    key={song.index}
                    className="flex h-12 w-full animate-rise items-center gap-3 rounded-[10px] px-2 text-left transition-[background-color,scale] duration-150 hover:bg-white/10 active:scale-[0.98]"
                    style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                    title={`Play “${song.title}”`}
                    onClick={() => api.miniJumpTo(song.index)}
                  >
                    <span className="size-9 flex-none overflow-hidden rounded-[7px] bg-white/8">{song.thumbnail && <img src={song.thumbnail} alt="" draggable={false} className="size-full object-cover" />}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate type-body-emphasized text-primary">{song.title}</span>
                      <span className="truncate type-callout text-secondary">{song.artist}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-6 text-center type-callout text-tertiary">Nothing is queued after this song.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
