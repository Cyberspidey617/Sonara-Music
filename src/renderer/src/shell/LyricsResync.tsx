import { Check, Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LyricsTiming } from '@shared/types';
import { useLibrary } from '@/state/library';
import { getPlayhead, usePlayer } from '@/state/player';

type Timed = { timestamp: number; endtime: number };
/** A line as am-lyrics has it: its words (syllables) carry their own times. */
export type TimedLine = Timed & { text: (Timed & { text: string })[]; backgroundText?: (Timed & { text: string })[] };

const STEP = 100;

/** A song's adjusted timing, or undefined. */
export function useLyricsTiming(videoId: string): LyricsTiming | undefined {
  return useLibrary((s) => s.settings.lyricsTiming?.[videoId]);
}

/** Changes a song's timing from its latest saved state (two quick clicks both count). */
function saveTiming(videoId: string, change: (timing: LyricsTiming) => LyricsTiming) {
  const timing = change(useLibrary.getState().settings.lyricsTiming?.[videoId] ?? {});
  const lines = Object.fromEntries(Object.entries(timing.lines ?? {}).filter(([, ms]) => ms));
  const clean: LyricsTiming = { ...(timing.offset ? { offset: timing.offset } : {}), ...(Object.keys(lines).length ? { lines } : {}) };
  const all = { ...useLibrary.getState().settings.lyricsTiming };
  if (Object.keys(clean).length) all[videoId] = clean;
  else delete all[videoId];
  useLibrary.getState().updateSettings({ lyricsTiming: all });
}

/** How far a line moves, in ms. */
const moveOf = (timing: LyricsTiming | undefined, i: number) => (timing?.offset ?? 0) + (timing?.lines?.[i] ?? 0);

/** The lines with the adjusted timing applied, words and all. */
export function retime<T extends TimedLine>(lines: T[], timing: LyricsTiming | undefined): T[] {
  if (!timing || (!timing.offset && !timing.lines)) return lines;
  const out = lines.map((line, i) => {
    const d = moveOf(timing, i);
    if (!d) return line;
    const mv = <W extends Timed>(w: W): W => ({ ...w, timestamp: Math.max(0, w.timestamp + d), endtime: Math.max(0, w.endtime + d) });
    return { ...mv(line), text: line.text.map(mv), ...(line.backgroundText && { backgroundText: line.backgroundText.map(mv) }) };
  });
  // A line moved on its own: the line before it now ends where it starts, so they neither overlap nor leave a gap
  // (when they followed each other before).
  for (let i = 1; i < out.length; i++) {
    if (!timing.lines?.[i] && !timing.lines?.[i - 1]) continue;
    const prev = out[i - 1]!;
    const start = out[i]!.timestamp;
    const wasNext = lines[i - 1]!.endtime >= lines[i]!.timestamp - 150;
    if (prev.timestamp >= start || (prev.endtime <= start && !wasNext)) continue;
    const cap = <W extends Timed>(w: W): W => (w.endtime > start ? { ...w, endtime: Math.max(w.timestamp, start) } : w);
    out[i - 1] = { ...prev, endtime: start, text: prev.endtime > start ? prev.text.map(cap) : prev.text };
  }
  return out;
}

const clock = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
const signed = (ms: number) => `${ms > 0 ? '+' : ms < 0 ? '−' : '±'}${(Math.abs(ms) / 1000).toFixed(1)} s`;

