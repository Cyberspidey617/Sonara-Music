import { DownloadButton } from '@/components/Downloads';
import { PlaylistRecommendations } from '@/components/PlaylistRecommendations';
import { Clock, Ellipsis, Heart, ListMusic, Pencil, Shuffle, Trash2 } from 'lucide-react';
import type { Track } from '@shared/types';
import { formatTotal, plural } from '@/lib/format';
import { useLibrary } from '@/state/library';
import { openMenuAt } from '@/state/menu';
import { go } from '@/state/nav';
import { usePlayer } from '@/state/player';
import { toast, useUi } from '@/state/ui';
import { IconButton, PillButton } from '@/components/Buttons';
import { DetailHeader } from '@/components/DetailHeader';
import { PlayGlyph } from '@/components/icons';
import { Mosaic } from '@/components/Mosaic';
import { Page } from '@/components/Page';
import { EmptyState } from '@/components/States';
import { TrackList } from '@/components/TrackList';

function PlayActions({ tracks, label }: { tracks: Track[]; label: string }) {
  return (
    <>
      <PillButton disabled={!tracks.length} onClick={() => usePlayer.getState().playTracks(tracks, 0, { source: { label } })}>
        <PlayGlyph size={16} /> Play
      </PillButton>
      <PillButton variant="tinted" disabled={!tracks.length} onClick={() => usePlayer.getState().playTracks(tracks, 0, { shuffle: true, source: { label } })}>
        <Shuffle size={16} strokeWidth={2.2} /> Shuffle
      </PillButton>
      <DownloadButton tracks={tracks} />
    </>
  );
}

export function LikedPage() {
  const liked = useLibrary((s) => s.liked);
  return (
    <Page>
      <DetailHeader
        artwork={
          <div className="grid size-[clamp(150px,25cqw,232px)] flex-none place-items-center rounded-artwork-lg bg-[linear-gradient(135deg,#5b2a86,#fa586a_60%,#f4a261)] text-white shadow-art">
            <Heart size={84} fill="currentColor" strokeWidth={1.2} />
          </div>
        }
        eyebrow="Playlist"
        title="Liked Songs"
        byline="You"
        meta={liked.length ? `${plural(liked.length, 'song')} · ${formatTotal(liked)}` : undefined}
        actions={<PlayActions tracks={liked} label="Liked Songs" />}
      />
      <div className="px-(--body-gutter) pb-10">
        {liked.length ? (
          <TrackList tracks={liked} source={{ label: 'Liked Songs' }} onRemove={(i) => useLibrary.getState().toggleLike(liked[i]!)} />
        ) : (
          <EmptyState icon={<Heart size={36} strokeWidth={1.5} />} title="Songs you like appear here" body="Tap the heart on any song — in the player, a list, or the full-screen view — to save it." />
        )}
      </div>
    </Page>
  );
}

export function RecentPage() {
  const history = useLibrary((s) => s.history);
  return (
    <Page>
      <DetailHeader
        artwork={
          <div className="grid size-[clamp(150px,25cqw,232px)] flex-none place-items-center rounded-artwork-lg bg-[linear-gradient(135deg,#1f3b57,#3a7ca5_55%,#9ad1d4)] text-white shadow-art">
            <Clock size={84} strokeWidth={1.2} />
          </div>
        }
        eyebrow="History"
        title="Recently Played"
        meta={history.length ? plural(history.length, 'song') : undefined}
        actions={
          <>
            <PlayActions tracks={history} label="Recently Played" />
            {history.length > 0 && (
              <PillButton
                variant="tinted"
                onClick={() => {
                  useLibrary.getState().clearHistory();
                  toast('History cleared');
                }}
              >
                <Trash2 size={15} /> Clear
              </PillButton>
            )}
          </>
        }
      />
      <div className="px-(--body-gutter) pb-10">
        {history.length ? <TrackList tracks={history} source={{ label: 'Recently Played' }} fromHistory /> : <EmptyState icon={<Clock size={36} strokeWidth={1.5} />} title="Nothing played yet" body="What you listen to shows up here." />}
      </div>
    </Page>
  );
}

export function LocalPlaylistPage({ id }: { id: string }) {
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id));
  if (!playlist) return <EmptyState icon={<ListMusic size={36} strokeWidth={1.5} />} title="Playlist not found" body="It may have been deleted." />;
  const remove = (index: number) => {
    const track = playlist.tracks[index];
    useLibrary.getState().removeFromPlaylist(id, index);
    if (track) toast(`Removed “${track.title}”`, { label: 'Undo', run: () => useLibrary.getState().addToPlaylist(id, [track]) });
  };
  return (
    <Page tintUrl={playlist.tracks.find((t) => t.thumbnail)?.thumbnail}>
      <DetailHeader
        artwork={<Mosaic tracks={playlist.tracks} size={232} className="flex-none shadow-art" />}
        eyebrow="Your Playlist"
        title={playlist.name}
        byline="You"
        meta={playlist.tracks.length ? `${plural(playlist.tracks.length, 'song')} · ${formatTotal(playlist.tracks)}` : 'Empty'}
        actions={
          <>
            <PlayActions tracks={playlist.tracks} label={playlist.name} />
            <IconButton
              aria-label="More"
              onClick={(e) =>
                openMenuAt(e.currentTarget, [
                  { header: playlist.name },
                  { label: 'Rename…', icon: <Pencil size={15} />, onSelect: () => useUi.getState().openDialog({ kind: 'rename-playlist', id }) },
                  { label: 'Add to Queue', onSelect: () => (usePlayer.getState().addToQueue(playlist.tracks), toast('Added to queue')) },
                  { separator: true },
                  {
                    label: 'Delete Playlist',
                    icon: <Trash2 size={15} />,
                    destructive: true,
                    onSelect: () => {
                      const copy = playlist;
                      useLibrary.getState().deletePlaylist(id);
                      go({ name: 'home' });
                      toast(`Deleted “${copy.name}”`, { label: 'Undo', run: () => useLibrary.getState().createPlaylist(copy.name, copy.tracks, copy.sourceId) });
                    },
                  },
                ], 'below-start')
              }
            >
              <Ellipsis size={18} />
            </IconButton>
          </>
        }
      />
      <div className="px-(--body-gutter) pb-10">
        {playlist.tracks.length ? (
          <>
            <TrackList tracks={playlist.tracks} source={{ label: playlist.name }} onRemove={remove} />
            <PlaylistRecommendations playlistId={id} name={playlist.name} tracks={playlist.tracks} />
          </>
        ) : (
          <EmptyState icon={<ListMusic size={36} strokeWidth={1.5} />} title="This playlist is empty" body="Add songs from any list with “Add to Playlist…” in its menu, or right-click a song." />
        )}
      </div>
    </Page>
  );
}
