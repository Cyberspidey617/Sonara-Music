import { Search } from 'lucide-react';
import type { Lockup as LockupData, SearchResults } from '@shared/types';
import { Segmented } from '@/components/Segmented';
import { useSearch, useYourMusicSearch } from '@/lib/queries';
import { go, type SearchTab } from '@/state/nav';
import { usePlayer } from '@/state/player';
import { Artwork } from '@/components/Artwork';
import { PillButton } from '@/components/Buttons';
import { PlayGlyph } from '@/components/icons';
import { Lockup, openLockup, playLockup } from '@/components/Lockup';
import { ShelfRow } from '@/components/Shelf';
import { EmptyState, ErrorState, ShelfSkeleton, TrackListSkeleton } from '@/components/States';
import { TrackList } from '@/components/TrackList';

function TopResult({ lockup }: { lockup: LockupData }) {
  const round = lockup.kind === 'artist';
  return (
    <div
      className="group glow relative flex min-h-[220px] flex-1 cursor-pointer flex-col justify-end gap-1 rounded-card bg-white/[0.055] p-6 transition-colors duration-300 hover:bg-white/[0.09]"
      onClick={() => openLockup(lockup)}
    >
      <Artwork url={lockup.thumbnail} size={112} round={round} kind={round ? 'artist' : 'music'} className="mb-4 size-28 shadow-art" />
      <span className="truncate type-[700_26px/32px] tracking-apple">{lockup.title}</span>
      {lockup.subtitle && <span className="truncate type-body-reduced text-secondary">{lockup.subtitle}</span>}
      <button
        className="glass-prominent glow absolute right-6 bottom-6 grid size-12 translate-y-1.5 place-items-center rounded-full opacity-0 transition-[opacity,translate,scale] duration-300 ease-(--ease-spring) group-hover:translate-y-0 group-hover:opacity-100 hover:scale-105 active:scale-95"
        aria-label={`Play ${lockup.title}`}
        onClick={(e) => {
          e.stopPropagation();
          void playLockup(lockup);
        }}
      >
        <PlayGlyph size={22} className="relative z-1" />
      </button>
    </div>
  );
}

const TABS: { value: SearchTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'songs', label: 'Songs' },
  { value: 'videos', label: 'Videos' },
  { value: 'albums', label: 'Albums' },
  { value: 'artists', label: 'Artists' },
  { value: 'playlists', label: 'Playlists' },
];

/** One kind of result in full: songs and videos as lists, the rest as a grid of tiles. */
function SearchCategory({ data, tab, q }: { data: SearchResults; tab: Exclude<SearchTab, 'all'>; q: string }) {
  const source = { label: `Search: ${q}` };
  if (tab === 'songs' || tab === 'videos') {
    const tracks = tab === 'songs' ? data.songs : data.videos;
    if (!tracks.length) return <p className="px-(--body-gutter) pt-6 type-body-reduced text-tertiary">No {tab} for “{q}”.</p>;
    return (
      <section className="px-(--body-gutter)">
        <div className="mb-3 flex justify-end">
          <PillButton variant="tinted" className="h-7 min-w-0 px-3 type-body-emphasized" onClick={() => usePlayer.getState().playTracks(tracks, 0, { source })}>
            <PlayGlyph size={13} /> Play All
          </PillButton>
        </div>
        <TrackList tracks={tracks} source={source} />
      </section>
    );
  }
  const items = data[tab];
  if (!items.length) return <p className="px-(--body-gutter) pt-6 type-body-reduced text-tertiary">No {tab} for “{q}”.</p>;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-4 gap-y-6 px-(--body-gutter)">
      {items.map((l) => (
        <Lockup key={l.id} lockup={l} size={170} />
      ))}
    </div>
  );
}