/** Adjust when each lyric line shows: the whole song at once, or line by line while it plays. */
export function LyricsResync({ videoId, lines, onClose }: { videoId: string; lines: TimedLine[]; onClose: () => void }) {
  const timing = useLyricsTiming(videoId);
  const [now, setNow] = useState(() => getPlayhead() * 1000);
  const list = useRef<HTMLDivElement>(null);
  const touched = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(getPlayhead() * 1000), 100);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  const start = (i: number) => Math.max(0, lines[i]!.timestamp + moveOf(timing, i));
  let current = -1;
  for (let i = 0; i < lines.length; i++) if (start(i) <= now) current = i;

  // Follows the song, unless you scrolled the list in the last few seconds.
  useEffect(() => {
    if (current < 0 || Date.now() - touched.current < 3000) return;
    list.current?.querySelector(`[data-line="${current}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);

  const moveAll = (ms: number) => saveTiming(videoId, (t) => ({ ...t, offset: (t.offset ?? 0) + ms }));
  const moveLine = (i: number, ms: number) => saveTiming(videoId, (t) => ({ ...t, lines: { ...t.lines, [i]: (t.lines?.[i] ?? 0) + ms } }));
  const lineNow = (i: number) =>
    saveTiming(videoId, (t) => ({ ...t, lines: { ...t.lines, [i]: Math.round(getPlayhead() * 1000 - lines[i]!.timestamp - (t.offset ?? 0)) } }));
  const offset = timing?.offset ?? 0;
  const changed = !!timing;
  const words = (l: TimedLine) => l.text.map((w) => w.text).join('').trim();

  const icon = 'grid size-7 shrink-0 place-items-center rounded-full text-secondary transition-colors hover:bg-white/12 hover:text-primary';
  const pill = 'h-7 shrink-0 rounded-pill px-2.5 type-footnote font-semibold transition-colors';

  return (
    <div className="absolute inset-0 z-20 flex animate-rise flex-col overflow-hidden" role="dialog" aria-label="Resync lyrics">
      <div className="flex items-start gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="type-title-3-emphasized text-primary">Resync lyrics</div>
          <div className="mt-0.5 type-callout text-tertiary">Play the song and press Now as each line starts, or move lines by 0.1 s.</div>
        </div>
        {changed && (
          <button className={`${pill} flex items-center gap-1 text-secondary hover:bg-white/12 hover:text-primary`} title="Back to the original timing" onClick={() => saveTiming(videoId, () => ({}))}>
            <RotateCcw size={13} /> Reset
          </button>
        )}
        <button className={`${pill} flex items-center gap-1 bg-key text-(--onKeyColor)`} onClick={onClose}>
          <Check size={14} /> Done
        </button>
      </div>

      <div className="mx-4 mb-2 flex items-center gap-1 rounded-[12px] bg-white/6 px-3 py-1.5">
        <span className="flex-1 type-callout-emphasized whitespace-nowrap text-primary">Whole song</span>
        <button className={`${pill} text-secondary hover:bg-white/12`} onClick={() => moveAll(-500)} title="0.5 s earlier">−0.5</button>
        <button className={icon} onClick={() => moveAll(-STEP)} title="0.1 s earlier" aria-label="0.1 seconds earlier"><Minus size={15} /></button>
        <span className={`w-16 text-center type-callout-emphasized tabular-nums ${offset ? 'text-key' : 'text-tertiary'}`}>{signed(offset)}</span>
        <button className={icon} onClick={() => moveAll(STEP)} title="0.1 s later" aria-label="0.1 seconds later"><Plus size={15} /></button>
        <button className={`${pill} text-secondary hover:bg-white/12`} onClick={() => moveAll(500)} title="0.5 s later">+0.5</button>
      </div>

      <div
        ref={list}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-6 [mask-image:linear-gradient(180deg,transparent,#000_12px,#000_calc(100%-32px),transparent)]"
        onWheel={() => (touched.current = Date.now())}
        onPointerDown={() => (touched.current = Date.now())}
      >
        {lines.map((line, i) => {
          const own = timing?.lines?.[i] ?? 0;
          const text = words(line);
          return (
            <div
              key={i}
              data-line={i}
              className={`group flex items-center gap-1.5 rounded-[12px] px-2 py-1 transition-colors ${i === current ? 'bg-white/10' : 'hover:bg-white/5'}`}
            >
              <button
                className={`w-[58px] shrink-0 rounded-md py-1 text-left type-footnote font-semibold tabular-nums transition-colors hover:text-primary ${own ? 'text-key' : i === current ? 'text-primary' : 'text-tertiary'}`}
                title={own ? `Moved ${signed(own)} on its own · play from here` : 'Play from here'}
                onClick={() => usePlayer.getState().seek(start(i) / 1000)}
              >
                {clock(start(i))}
              </button>
              <span className={`min-w-0 flex-1 truncate type-callout ${i === current ? 'text-primary' : text ? 'text-secondary' : 'text-tertiary italic'}`} title={text}>
                {text || '♪'}
              </span>
              <button className={icon} onClick={() => moveLine(i, -STEP)} title="This line 0.1 s earlier" aria-label="Line 0.1 seconds earlier"><Minus size={14} /></button>
              <button className={icon} onClick={() => moveLine(i, STEP)} title="This line 0.1 s later" aria-label="Line 0.1 seconds later"><Plus size={14} /></button>
              <button
                className={`${pill} bg-white/10 text-primary hover:bg-white/20`}
                title="This line starts now"
                onClick={() => lineNow(i)}
              >
                Now
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
