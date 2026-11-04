import { ListMusic, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MiniLayout, PlaybackState } from '@shared/types';
import { api } from '@/lib/api';
import { LogoMark, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from '@/components/icons';

const control = 'app-no-drag grid size-9 flex-none place-items-center rounded-full text-primary transition-[background-color,scale] duration-150 hover:bg-white/10 active:scale-90 disabled:opacity-35 aria-pressed:bg-white/15';

/**
 * The mini player: its own small window, on top of other apps. It mirrors what the main window
 * reports and sends its buttons back there; the body drags it anywhere on screen.
 */
export function MiniPlayer() {
  const [state, setState] = useState<PlaybackState & { at: number }>({ playing: false, at: performance.now() });
  const [layout, setLayout] = useState<MiniLayout>('bar');
  const bar = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      api.onMiniState((next, nextLayout) => {
        setState({ ...next, at: performance.now() });
        if (nextLayout) setLayout(nextLayout);
      }),
    [],
  );

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

  const accent = state.accent || 'rgb(250 88 106)';
  const has = !!state.title;
  const queueOpen = layout === 'queue';
  const toggleQueue = () => {
    const next = queueOpen ? 'bar' : 'queue';
    setLayout(next);
    api.setMiniLayout(next);
  };
  return (
    <div className="group app-drag flex h-screen w-screen p-2 select-none">
      <div
        className={`relative flex h-full w-full flex-col overflow-hidden border border-white/12 shadow-[0_8px_24px_rgb(0_0_0/0.45)] ${queueOpen ? 'rounded-[24px]' : 'rounded-[34px]'}`}
        style={{ background: `linear-gradient(115deg, color-mix(in srgb, ${accent} 26%, transparent), transparent 62%), rgb(18 18 22 / 0.62)` }}
      >
        <div className="relative flex h-[68px] flex-none items-center gap-3 pr-3 pl-2">
          <button className="app-no-drag size-[52px] flex-none overflow-hidden rounded-[16px] bg-white/8" title="Open Sonara" aria-label="Open Sonara" onClick={() => api.openMainWindow()}>
            {state.thumbnail ? <img src={state.thumbnail} alt="" draggable={false} className="size-full object-cover" /> : <LogoMark size={30} className="m-auto" />}
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate type-body-emphasized text-primary">{state.title ?? 'Nothing playing'}</span>
            <span className="truncate type-callout text-secondary">{has ? state.artist : 'Play something in Sonara'}</span>
          </div>
          <div className="flex flex-none items-center gap-0.5">
            <button className={control} disabled={!has} aria-label="Previous" title="Previous (Ctrl+Alt+←)" onClick={() => api.miniCommand('previous')}>
              <PreviousGlyph size={18} />
            </button>
            <button
              className="app-no-drag grid size-10 flex-none place-items-center rounded-full text-white transition-[scale,filter] duration-150 hover:brightness-110 active:scale-90 disabled:opacity-35"
              style={{ background: accent }}
              disabled={!has}
              aria-label={state.playing ? 'Pause' : 'Play'}
              title={`${state.playing ? 'Pause' : 'Play'} (Ctrl+Alt+Space or Ctrl+Alt+P)`}
              onClick={() => api.miniCommand('play-pause')}
            >
              {state.playing ? <PauseGlyph size={20} /> : <PlayGlyph size={20} className="translate-x-px" />}
            </button>
            <button className={control} disabled={!has} aria-label="Next" title="Next (Ctrl+Alt+→)" onClick={() => api.miniCommand('next')}>
              <NextGlyph size={18} />
            </button>
            <button className={control} aria-pressed={queueOpen} aria-label="Up Next" title="Up Next" onClick={toggleQueue}>
              <ListMusic size={17} strokeWidth={2} />
            </button>
          </div>
          <div className="pointer-events-none absolute inset-x-6 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-white/10">
            <div ref={bar} className="h-full origin-left" style={{ background: accent, transform: 'scaleX(0)' }} />
          </div>
        </div>
        {queueOpen && (
          <div className="app-no-drag flex min-h-0 flex-1 flex-col border-t border-white/10 bg-black/50">
            <h2 className="px-4 pt-3 pb-1.5 type-callout-emphasized text-secondary">Up Next{state.upNext?.length ? ` · ${state.upNext.length}` : ''}</h2>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {state.upNext?.length ? (
                state.upNext.map((song) => (
                  <button key={song.index} className="flex h-12 w-full items-center gap-3 rounded-[10px] px-2 text-left hover:bg-white/10" title={`Play “${song.title}”`} onClick={() => api.miniJumpTo(song.index)}>
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
        <button
          className="app-no-drag absolute top-1.5 right-3 grid size-5 place-items-center rounded-full bg-black/50 text-secondary opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
          aria-label="Hide the mini player"
          title="Hide (Ctrl+Alt+M)"
          onClick={() => api.hideMiniPlayer()}
        >
          <X size={11} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
