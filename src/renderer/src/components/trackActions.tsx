import { Disc3, FolderOpen, HardDriveDownload, Heart, HeartOff, Link2, ListEnd, ListPlus, ListStart, Radio, Trash2, User } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadTracks, useDownloads } from '@/state/downloads';
import type { Track } from '@shared/types';
import type { MenuEntry } from '@/state/menu';
import { useLibrary } from '@/state/library';
import { isYouTubeId } from '@shared/types';
import { albumRoute, go } from '@/state/nav';
import { usePlayer } from '@/state/player';
import { toast, useUi } from '@/state/ui';

const ICON = { size: 15, strokeWidth: 1.9 };

/** Download, or (once saved) show the file / remove it. */
function downloadEntries(track: Track): MenuEntry[] {
  const d = useDownloads.getState().items[track.videoId];
  if (track.source === 'local') return [];
  if (d?.state === 'done')
    return [
      { label: 'Show Downloaded File', icon: <FolderOpen {...ICON} />, onSelect: () => void api.showDownload(track.videoId) },
      { label: 'Remove Download', icon: <Trash2 {...ICON} />, onSelect: () => void api.removeDownload(track.videoId, true).then(() => toast('Download removed')) },
    ];
  if (d && d.state !== 'error') return [{ label: `Cancel Download (${d.total ? Math.round((d.received / d.total) * 100) : 0}%)`, icon: <HardDriveDownload {...ICON} />, onSelect: () => void api.cancelDownload(track.videoId) }];
  return [{ label: 'Download…', icon: <HardDriveDownload {...ICON} />, onSelect: () => downloadTracks([track]) }];
}

/** The actions every track offers, in its "…" menu and on right-click. */
export function trackMenu(track: Track, extra: { removeFromPlaylist?: () => void; removeFromQueue?: () => void } = {}): MenuEntry[] {
  const liked = useLibrary.getState().isLiked(track.videoId);
  const artist = track.artists.find((a) => a.id);
  const entries: MenuEntry[] = [
    { header: track.title },
    {
      label: 'Play Next',
      icon: <ListStart {...ICON} />,
      onSelect: () => {
        usePlayer.getState().playNext([track]);
        toast('Playing next');
      },
    },
    {
      label: 'Add to Queue',
      icon: <ListEnd {...ICON} />,
      onSelect: () => {
        usePlayer.getState().addToQueue([track]);
        toast('Added to queue');
      },
    },
    { label: 'Start Radio', icon: <Radio {...ICON} />, onSelect: () => usePlayer.getState().startRadio(track) },
    { separator: true },
    ...downloadEntries(track),
    {
      label: liked ? 'Remove from Liked Songs' : 'Add to Liked Songs',
      icon: liked ? <HeartOff {...ICON} /> : <Heart {...ICON} />,
      onSelect: () => toast(useLibrary.getState().toggleLike(track) ? 'Added to Liked Songs' : 'Removed from Liked Songs'),
    },
    { label: 'Add to Playlist…', icon: <ListPlus {...ICON} />, onSelect: () => useUi.getState().openDialog({ kind: 'add-to-playlist', tracks: [track] }) },
  ];
  if (artist || track.album?.id) entries.push({ separator: true });
  if (artist) entries.push({ label: `Go to ${artist.name}`, icon: <User {...ICON} />, onSelect: () => go({ name: 'artist', id: artist.id! }) });
  if (track.album?.id) entries.push({ label: 'Go to Album', icon: <Disc3 {...ICON} />, onSelect: () => go(albumRoute(track.album!.id!)) });
  entries.push({ separator: true });
  if (isYouTubeId(track.videoId)) entries.push({
    label: 'Copy Link',
    icon: <Link2 {...ICON} />,
    onSelect: () => {
      void navigator.clipboard.writeText(`https://music.youtube.com/watch?v=${track.videoId}`);
      toast('Link copied');
    },
  });
  if (extra.removeFromPlaylist) entries.push({ label: 'Remove from Playlist', icon: <Trash2 {...ICON} />, destructive: true, onSelect: extra.removeFromPlaylist });
  if (extra.removeFromQueue) entries.push({ label: 'Remove from Queue', icon: <Trash2 {...ICON} />, destructive: true, onSelect: extra.removeFromQueue });
  return entries;
}
