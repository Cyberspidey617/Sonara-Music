import { DownloadButton } from '@/components/Downloads';
import { Download, Ellipsis, Heart, ListPlus, Shuffle } from 'lucide-react';
import { usePlaylist } from '@/lib/queries';
import { api, errorMessage } from '@/lib/api';
import { formatTotal, plural } from '@/lib/format';
import { useLibrary } from '@/state/library';
import { openMenuAt } from '@/state/menu';
import { go } from '@/state/nav';
import { usePlayer } from '@/state/player';
import { toast, useUi } from '@/state/ui';
import { IconButton, PillButton } from '@/components/Buttons';
import { DetailHeader } from '@/components/DetailHeader';
import { PlayGlyph } from '@/components/icons';
import { Page } from '@/components/Page';
import { ErrorState, HeaderSkeleton, TrackListSkeleton } from '@/components/States';
import { TrackList } from '@/components/TrackList';

/** A YouTube Music playlist (not one of the user's own). */
export function PlaylistPage({ id }: { id: string }) {
  const { data, error, isLoading, refetch } = usePlaylist(id);
  const saved = useLibrary((s) => s.playlists.find((p) => p.sourceId === id));
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

  const save = async () => {
    if (saved) {
      go({ name: 'local', id: saved.id });
      return;
    }
    toast(`Saving “${data.title}”…`);
    try {
      // The page shows the first few hundred tracks; saving reads them all.
      const full = await api.importPlaylist(id);
      const newId = useLibrary.getState().createPlaylist(data.title, full.tracks, id);
      toast(`Saved ${plural(full.tracks.length, 'song')} to your playlists`, { label: 'Open', run: () => go({ name: 'local', id: newId }) });
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <Page tintUrl={data.thumbnail}>
      <DetailHeader
        thumbnail={data.thumbnail}
        eyebrow="Playlist"
        title={data.title}
        byline={data.author}
        meta={[data.subtitle?.replace(/^Playlist • /, ''), !data.subtitle && `${plural(data.tracks.length, 'song')} · ${formatTotal(data.tracks)}`].filter(Boolean).join(' · ')}
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
            <PillButton variant="tinted" onClick={() => void save()}>
              <Download size={16} /> {saved ? 'Saved' : 'Save'}
            </PillButton>
            <IconButton
              aria-label="More"
              onClick={(e) =>
                openMenuAt(e.currentTarget, [
                  { header: data.title },
                  { label: 'Add All to Liked Songs', icon: <Heart size={15} />, onSelect: () => (useLibrary.getState().likeAll(data.tracks), toast('Added to Liked Songs')) },
                  { label: 'Add to Playlist…', icon: <ListPlus size={15} />, onSelect: () => useUi.getState().openDialog({ kind: 'add-to-playlist', tracks: data.tracks }) },
                  { label: 'Add to Queue', onSelect: () => (usePlayer.getState().addToQueue(data.tracks), toast('Added to queue')) },
                  { label: 'Open on YouTube Music', onSelect: () => void api.openExternal(`https://music.youtube.com/playlist?list=${id.replace(/^VL/, '')}`) },
                ], 'below-start')
              }
            >
              <Ellipsis size={18} />
            </IconButton>
          </>
        }
      />
      <div className="px-(--body-gutter) pb-10">
        <TrackList tracks={data.tracks} source={source} />
      </div>
    </Page>
  );
}
