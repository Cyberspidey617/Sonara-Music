import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSuggestions } from '@/lib/queries';
import { go, useNav } from '@/state/nav';
import { useUi } from '@/state/ui';

/** The search field, centred in the toolbar like Apple Music on the Mac. */
export function SearchBar() {
  const route = useNav((s) => s.stack[s.index]!.route);
  const tick = useUi((s) => s.searchFocusTick);
  const [value, setValue] = useState(route.name === 'search' ? route.q : '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const { data: suggestions = [] } = useSuggestions(open ? value : '');

  useEffect(() => {
    if (tick) {
      input.current?.focus();
      input.current?.select();
    }
  }, [tick]);
  useEffect(() => {
    if (route.name === 'search') setValue(route.q);
  }, [route]);

  const submit = (q: string) => {
    const query = q.trim();
    if (!query) return;
    setValue(query);
    setOpen(false);
    input.current?.blur();
    go({ name: 'search', q: query });
  };

  const shown = open && value.trim().length > 1 ? suggestions : [];
  return (
    <div data-elastic="0.3" className="glass elastic app-no-drag relative h-[34px] w-full rounded-pill after:opacity-80 transition-[box-shadow] focus-within:shadow-[0_0_0_3px_rgb(var(--keyColor-rgb)/0.35),var(--glass-shadow)]">
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
          if (e.key === 'Enter') submit(highlight >= 0 && shown[highlight] ? shown[highlight]! : value);
          else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(shown.length - 1, h + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(-1, h - 1));
          } else if (e.key === 'Escape') {
            setOpen(false);
            input.current?.blur();
          }
        }}
      />
      {value && (
        <button className="absolute top-1/2 right-2 z-1 grid size-5 animate-glyph -translate-y-1/2 place-items-center rounded-full text-tertiary hover:text-primary" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => setValue('')}>
          <X size={13} />
        </button>
      )}
      {shown.length > 0 && (
        <ul className="glass-thick absolute inset-x-0 top-[calc(100%+6px)] z-50 animate-menu-in overflow-hidden rounded-[18px] p-1.5 [transform-origin:50%_0]" role="listbox">
          {shown.map((s, i) => (
            <li key={s} className="stagger" style={{ '--i': i } as CSSProperties}>
              <button
                className={`relative flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-left type-body-reduced ${i === highlight ? 'bg-white/12' : 'hover:bg-white/8'}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(s)}
              >
                <Search size={13} className="flex-none text-tertiary" />
                <span className="truncate">{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
