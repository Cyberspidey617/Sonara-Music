import type { AudioFormat, TrackSource } from '@shared/types';
import { usePlayer } from '@/state/player';

export function describeFormat(f: AudioFormat | undefined): string {
  if (!f) return '';
  const parts = [f.codec];
  if (f.lossless && f.bitDepth) parts.push(`${f.bitDepth}-bit`);
  if (f.lossless && f.sampleRate) parts.push(`${+(f.sampleRate / 1000).toFixed(1)} kHz`);
  if (!f.lossless && f.bitrate) parts.push(`${Math.round(f.bitrate / 1000)} kbps`);
  return parts.join(' · ');
}

const SOURCE: Record<TrackSource, string> = { youtube: 'YouTube Music', local: 'On this PC', server: 'Your server', download: 'Downloaded', addon: 'Lossless source' };

/** What the current song is playing as: "LOSSLESS" with the format, or YouTube's stream. */
export function NowPlayingQuality({ detailed = false, className = '' }: { detailed?: boolean; className?: string }) {
  const playingAs = usePlayer((s) => s.playingAs);
  if (!playingAs?.format) return null;
  const { format, source, sourceName } = playingAs;
  const from = sourceName ?? SOURCE[source];
  const hiRes = format.lossless && ((format.bitDepth ?? 16) > 16 || (format.sampleRate ?? 44100) > 48000);
  if (!detailed) {
    if (!format.lossless) return null;
    return (
      <span className={`inline-flex h-[15px] flex-none items-center rounded-[3px] border border-current px-1 text-[9px] leading-none font-bold tracking-wide text-key ${className}`} title={`${hiRes ? 'Hi-Res ' : ''}Lossless · ${describeFormat(format)} · ${from}`}>
        {hiRes ? 'HI-RES' : 'LOSSLESS'}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} title={from}>
      {format.lossless && (
        <span className="inline-flex h-[17px] items-center rounded-[4px] bg-white/90 px-1.5 text-[10px] leading-none font-bold tracking-wide text-black">{hiRes ? 'HI-RES LOSSLESS' : 'LOSSLESS'}</span>
      )}
      <span className="type-callout-medium text-tertiary">
        {describeFormat(format)} · {from}
      </span>
    </span>
  );
}

/** A small badge for a track row: shown for lossless files. */
export function FormatChip({ format }: { format?: AudioFormat }) {
  if (!format?.lossless) return null;
  const hiRes = (format.bitDepth ?? 16) > 16 || (format.sampleRate ?? 44100) > 48000;
  return (
    <span className="ml-1.5 inline-flex h-[13px] flex-none items-center rounded-[3px] border border-tertiary px-[3px] text-[8.5px] leading-none font-bold tracking-wide text-tertiary" title={describeFormat(format)}>
      {hiRes ? 'HI-RES' : 'LOSSLESS'}
    </span>
  );
}
