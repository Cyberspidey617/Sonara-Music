/*
 * The pebble's live waveform: the music's spectrum, read from what the decks play.
 *
 * It only listens. Each <audio> deck's captureStream() copies its sound into a
 * separate, silent Web Audio graph that ends at an analyser (never at the
 * speakers), so playback keeps its own path untouched: no resampling, nothing
 * added before the equalizer is switched on.
 */
import { audioDecks } from '@/state/player';

let analyser: AnalyserNode | null = null;
let failed = false;

/** One analyser fed by both decks (crossfades included), made on first use; null where it can't be. */
export function getAnalyser(): AnalyserNode | null {
  if (analyser || failed) return analyser;
  try {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256; // ~190 Hz per bin: enough detail for the bars
    analyser.smoothingTimeConstant = 0.6;
    const node = analyser;
    // A deck's stream gets a new audio track for each song it loads; each is connected while it lasts.
    const sources = new Map<MediaStreamTrack, MediaStreamAudioSourceNode>();
    const add = (track: MediaStreamTrack) => {
      if (track.kind !== 'audio' || sources.has(track)) return;
      const source = ctx.createMediaStreamSource(new MediaStream([track]));
      source.connect(node);
      sources.set(track, source);
    };
    const remove = (track: MediaStreamTrack) => {
      sources.get(track)?.disconnect();
      sources.delete(track);
    };
    for (const deck of audioDecks) {
      const capture = (deck as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream;
      if (!capture) throw new Error('captureStream is unavailable');
      const stream = capture.call(deck);
      stream.getAudioTracks().forEach(add);
      stream.addEventListener('addtrack', (e) => add(e.track));
      stream.addEventListener('removetrack', (e) => remove(e.track));
    }
    void ctx.resume();
  } catch (error) {
    console.warn('waveform unavailable', error);
    failed = true;
    analyser = null;
  }
  return analyser;
}

/**
 * Levels from 0 to 1 for `bars` bars, mirrored: the lowest notes in the middle, higher ones
 * toward both ends. Bins are spread on a curve (music sits mostly low); quieter highs get a lift.
 */
export function spectrumLevels(data: Uint8Array, bars: number, out: Float32Array) {
  const half = bars / 2;
  // Above ~10 kHz there is little to show; the first ~45% of the bins carries the music.
  const span = Math.floor(data.length * 0.45);
  for (let i = 0; i < bars; i++) {
    const fromCentre = Math.abs(i + 0.5 - half) / half; // 0 at the centre, 1 at the edges
    const bin = Math.min(span - 1, Math.floor(fromCentre ** 1.6 * span));
    out[i] = Math.min(1, ((data[bin] ?? 0) / 255) * (1 + fromCentre * 0.8));
  }
}
