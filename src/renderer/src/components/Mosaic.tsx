import { ListMusic } from 'lucide-react';
import type { Track } from '@shared/types';
import { Artwork } from './Artwork';

/** A playlist's cover: its first four distinct artworks in a 2×2 grid. */
export function Mosaic({ tracks, size, className = '' }: { tracks: Track[]; size: number; className?: string }) {
  const arts = [...new Set(tracks.map((t) => t.thumbnail).filter((u): u is string => !!u))].slice(0, 4);
  if (arts.length === 0)
    return (
      <div className={`grid place-items-center rounded-artwork-lg bg-[linear-gradient(135deg,#2c2c30,#18181b)] text-tertiary ${className}`} style={{ width: size, height: size }}>
        <ListMusic size={size * 0.32} strokeWidth={1.3} />
      </div>
    );
  if (arts.length < 4)
    return (
      <div className={`flex-none ${className}`} style={{ width: size, height: size }}>
        <Artwork url={arts[0]} size={size} radius={size < 60 ? 'sm' : 'lg'} className="size-full rounded-[inherit]" />
      </div>
    );
  return (
    <div className={`artwork-stroke relative grid grid-cols-2 overflow-hidden rounded-artwork-lg ${className}`} style={{ width: size, height: size }}>
      {arts.map((url) => (
        <Artwork key={url} url={url} size={size / 2} radius="sm" className="size-full rounded-none" />
      ))}
    </div>
  );
}
