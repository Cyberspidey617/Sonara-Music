import { Bookmark, RotateCcw, X } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { EQ_FREQUENCIES, type EqSettings } from '@shared/types';
import { BASIC_CONTROLS, basicValue, clampDb, EQ_MAX, EQ_MIN, EQ_PRESETS, POPULAR_PRESETS, preampFor, presetName, responseCurve, setBasic } from '@/lib/equalizer';
import { useLibrary } from '@/state/library';
import { Segmented, Toggle } from './Segmented';

const fmtDb = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) % 1 ? 1 : 0)} dB`;
const fmtHz = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f));

function useEq(): [EqSettings, (patch: Partial<EqSettings>) => void] {
  const eq = useLibrary((s) => s.settings.eq);
  const set = (patch: Partial<EqSettings>) => {
    const current = useLibrary.getState().settings.eq;
    // Touching any control turns the equalizer on.
    useLibrary.getState().updateSettings({ eq: { ...current, enabled: true, ...patch } });
  };
  return [eq, set];
}

/**
 * A dB slider, centred on 0: the fill runs from 0 dB to the knob. Drag, click, scroll,
 * arrow keys (Page Up/Down for 3 dB), or double-click to reset.
 */
function DbSlider({ value, onChange, vertical = false, label, className = '', min = EQ_MIN, max = EQ_MAX }: { value: number; onChange: (v: number) => void; vertical?: boolean; label: string; className?: string; min?: number; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const k = vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    onChange(clampDb(min + Math.max(0, Math.min(1, k)) * (max - min)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'PageUp' ? 3 : e.key === 'PageDown' ? -3 : e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.5 : 0;
    if (e.key === 'Home' || e.key === '0') onChange(0);
    else if (step) onChange(clampDb(value + step));
    else return;
    e.preventDefault();
  };
  const pos = (value - min) / (max - min);
  const zero = (0 - min) / (max - min);
  const lo = Math.min(pos, zero);
  const hi = Math.max(pos, zero);
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={fmtDb(value)}
      tabIndex={0}
      title={`${label}: ${fmtDb(value)} — double-click to reset`}
      className={`group/db relative cursor-pointer touch-none rounded-pill outline-offset-4 ${vertical ? 'w-7' : 'h-7'} ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && fromPointer(e)}
      onDoubleClick={() => onChange(0)}
      onWheel={(e) => onChange(clampDb(value + (e.deltaY < 0 ? 0.5 : -0.5)))}
      onKeyDown={onKey}
    >
      {/* Track, with a tick at 0 dB */}
      <div className={`absolute rounded-pill bg-white/[0.12] ${vertical ? 'inset-y-0 left-1/2 w-1.5 -translate-x-1/2' : 'inset-x-0 top-1/2 h-1.5 -translate-y-1/2'}`} />
      <div className={`absolute bg-white/30 ${vertical ? 'left-1/2 h-px w-4 -translate-x-1/2' : 'top-1/2 h-4 w-px -translate-y-1/2'}`} style={vertical ? { bottom: `${zero * 100}%` } : { left: `${zero * 100}%` }} />
      {/* Fill from 0 dB to the value */}
      <div
        className={`absolute rounded-pill bg-key transition-[background-color] ${vertical ? 'left-1/2 w-1.5 -translate-x-1/2' : 'top-1/2 h-1.5 -translate-y-1/2'}`}
        style={vertical ? { bottom: `${lo * 100}%`, height: `${(hi - lo) * 100}%` } : { left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
      />
      {/* Knob: a small capsule that grows under the pointer */}
      <div
        className={`absolute rounded-pill bg-white shadow-[0_1px_4px_rgb(0_0_0/0.45)] transition-[scale] duration-200 ease-(--ease-spring) group-hover/db:scale-110 group-active/db:scale-125 ${vertical ? 'left-1/2 h-3.5 w-6 -translate-x-1/2 translate-y-1/2' : 'top-1/2 h-6 w-3.5 -translate-x-1/2 -translate-y-1/2'}`}
        style={vertical ? { bottom: `${pos * 100}%` } : { left: `${pos * 100}%` }}
      />
    </div>
  );
}

