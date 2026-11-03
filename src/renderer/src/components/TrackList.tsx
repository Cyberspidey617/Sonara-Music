import { DownloadStatus } from './Downloads';
import type { CSSProperties } from 'react';
import { Ellipsis } from 'lucide-react';
import { memo } from 'react';
import type { Track } from '@shared/types';
import { formatTime } from '@/lib/format';
import { openContextMenu, openMenuAt } from '@/state/menu';
import { usePlayer, type PlaySource } from '@/state/player';
import { Artwork } from './Artwork';
import { Equalizer, ExplicitBadge, PlayGlyph } from './icons';
import { LikeButton } from './LikeButton';
import { AlbumLink, ArtistLinks } from './Links';
import { trackMenu } from './trackActions';
import { FormatChip } from './QualityBadge';

interface TrackListProps {
  tracks: Track[];
  /** Album pages number their rows; everything else shows artwork. */
  numbered?: boolean;
  showAlbum?: boolean;
  source?: PlaySource;
  onRemove?: (index: number) => void;
  /** Play just this track and follow it with radio, rather than the list from it. */
  playAsRadio?: boolean;
  /** The list is the listening history: each song can be removed from it. */
  fromHistory?: boolean;
}

export function TrackList({ tracks, numbered = false, showAlbum: wantAlbum = true, source, onRemove, playAsRadio = false, fromHistory = false }: TrackListProps) {
  const showAlbum = wantAlbum && tracks.some((t) => t.album?.name);
  const currentId = usePlayer((s) => s.queue[s.index]?.track.videoId ?? null);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'loading');
  const play = (index: number) => {
    const player = usePlayer.getState();
    const track = tracks[index]!;
    if (track.videoId === currentId) {
      player.togglePlay();
      return;
    }
    if (playAsRadio) player.startRadio(track);
    else player.playTracks(tracks, index, { source });
  };

  return (
    <div role="list" className="flex flex-col">
      <div
        className={`grid h-8 items-center gap-3 border-b border-divider px-2 type-callout-emphasized text-tertiary ${showAlbum ? 'grid-cols-[40px_minmax(0,4fr)_minmax(0,3fr)_88px_64px]' : 'grid-cols-[40px_minmax(0,1fr)_88px_64px]'} mb-1`}
        aria-hidden="true"
      >
        <span className="text-center">{numbered ? '#' : ''}</span>
        <span>Title</span>
        {showAlbum && <span>Album</span>}
        <span />
        <span className="pr-2 text-right">Time</span>
      </div>
      {tracks.map((track, i) => (
        <TrackRow
          key={`${track.videoId}-${i}`}
          track={track}
          index={i}
          numbered={numbered}
          showAlbum={showAlbum}
          current={track.videoId === currentId}
          playing={playing}
          onPlay={play}
          onRemove={onRemove}
          fromHistory={fromHistory}
        />
      ))}
    </div>
  );
}

interface RowProps {
  track: Track;
  index: number;
  numbered: boolean;
  showAlbum: boolean;
  current: boolean;
  playing: boolean;
  onPlay: (index: number) => void;
  onRemove?: (index: number) => void;
  fromHistory: boolean;
}

const TrackRow = memo(function TrackRow({ track, index, numbered, showAlbum, current, playing, onPlay, onRemove, fromHistory }: RowProps) {
  const menu = () => trackMenu(track, { ...(onRemove && { removeFromPlaylist: () => onRemove(index) }), fromHistory });
  return (
    <div
      role="listitem"
      style={{ '--i': index } as CSSProperties}
      className={`group stagger grid h-(--row-h) items-center gap-3 rounded-row px-2 hover:bg-tracklist-hover ${current ? 'bg-white/[0.06]' : ''} ${showAlbum ? 'grid-cols-[40px_minmax(0,4fr)_minmax(0,3fr)_88px_64px]' : 'grid-cols-[40px_minmax(0,1fr)_88px_64px]'}`}
      onDoubleClick={() => onPlay(index)}
      onContextMenu={(e) => openContextMenu(e, menu())}
    >
      <div className="relative grid size-(--row-art) place-items-center justify-self-center">
        {numbered ? (
          <span className={`type-body-reduced tabular-nums group-hover:invisible ${current ? 'invisible' : 'text-tertiary'}`}>{index + 1}</span>
        ) : (
          <Artwork url={track.thumbnail} size={40} radius="sm" className="absolute inset-0" />
        )}
        {current && (
          <span className={`absolute inset-0 grid place-items-center rounded-artwork-sm group-hover:invisible ${numbered ? 'text-key' : 'bg-black/55 text-white'}`}>
            <Equalizer playing={playing} />
          </span>
        )}
        <button
          className={`absolute inset-0 hidden place-items-center rounded-artwork-sm group-hover:grid ${numbered ? 'text-primary' : 'bg-black/55 text-white'}`}
          aria-label={current && playing ? 'Pause' : `Play ${track.title}`}
          onClick={() => onPlay(index)}
        >
          {current && playing ? <span className="flex gap-[3px]"><i className="block h-3.5 w-[4px] rounded-[1px] bg-current" /><i className="block h-3.5 w-[4px] rounded-[1px] bg-current" /></span> : <PlayGlyph size={18} />}
        </button>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-0.5">
        <div className="flex min-w-0 items-center">
          <span className={`truncate type-body-reduced ${current ? 'text-key' : 'text-primary'}`}>{track.title}</span>
          {track.explicit && <ExplicitBadge />}
          <FormatChip format={track.format} />
          <DownloadStatus videoId={track.videoId} size={14} className="ml-1.5" />
        </div>
        <ArtistLinks artists={track.artists} className="truncate type-callout text-secondary" />
      </div>
      {showAlbum && <AlbumLink track={track} className="truncate type-callout text-secondary" />}
      <div className="flex items-center justify-end gap-1">
        <LikeButton track={track} size={15} className="size-8 rounded-full text-secondary opacity-0 group-hover:opacity-100 hover:text-primary aria-pressed:opacity-100" />
        <button
          className="grid size-8 place-items-center rounded-full text-secondary opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-primary"
          aria-label="More"
          onClick={(e) => openMenuAt(e.currentTarget, menu())}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Ellipsis size={17} />
        </button>
      </div>
      <span className="pr-2 text-right type-callout tabular-nums text-tertiary">{track.duration ? formatTime(track.duration) : ''}</span>
    </div>
  );
});
