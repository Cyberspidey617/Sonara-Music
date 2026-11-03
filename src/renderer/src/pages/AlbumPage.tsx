import { DownloadButton } from '@/components/Downloads';
import { Ellipsis, Heart, ListPlus, Radio, Shuffle } from 'lucide-react';
import { useAlbum } from '@/lib/queries';
import { formatTotal, plural } from '@/lib/format';
import { useLibrary } from '@/state/library';
import { openMenuAt } from '@/state/menu';
import { usePlayer } from '@/state/player';
import { toast, useUi } from '@/state/ui';
import { IconButton, PillButton } from '@/components/Buttons';
import { DetailHeader } from '@/components/DetailHeader';
import { PlayGlyph } from '@/components/icons';
import { Page } from '@/components/Page';
import { ShelfView } from '@/components/Shelf';
import { ErrorState, HeaderSkeleton, TrackListSkeleton } from '@/components/States';
import { TrackList } from '@/components/TrackList';

export function AlbumPage({ id }: { id: string }) {
  const { data, error, isLoading, refetch } = useAlbum(id);
  if (isLoading)
    return (
      <>
        <HeaderSkeleton />
        <div className="px-(--body-gutter)">
          <TrackListSkeleton />
        </div>
      </>
    );
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const source = { label: data.title };
  const meta = [data.subtitle?.replace(/^Album • /, ''), plural(data.tracks.length, 'song'), formatTotal(data.tracks)].filter(Boolean).join(' · ');
  return (
    <Page tintUrl={data.thumbnail}>
      <DetailHeader
        thumbnail={data.thumbnail}
        eyebrow={data.subtitle?.split(' • ')[0] ?? 'Album'}
        title={data.title}
        artists={data.artists}
        meta={meta}
        description={data.description}
        actions={
          <>
            <PillButton disabled={!data.tracks.length} onClick={() => usePlayer.getState().playTracks(data.tracks, 0, { source })}>
              <PlayGlyph size={16} /> Play
            </PillButton>
            <PillButton variant="tinted" disabled={!data.tracks.length} onClick={() => usePlayer.getState().playTracks(data.tracks, 0, { shuffle: true, source })}>
              <Shuffle size={16} strokeWidth={2.2} /> Shuffle
            </PillButton>
            <DownloadButton tracks={data.tracks} />
            <IconButton
              aria-label="More"
              onClick={(e) =>
                openMenuAt(e.currentTarget, [
                  { header: data.title },
                  { label: 'Add All to Liked Songs', icon: <Heart size={15} />, onSelect: () => (useLibrary.getState().likeAll(data.tracks), toast('Added to Liked Songs')) },
                  { label: 'Add to Playlist…', icon: <ListPlus size={15} />, onSelect: () => useUi.getState().openDialog({ kind: 'add-to-playlist', tracks: data.tracks }) },
                  { label: 'Play Next', onSelect: () => (usePlayer.getState().playNext(data.tracks), toast('Playing next')) },
                  { label: 'Add to Queue', onSelect: () => (usePlayer.getState().addToQueue(data.tracks), toast('Added to queue')) },
                  ...(data.tracks[0] ? [{ label: 'Start Radio', icon: <Radio size={15} />, onSelect: () => usePlayer.getState().startRadio(data.tracks[0]!) }] : []),
                  { label: 'Save as Playlist', onSelect: () => (useLibrary.getState().createPlaylist(data.title, data.tracks, id), toast(`Saved “${data.title}” to your playlists`)) },
                ], 'below-start')
              }
            >
              <Ellipsis size={18} />
            </IconButton>
          </>
        }
      />
      <div className="px-(--body-gutter) pb-8">
        <TrackList tracks={data.tracks} numbered showAlbum={false} source={source} />
        {data.year && <p className="mt-6 type-callout text-tertiary">Released {data.year}</p>}
      </div>
      {data.more.map((shelf, i) => (
        <ShelfView key={`${shelf.title}-${i}`} shelf={shelf} />
      ))}
    </Page>
  );
}
