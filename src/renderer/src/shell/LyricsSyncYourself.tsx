import { Check, RotateCcw, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TimedLyric } from '@shared/types';
import { useLibrary } from '@/state/library';
import { getPlayhead, usePlayer } from '@/state/player';
import { toast } from '@/state/ui';

/** A song's lyrics as you timed them, or undefined. */
export function useUserLyrics(videoId: string): TimedLyric[] | undefined {
  return useLibrary((s) => s.settings.userLyrics?.[videoId]);
}

function save(videoId: string, lines: TimedLyric[] | null) {
  const all = { ...useLibrary.getState().settings.userLyrics };
  if (lines) all[videoId] = lines;
  else delete all[videoId];
  useLibrary.getState().updateSettings({ userLyrics: all });
}

/** The playhead in ms, ten times a second. */
function useNowMs(): number {
  const [now, setNow] = useState(() => getPlayhead() * 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(getPlayhead() * 1000), 100);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Lyrics you timed: the line being sung lit, following along; click a line to play from it. */
export function SyncedByYou({ videoId, lines, style, center, onResync }: { videoId: string; lines: TimedLyric[]; style: React.CSSProperties; center: boolean; onResync: () => void }) {
  const now = useNowMs();
  const list = useRef<HTMLDivElement>(null);
  let current = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i]!.t <= now) current = i;
  useEffect(() => {
    list.current?.querySelector(`[data-line="${current}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);
  return (
    <div ref={list} className={`font-bold select-text ${center ? 'text-center' : ''}`} style={style}>
      {lines.map((line, i) => (
        <button
          key={i}
          data-line={i}
          className={`mb-2 block w-full rounded-[10px] text-left transition-[color,opacity,filter] duration-300 ${center ? 'text-center' : ''} ${
            i === current ? 'text-primary' : i < current ? 'text-primary/40' : 'text-primary/55 hover:text-primary/80'
          }`}
          onClick={() => usePlayer.getState().seek(line.t / 1000)}
        >
          {line.text}
        </button>
      ))}
      <p className="mt-6 flex flex-wrap items-center gap-3 type-callout font-normal text-tertiary">
        Synced by you
        <button className="text-secondary hover:text-primary" onClick={onResync}>
          Sync again
        </button>
        <button
          className="text-secondary hover:text-primary"
          onClick={() => {
            const before = lines;
            save(videoId, null);
            toast('Your timing was removed', { label: 'Undo', run: () => save(videoId, before) });
          }}
        >
          Remove
        </button>
      </p>
    </div>
  );
}

/**
 * Timing plain lyrics yourself: play the song and tap (or press Space) as each line starts. Undo
 * steps back a line; when every line has its moment, the lyrics play along from then on.
 */
export function SyncYourself({ videoId, text, onDone }: { videoId: string; text: string[]; onDone: () => void }) {
  const lines = text.map((t) => t.trim()).filter(Boolean);
  const [times, setTimes] = useState<number[]>([]);
  const next = times.length;
  const list = useRef<HTMLDivElement>(null);

  const tap = () => {
    if (next >= lines.length) return;
    const at = Math.round(getPlayhead() * 1000);
    const updated = [...times, Math.max(at, times[times.length - 1] ?? 0)];
    setTimes(updated);
    if (updated.length === lines.length) {
      save(
        videoId,
        lines.map((line, i) => ({ t: updated[i]!, text: line })),
      );
      toast('Lyrics synced. They’ll play along from now on.');
      onDone();
    }
  };
  const undo = () => {
    const last = times[times.length - 1];
    setTimes(times.slice(0, -1));
    // Back to just before the undone line, to tap it again.
    if (last !== undefined) usePlayer.getState().seek(Math.max(0, last / 1000 - 2));
  };

  // Space or Enter taps, Backspace undoes, Esc stops: caught before the app's own shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return;
      if (e.key === ' ' || e.key === 'Enter') tap();
      else if (e.key === 'Backspace') undo();
      else if (e.key === 'Escape') onDone();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  useEffect(() => {
    list.current?.querySelector(`[data-line="${next}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [next]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col">
      <div className="flex items-start gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="type-title-3-emphasized text-primary">Sync these lyrics</div>
          <div className="mt-0.5 type-callout text-tertiary">Play the song and tap (or press Space) as each line starts. Backspace undoes a line.</div>
        </div>
        <button className="flex h-7 items-center gap-1 rounded-pill px-2.5 type-footnote font-semibold text-secondary hover:bg-white/12 hover:text-primary" onClick={onDone}>
          <X size={13} /> Cancel
        </button>
      </div>
      <div ref={list} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 [mask-image:linear-gradient(180deg,transparent,#000_16px,#000_calc(100%-24px),transparent)]">
        {lines.map((line, i) => (
          <div
            key={i}
            data-line={i}
            className={`flex items-baseline gap-3 rounded-[10px] px-2 py-1.5 type-body-emphasized transition-colors ${i === next ? 'bg-white/10 text-primary' : i < next ? 'text-secondary' : 'text-tertiary'}`}
          >
            <span className="w-12 flex-none type-footnote font-semibold tabular-nums">{times[i] !== undefined ? `${Math.floor(times[i]! / 60000)}:${((times[i]! / 1000) % 60).toFixed(1).padStart(4, '0')}` : i === next ? 'next' : ''}</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3 px-4 pt-2 pb-5">
        <button className="flex h-10 items-center gap-1.5 rounded-pill bg-white/10 px-4 type-body-emphasized text-primary hover:bg-white/16 disabled:opacity-40" disabled={!times.length} onClick={undo}>
          <Undo2 size={16} /> Undo
        </button>
        <button className="flex h-12 min-w-[180px] items-center justify-center gap-2 rounded-pill bg-key px-6 type-title-3-emphasized text-(--onKeyColor) hover:brightness-110" onClick={tap}>
          {next < lines.length ? <>Tap: line {next + 1} of {lines.length}</> : <Check size={18} />}
        </button>
        <button
          className="flex h-10 items-center gap-1.5 rounded-pill bg-white/10 px-4 type-body-emphasized text-primary hover:bg-white/16"
          title="Start again from the beginning of the song"
          onClick={() => {
            setTimes([]);
            usePlayer.getState().seek(0);
          }}
        >
          <RotateCcw size={16} /> Restart
        </button>
      </div>
    </div>
  );
}
