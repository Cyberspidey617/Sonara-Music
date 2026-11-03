import type { SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function glyph(d: string, viewBox = '0 0 24 24') {
  return function Glyph({ size = 24, ...props }: IconProps) {
    return (
      <svg width={size} height={size} viewBox={viewBox} fill="currentColor" aria-hidden="true" {...props}>
        <path d={d} />
      </svg>
    );
  };
}

// Filled transport glyphs, drawn for Obsidian.
export const PlayGlyph = glyph('M7.2 4.6v14.8c0 1 1.1 1.6 1.9 1.1l11.3-7.4c.8-.5.8-1.6 0-2.1L9.1 3.5c-.8-.5-1.9.1-1.9 1.1z');
export const PauseGlyph = glyph(
  'M6.6 4h2.8c.6 0 1.1.5 1.1 1.1v13.8c0 .6-.5 1.1-1.1 1.1H6.6c-.6 0-1.1-.5-1.1-1.1V5.1C5.5 4.5 6 4 6.6 4zm8 0h2.8c.6 0 1.1.5 1.1 1.1v13.8c0 .6-.5 1.1-1.1 1.1h-2.8c-.6 0-1.1-.5-1.1-1.1V5.1c0-.6.5-1.1 1.1-1.1z',
);
export const NextGlyph = glyph(
  'M4.2 5.7v12.6c0 .9 1 1.4 1.7.9l9.3-6.3c.7-.4.7-1.4 0-1.8L5.9 4.8c-.7-.5-1.7 0-1.7.9zM17.6 4.6h1.3c.6 0 1 .4 1 1v12.8c0 .6-.4 1-1 1h-1.3c-.6 0-1-.4-1-1V5.6c0-.6.4-1 1-1z',
);
export function PreviousGlyph(props: IconProps) {
  return <NextGlyph {...props} style={{ transform: 'scaleX(-1)', ...props.style }} />;
}

/** Obsidian's mark: a faceted shard of volcanic glass. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M32 3 53 19l-6 39H17l-6-39z" fill="currentColor" opacity=".28" />
      <path d="M32 3 30 27 11 19z" fill="currentColor" opacity=".95" />
      <path d="M32 3 53 19 30 27z" fill="currentColor" opacity=".62" />
      <path d="M11 19l19 8-13 31z" fill="currentColor" opacity=".78" />
      <path d="M53 19 30 27l17 31z" fill="currentColor" opacity=".42" />
      <path d="M30 27 17 58h30z" fill="currentColor" opacity=".55" />
    </svg>
  );
}

/** Three bars that dance while a row's track plays. */
export function Equalizer({ playing, className = '' }: { playing: boolean; className?: string }) {
  return (
    <span className={`inline-flex h-3.5 items-end gap-[2px] ${className}`} aria-hidden="true">
      {[0, 0.25, 0.5].map((delay) => (
        <span
          key={delay}
          className={`h-full w-[3px] origin-bottom rounded-[1px] bg-current ${playing ? 'animate-eq' : 'scale-y-50'}`}
          style={{ animationDelay: `${-delay}s` }}
        />
      ))}
    </span>
  );
}

export function ExplicitBadge() {
  return (
    <span className="ml-1.5 inline-grid h-[13px] min-w-[13px] flex-none place-items-center rounded-[3px] bg-tertiary px-[3px] text-[9px] leading-none font-bold text-page" title="Explicit" aria-label="Explicit">
      E
    </span>
  );
}
