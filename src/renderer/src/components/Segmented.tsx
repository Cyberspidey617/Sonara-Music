import { useLayoutEffect, useRef, useState } from 'react';

interface SegmentedProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Segments share the full width. */
  stretch?: boolean;
  className?: string;
  label?: string;
  /** Switches views (tabs) rather than picking a value (radio buttons). */
  tabs?: boolean;
}

/**
 * A capsule segmented control. The selection is a lit piece of glass that
 * slides between segments with a spring, as Apple's controls do.
 */
export function Segmented<T extends string | number>({ value, options, onChange, stretch = false, className = '', label, tabs = false }: SegmentedProps<T>) {
  const track = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const index = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const measure = () => {
      const el = buttons.current[index];
      if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (track.current) observer.observe(track.current);
    // Web fonts change the labels' widths once they load.
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [index, options.length]);

  return (
    <div ref={track} role={tabs ? 'tablist' : 'radiogroup'} aria-label={label} className={`relative flex rounded-pill bg-white/[0.075] p-[3px] ${stretch ? 'w-full' : 'w-max'} ${className}`}>
      {box && (
        <span
          aria-hidden="true"
          className="absolute top-[3px] bottom-[3px] rounded-pill bg-white/[0.17] shadow-[inset_0_0.5px_0_rgb(255_255_255/0.4),inset_0_-0.5px_0_rgb(255_255_255/0.08),0_2px_10px_rgb(0_0_0/0.28)] transition-[left,width] duration-[420ms] ease-(--ease-spring)"
          style={{ left: box.left, width: box.width }}
        />
      )}
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          role={tabs ? 'tab' : 'radio'}
          aria-selected={tabs ? o.value === value : undefined}
          aria-checked={tabs ? undefined : o.value === value}
          className={`relative z-1 h-[30px] rounded-pill px-3.5 type-body-emphasized whitespace-nowrap transition-colors duration-200 ${stretch ? 'flex-1' : ''} ${o.value === value ? 'text-primary' : 'text-secondary hover:text-primary'}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A switch: a capsule knob that stretches and turns to glass while it's pressed. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`group relative h-[28px] w-[52px] flex-none rounded-pill transition-colors duration-300 ${on ? 'bg-[#30d158]' : 'bg-white/[0.16]'}`}
      onClick={() => onChange(!on)}
    >
      <span
        className={`absolute top-[2px] h-6 w-[30px] rounded-pill bg-white shadow-[0_2px_6px_rgb(0_0_0/0.3)] transition-[left,width,background-color] duration-[380ms] ease-(--ease-spring) group-active:w-[38px] group-active:bg-white/75 group-active:backdrop-blur-sm ${
          on ? 'left-[20px] group-active:left-[12px]' : 'left-[2px]'
        }`}
      />
    </button>
  );
}
