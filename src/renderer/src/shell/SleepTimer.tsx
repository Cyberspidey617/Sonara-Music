import { Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { openMenuAt, type MenuEntry } from '@/state/menu';
import { usePlayer } from '@/state/player';
import { toast } from '@/state/ui';

function remaining(endsAt: number | null): string {
  if (!endsAt) return '';
  const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** The moon button: a sleep timer, as Obsidian's player has. */
export function SleepTimerButton({ className = '', size = 17, placement = 'above-end' as const }: { className?: string; size?: number; placement?: 'above-end' | 'below-start' | 'below-end' | 'above-start' }) {
  const sleep = usePlayer((s) => s.sleep);
  const [, tick] = useState(0);
  const on = !!sleep.endsAt || sleep.endOfTrack;
  useEffect(() => {
    if (!sleep.endsAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [sleep.endsAt]);

  const entries = (): MenuEntry[] => {
    const set = usePlayer.getState().setSleepTimer;
    const list: MenuEntry[] = [{ header: on ? (sleep.endOfTrack ? 'Stops after this song' : `Stops in ${remaining(sleep.endsAt)}`) : 'Sleep Timer' }];
    for (const m of [5, 10, 15, 30, 45, 60, 90, 120]) list.push({ label: m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`, onSelect: () => set(m) });
    list.push({ label: 'End of this song', onSelect: () => usePlayer.getState().setSleepEndOfTrack() });
    if (on) {
      list.push({ separator: true });
      list.push({ label: 'Turn Off Timer', destructive: true, onSelect: () => (set(null), toast('Sleep timer off')) });
    }
    return list;
  };

  return (
    <button
      className={`relative ${className} ${on ? 'text-key' : ''}`}
      aria-label="Sleep timer"
      aria-pressed={on}
      title={on ? (sleep.endOfTrack ? 'Stops after this song' : `Sleep in ${remaining(sleep.endsAt)}`) : 'Sleep timer'}
      onClick={(e) => openMenuAt(e.currentTarget, entries(), placement)}
    >
      <Moon size={size} strokeWidth={2} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

export function SleepCountdown({ className = '' }: { className?: string }) {
  const sleep = usePlayer((s) => s.sleep);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!sleep.endsAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [sleep.endsAt]);
  if (!sleep.endsAt && !sleep.endOfTrack) return null;
  return <span className={className}>{sleep.endOfTrack ? 'Stopping after this song' : `Sleep in ${remaining(sleep.endsAt)}`}</span>;
}
