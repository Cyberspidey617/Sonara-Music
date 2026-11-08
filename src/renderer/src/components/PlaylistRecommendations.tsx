import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { Track } from '@shared/types';
import { Artwork } from '@/components/Artwork';
import { trackMenu } from '@/components/trackActions';
import { artistLine } from '@/lib/format';
import { recommendForPlaylist } from '@/lib/taste';
import { useLibrary } from '@/state/library';
import { openContextMenu } from '@/state/menu';
import { useOnline } from '@/state/online';
import { usePlayer } from '@/state/player';
import { toast } from '@/state/ui';

const SHOWN = 8;

/** Under one of your playlists: songs like the ones in it, each one click from being added. */
export function PlaylistRecommendations({ playlistId, name, tracks }: { playlistId: string; name: string; tracks: Track[] }) {
  const online = useOnline((s) => s.online);
  const notInterested = useLibrary((s) => s.settings.notInterested ?? []);
  const notInterestedArtists = useLibrary((s) => s.settings.notInterestedArtists ?? []);
  const [page, setPage] = useState(0);
  // Seeds: its first, middle and last songs, so adding a song doesn't fetch everything again.
  const seeds = [tracks[0], tracks[Math.floor(tracks.length / 2)], tracks[tracks.length - 1]].map((t) => t?.videoId);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['playlist-recommendations', playlistId, seeds, notInterested, notInterestedArtists],
    queryFn: () => recommendForPlaylist(tracks, { notInterested, notInterestedArtists }),
    enabled: online && tracks.length > 0,
    staleTime: 60 * 60_000,
    placeholderData: (previous) => previous,
  });
  if (!online || !tracks.length) return null;
  const inList = new Set(tracks.map((t) => t.videoId));
  const all = (data ?? []).filter((t) => !inList.has(t.videoId));
  const pages = Math.max(1, Math.ceil(all.length / SHOWN));
  const shown = all.slice((page % pages) * SHOWN, (page % pages) * SHOWN + SHOWN);

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between gap-4 px-2">
        <div>
          <h2 className="flex items-center gap-2 type-title-2-emphasized text-primary">
            <Sparkles size={18} className="text-key" /> Recommended
          </h2>
          <p className="type-callout text-secondary">Based on what’s in this playlist</p>
        </div>
        {all.length > SHOWN && (
          <button className="flex items-center gap-1.5 rounded-pill px-3 py-1.5 type-callout-emphasized text-secondary hover:bg-white/8 hover:text-primary" onClick={() => setPage((p) => p + 1)}>
            <RefreshCw size={14} /> Refresh
          </button>
        )}
        {all.length <= SHOWN && all.length > 0 && (
          <button className="flex items-center gap-1.5 rounded-pill px-3 py-1.5 type-callout-emphasized text-secondary hover:bg-white/8 hover:text-primary" disabled={isFetching} onClick={() => void refetch()}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        )}
      </div>
      <div className="mt-3">
        {isLoading && <p className="px-2 type-callout text-tertiary">Finding songs for this playlist…</p>}
        {!isLoading && !shown.length && <p className="px-2 type-callout text-tertiary">No recommendations right now.</p>}
        {shown.map((t) => (
          <div
            key={t.videoId}
            className="group flex h-(--row-h) items-center gap-3 rounded-row px-2 hover:bg-tracklist-hover"
            onDoubleClick={() => usePlayer.getState().playTracks([t], 0, { source: { label: `Recommended for ${name}` } })}
            onContextMenu={(e) => openContextMenu(e, trackMenu(t))}
          >
            <button className="size-(--row-art) flex-none" aria-label={`Play ${t.title}`} onClick={() => usePlayer.getState().playTracks([t], 0, { source: { label: `Recommended for ${name}` } })}>
              <Artwork url={t.thumbnail} size={40} radius="sm" className="size-full" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate type-body-reduced text-primary">{t.title}</span>
              <span className="truncate type-callout text-secondary">{artistLine(t)}</span>
            </div>
            <button
              className="flex flex-none items-center gap-1 rounded-pill border border-white/20 px-3 py-1 type-callout-emphasized text-primary hover:border-white/40 hover:bg-white/8"
              onClick={() => {
                useLibrary.getState().addToPlaylist(playlistId, [t]);
                toast(`Added to ${name}`);
              }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
