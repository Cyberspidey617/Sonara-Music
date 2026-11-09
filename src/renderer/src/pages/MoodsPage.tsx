import { useQuery } from '@tanstack/react-query';
import { Compass } from 'lucide-react';
import type { CSSProperties } from 'react';
import { ShelfView } from '@/components/Shelf';
import { EmptyState, ErrorState, ShelfSkeleton } from '@/components/States';
import { api } from '@/lib/api';
import { go } from '@/state/nav';

/** Genres & Moods: YouTube Music's moods and moments, and its genres, as coloured tiles. */
export function MoodsPage() {
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['moods'], queryFn: () => api.moods(), staleTime: 24 * 60 * 60_000 });
  if (isLoading) return <ShelfSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data?.sections.length) return <EmptyState icon={<Compass size={36} strokeWidth={1.5} />} title="Nothing to browse right now" body="YouTube Music’s moods and genres didn’t load. Try again later." />;
  return (
    <div className="px-(--body-gutter) pt-4 pb-10">
      <h1 className="type-large-title-emphasized">Genres & Moods</h1>
      {data.sections.map((section) => (
        <section key={section.title} className="mt-8">
          <h2 className="mb-3 type-[700_20px/26px] tracking-apple">{section.title}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {section.items.map((item, i) => (
              <button
                key={item.params}
                style={{ '--i': i, '--tile': item.color ?? 'var(--keyColor)' } as CSSProperties}
                className="stagger group relative h-[64px] overflow-hidden rounded-[14px] bg-white/[0.06] px-4 text-left ring-1 ring-white/8 ring-inset transition-colors hover:bg-white/[0.1]"
                onClick={() => go({ name: 'mood', params: item.params, title: item.title, ...(item.color && { color: item.color }) })}
              >
                <span className="absolute inset-y-0 left-0 w-1.5 bg-(--tile)" />
                <span className="absolute -right-6 -bottom-8 size-20 rounded-full bg-(--tile) opacity-25 blur-xl transition-opacity group-hover:opacity-40" />
                <span className="relative type-body-emphasized text-primary">{item.title}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** One mood or genre: YouTube Music's shelves for it. */
export function MoodPage({ params, title, color }: { params: string; title: string; color?: string }) {
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['mood', params], queryFn: () => api.mood(params), staleTime: 6 * 60 * 60_000 });
  return (
    <div className="pt-4 pb-10">
      <div className="relative mb-6 px-(--body-gutter)">
        <span className="pointer-events-none absolute -top-24 left-0 h-48 w-2/3 rounded-full opacity-30 blur-3xl" style={{ background: color ?? 'var(--keyColor)' }} />
        <p className="relative type-footnote font-bold tracking-[0.14em] text-secondary uppercase">Genres & Moods</p>
        <h1 className="relative type-large-title-emphasized">{title}</h1>
      </div>
      {isLoading && <ShelfSkeleton />}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data && !data.length && <EmptyState icon={<Compass size={36} strokeWidth={1.5} />} title="Nothing here right now" body="Try another mood or genre." />}
      {data?.map((shelf, i) => <ShelfView key={`${shelf.title}-${i}`} shelf={shelf} />)}
    </div>
  );
}
