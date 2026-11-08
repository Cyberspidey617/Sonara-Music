import { useEffect, useRef, useState } from 'react';
import type { VideoFit } from '@shared/types';
import { api } from '@/lib/api';
import { useLibrary } from '@/state/library';
import { getPlayhead, listeningVolume, setSongSilenced, usePlayer } from '@/state/player';

/** The song and the video's sound this far apart: the song was moved (a seek, a skip). */
const JUMP = 1.5;
/** The picture against its clock: drift the eye can't see. */
const SETTLED = 0.03;
/** The picture against its clock: past this, lips visibly don't match. */
const PICTURE_JUMP = 0.25;
/** A picture ahead by up to this holds still until its clock catches up (jumping back would reload it). */
const HOLD_MAX = 4;
/** A jump gets this long to load before the picture is moved again. */
const LOAD_TIMEOUT = 6000;

/**
 * A song's music video over the full-screen player.
 *
 * The song is the clock: play, pause and seek act on it, and it keeps playing (with lyrics and
 * progress). A video as long as the song is silent and follows the song, which is heard. Any other
 * video plays its own sound (as its own stream) and the song goes on silently.
 *
 * The picture follows its clock (the video's sound, or the song) as a video player would:
 *  - a small drift is closed within a second or two by playing a little faster or slower;
 *  - a real gap is jumped, aiming ahead by as long as the last jump took to load, and the picture is
 *    then left alone until it has loaded (jumping again before that is what made it stall);
 *  - a picture that arrives early holds still until the clock catches up, instead of jumping back.
 * The video's sound waits whenever the picture is loading (after a seek, or if it buffers), and the
 * two start again together, from the picture's moment.
 */
