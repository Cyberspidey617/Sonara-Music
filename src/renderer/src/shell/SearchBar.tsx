import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Lockup } from '@shared/types';
import { Artwork } from '@/components/Artwork';
import { openLockup } from '@/components/Lockup';
import { useSuggestions } from '@/lib/queries';
import { go, useNav } from '@/state/nav';
import { useUi } from '@/state/ui';

/** A row in the suggestions: words to search for, or a song, artist or album to go straight to. */
type Row = { kind: 'query'; q: string } | { kind: 'item'; item: Lockup };

/** The search field, centred in the toolbar like Apple Music on the Mac. */
export function SearchBar() {
  const route = useNav((s) => s.stack[s.index]!.route);
  const tick = useUi((s) => s.searchFocusTick);
  const [value, setValue] = useState(route.name === 'search' ? route.q : '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const { data: suggestions } = useSuggestions(open ? value : '');

  useEffect(() => {
    if (tick) {
      input.current?.focus();
      input.current?.select();
    }
  }, [tick]);
  useEffect(() => {
    if (route.name === 'search') setValue(route.q);
  }, [route]);

  const close = () => {
    setOpen(false);
    input.current?.blur();
  };
  // Any click outside the field and its suggestions closes them (what you typed stays), even where
  // the click takes no focus; so does switching to another app.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('blur', close);
    };
  }, [open]);
  const submit = (q: string) => {
    const query = q.trim();
    if (!query) return;
    setValue(query);
    close();
    go({ name: 'search', q: query });
  };
  // A song plays (with its radio after it); an artist, album or playlist opens.
  const choose = (row: Row) => {
    if (row.kind === 'query') return submit(row.q);
    close();
    openLockup(row.item);
  };

  const rows: Row[] =
    open && value.trim().length > 1 && suggestions
      ? [...suggestions.queries.map((q): Row => ({ kind: 'query', q })), ...suggestions.items.map((item): Row => ({ kind: 'item', item }))]
      : [];
  // Open, the field and its suggestions are one piece of glass: a panel drops down from behind the
  // field (which gives up its own glass meanwhile), so nothing is glass inside glass and the blur holds.
  const dropped = rows.length > 0;
  return (
    <div ref={box} className="app-no-drag relative h-[34px] w-full">
      {dropped && (
        <div
          className="glass-thick absolute inset-x-0 top-0 z-40 flex max-h-[min(72vh,600px)] animate-search-drop flex-col overflow-hidden rounded-[18px]"
          style={{ backgroundColor: 'color-mix(in srgb, rgb(var(--pageBG-rgb)) 72%, transparent)' }}
        >
          <div className="h-[34px] flex-none" aria-hidden="true" />
          <div className="mx-3.5 h-px flex-none bg-white/10" aria-hidden="true" />
          <ul className="no-scrollbar min-h-0 overflow-y-auto p-1.5" role="listbox">
            {rows.map((row, i) => (
              <li key={row.kind === 'query' ? `q:${row.q}` : `i:${row.item.kind}:${row.item.id}`} className="stagger" style={{ '--i': i } as CSSProperties} role="option" aria-selected={i === highlight}>
                <button
                  className={`relative flex w-full items-center gap-3 rounded-[12px] px-2.5 text-left transition-colors duration-150 ${row.kind === 'query' ? 'h-9' : 'h-14'} ${i === highlight ? 'bg-white/12' : 'hover:bg-white/8'}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(row)}
                >
                  {row.kind === 'query' ? (
                    <>
                      <Search size={14} className="flex-none text-tertiary" />
                      <span className="truncate type-body-reduced text-secondary">
                        <Typed text={row.q} typed={value} />
                      </span>
                    </>
                  ) : (
                    <>
                      <Artwork url={row.item.thumbnail} size={40} round={row.item.kind === 'artist'} radius="sm" kind={row.item.kind === 'artist' ? 'artist' : 'music'} className="size-10 flex-none" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate type-body-emphasized text-primary">{row.item.title}</span>
                        {row.item.subtitle && <span className="truncate type-callout text-secondary">{row.item.subtitle}</span>}
                      </span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div
        data-elastic="0.3"
        className={`relative z-50 h-full w-full rounded-pill transition-[box-shadow] ${dropped ? '' : 'glass elastic after:opacity-80 focus-within:shadow-[0_0_0_3px_rgb(var(--keyColor-rgb)/0.35),var(--glass-shadow)]'}`}
      >
        <Search size={15} strokeWidth={2.3} className="pointer-events-none absolute top-1/2 left-3.5 z-1 -translate-y-1/2 text-secondary" />
        <input
          ref={input}
          value={value}
          placeholder="Search songs, albums, artists"
          spellCheck={false}
          className="relative z-1 h-full w-full rounded-pill border-0 bg-transparent pr-8 pl-9 type-body-reduced text-primary outline-none placeholder:text-tertiary"
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const row = rows[highlight];
              if (row) choose(row);
              else submit(value);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(rows.length - 1, h + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(-1, h - 1));
            } else if (e.key === 'Escape') close();
          }}
        />
        {value && (
          <button className="absolute top-1/2 right-2 z-1 grid size-5 animate-glyph -translate-y-1/2 place-items-center rounded-full text-tertiary hover:text-primary" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => setValue('')}>
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/** A suggestion with what you've typed in bold, the rest it adds in the lighter colour. */
function Typed({ text, typed }: { text: string; typed: string }) {
  const start = text.toLowerCase().indexOf(typed.trim().toLowerCase());
  if (!typed.trim() || start < 0) return <>{text}</>;
  const end = start + typed.trim().length;
  return (
    <>
      {text.slice(0, start)}
      <strong className="font-semibold text-primary">{text.slice(start, end)}</strong>
      {text.slice(end)}
    </>
  );
}
