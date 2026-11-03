import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Lockup as LockupData, Shelf as ShelfData, Track } from '@shared/types';
import { usePlayer } from '@/state/player';
import { openContextMenu } from '@/state/menu';
import { Artwork } from './Artwork';
import { Equalizer, ExplicitBadge, PlayGlyph } from './icons';
import { ArtistLinks } from './Links';
import { Lockup } from './Lockup';
import { trackMenu } from './trackActions';

/** A titled row that scrolls sideways, with arrow buttons that appear on hover. */
export function ShelfRow({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const update = () => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(update, [children]);
  const page = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * (scroller.current.clientWidth - 80), behavior: 'smooth' });

  return (
    <section className="group/shelf reveal relative mb-9">
      <div className="mb-3 flex items-end justify-between px-(--body-gutter)">
        <h2 className="truncate type-[700_20px/26px] tracking-apple text-primary">{title}</h2>
        {action}
      </div>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={update}
          className="no-scrollbar -ml-(--content-left) flex snap-x snap-mandatory scroll-pl-[calc(var(--content-left)+var(--body-gutter))] gap-5 overflow-x-auto pr-(--body-gutter) pb-2 pl-[calc(var(--content-left)+var(--body-gutter))]"
        >
          {children}
        </div>
        {!edges.start && (
          <button
            className="glass glow absolute top-[calc(50%-40px)] left-3 grid size-9 place-items-center rounded-full text-white opacity-0 transition-opacity group-hover/shelf:opacity-100"
            aria-label="Scroll left"
            onClick={() => page(-1)}
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {!edges.end && (
          <button
            className="glass glow absolute top-[calc(50%-40px)] right-3 grid size-9 place-items-center rounded-full text-white opacity-0 transition-opacity group-hover/shelf:opacity-100"
            aria-label="Scroll right"
            onClick={() => page(1)}
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>
    </section>
  );
}

/** Songs as a compact grid of rows, four to a column (Quick picks, Trending). */
export function SongGrid({ tracks, title }: { tracks: Track[]; title: string }) {
  const columns: Track[][] = [];
  for (let i = 0; i < tracks.length; i += 4) columns.push(tracks.slice(i, i + 4));
  const currentId = usePlayer((s) => s.queue[s.index]?.track.videoId);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'loading');
  const play = (track: Track) => {
    if (track.videoId === currentId) usePlayer.getState().togglePlay();
    else usePlayer.getState().startRadio(track);
  };
  return (
    <ShelfRow title={title}>
      {columns.map((column, c) => (
        <div key={c} className="flex w-[min(380px,32vw)] flex-none snap-start flex-col gap-0.5">
          {column.map((track) => {
            const current = track.videoId === currentId;
            return (
              <div
                key={track.videoId}
                className="group flex h-(--row-h) items-center gap-3 rounded-row px-1.5 hover:bg-tracklist-hover"
                onDoubleClick={() => play(track)}
                onContextMenu={(e) => openContextMenu(e, trackMenu(track))}
              >
                <button className="relative size-(--row-art) flex-none" onClick={() => play(track)} aria-label={`Play ${track.title}`}>
                  <Artwork url={track.thumbnail} size={44} radius="sm" className="size-full" />
                  <span className={`absolute inset-0 place-items-center rounded-artwork-sm bg-black/50 text-white ${current ? 'grid' : 'hidden group-hover:grid'}`}>
                    {current ? <Equalizer playing={playing} /> : <PlayGlyph size={17} />}
                  </span>
                </button>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center">
                    <span className={`truncate type-body-reduced ${current ? 'text-key' : 'text-primary'}`}>{track.title}</span>
                    {track.explicit && <ExplicitBadge />}
                  </div>
                  <ArtistLinks artists={track.artists} className="truncate type-callout text-secondary" />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </ShelfRow>
  );
}

export function ShelfView({ shelf }: { shelf: ShelfData }) {
  if (shelf.layout === 'songs') {
    const tracks = shelf.items.map((i: LockupData) => i.track).filter((t): t is Track => !!t);
    if (tracks.length) return <SongGrid title={shelf.title} tracks={tracks} />;
  }
  const wide = shelf.items.every((i) => i.kind === 'video');
  return (
    <ShelfRow title={shelf.title}>
      {shelf.items.map((lockup, i) => (
        <div key={`${lockup.kind}-${lockup.id}`} className="stagger flex-none snap-start" style={{ '--i': i } as CSSProperties}>
          <Lockup lockup={lockup} size={wide ? 280 : 176} />
        </div>
      ))}
    </ShelfRow>
  );
}
