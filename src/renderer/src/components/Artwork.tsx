import { Disc3, User } from 'lucide-react';
import { sizedArtwork } from '@/lib/artwork';

interface ArtworkProps {
  url?: string;
  /** Displayed size in CSS px, for picking the image size to load. */
  size: number;
  className?: string;
  round?: boolean;
  radius?: 'sm' | 'md' | 'lg';
  kind?: 'music' | 'artist';
}

/** Images already decoded once: shown at once instead of fading in again (so a morph never shows a placeholder). */
const seen = new Set<string>();
export function preloadArtwork(url: string | undefined, size: number) {
  const src = sizedArtwork(url, size);
  if (!src || seen.has(src)) return;
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.src = src;
  img.decode().then(() => seen.add(src), () => undefined);
}

const radii = { sm: 'rounded-artwork-sm', md: 'rounded-artwork-md', lg: 'rounded-artwork-lg' };

export function Artwork({ url, size, className = '', round = false, radius = 'md', kind = 'music' }: ArtworkProps) {
  const src = sizedArtwork(url, size);
  return (
    <div className={`artwork-stroke overflow-hidden bg-joe ${/\babsolute\b/.test(className) ? '' : 'relative'} ${round ? 'rounded-full' : radii[radius]} ${className}`}>
      <span className="absolute inset-0 grid place-items-center text-tertiary">
        {kind === 'artist' ? <User size={Math.max(14, size * 0.35)} strokeWidth={1.4} /> : <Disc3 size={Math.max(14, size * 0.35)} strokeWidth={1.4} />}
      </span>
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          loading={seen.has(src) ? 'eager' : 'lazy'}
          {...(seen.has(src) ? { 'data-loaded': '' } : {})}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          className="relative size-full object-cover opacity-0 transition-opacity duration-300 ease-in data-loaded:opacity-100"
          onLoad={(e) => {
            seen.add(src);
            e.currentTarget.setAttribute('data-loaded', '');
          }}
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
    </div>
  );
}
