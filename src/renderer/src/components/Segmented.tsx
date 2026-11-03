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
      className={`group relative h-[28px] w-[52px] flex-none rounded-pill transition-colors duration-300 ${on ? 'bg-key' : 'bg-white/[0.16]'}`}
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

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  label: string;
  /** Shown beside the track, e.g. "120%". */
  format: (value: number) => string;
  /** Marked on the track; double-click returns to it. */
  defaultValue?: number;
}

/**
 * The value beside a slider. Double-click it to type an exact value: Enter or clicking away
 * applies it (kept within the slider's range), Escape cancels. Percent sliders take percent.
 */
function SliderValue({ value, min, max, decimals, format, label, onChange }: { value: number; min: number; max: number; decimals: number; format: (v: number) => string; label: string; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const percent = format(1) === '100%';
  const shown = percent ? Math.round(value * 100 * 10) / 10 : value;
  const commit = () => {
    if (text === null) return;
    const typed = parseFloat(text.replace(',', '.').replace(/[^\d.-]/g, ''));
    setText(null);
    if (!Number.isFinite(typed)) return;
    // Typed values are kept as typed (to a hundredth of a percent), only held within the range.
    const next = Math.min(max, Math.max(min, percent ? typed / 100 : typed));
    const rounded = Number(next.toFixed(percent ? 4 : Math.max(decimals, 2)));
    if (rounded !== value) onChange(rounded);
  };
  if (text !== null)
    return (
      <input
        autoFocus
        aria-label={`${label} value`}
        inputMode="decimal"
        className="h-6 w-14 rounded-[6px] bg-white/10 px-1.5 text-right type-callout-medium tabular-nums text-primary outline-none ring-1 ring-key"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setText(null);
        }}
      />
    );
  return (
    <button
      className="w-14 rounded-[6px] text-right type-callout-medium tabular-nums text-secondary hover:bg-white/[0.06] hover:text-primary"
      title="Double-click to type a value"
      aria-label={`${label}: ${format(value)}. Double-click to type a value`}
      onDoubleClick={() => setText(String(shown))}
    >
      {format(value)}
    </button>
  );
}

/** A precise slider: an accent fill and a knob that grows while dragged, with the value beside it. */
export function Slider({ value, min, max, step, onChange, label, format, defaultValue }: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
  // Rounded to the step's decimals, so 0.1 + 0.2 never shows as 0.30000000000000004.
  const decimals = (String(step).split('.')[1] ?? '').length;
  const emit = (v: number) => {
    const next = Number(clamp(v).toFixed(decimals));
    if (next !== value) onChange(next);
  };
  const fromPointer = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    emit(min + ((clientX - r.left) / r.width) * (max - min));
  };
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="flex items-center gap-3">
      <div
        ref={track}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        tabIndex={0}
        className="group/slider relative flex h-6 w-[180px] cursor-pointer touch-none items-center outline-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && fromPointer(e.clientX)}
        onDoubleClick={() => defaultValue !== undefined && emit(defaultValue)}
        onWheel={(e) => emit(value + (e.deltaY < 0 ? step : -step))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') emit(value + step);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') emit(value - step);
          else if (e.key === 'Home') emit(min);
          else if (e.key === 'End') emit(max);
          else return;
          e.preventDefault();
        }}
      >
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.12]">
          <div className="absolute inset-y-0 left-0 bg-key" style={{ width: at(value) }} />
        </div>
        {defaultValue !== undefined && (
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/35" style={{ left: at(defaultValue) }} />
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.35)] transition-[scale] duration-200 ease-(--ease-spring) group-active/slider:scale-125 group-focus-visible/slider:ring-2 group-focus-visible/slider:ring-key"
          style={{ left: at(value) }}
        />
      </div>
      <SliderValue value={value} min={min} max={max} decimals={decimals} format={format} label={label} onChange={onChange} />
    </div>
  );
}