export function SearchPage({ q, tab = 'all' }: { q: string; tab?: SearchTab }) {
  const { data, error, isLoading, refetch } = useSearch(q);
  const mine = useYourMusicSearch(q);
  if (!q.trim()) {
    return <EmptyState icon={<Search size={38} strokeWidth={1.5} />} title="Search YouTube Music" body="Find songs, albums, artists and playlists. Press Ctrl+K anywhere to search." />;
  }
  if (isLoading)
    return (
      <div className="px-0 pt-6">
        <div className="mb-8 px-(--body-gutter)">
          <TrackListSkeleton rows={6} />
        </div>
        <ShelfSkeleton />
      </div>
    );
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;
  const nothing = !data.top && !data.songs.length && !data.albums.length && !data.artists.length && !data.playlists.length;
  if (nothing) return <EmptyState icon={<Search size={38} strokeWidth={1.5} />} title="No results" body={`Nothing on YouTube Music matched “${q}”.`} />;

  const songs = data.songs.slice(0, 20);
  return (
    <div className="pt-4 pb-10">
      <h1 className="mb-1 px-(--body-gutter) type-large-title-emphasized">Results for “{q}”</h1>
      <div className="mt-3 mb-5 px-(--body-gutter)">
        <Segmented<SearchTab> label="Kind of result" tabs value={tab} options={TABS} onChange={(next) => go({ name: 'search', q, tab: next }, { tab: true })} />
      </div>
      {data.correctedQuery && data.correctedQuery.toLowerCase() !== q.toLowerCase() && (
        <p className="mb-2 px-(--body-gutter) type-body-reduced text-secondary">
          Did you mean{' '}
          <button className="text-key hover:underline" onClick={() => go({ name: 'search', q: data.correctedQuery! })}>
            {data.correctedQuery}
          </button>
          ?
        </p>
      )}
      {tab !== 'all' ? (
        <SearchCategory data={data} tab={tab} q={q} />
      ) : (
      <>
      <div className="mt-5 mb-10 grid grid-cols-1 gap-8 px-(--body-gutter) @min-[880px]/page:grid-cols-[minmax(280px,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col">
          <h2 className="mb-3 flex h-8 items-center type-[700_20px/26px] tracking-apple">Top Result</h2>
          {data.top ? <TopResult lockup={data.top} /> : songs[0] && <TopResult lockup={{ kind: 'song', id: songs[0].videoId, title: songs[0].title, subtitle: `Song • ${songs[0].artists.map((a) => a.name).join(', ')}`, thumbnail: songs[0].thumbnail, track: songs[0] }} />}
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex h-8 items-center justify-between">
            <h2 className="type-[700_20px/26px] tracking-apple">Songs</h2>
            {songs.length > 0 && (
              <PillButton variant="tinted" className="h-7 min-w-0 px-3 type-body-emphasized" onClick={() => usePlayer.getState().playTracks(data.songs, 0, { source: { label: `Search: ${q}` } })}>
                <PlayGlyph size={13} /> Play All
              </PillButton>
            )}
          </div>
          <TrackList tracks={songs.slice(0, 5)} showAlbum={false} source={{ label: `Search: ${q}` }} />
        </div>
      </div>
      {mine.data && mine.data.length > 0 && (
        <section className="mb-10 px-(--body-gutter)">
          <h2 className="mb-3 type-[700_20px/26px] tracking-apple">In Your Music</h2>
          <TrackList tracks={mine.data.slice(0, 8)} source={{ label: `Your Music: ${q}` }} />
        </section>
      )}
      {data.artists.length > 0 && (
        <ShelfRow title="Artists">
          {data.artists.map((l) => (
            <div key={l.id} className="flex-none snap-start">
              <Lockup lockup={l} size={160} />
            </div>
          ))}
        </ShelfRow>
      )}
      {data.albums.length > 0 && (
        <ShelfRow title="Albums">
          {data.albums.map((l) => (
            <div key={l.id} className="flex-none snap-start">
              <Lockup lockup={l} size={176} />
            </div>
          ))}
        </ShelfRow>
      )}
      {songs.length > 5 && (
        <section className="mb-10 px-(--body-gutter)">
          <h2 className="mb-3 type-[700_20px/26px] tracking-apple">More Songs</h2>
          <TrackList tracks={songs.slice(5)} source={{ label: `Search: ${q}` }} />
        </section>
      )}
      {data.playlists.length > 0 && (
        <ShelfRow title="Playlists">
          {data.playlists.map((l) => (
            <div key={l.id} className="flex-none snap-start">
              <Lockup lockup={l} size={176} />
            </div>
          ))}
        </ShelfRow>
      )}
      {data.videos.length > 0 && (
        <ShelfRow title="Videos">
          {data.videos.map((t) => (
            <div key={t.videoId} className="flex-none snap-start">
              <Lockup lockup={{ kind: 'video', id: t.videoId, title: t.title, subtitle: t.artists.map((a) => a.name).join(', '), thumbnail: t.thumbnail, track: t }} size={280} />
            </div>
          ))}
        </ShelfRow>
      )}
      </>
      )}
    </div>
  );
}