/** The real response of the filters, drawn on a log-frequency scale. */
function Curve({ eq }: { eq: EqSettings }) {
  const W = 600;
  const H = 120;
  const freqs = useMemo(() => {
    const f = new Float32Array(new ArrayBuffer(160 * 4));
    for (let i = 0; i < f.length; i++) f[i] = 20 * 1000 ** (i / (f.length - 1)); // 20 Hz – 20 kHz
    return f;
  }, []);
  const db = responseCurve(eq, freqs);
  const x = (f: number) => (Math.log10(f / 20) / 3) * W;
  const y = (v: number) => H / 2 - (v / 15) * (H / 2 - 6);
  const line = Array.from(db, (v, i) => `${i ? 'L' : 'M'}${x(freqs[i]!).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-[120px] w-full transition-opacity ${eq.enabled ? '' : 'opacity-40'}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--keyColor-rgb))" stopOpacity="0.35" />
          <stop offset="1" stopColor="rgb(var(--keyColor-rgb))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[-12, -6, 6, 12].map((v) => (
        <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="white" strokeOpacity="0.06" vectorEffect="non-scaling-stroke" />
      ))}
      {EQ_FREQUENCIES.map((f) => (
        <line key={f} x1={x(f)} x2={x(f)} y1="0" y2={H} stroke="white" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
      ))}
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="white" strokeOpacity="0.22" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#eq-fill)" />
      <path d={line} fill="none" stroke="rgb(var(--keyColor-rgb))" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const chip = (on: boolean) =>
  `relative h-8 rounded-pill px-3.5 type-body-emphasized whitespace-nowrap transition-colors ${on ? 'bg-white text-black' : 'bg-white/[0.08] text-primary hover:bg-white/[0.14]'}`;

function Presets({ eq, set }: { eq: EqSettings; set: (p: Partial<EqSettings>) => void }) {
  const [more, setMore] = useState(() => EQ_PRESETS.findIndex((p) => p.id === eq.preset) >= POPULAR_PRESETS);
  const shown = more ? EQ_PRESETS : EQ_PRESETS.slice(0, POPULAR_PRESETS);
  const remove = (name: string) => {
    const current = useLibrary.getState().settings.eq;
    useLibrary.getState().updateSettings({ eq: { ...current, saved: current.saved.filter((p) => p.name !== name), preset: current.preset === `custom:${name}` ? 'custom' : current.preset } });
  };
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Presets">
      {shown.map((p) => (
        <button key={p.id} role="radio" aria-checked={eq.preset === p.id} className={chip(eq.enabled && eq.preset === p.id)} onClick={() => set({ preset: p.id, bands: [...p.bands] })}>
          {p.name}
        </button>
      ))}
      {eq.saved.map((p) => (
        <span key={p.name} className="relative inline-flex">
          <button role="radio" aria-checked={eq.preset === `custom:${p.name}`} className={`${chip(eq.enabled && eq.preset === `custom:${p.name}`)} pr-8`} onClick={() => set({ preset: `custom:${p.name}`, bands: [...p.bands] })}>
            <Bookmark size={13} className="mr-1.5 inline -translate-y-px" />
            {p.name}
          </button>
          <button className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-full text-tertiary hover:bg-black/20 hover:text-primary" aria-label={`Delete ${p.name}`} title="Delete preset" onClick={() => remove(p.name)}>
            <X size={12} />
          </button>
        </span>
      ))}
      <button className="h-8 rounded-pill px-3 type-body-emphasized text-key hover:bg-white/[0.06]" aria-expanded={more} onClick={() => setMore((m) => !m)}>
        {more ? 'Fewer' : `${EQ_PRESETS.length - POPULAR_PRESETS} more`}
      </button>
    </div>
  );
}

function Basic({ eq, set }: { eq: EqSettings; set: (p: Partial<EqSettings>) => void }) {
  return (
    <div className="flex flex-col gap-1">
      {BASIC_CONTROLS.map((c) => {
        const v = basicValue(eq.bands, c.weights);
        return (
          <div key={c.id} className="grid grid-cols-[132px_1fr_64px] items-center gap-4 py-1.5">
            <div className="flex flex-col">
              <span className="type-body-emphasized text-primary">{c.label}</span>
              <span className="type-callout text-tertiary">{c.detail}</span>
            </div>
            <DbSlider label={c.label} value={v} onChange={(nv) => set({ preset: 'custom', bands: setBasic(eq.bands, c.weights, nv) })} />
            <span className="text-right type-body-emphasized text-secondary tabular-nums">{fmtDb(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Advanced({ eq, set }: { eq: EqSettings; set: (p: Partial<EqSettings>) => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const save = () => {
    const n = name.trim().slice(0, 24);
    if (!n) return;
    const saved = [...eq.saved.filter((p) => p.name !== n), { name: n, bands: [...eq.bands] }];
    set({ saved, preset: `custom:${n}` });
    setNaming(false);
    setName('');
  };
  const pre = preampFor(eq);
  return (
    <div>
      <div className="flex items-stretch gap-3">
        {/* Preamp, apart from the bands */}
        <div className="flex w-12 flex-col items-center gap-2 border-r border-divider pr-3">
          <span className="type-[600_11px/14px] text-secondary tabular-nums">{fmtDb(pre).replace(' dB', '')}</span>
          <DbSlider vertical label="Preamp" className="h-40" value={pre} onChange={(v) => set({ autoPreamp: false, preamp: v })} />
          <span className="type-[600_11px/14px] text-tertiary">Pre</span>
        </div>
        <div className="grid flex-1 grid-cols-10 justify-items-center">
          {EQ_FREQUENCIES.map((f, i) => (
            <div key={f} className="flex flex-col items-center gap-2">
              <span className="type-[600_11px/14px] text-secondary tabular-nums">{fmtDb(eq.bands[i] ?? 0).replace(' dB', '')}</span>
              <DbSlider
                vertical
                label={`${fmtHz(f)}Hz`}
                className="h-40"
                value={eq.bands[i] ?? 0}
                onChange={(v) => set({ preset: 'custom', bands: eq.bands.map((b, k) => (k === i ? v : b)) })}
              />
              <span className="type-[600_11px/14px] text-tertiary">{fmtHz(f)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="flex items-center gap-3">
          <Toggle label="Prevent clipping" on={eq.autoPreamp} onChange={(autoPreamp) => set({ autoPreamp })} />
          <span className="flex flex-col">
            <span className="type-body-reduced text-primary">Prevent clipping</span>
            <span className="type-callout text-tertiary">Lowers the level by the biggest boost</span>
          </span>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {naming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setNaming(false))} placeholder="Preset name" maxLength={24} className="h-8 w-40 rounded-pill border-[0.5px] border-search-border bg-white/[0.07] px-3.5 type-body-reduced text-primary placeholder:text-tertiary focus:border-white/35" />
              <button type="submit" disabled={!name.trim()} className="h-8 rounded-pill bg-white px-3.5 type-body-emphasized text-black disabled:opacity-40">
                Save
              </button>
            </form>
          ) : (
            <button className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-white/10 px-3.5 type-body-emphasized hover:bg-white/16" onClick={() => setNaming(true)}>
              <Bookmark size={14} /> Save as Preset
            </button>
          )}
          <button className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-white/10 px-3.5 type-body-emphasized hover:bg-white/16" onClick={() => set({ preset: 'flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0, autoPreamp: true })}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}

/** The whole equalizer: on/off, the curve, presets, and Basic or Advanced controls. */
export function EqualizerPanel({ compact = false }: { compact?: boolean }) {
  const [eq, set] = useEq();
  const mode = useLibrary((s) => s.settings.eq.mode);
  const setMode = (m: EqSettings['mode']) => {
    const current = useLibrary.getState().settings.eq;
    useLibrary.getState().updateSettings({ eq: { ...current, mode: m } });
  };
  return (
    <div className={`flex flex-col ${compact ? 'gap-4' : 'gap-5'}`}>
      <div className="flex items-center gap-4">
        <Toggle label="Equalizer" on={eq.enabled} onChange={(enabled) => useLibrary.getState().updateSettings({ eq: { ...useLibrary.getState().settings.eq, enabled } })} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="type-body-emphasized text-primary">{eq.enabled ? presetName(eq) : 'Off'}</span>
          <span className="type-callout text-tertiary">{eq.enabled ? 'Applies to everything you play' : 'Music plays exactly as it’s streamed'}</span>
        </div>
        <Segmented
          label="Equalizer controls"
          value={mode}
          options={[
            { value: 'basic', label: 'Basic' },
            { value: 'advanced', label: 'Advanced' },
          ]}
          onChange={setMode}
        />
      </div>
      <div className="rounded-[16px] bg-black/20 px-2 pt-2 pb-1">
        <Curve eq={eq} />
        <div className="relative mx-1 h-4 type-[500_10px/12px] text-tertiary">
          {[[100, '100 Hz'], [1000, '1 kHz'], [10000, '10 kHz']].map(([f, l]) => (
            <span key={l} className="absolute -translate-x-1/2" style={{ left: `${(Math.log10((f as number) / 20) / 3) * 100}%` }}>
              {l}
            </span>
          ))}
        </div>
      </div>
      <Presets eq={eq} set={set} />
      {mode === 'basic' ? <Basic eq={eq} set={set} /> : <Advanced eq={eq} set={set} />}
    </div>
  );
}
