import { useEffect, useState, type ReactNode } from 'react';
import { rgb, tintFor, type Rgb } from '@/lib/palette';

/**
 * A page, optionally tinted by its artwork as BitChord's album pages are: the
 * artwork's colour washes the top of the page and fades into black.
 */
export function Page({ tintUrl, children }: { tintUrl?: string; children: ReactNode }) {
  const [tint, setTint] = useState<Rgb | null>(null);
  useEffect(() => {
    setTint(null);
    if (!tintUrl) return;
    let alive = true;
    tintFor(tintUrl).then(
      (c) => alive && setTint(c),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [tintUrl]);
  return (
    <div className="relative min-h-full">
      <div
        className="pointer-events-none absolute right-0 -left-(--content-left) -top-(--titlebar-height) h-[600px] transition-opacity duration-700"
        style={{ opacity: tint ? 1 : 0, background: tint ? `linear-gradient(to bottom, ${rgb(tint, 0.85)}, ${rgb(tint, 0.35)} 55%, transparent)` : undefined }}
        aria-hidden="true"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
