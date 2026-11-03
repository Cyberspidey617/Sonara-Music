import type { AudioQuality, Track } from '@shared/types';
import { isElectron } from './api';

/**
 * What the <audio> element plays for a track: a file or server song through
 * media://, or a YouTube song through ytstream://. With "Lossless when
 * available", the YouTube request carries the song's names so the main
 * process can find your lossless copy of it.
 */
export function streamUrl(track: Track, quality: AudioQuality): string {
  if (!isElectron) return silentWav(Math.min(track.duration ?? 200, 600));
  if (track.source === 'local') return `media://local/${encodeURIComponent(track.videoId)}`;
  if (track.source === 'server') return `media://server/${encodeURIComponent(track.videoId.replace(/^srv_/, ''))}`;
  const params = new URLSearchParams({ q: quality });
  if (quality === 'lossless') {
    params.set('t', track.title);
    params.set('a', track.artists.map((a) => a.name).join(', '));
    if (track.duration) params.set('d', String(Math.round(track.duration)));
  }
  return `ytstream://track/${encodeURIComponent(track.videoId)}?${params}`;
}

/** Development outside Electron: a silent WAV of the track's length, so the UI can be exercised. */
const silent = new Map<number, string>();
function silentWav(seconds: number): string {
  const key = Math.round(seconds);
  const known = silent.get(key);
  if (known) return known;
  const rate = 8000;
  const samples = rate * key;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  write(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, 'data');
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  silent.set(key, url);
  return url;
}
