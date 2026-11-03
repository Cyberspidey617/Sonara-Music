import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useLiquidLens } from '@/lib/glass';
import { createPortal } from 'react-dom';
import { useMenu } from '@/state/menu';

/** The one menu on screen: context menus and "…" menus all render here. */
export function MenuLayer() {
  const entries = useMenu((s) => s.entries);
  const anchor = useMenu((s) => s.anchor);
  const close = useMenu((s) => s.close);
  const ref = useRef<HTMLDivElement>(null);
  // Menus are small floating glass: they refract what's behind their rim.
  const lens = useLiquidLens(ref, { band: 14, strength: 30, blur: 28, key: entries });
  const [position, setPosition] = useState<{ left: number; top: number; origin: string } | null>(null);

  useLayoutEffect(() => {
    if (!entries || !anchor || !ref.current) {
      setPosition(null);
      return;
    }
    // Layout size, not getBoundingClientRect: the open animation scales the menu down at first,
    // and measuring it mid-animation would place a tall menu off the bottom of the window.
    const menu = { width: ref.current.offsetWidth, height: ref.current.offsetHeight };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.x;
    let top = anchor.y;
    if (anchor.rect) {
      const p = anchor.placement ?? 'below-end';
      left = p.endsWith('end') ? anchor.rect.right - menu.width : anchor.rect.left;
      top = p.startsWith('above') ? anchor.rect.top - menu.height - 6 : anchor.rect.bottom + 6;
      if (top + menu.height > vh - 8) top = anchor.rect.top - menu.height - 6;
      if (top < 8) top = anchor.rect.bottom + 6;
    } else {
      if (left + menu.width > vw - 8) left = left - menu.width;
      if (top + menu.height > vh - 8) top = Math.max(8, top - menu.height);
    }
    const finalLeft = Math.max(8, Math.min(left, vw - menu.width - 8));
    const finalTop = Math.max(8, Math.min(top, vh - menu.height - 8));
    // The menu grows out of the point (or button) it was opened from.
    const ox = Math.max(0, Math.min(menu.width, (anchor.rect ? (anchor.placement?.endsWith('end') ? anchor.rect.right : anchor.rect.left) : anchor.x) - finalLeft));
    const oy = Math.max(0, Math.min(menu.height, (anchor.rect ? (finalTop < anchor.rect.top ? anchor.rect.top : anchor.rect.bottom) : anchor.y) - finalTop));
    setPosition({ left: finalLeft, top: finalTop, origin: `${ox}px ${oy}px` });
  }, [entries, anchor]);

  useLayoutEffect(() => {
    if (!entries) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onScroll = () => close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    window.addEventListener('blur', onScroll);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('blur', onScroll);
    };
  }, [entries, close]);

  if (!entries || !anchor) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[10000]"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
      onContextMenu={(e) => {
        e.preventDefault();
        close();
      }}
      onWheel={close}
    >
      <div
        ref={ref}
        role="menu"
        className="glass-thick absolute min-w-[230px] max-w-[320px] animate-menu-in rounded-[14px] p-1.5"
        style={position ? { left: position.left, top: position.top, transformOrigin: position.origin, ...lens } : { left: -9999, top: -9999 }}
      >
        {entries.map((entry, i) => {
          if ('separator' in entry) return <div key={i} className="mx-2.5 my-1 h-px bg-divider" />;
          if ('header' in entry)
            return (
              <div key={i} className="truncate px-2.5 pt-1.5 pb-1 type-subhead-emphasized text-tertiary">
                {entry.header}
              </div>
            );
          return (
            <button
              key={i}
              role="menuitem"
              disabled={entry.disabled}
              style={{ '--i': i } as CSSProperties}
              className={`menu-item relative flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left type-body-reduced transition-[background-color,scale] duration-150 hover:bg-white/12 active:scale-[0.97] disabled:opacity-40 disabled:hover:bg-transparent ${entry.destructive ? 'text-[#ff6b61]' : 'text-primary'}`}
              onClick={() => {
                close();
                entry.onSelect();
              }}
            >
              {entry.icon && <span className="grid size-4 flex-none place-items-center text-secondary">{entry.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {entry.hint && <span className="type-callout text-tertiary">{entry.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
