import { Heart } from 'lucide-react';
import { useState } from 'react';
import type { Track } from '@shared/types';
import { useLibrary } from '@/state/library';
import { toast } from '@/state/ui';

export function LikeButton({ track, size = 16, className = '' }: { track: Track | null | undefined; size?: number; className?: string }) {
  const liked = useLibrary((s) => (track ? s.liked.some((t) => t.videoId === track.videoId) : false));
  // Counts likes made here, so the heart pops only when you like something, not on every render.
  const [pops, setPops] = useState(0);
  return (
    <button
      className={`grid place-items-center ${liked ? 'text-key' : ''} ${className}`}
      aria-label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      aria-pressed={liked}
      title={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      disabled={!track}
      onClick={(e) => {
        e.stopPropagation();
        if (!track) return;
        const now = useLibrary.getState().toggleLike(track);
        if (now) setPops((n) => n + 1);
        toast(now ? 'Added to Liked Songs' : 'Removed from Liked Songs');
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <Heart key={pops} size={size} strokeWidth={2} fill={liked ? 'currentColor' : 'none'} className={pops && liked ? 'animate-pop' : ''} />
    </button>
  );
}
