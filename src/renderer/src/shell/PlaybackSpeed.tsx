import { Check, Gauge } from 'lucide-react';
import { openMenuAt, type MenuEntry } from '@/state/menu';
import { useLibrary } from '@/state/library';
import { toast } from '@/state/ui';

const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const label = (x: number) => `${x}×`;

/** Playback speed, 0.5× to 2×, with the pitch kept: for podcasts, practice, or a slower listen. */
export function PlaybackSpeedButton({ className = '', size = 17, placement = 'above-end' as const }: { className?: string; size?: number; placement?: 'above-end' | 'below-start' | 'below-end' | 'above-start' }) {
  const speed = useLibrary((s) => s.settings.playbackSpeed || 1);
  const changed = speed !== 1;
  const entries = (): MenuEntry[] => [
    { header: 'Playback Speed' },
    ...SPEEDS.map((x) => ({
      label: x === 1 ? '1× (Normal)' : label(x),
      icon: x === speed ? <Check size={14} /> : <span className="inline-block w-[14px]" />,
      onSelect: () => {
        useLibrary.getState().updateSettings({ playbackSpeed: x });
        toast(x === 1 ? 'Normal speed' : `Playing at ${label(x)}`);
      },
    })),
  ];
  return (
    <button
      className={`relative ${className} ${changed ? 'text-key' : ''}`}
      aria-label={`Playback speed, ${label(speed)}`}
      aria-pressed={changed}
      title={`Playback speed: ${label(speed)}`}
      onClick={(e) => openMenuAt(e.currentTarget, entries(), placement)}
    >
      {changed ? <span className="text-[12px] leading-none font-bold tabular-nums">{label(speed)}</span> : <Gauge size={size} strokeWidth={2} />}
    </button>
  );
}
