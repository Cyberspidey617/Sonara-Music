import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useRef, type PointerEvent } from 'react';
import { usePlayer } from '@/state/player';

export function VolumeIcon({ size = 18 }: { size?: number }) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.34 ? Volume : volume < 0.67 ? Volume1 : Volume2;
  return <Icon size={size} strokeWidth={2} />;
}

/** A thin horizontal volume slider; the wheel nudges it too. */
export function VolumeSlider({ className = '', thick = false }: { className?: string; thick?: boolean }) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const ref = useRef<HTMLDivElement>(null);
  const set = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    usePlayer.getState().setVolume((e.clientX - r.left) / r.width);
  };
  const shown = muted ? 0 : volume;
  return (
    <div
      ref={ref}
      className={`group/vol relative flex h-5 cursor-pointer touch-none items-center ${className}`}
      role="slider"
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && set(e)}
      onWheel={(e) => usePlayer.getState().setVolume(volume + (e.deltaY < 0 ? 0.05 : -0.05))}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') usePlayer.getState().setVolume(volume + 0.05);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') usePlayer.getState().setVolume(volume - 0.05);
      }}
    >
      <div className={`relative w-full overflow-hidden rounded-full bg-quaternary transition-[height] duration-150 ${thick ? 'h-1.5 group-hover/vol:h-2.5' : 'h-1 group-hover/vol:h-1.5'}`}>
        <div className="absolute inset-y-0 left-0 bg-secondary group-hover/vol:bg-primary" style={{ width: `${shown * 100}%` }} />
      </div>
    </div>
  );
}
