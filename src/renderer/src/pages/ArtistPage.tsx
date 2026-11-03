import { Radio, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { useArtist } from '@/lib/queries';
import { largeArtwork } from '@/lib/artwork';
import { usePlayer } from '@/state/player';
import { PillButton } from '@/components/Buttons';
import { PlayGlyph } from '@/components/icons';
import { ShelfView } from '@/components/Shelf';
import { ErrorState, Skeleton, TrackListSkeleton } from '@/components/States';
import { TrackList } from '@/components/TrackList';

export function ArtistPage({ id }: { id: string }) {
  const { data, error, isLoading, refetch } = useArtist(id);
  const [expanded, setExpanded] = useState(false);
  if (isLoading)
    return (
      <>
        <Skeleton className="h-[380px] w-full" />
        <div className="px-(--body-gutter) pt-6">
          <TrackListSkeleton rows={5} />
        </div>
      </>
    );
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const source = { label: data.name };
  const hero = largeArtwork(data.thumbnail);
  return (
    <div className="pb-10">
      {/* The hero: the artist's image, fading into the page, with the name over its foot.
          It extends beneath the floating sidebar, as Apple's background extension does. */}
      <header className="relative -mt-(--titlebar-height) -ml-(--content-left) h-[min(50vh,480px)] min-h-[340px] overflow-hidden">
        {hero && <img src={hero} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover object-[50%_25%]" onError={(e) => (e.currentTarget.style.display = 'none')} />}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--pageBG)_2%,rgb(var(--pageBG-rgb)/0.55)_45%,rgb(0_0_0/0.15))]" />
        <div className="absolute inset-x-0 bottom-0 pr-(--body-gutter) pb-7 pl-[calc(var(--content-left)+var(--body-gutter))]">
          <h1 className="type-[700_56px/62px] tracking-[-0.03em] drop-shadow-[0_2px_20px_rgb(0_0_0/0.5)]">{data.name}</h1>
          {data.subscribers && <p className="mt-1 type-body-reduced text-secondary">{data.subscribers}</p>}
          <div className="mt-5 flex gap-3">
            <PillButton disabled={!data.topSongs.length} onClick={() => usePlayer.getState().playTracks(data.topSongs, 0, { source })}>
              <PlayGlyph size={16} /> Play
            </PillButton>
            <PillButton variant="tinted" disabled={!data.topSongs.length} onClick={() => usePlayer.getState().playTracks(data.topSongs, 0, { shuffle: true, source })}>
              <Shuffle size={16} strokeWidth={2.2} /> Shuffle
            </PillButton>
            {data.topSongs[0] && (
              <PillButton variant="tinted" onClick={() => usePlayer.getState().startRadio(data.topSongs[0]!)}>
                <Radio size={16} /> Radio
              </PillButton>
            )}
          </div>
        </div>
      </header>
      {data.topSongs.length > 0 && (
        <section className="mt-6 mb-10 px-(--body-gutter)">
          <h2 className="mb-3 type-[700_20px/26px] tracking-apple">Top Songs</h2>
          <TrackList tracks={data.topSongs} source={source} />
        </section>
      )}
      {data.shelves.map((shelf, i) => (
        <ShelfView key={`${shelf.title}-${i}`} shelf={shelf} />
      ))}
      {data.description && (
        <section className="mx-(--body-gutter) mb-6 max-w-[860px] rounded-card bg-white/[0.055] p-6">
          <h2 className="mb-2 type-[700_20px/26px] tracking-apple">About</h2>
          <p className={`type-body-reduced whitespace-pre-line text-secondary select-text ${expanded ? '' : 'line-clamp-4'}`}>{data.description}</p>
          <button className="mt-2 type-body-emphasized text-key hover:underline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Less' : 'More'}
          </button>
        </section>
      )}
    </div>
  );
}
