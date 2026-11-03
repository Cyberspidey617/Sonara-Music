import { Ellipsis, Loader2, Radio, X } from 'lucide-react';
import { useState } from 'react';
import { Artwork } from '@/components/Artwork';
import { Equalizer, ExplicitBadge } from '@/components/icons';
import { trackMenu } from '@/components/trackActions';
import { artistLine } from '@/lib/format';
import { useLibrary } from '@/state/library';
import { openContextMenu, openMenuAt } from '@/state/menu';
import { usePlayer, type QueueItem } from '@/state/player';

function Row({ item, index, current, playing, onDragStart, onDrop }: { item: QueueItem; index: number; current?: boolean; playing?: boolean; onDragStart?: (i: number) => void; onDrop?: (i: number) => void }) {
  const [over, setOver] = useState(false);
  const { track } = item;
  const menu = () => trackMenu(track, current ? {} : { removeFromQueue: () => usePlayer.getState().removeAt(index) });
  return (
    <div
      className={`group relative flex h-(--row-h) items-center gap-3 rounded-row px-2 hover:bg-tracklist-hover ${over ? 'before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:bg-key' : ''}`}
      draggable={!current}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(index);
      }}
      onDragOver={(e) => {
        if (current) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => {
        setOver(false);
        onDrop?.(index);
      }}
      onDoubleClick={() => !current && usePlayer.getState().jumpTo(index)}
      onContextMenu={(e) => openContextMenu(e, menu())}
    >
      <button className="relative size-(--row-art) flex-none" onClick={() => (current ? usePlayer.getState().togglePlay() : usePlayer.getState().jumpTo(index))} aria-label={`Play ${track.title}`}>
        <Artwork url={track.thumbnail} size={40} radius="sm" className="size-full" />
        {current && (
          <span className="absolute inset-0 grid place-items-center rounded-artwork-sm bg-black/50 text-white">
            <Equalizer playing={!!playing} />
          </span>
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center">
          <span className={`truncate type-body-reduced ${current ? 'text-key' : 'text-primary'}`}>{track.title}</span>
          {track.explicit && <ExplicitBadge />}
        </div>
        <span className="truncate type-callout text-secondary">{artistLine(track)}</span>
      </div>
      {!current && (
        <button className="grid size-7 flex-none place-items-center rounded-full text-secondary opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-primary" aria-label="Remove from queue" onClick={() => usePlayer.getState().removeAt(index)}>
          <X size={15} />
        </button>
      )}
      <button className="grid size-7 flex-none place-items-center rounded-full text-secondary opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-primary" aria-label="More" onClick={(e) => openMenuAt(e.currentTarget, menu())}>
        <Ellipsis size={15} />
      </button>
    </div>
  );
}

/** The queue: what's playing, what's next (yours), then what autoplay found. */
export function UpNext() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'loading');
  const source = usePlayer((s) => s.source);
  const radioLoading = usePlayer((s) => s.radioLoading);
  const autoplay = useLibrary((s) => s.settings.autoplay);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const current = queue[index];
  const upcoming = queue.map((item, i) => ({ item, i })).slice(index + 1);
  const mine = upcoming.filter(({ item }) => !item.auto);
  const auto = upcoming.filter(({ item }) => item.auto);
  const drop = (to: number) => {
    if (dragFrom !== null && dragFrom !== to) usePlayer.getState().move(dragFrom, to);
    setDragFrom(null);
  };

  if (!current)
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center text-tertiary">
        <span className="type-title-3">Nothing in the queue</span>
        <span className="type-callout">Play a song, album or playlist to fill it.</span>
      </div>
    );

  return (
    <div className="no-scrollbar size-full overflow-y-auto px-2 pb-28">
      <h3 className="px-2 pt-2 pb-1.5 type-body-emphasized text-secondary">Now Playing{source ? ` · ${source.label}` : ''}</h3>
      <Row item={current} index={index} current playing={playing} />
      {mine.length > 0 && (
        <>
          <div className="flex items-center justify-between px-2 pt-5 pb-1.5">
            <h3 className="type-body-emphasized text-secondary">Up Next</h3>
            <button className="type-callout-emphasized text-secondary hover:text-primary" onClick={() => usePlayer.getState().clearUpcoming()}>
              Clear
            </button>
          </div>
          {mine.map(({ item, i }) => (
            <Row key={item.uid} item={item} index={i} onDragStart={setDragFrom} onDrop={drop} />
          ))}
        </>
      )}
      {(auto.length > 0 || radioLoading) && (
        <>
          <h3 className="flex items-center gap-1.5 px-2 pt-5 pb-1.5 type-body-emphasized text-secondary">
            <Radio size={12} /> Autoplay {radioLoading && <Loader2 size={12} className="animate-spin" />}
          </h3>
          {auto.map(({ item, i }) => (
            <Row key={item.uid} item={item} index={i} onDragStart={setDragFrom} onDrop={drop} />
          ))}
        </>
      )}
      {!mine.length && !auto.length && !radioLoading && (
        <p className="px-2 pt-6 type-callout text-tertiary">{autoplay ? 'Similar songs will follow when this one ends.' : 'The queue ends after this song. Turn on Autoplay in Settings to keep going.'}</p>
      )}
    </div>
  );
}