export function MusicVideo({
  url,
  audioUrl,
  fit,
  onError,
  onClose,
}: {
  url: string;
  /** The video's own sound, as a stream of its own; null to hear the song. */
  audioUrl: string | null;
  fit: VideoFit;
  onError?: () => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const playing = usePlayer((s) => s.status === 'playing');
  const [ratio, setRatio] = useState(16 / 9);

  useEffect(() => {
    const v = video.current;
    const a = audioUrl ? audio.current : null;
    if (!v) return;
    const songPlaying = () => usePlayer.getState().status === 'playing';
    const loading = () => v.seeking || v.readyState < 3;
    let jumpedAt = 0;
    // How far ahead a jump aims: the time the last one took to load (a guess at first).
    let lead = 0.5;
    let holding = false;

    const onCanPlay = () => {
      if (!jumpedAt) return;
      lead = Math.min(3, Math.max(0.2, (performance.now() - jumpedAt) / 1000 + 0.15));
      jumpedAt = 0;
    };
    // The song is heard until the video's sound is playing; when the video ends first, the song again.
    const onPlaying = () => setSongSilenced(true);
    const onEnded = () => setSongSilenced(false);
    v.addEventListener('canplay', onCanPlay);
    a?.addEventListener('playing', onPlaying);
    a?.addEventListener('ended', onEnded);

    let timer = 0;
    const tick = () => {
      const now = performance.now();
      const song = getPlayhead();
      const want = songPlaying();
      if (a && Number.isFinite(song)) {
        if (!a.paused && !a.ended && Math.abs(a.currentTime - song) > JUMP) a.pause(); // the song was moved
        else if (!a.paused && loading() && !holding) a.pause(); // the picture is loading: wait for it
        else if (a.paused && !a.ended && want && !loading() && !holding && Math.abs(v.currentTime - song) <= JUMP) {
          a.currentTime = v.currentTime; // start together, from the picture's moment
          void a.play().catch(() => undefined);
        }
      }
      const heard = !!a && !a.paused && !a.seeking && a.readyState >= 2;
      const clock = heard ? a.currentTime : song;
      const limit = heard ? PICTURE_JUMP : 0.4;
      const settling = jumpedAt && loading() && now - jumpedAt < LOAD_TIMEOUT;
      if (!settling && Number.isFinite(clock) && v.readyState >= 1) {
        const off = v.currentTime - clock;
        const moveTo = (to: number) => {
          v.currentTime = Math.max(0, Math.min(to, (v.duration || Infinity) - 0.1));
          v.playbackRate = 1;
          jumpedAt = now;
        };
        if (holding) {
          if (!want || off <= SETTLED) {
            holding = false;
            if (want) void v.play().catch(() => undefined);
          } else if (off > HOLD_MAX) {
            holding = false;
            moveTo(clock + lead);
          }
        } else if (off > limit && off <= HOLD_MAX && !loading()) {
          holding = true;
          v.playbackRate = 1;
          v.pause();
        } else if (Math.abs(off) > limit) moveTo(clock + lead);
        else if (Math.abs(off) > SETTLED) v.playbackRate = Math.min(1.15, Math.max(0.85, 1 - off * 0.6));
        else if (v.playbackRate !== 1) v.playbackRate = 1;
      }
      timer = window.setTimeout(tick, 100);
    };
    tick();
    return () => {
      window.clearTimeout(timer);
      v.removeEventListener('canplay', onCanPlay);
      a?.removeEventListener('playing', onPlaying);
      a?.removeEventListener('ended', onEnded);
      setSongSilenced(false);
    };
  }, [url, audioUrl]);

  // Plays and pauses with the song (the video's own sound is started by the loop above, with the picture).
  useEffect(() => {
    const v = video.current;
    if (v) {
      if (playing) void v.play().catch(() => undefined);
      else v.pause();
    }
    if (!playing) audio.current?.pause();
  }, [playing, url, audioUrl]);

  // The video's sound as loud as the song: your volume, and, with "Same loudness for every song" on,
  // turned down by YouTube's loudness figure for it, as the song is.
  useEffect(() => {
    let gain = 1;
    const apply = () => {
      const level = listeningVolume() * gain;
      if (audio.current) audio.current.volume = level;
    };
    apply();
    let alive = true;
    const soundId = audioUrl?.match(/track\/([\w-]{11})/)?.[1];
    if (soundId && useLibrary.getState().settings.normalize) {
      // Known once its stream is found, a moment after it starts loading.
      const ask = (tries: number) =>
        void api.streamInfo(soundId).then((info) => {
          if (!alive) return;
          if (typeof info?.loudnessDb === 'number') {
            gain = info.loudnessDb > 0 ? Math.pow(10, -info.loudnessDb / 20) : 1;
            apply();
          } else if (tries > 0) window.setTimeout(() => ask(tries - 1), 700);
        }, () => undefined);
      ask(8);
    }
    const stop = usePlayer.subscribe((s, before) => {
      if (s.volume !== before.volume || s.muted !== before.muted) apply();
    });
    return () => {
      alive = false;
      stop();
    };
  }, [audioUrl]);

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

  // The picture keeps its own shape: a box of its ratio, as large as the size allows.
  const scale = fit === '75' ? 0.75 : fit === '50' ? 0.5 : 1;
  const box = fit === 'fill' ? { width: '100%', height: '100%' } : { width: `min(${scale * 100}vw, ${scale * 100}vh * ${ratio})`, aspectRatio: String(ratio) };

  return (
    // Above everything in the player (the lyrics panel's controls too), under its top strip.
    <div className="absolute inset-0 z-20 grid animate-fade-in place-items-center bg-black" onClick={() => usePlayer.getState().togglePlay()}>
      <video
        ref={video}
        src={url}
        muted
        playsInline
        preload="auto"
        className={`${fit === 'fill' ? 'object-cover' : 'object-contain'} ${scale < 1 ? 'rounded-[18px] shadow-[0_24px_80px_rgb(0_0_0/0.6)]' : ''} transition-[width] duration-300`}
        style={box}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
          v.currentTime = getPlayhead() + 0.35;
        }}
        onError={onError}
      />
      {audioUrl && (
        <audio ref={audio} src={audioUrl} preload="auto" onError={() => setSongSilenced(false)} />
      )}
    </div>
  );
}
