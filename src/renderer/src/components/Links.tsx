import type { ArtistRef, Track } from '@shared/types';
import { albumRoute, go } from '@/state/nav';

const link = 'hover:underline';

/** The artists, each opening their page when it's known. */
export function ArtistLinks({ artists, className = '' }: { artists: ArtistRef[]; className?: string }) {
  return (
    <span className={className}>
      {artists.map((a, i) => (
        <span key={`${a.name}-${i}`}>
          {i > 0 && (i === artists.length - 1 ? ' & ' : ', ')}
          {a.id ? (
            <button
              className={link}
              onClick={(e) => {
                e.stopPropagation();
                go({ name: 'artist', id: a.id! });
              }}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {a.name}
            </button>
          ) : (
            a.name
          )}
        </span>
      ))}
    </span>
  );
}

export function AlbumLink({ track, className = '' }: { track: Track; className?: string }) {
  if (!track.album) return <span className={className} />;
  if (!track.album.id) return <span className={className}>{track.album.name}</span>;
  return (
    <span className={className}>
      <button
        className={link}
        onClick={(e) => {
          e.stopPropagation();
          go(albumRoute(track.album!.id!));
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {track.album.name}
      </button>
    </span>
  );
}
