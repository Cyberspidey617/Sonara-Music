import { RotateCw, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api';

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-skeleton ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-[linear-gradient(90deg,transparent,var(--skeleton-shimmer),transparent)]" />
    </div>
  );
}

export function ShelfSkeleton() {
  return (
    <div className="mb-9 px-(--body-gutter)">
      <Skeleton className="mb-3 h-5 w-48 rounded-[4px]" />
      <div className="flex gap-5 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex w-[176px] flex-none flex-col gap-2">
            <Skeleton className="aspect-square w-full rounded-artwork-md" />
            <Skeleton className="h-3.5 w-3/4 rounded-[4px]" />
            <Skeleton className="h-3 w-1/2 rounded-[4px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrackListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-14 items-center gap-3 px-2">
          <Skeleton className="size-10 rounded-artwork-sm" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/3 rounded-[4px]" />
            <Skeleton className="h-3 w-1/5 rounded-[4px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="flex items-end gap-8 px-(--body-gutter) pt-6 pb-8">
      <Skeleton className="size-[232px] flex-none rounded-artwork-lg" />
      <div className="flex flex-1 flex-col gap-3 pb-2">
        <Skeleton className="h-8 w-1/2 rounded-[6px]" />
        <Skeleton className="h-5 w-1/4 rounded-[6px]" />
        <Skeleton className="h-4 w-1/5 rounded-[6px]" />
        <div className="mt-3 flex gap-3">
          <Skeleton className="h-9 w-28 rounded-pill" />
          <Skeleton className="h-9 w-28 rounded-pill" />
        </div>
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-24 text-center">
      <WifiOff size={34} strokeWidth={1.5} className="text-tertiary" />
      <h2 className="type-title-2-emphasized">Couldn’t load this</h2>
      <p className="max-w-[440px] type-body-reduced text-secondary">{errorMessage(error)}</p>
      {onRetry && (
        <button className="mt-2 inline-flex h-8 items-center gap-2 rounded-pill bg-white/10 px-4 type-body-emphasized hover:bg-white/15" onClick={onRetry}>
          <RotateCw size={14} /> Try Again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-24 text-center">
      <div className="text-tertiary">{icon}</div>
      <h2 className="type-title-2-emphasized">{title}</h2>
      <p className="max-w-[420px] type-body-reduced text-secondary">{body}</p>
      {action}
    </div>
  );
}
