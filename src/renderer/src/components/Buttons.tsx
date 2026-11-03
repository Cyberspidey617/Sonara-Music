import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Capsule buttons in Liquid Glass. `filled` is the prominent style (tinted
 * with the accent) for the one primary action on a screen; `tinted` is
 * regular glass for the rest. Only for the content layer: inside a glass
 * surface (a dialog, the sidebar) use plain fills instead, never glass on glass.
 */
export function PillButton({ children, variant = 'filled', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: 'filled' | 'tinted' }) {
  const look = variant === 'filled' ? 'glass-prominent hover:brightness-110' : 'glass text-primary';
  return (
    <button
      className={`glow elastic relative inline-flex h-[38px] min-w-[112px] items-center justify-center gap-2 rounded-pill px-5 type-title-3-emphasized transition-[scale,filter] duration-200 ease-(--ease-spring) active:scale-[0.96] disabled:opacity-40 ${look} ${className}`}
      {...props}
    >
      <span className="relative z-1 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

export function IconButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button className={`glass glow elastic relative grid size-[38px] place-items-center rounded-full text-primary transition-[scale] duration-200 ease-(--ease-spring) active:scale-[0.92] ${className}`} {...props}>
      <span className="relative z-1 grid place-items-center">{children}</span>
    </button>
  );
}
