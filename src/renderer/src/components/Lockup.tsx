import { Disc3, Ellipsis, ListMusic, Play, Shuffle, User } from 'lucide-react';
import type { Lockup as LockupData, Track } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useLibrary } from '@/state/library';
import { go } from '@/state/nav';
import { openContextMenu, openMenuAt, type MenuEntry } from '@/state/menu';
import { usePlayer } from '@/state/player';
import { toast } from '@/state/ui';
import { Artwork } from './Artwork';
import { PlayGlyph } from './icons';
import { trackMenu } from './trackActions';

export function openLockup(lockup: LockupData) {
  if (lockup.track) {
    usePlayer.getState().startRadio(lockup.track);
    return;
  }
  if (lockup.kind === 'localAlbum') go({ name: 'musicAlbum', source: 'local', id: lockup.id });
  else if (lockup.kind === 'serverAlbum') go({ name: 'musicAlbum', source: 'server', id: lockup.id });
  else if (lockup.kind === 'album') go({ name: 'album', id: lockup.id });
  else if (lockup.kind === 'artist') go({ name: 'artist', id: lockup.id });
  else if (lockup.kind === 'playlist') go({ name: 'playlist', id: lockup.id });
}

/** Plays an album or playlist straight from its tile. */
export async function playLockup(lockup: LockupData, shuffle = false) {
  if (lockup.track) {
    usePlayer.getState().startRadio(lockup.track);
    return;
  }
  try {
    let tracks: Track[] = [];
    if (lockup.kind === 'localAlbum') tracks = (await api.localAlbum(lockup.id)).tracks;
    else if (lockup.kind === 'serverAlbum') tracks = (await api.serverAlbum(lockup.id)).tracks;
    else if (lockup.kind === 'album') tracks = (await api.album(lockup.id)).tracks;
    else if (lockup.kind === 'playlist') tracks = (await api.playlist(lockup.id)).tracks;
    else if (lockup.kind === 'artist') tracks = (await api.artist(lockup.id)).topSongs;
    if (!tracks.length) throw new Error('Nothing to play here.');
    usePlayer.getState().playTracks(tracks, 0, { shuffle, source: { label: lockup.title } });
  } catch (error) {
    toast(errorMessage(error));
  }
}

const ICON = { size: 15, strokeWidth: 1.9 };

function lockupMenu(lockup: LockupData, fromHistory: boolean): MenuEntry[] {
  if (lockup.track) return trackMenu(lockup.track, { fromHistory });
  return [
    { header: lockup.title },
    { label: 'Play', icon: <Play {...ICON} />, onSelect: () => void playLockup(lockup) },
    { label: 'Shuffle', icon: <Shuffle {...ICON} />, onSelect: () => void playLockup(lockup, true) },
    { separator: true },
    {
      label: lockup.kind === 'artist' ? 'Go to Artist' : lockup.kind === 'playlist' ? 'Open Playlist' : 'Go to Album',
      icon: lockup.kind === 'artist' ? <User {...ICON} /> : lockup.kind === 'playlist' ? <ListMusic {...ICON} /> : <Disc3 {...ICON} />,
      onSelect: () => openLockup(lockup),
    },
  ];
}

/** A square tile (round for artists): artwork, title, subtitle; a play button on hover. */
export function Lockup({ lockup, size: baseSize = 180, fromHistory = false }: { lockup: LockupData; size?: number; fromHistory?: boolean }) {
  // Settings › Layout › Cover size; 0 (fill a grid cell) stays as it is.
  const coverScale = useLibrary((s) => s.settings.coverSize ?? 1);
  const size = Math.round(baseSize * coverScale);
  const artist = lockup.kind === 'artist';
  const video = lockup.kind === 'video';
  return (
    <div className={`group flex min-w-0 flex-col ${size ? '' : 'w-full'}`} style={size ? { width: size } : undefined} onContextMenu={(e) => openContextMenu(e, lockupMenu(lockup, fromHistory))}>
      <div className="relative cursor-pointer transition-[translate,scale] duration-500 ease-(--ease-spring) group-hover:-translate-y-1 group-hover:scale-[1.02] active:scale-[0.98]" onClick={() => openLockup(lockup)}>
        <Artwork url={lockup.thumbnail} size={size || 226} round={artist} kind={artist ? 'artist' : 'music'} className={video ? 'aspect-video w-full' : 'aspect-square w-full'} />
        {!artist && (
          <div className="absolute inset-0 rounded-artwork-md bg-[linear-gradient(to_top,rgb(0_0_0/0.42),transparent_50%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            {/* Glass controls over the artwork: they rise into place on hover. */}
            <button
              className="glass-clear glow elastic absolute bottom-2.5 left-2.5 grid size-10 translate-y-1.5 place-items-center rounded-full text-white transition-[translate,scale] duration-300 ease-(--ease-spring) group-hover:translate-y-0 hover:scale-105 active:scale-95"
              aria-label={`Play ${lockup.title}`}
              onClick={(e) => {
                e.stopPropagation();
                void playLockup(lockup);
              }}
            >
              <PlayGlyph size={18} className="relative z-1" />
            </button>
            <button
              className="glass-clear glow elastic absolute right-2.5 bottom-2.5 grid size-8 translate-y-1.5 place-items-center rounded-full text-white transition-[translate] delay-[40ms] duration-300 ease-(--ease-spring) group-hover:translate-y-0"
              aria-label="More"
              onClick={(e) => {
                e.stopPropagation();
                openMenuAt(e.currentTarget, lockupMenu(lockup, fromHistory), 'below-start');
              }}
            >
              <Ellipsis size={16} className="relative z-1" />
            </button>
          </div>
        )}
      </div>
      <button className={`mt-2 truncate type-body-reduced text-primary hover:underline ${artist ? 'text-center' : 'text-left'}`} onClick={() => openLockup(lockup)} title={lockup.title}>
        {lockup.title}
      </button>
      {lockup.subtitle && <span className={`truncate type-callout text-secondary ${artist ? 'text-center' : ''}`} title={lockup.subtitle}>{lockup.subtitle}</span>}
    </div>
  );
}
