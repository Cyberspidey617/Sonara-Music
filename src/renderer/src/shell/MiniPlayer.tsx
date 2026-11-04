import { ListMusic, Maximize2, Minus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MiniLayout, PlaybackState } from '@shared/types';
import { api } from '@/lib/api';
import { LogoMark, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from '@/components/icons';

/**
 * Where the glass comes from: the system (acrylic on Windows 11, vibrancy on macOS) blurring what's
 * really behind the window, or, where there's none, a translucent pebble the page draws itself.
 */
const glass = new URLSearchParams(location.search).get('glass') ?? 'none';
const systemGlass = glass === 'acrylic' || glass === 'vibrancy';

const transport = 'app-no-drag grid size-9 flex-none place-items-center rounded-full text-primary transition-[background-color,scale] duration-150 hover:bg-white/12 active:scale-90 disabled:opacity-35';
const small = 'app-no-drag grid size-8 flex-none place-items-center rounded-full text-secondary transition-[background-color,color,scale] duration-150 hover:bg-white/12 hover:text-primary active:scale-90 aria-pressed:bg-white/15 aria-pressed:text-primary';

function Cover({ src, size, onClick, title }: { src?: string; size: number; onClick: () => void; title: string }) {
  return (
    <button className="app-no-drag flex-none overflow-hidden rounded-[14px] bg-white/8 shadow-[0_2px_10px_rgb(0_0_0/0.35)]" style={{ width: size, height: size }} title={title} aria-label={title} onClick={onClick}>
      {src ? <img src={src} alt="" draggable={false} className="size-full object-cover" /> : <LogoMark size={size * 0.55} className="m-auto" />}
    </button>
  );
}

/**
 * The mini player: its own small window, on top of other apps. It mirrors what the main window
 * reports and sends its buttons back there; its body drags it anywhere on screen.
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
  }, [state, layout]);

  const accent = state.accent || 'rgb(250 88 106)';
  const has = !!state.title;
  const go = (next: MiniLayout) => {
    setLayout(next);
    api.setMiniLayout(next);
  };
  const play = (size: 'lg' | 'md') => (
    <button
      className={`app-no-drag grid flex-none place-items-center rounded-full text-white shadow-[0_3px_12px_rgb(0_0_0/0.3)] transition-[scale,filter] duration-150 hover:brightness-110 active:scale-90 disabled:opacity-35 ${size === 'lg' ? 'size-10' : 'size-9'}`}
      style={{ background: accent }}
      disabled={!has}
      aria-label={state.playing ? 'Pause' : 'Play'}
      title={`${state.playing ? 'Pause' : 'Play'} (Ctrl+Alt+Space or Ctrl+Alt+P)`}
      onClick={() => api.miniCommand('play-pause')}
    >
      {state.playing ? <PauseGlyph size={size === 'lg' ? 20 : 18} /> : <PlayGlyph size={size === 'lg' ? 20 : 18} className="translate-x-px" />}
    </button>
  );

  // The surface: the system's glass fills the window (just tinted here), or the page's own pebble.
  const surface = (children: ReactNode, rounded: string) =>
    systemGlass ? (
      <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: `linear-gradient(115deg, color-mix(in srgb, ${accent} 20%, transparent), transparent 62%), rgb(0 0 0 / 0.18)` }}>
        {children}
      </div>
    ) : (
      <div className="flex h-full w-full p-2">
        <div
          className={`relative flex h-full w-full flex-col overflow-hidden border border-white/12 shadow-[0_8px_24px_rgb(0_0_0/0.45)] ${rounded}`}
          style={{ background: `linear-gradient(115deg, color-mix(in srgb, ${accent} 26%, transparent), transparent 62%), rgb(18 18 22 / 0.92)` }}
        >
          {children}
        </div>
      </div>
    );

  // Minimised: the cover and play/pause; the cover (or the arrows) brings the bar back.
  if (layout === 'pebble')
    return (
      <div className="app-drag h-screen w-screen select-none">
        {surface(
          <div className="flex h-full items-center gap-2.5 px-2.5">
            <Cover src={state.thumbnail} size={52} title="Expand the mini player" onClick={() => go('bar')} />
            {play('md')}
            <button className={small} aria-label="Expand" title="Expand" onClick={() => go('bar')}>
              <Maximize2 size={14} strokeWidth={2.2} />
            </button>
          </div>,
          'rounded-[34px]',
        )}
      </div>
    );

  const queueOpen = layout === 'queue';
  return (
    <div className="app-drag h-screen w-screen select-none">
      {surface(
        <>
          <div className="relative flex h-[68px] flex-none items-center gap-3 pr-2.5 pl-2" style={systemGlass ? { height: 84 } : undefined}>
            <Cover src={state.thumbnail} size={52} title="Open Sonara" onClick={() => api.openMainWindow()} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate type-body-emphasized text-primary">{state.title ?? 'Nothing playing'}</span>
              <span className="truncate type-callout text-secondary">{has ? state.artist : 'Play something in Sonara'}</span>
            </div>
            <div className="flex flex-none items-center gap-0.5">
              <button className={transport} disabled={!has} aria-label="Previous" title="Previous (Ctrl+Alt+←)" onClick={() => api.miniCommand('previous')}>
                <PreviousGlyph size={18} />
              </button>
              {play('lg')}
              <button className={transport} disabled={!has} aria-label="Next" title="Next (Ctrl+Alt+→)" onClick={() => api.miniCommand('next')}>
                <NextGlyph size={18} />
              </button>
            </div>
            <span aria-hidden="true" className="h-8 w-px flex-none bg-white/15" />
            <div className="flex flex-none items-center gap-0.5">
              <button className={small} aria-pressed={queueOpen} aria-label="Up Next" title="Up Next" onClick={() => go(queueOpen ? 'bar' : 'queue')}>
                <ListMusic size={16} strokeWidth={2} />
              </button>
              <button className={small} aria-label="Minimise" title="Minimise" onClick={() => go('pebble')}>
                <Minus size={16} strokeWidth={2.2} />
              </button>
              <button className={`${small} hover:bg-[#e81123] hover:text-white`} aria-label="Hide the mini player" title="Hide (Ctrl+Alt+M)" onClick={() => api.hideMiniPlayer()}>
                <X size={15} strokeWidth={2.2} />
              </button>
            </div>
            <div className="pointer-events-none absolute inset-x-5 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-white/10">
              <div ref={bar} className="h-full origin-left" style={{ background: accent, transform: 'scaleX(0)' }} />
            </div>
          </div>
          {queueOpen && (
            <div className="app-no-drag flex min-h-0 flex-1 flex-col border-t border-white/10">
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
        </>,
        queueOpen ? 'rounded-[22px]' : 'rounded-[34px]',
      )}
    </div>
  );
}
