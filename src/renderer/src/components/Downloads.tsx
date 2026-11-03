import { ArrowDown, Check, CircleAlert, Gauge, HardDriveDownload, Smartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { DownloadQuality, Track } from '@shared/types';
import { downloadTracks, startDownload, useDownloads } from '@/state/downloads';
import { useLibrary } from '@/state/library';
import { IconButton } from './Buttons';
import { Toggle } from './Segmented';

const OPTIONS: { value: DownloadQuality; title: string; detail: string; kbps: number; icon: ReactNode }[] = [
  { value: 'best', title: 'Best', detail: 'YouTube’s highest quality, saved untouched · Opus ~160 kbps · .webm', kbps: 160, icon: <Gauge size={18} /> },
  { value: 'compatible', title: 'Compatible', detail: 'Opens in every player, car and phone · AAC 128 kbps · .m4a', kbps: 128, icon: <Smartphone size={18} /> },
  { value: 'small', title: 'Data Saver', detail: 'Smallest files · Opus ~64 kbps · .webm', kbps: 64, icon: <ArrowDown size={18} /> },
];

const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(0.1, bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`);

/** The quality picker shown before downloading (unless a default is saved). */
export function DownloadChooser({ tracks, onDone }: { tracks: Track[]; onDone: () => void }) {
  const saved = useLibrary((s) => s.settings.downloadQuality);
  const [quality, setQuality] = useState<DownloadQuality>(saved && saved !== 'ask' ? saved : 'best');
  const [remember, setRemember] = useState(false);
  const seconds = tracks.reduce((a, t) => a + (t.duration ?? 210), 0);
  return (
    <div className="relative px-7 pb-7">
      <p className="mb-4 type-body-reduced text-secondary">
        {tracks.length === 1 ? `“${tracks[0]!.title}”` : `${tracks.length} songs`} · saved to your Music folder and playable offline.
      </p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Download quality">
        {OPTIONS.map((o, i) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={quality === o.value}
            style={{ '--i': i } as React.CSSProperties}
            className={`stagger relative flex items-center gap-3.5 rounded-[16px] px-4 py-3 text-left transition-[background-color,box-shadow] duration-200 ${quality === o.value ? 'bg-white/[0.14] shadow-[inset_0_0_0_1.5px_rgb(var(--keyColor-rgb)/0.9)]' : 'bg-white/[0.05] hover:bg-white/[0.09]'}`}
            onClick={() => setQuality(o.value)}
          >
            <span className={`grid size-9 flex-none place-items-center rounded-full ${quality === o.value ? 'bg-key text-(--onKeyColor)' : 'bg-white/10 text-secondary'}`}>{o.icon}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-body-emphasized text-primary">{o.title}</span>
              <span className="type-callout text-secondary">{o.detail}</span>
            </span>
            <span className="flex-none type-callout-medium text-tertiary tabular-nums">{'≈ ' + mb((seconds * o.kbps * 1000) / 8)}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 type-callout text-tertiary">Songs are saved exactly as delivered. Converting YouTube audio to FLAC or 320 kbps MP3 wouldn’t add quality, only size, so it isn’t offered.</p>
      <div className="mt-5 flex items-center gap-3">
        <label className="flex flex-1 items-center gap-3">
          <Toggle label="Always use this quality" on={remember} onChange={setRemember} />
          <span className="type-body-reduced text-secondary">Always use this</span>
        </label>
        <button className="h-9 rounded-pill bg-white/10 px-5 type-body-emphasized hover:bg-white/15" onClick={onDone}>
          Cancel
        </button>
        <button
          autoFocus
          className="glass-prominent glow elastic relative h-9 rounded-pill px-5 type-body-emphasized"
          onClick={() => {
            if (remember) useLibrary.getState().updateSettings({ downloadQuality: quality });
            startDownload(tracks, quality);
            onDone();
          }}
        >
          <span className="relative z-1">Download</span>
        </button>
      </div>
    </div>
  );
}

/** A ring that fills as a song downloads, a tick once it's saved. */
export function DownloadStatus({ videoId, size = 16, className = '' }: { videoId: string; size?: number; className?: string }) {
  const d = useDownloads((s) => s.items[videoId]);
  if (!d) return null;
  if (d.state === 'done')
    return (
      <span className={`inline-grid flex-none animate-glyph place-items-center rounded-full bg-key text-(--onKeyColor) ${className}`} style={{ width: size, height: size }} title={`Downloaded · ${d.format?.codec ?? ''}`} aria-label="Downloaded">
        <ArrowDown size={size * 0.68} strokeWidth={3} />
      </span>
    );
  if (d.state === 'error')
    return (
      <span className={`inline-grid flex-none place-items-center text-key ${className}`} title={d.error} aria-label="Download failed">
        <CircleAlert size={size} />
      </span>
    );
  const k = d.total ? d.received / d.total : 0;
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className={`flex-none -rotate-90 ${className}`} aria-label={`Downloading, ${Math.round(k * 100)}%`}>
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.2" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="rgb(var(--keyColor-rgb))" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - k)} className={`transition-[stroke-dashoffset] duration-300 ${d.state === 'queued' ? 'animate-pulse' : ''}`} />
    </svg>
  );
}

/** The download button on album and playlist headers. */
export function DownloadButton({ tracks }: { tracks: Track[] }) {
  const items = useDownloads((s) => s.items);
  const relevant = tracks.filter((t) => t.source !== 'local');
  const done = relevant.length > 0 && relevant.every((t) => items[t.videoId]?.state === 'done');
  const active = relevant.filter((t) => items[t.videoId] && items[t.videoId]!.state !== 'done' && items[t.videoId]!.state !== 'error');
  const label = done ? 'Downloaded' : active.length ? `Downloading ${active.length}` : 'Download';
  return (
    <IconButton aria-label={label} title={label} disabled={!relevant.length} onClick={() => !done && downloadTracks(relevant)} className={done ? 'text-key' : ''}>
      {done ? <Check size={18} strokeWidth={2.4} /> : active.length ? <DownloadStatus videoId={active[0]!.videoId} size={18} /> : <HardDriveDownload size={18} strokeWidth={2} />}
    </IconButton>
  );
}
