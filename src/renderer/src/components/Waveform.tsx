import { useEffect, useRef } from 'react';
import type { Settings } from '@shared/types';
import { useArtworkColors, useThemeColors } from '@/lib/appearance';
import { hexToRgb, type Rgb } from '@/lib/palette';
import { getAnalyser, spectrumLevels } from '@/lib/waveform';
import { prefersReducedMotion } from '@/lib/motion';
import { onScreen, powerSaving, usePowerSaving } from '@/lib/power';

/** The waveform's settings (Settings › Player › Waveform). */
export type WaveOptions = Pick<Settings, 'waveBars' | 'waveThickness' | 'waveHeight' | 'waveSmoothing' | 'waveSensitivity' | 'waveAutoLevel' | 'waveShape' | 'waveStyle' | 'waveIdle'>;

/** The classic gradient: white at the centre, through soft lavender, to muted purple at the ends. */
const LAVENDER = ['#A78BFA', '#DCC5FF', '#FFFFFF', '#DCC5FF', '#A78BFA'];
const AT = [0, 0.28, 0.5, 0.72, 1];

const mix = ([r, g, b]: Rgb, amount: number) => `rgb(${Math.round(r + (255 - r) * amount)} ${Math.round(g + (255 - g) * amount)} ${Math.round(b + (255 - b) * amount)})`;
/** One colour as the waveform's gradient: the colour at the ends, lighter inward, white at the centre. */
const stopsFor = (base: Rgb) => [mix(base, 0), mix(base, 0.55), '#FFFFFF', mix(base, 0.55), mix(base, 0)];

/** The gradient for the chosen colour; "song" follows the playing artwork (lavender until it's read). */
export function useWaveStops(s: Settings): string[] {
  const art = useArtworkColors(s.waveColor === 'song');
  const { accent } = useThemeColors(s);
  if (s.waveColor === 'song') return art.accent ? stopsFor(art.accent) : LAVENDER;
  if (s.waveColor === 'accent') return stopsFor(accent);
  if (s.waveColor === 'custom') return stopsFor(hexToRgb(s.waveCustomColor || '#a78bfa'));
  return LAVENDER;
}

/**
 * A symmetric audio waveform drawn on a canvas: thin pill-shaped bars following the music's
 * spectrum with eased motion. Paused, it breathes softly (or rests); inactive, it draws nothing.
 */
export function Waveform({ active, playing, options: o, stops, className = '' }: { active: boolean; playing: boolean; options: WaveOptions; stops: string[]; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const saving = usePowerSaving();
  const key = JSON.stringify([saving, o.waveBars, o.waveThickness, o.waveHeight, o.waveSmoothing, o.waveSensitivity, o.waveAutoLevel, o.waveShape, o.waveStyle, o.waveIdle, stops]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const bars = Math.max(8, Math.min(96, Math.round(o.waveBars || 40)));
    const reach = o.waveHeight || 1;
    const smooth = Math.max(0, Math.min(1, o.waveSmoothing ?? 0.5));
    const rising = o.waveStyle === 'rising';
    // Sensitivity: more gain and a gentler curve answer quiet sounds; 0.5 leaves levels as they are.
    const sensitivity = Math.max(0, Math.min(1, o.waveSensitivity ?? 0.5));
    const gain = 2 ** ((sensitivity - 0.5) * 2);
    const curve = 1.4 - 0.8 * sensitivity;
    const autoLevel = o.waveAutoLevel ?? true;
    // Auto level: the loudest recent moment, let go of slowly (~7 s from full), sets the scale.
    let peak = 0.5;
    // Small at the ends, tallest around the middle frequencies; or one height across.
    const envelope = (i: number) => (o.waveShape === 'even' ? 0.85 : 0.28 + 0.72 * Math.sin((Math.PI * i) / (bars - 1)) ** 1.4);
    const heights = new Float32Array(bars);
    const targets = new Float32Array(bars);
    const levels = new Float32Array(bars);
    let width = 0;
    let height = 0;
    let gradient: CanvasGradient | null = null;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = el.clientWidth;
      height = el.clientHeight;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gradient = ctx.createLinearGradient(0, 0, width, 0);
      stops.forEach((color, i) => gradient!.addColorStop(AT[i] ?? i / (stops.length - 1), color));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      if (!width || !height || !gradient) return;
      const bar = Math.max(1, Math.min(8, (width / bars) * (o.waveThickness || 0.5)));
      const step = (width - bar) / (bars - 1);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      for (let i = 0; i < bars; i++) {
        const h = Math.max(bar, Math.min(1, heights[i]!) * height);
        ctx.roundRect(i * step, rising ? height - h : (height - h) / 2, bar, h, bar / 2);
      }
      ctx.fill();
    };
    const rest = (amount: number) => {
      for (let i = 0; i < bars; i++) heights[i] = envelope(i) * amount;
    };

    const observer = new ResizeObserver(() => {
      resize();
      draw();
    });
    observer.observe(el);
    resize();
    // The resting shape at once, before the first animation frame.
    rest(0.2);
    draw();

    const still = prefersReducedMotion();
    // Inactive, motion reduced, or paused without breathing: one quiet, static frame.
    if (!active || still || (!playing && (!o.waveIdle || powerSaving()))) {
      rest(playing && !still ? 0.5 : 0.2);
      draw();
      return () => observer.disconnect();
    }

    const analyser = playing ? getAnalyser() : null;
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    // Rising quicker than falling; smoother settings glide more.
    const up = 0.45 - 0.33 * smooth;
    const down = 0.2 - 0.15 * smooth;
    let frame = 0;
    let last = performance.now();
    const pausedAt = last;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!onScreen(el, now)) return;
      // Paused, the slow breathing needs only a few frames a second, and settles still after a while
      // (an app left paused shouldn't keep the PC busy).
      if (!playing) {
        if (now - pausedAt > 20_000) {
          cancelAnimationFrame(frame);
          rest(0.2);
          draw();
          return;
        }
        if (now - last < 1000 / 12) return;
      } else if (now - last < 1000 / (powerSaving() ? 21 : 31)) {
        // Playing: 30 frames a second (20 saving power) look just as smooth for eased bars, and each
        // frame redraws the glass around them, so fewer is much lighter on the PC.
        return;
      }
      const dt = Math.min(64, now - last) / 16.67;
      last = now;
      let sound = false;
      if (analyser && data) {
        analyser.getByteFrequencyData(data);
        spectrumLevels(data, bars, levels);
        let loudest = 0;
        for (let i = 0; i < bars; i++) loudest = Math.max(loudest, levels[i]!);
        sound = loudest > 0.02;
        if (sound) {
          peak = autoLevel ? Math.max(loudest, peak - 0.0025 * dt, 0.15) : 1;
          for (let i = 0; i < bars; i++) levels[i] = Math.min(1, ((levels[i]! / peak) * (autoLevel ? 0.9 : 1) * gain) ** curve);
        }
      }
      for (let i = 0; i < bars; i++) {
        targets[i] = sound ? envelope(i) * Math.min(1, (0.18 + 0.82 * levels[i]!) * reach) : envelope(i) * (0.2 + 0.05 * Math.sin(now / 900 + i * 0.32));
        const rate = targets[i]! > heights[i]! ? up : down;
        heights[i]! += (targets[i]! - heights[i]!) * (1 - (1 - rate) ** dt);
      }
      draw();
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, playing, key]);

  return <canvas ref={canvas} aria-hidden="true" className={`block ${className}`} />;
}
