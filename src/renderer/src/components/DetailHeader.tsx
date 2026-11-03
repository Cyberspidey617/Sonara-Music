import type { ReactNode } from 'react';
import type { ArtistRef } from '@shared/types';
import { Artwork } from './Artwork';
import { ArtistLinks } from './Links';

interface DetailHeaderProps {
  thumbnail?: string;
  /** Shown above the title: "Album", "Playlist". */
  eyebrow?: string;
  title: string;
  artists?: ArtistRef[];
  byline?: string;
  meta?: string;
  description?: string;
  actions: ReactNode;
  artwork?: ReactNode;
}

/** The album / playlist header: big artwork, title, artist, metadata, then the action buttons. */
export function DetailHeader({ thumbnail, eyebrow, title, artists, byline, meta, description, actions, artwork }: DetailHeaderProps) {
  return (
    <header className="flex animate-rise items-end gap-[clamp(20px,3cqw,32px)] px-(--body-gutter) pt-6 pb-9 @max-[620px]/page:flex-col @max-[620px]/page:items-start">
      {artwork ?? <Artwork url={thumbnail} size={240} radius="lg" className="size-[clamp(150px,26cqw,240px)] flex-none shadow-[0_18px_44px_rgb(0_0_0/0.45)]" />}
      <div className="flex min-w-0 flex-1 flex-col pb-1">
        {eyebrow && <span className="mb-1 type-body-emphasized text-secondary">{eyebrow}</span>}
        <h1 className="line-clamp-2 text-[clamp(24px,3.4cqw,34px)] leading-[1.18] font-bold tracking-apple text-primary" title={title}>
          {title}
        </h1>
        {artists?.length ? (
          <ArtistLinks artists={artists} className="mt-1 truncate type-[500_22px/28px] tracking-[-0.012em] text-key" />
        ) : byline ? (
          <span className="mt-1 truncate type-[500_22px/28px] tracking-[-0.012em] text-key">{byline}</span>
        ) : null}
        {meta && <span className="mt-2 truncate type-callout-medium text-secondary">{meta}</span>}
        {description && <p className="mt-3 line-clamp-2 max-w-[720px] type-body-reduced text-secondary select-text" title={description}>{description}</p>}
        <div className="mt-6 flex items-center gap-3">{actions}</div>
      </div>
    </header>
  );
}
