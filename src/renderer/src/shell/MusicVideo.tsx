import { useEffect, useRef } from 'react';
import { getPlayhead, usePlayer } from '@/state/player';

/** Past this the video jumps to the song (a seek, a skip); below it, it eases back by speed alone. */
const JUMP = 1.2;
/** Drift that's left alone (the eye doesn't see it). */
const SETTLED = 0.06;

/**
 * A song's music video over the full-screen player. The song keeps playing from Sonara (with the
 * equalizer, crossfade and so on); the video is muted and follows it: playing and pausing with the
 * song, and moved back into time if it drifts. Click it to play or pause; Esc closes it.
 */
export function MusicVideo({ url, onClose, onError }: { url: string; onClose: () => void; onError?: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const playing = usePlayer((s) => s.status === 'playing');

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let frame = 0;
    // Seeking every time it drifts would keep a video from ever decoding a frame, so small drift is
    // closed by playing up to 5% faster or slower, and only a real jump (a seek) seeks the video.
    const follow = () => {
      const at = getPlayhead();
      if (Number.isFinite(at) && !v.seeking && v.readyState >= 1) {
        const off = v.currentTime - at;
        if (Math.abs(off) > JUMP) {
          v.currentTime = Math.min(at, v.duration || at);
          v.playbackRate = 1;
        } else if (Math.abs(off) > SETTLED) v.playbackRate = off > 0 ? 0.95 : 1.05;
        else v.playbackRate = 1;
      }
      frame = window.setTimeout(follow, 250);
    };
    follow();
    return () => window.clearTimeout(frame);
  }, [url]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) void v.play().catch(() => undefined);
    else v.pause();
  }, [playing, url]);

  // Esc closes the video first, before the full-screen player itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    // Above everything in the player (the lyrics panel's controls too), under its top strip.
    <div className="absolute inset-0 z-20 grid animate-fade-in place-items-center bg-black" onClick={() => usePlayer.getState().togglePlay()}>
      <video ref={video} src={url} muted playsInline preload="auto" className="size-full object-contain" onLoadedMetadata={(e) => (e.currentTarget.currentTime = getPlayhead())} onError={onError} />
    </div>
  );
}
