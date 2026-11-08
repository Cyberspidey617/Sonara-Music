import { Shuffle, Sparkle } from 'lucide-react';

/** The shuffle button's glyph; with a small sparkle for Smart Shuffle. */
export function ShuffleGlyph({ smart, size }: { smart: boolean; size: number }) {
  return (
    <span className="relative inline-grid place-items-center">
      <Shuffle size={size} strokeWidth={2.2} />
      {smart && <Sparkle size={Math.round(size * 0.5)} strokeWidth={2.4} className="absolute -top-1 -right-1.5 fill-current text-key" />}
    </span>
  );
}
