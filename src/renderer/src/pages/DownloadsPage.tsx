import { FolderOpen, HardDriveDownload, Play, RotateCw, Trash2, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { DownloadItem } from '@shared/types';
import { Artwork } from '@/components/Artwork';
import { PillButton } from '@/components/Buttons';
import { DetailHeader } from '@/components/DetailHeader';
import { Page } from '@/components/Page';
import { PlayGlyph } from '@/components/icons';
import { api } from '@/lib/api';
import { QUALITY_LABEL, startDownload, useDownloads } from '@/state/downloads';
import { usePlayer } from '@/state/player';
import { toast } from '@/state/ui';

const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`);

function Row({ d, index }: { d: DownloadItem; index: number }) {
  const k = d.total ? d.received / d.total : 0;
  const active = d.state === 'queued' || d.state === 'downloading';
  const small = 'grid size-8 place-items-center rounded-full text-secondary transition-colors hover:bg-white/10 hover:text-primary';
  return (
    <div role="listitem" className="group stagger glow relative grid h-16 grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[14px] px-2 hover:bg-white/[0.05]" style={{ '--i': index } as CSSProperties}>
      <Artwork url={d.track.thumbnail} size={48} radius="sm" className="size-12" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate type-body-emphasized text-primary">{d.track.title}</span>
        <span className="truncate type-callout text-secondary">
          {d.track.artists.map((a) => a.name).join(', ')}
          <span className="text-tertiary">
            {' · '}
            {QUALITY_LABEL[d.quality]}
            {d.format ? ` · ${d.format.codec}${d.format.bitDepth ? ` ${d.format.bitDepth}-bit` : ''}${!d.format.lossless && d.format.bitrate ? ` ${Math.round(d.format.bitrate / 1000)} kbps` : ''}` : ''}
            {d.total ? ` · ${mb(d.state === 'done' ? d.total : d.received)}${active ? ` of ${mb(d.total)}` : ''}` : ''}
          </span>
        </span>
        {d.state === 'error' && <span className="truncate type-callout text-key">{d.error}</span>}
      </div>
      <div className="flex items-center gap-1">
        {d.state === 'done' && (
          <>
            <button className={small} title="Play" aria-label={`Play ${d.track.title}`} onClick={() => usePlayer.getState().playTracks([d.track], 0, { source: { label: 'Downloads' } })}>
              <Play size={16} className="translate-x-px" />
            </button>
            <button className={small} title="Show in folder" aria-label="Show in folder" onClick={() => void api.showDownload(d.videoId)}>
              <FolderOpen size={16} />
            </button>
          </>
        )}
        {d.state === 'error' && (
          <button className={small} title="Retry" aria-label="Retry" onClick={() => startDownload([d.track], d.quality === 'lossless' ? 'best' : d.quality)}>
            <RotateCw size={16} />
          </button>
        )}
        {active ? (
          <button className={small} title="Cancel" aria-label="Cancel download" onClick={() => void api.cancelDownload(d.videoId)}>
            <X size={17} />
          </button>
        ) : (
          <button className={small} title="Remove (deletes the file)" aria-label="Remove download" onClick={() => void api.removeDownload(d.videoId, true).then(() => toast('Download removed'))}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {/* Progress: a bar of light along the row's foot. */}
      {active && (
        <div className="absolute inset-x-3 bottom-1 h-[3px] overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full bg-key transition-[width] duration-300 ease-out ${d.state === 'queued' ? 'animate-pulse' : ''}`} style={{ width: `${Math.max(2, k * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export function DownloadsPage() {
  const list = useDownloads((s) => s.list);
  const [folder, setFolder] = useState('');
  useEffect(() => void api.downloadsFolder().then(setFolder, () => undefined), []);
  const done = list.filter((d) => d.state === 'done');
  const active = list.filter((d) => d.state === 'queued' || d.state === 'downloading');
  const failed = list.filter((d) => d.state === 'error');
  const size = done.reduce((a, d) => a + d.total, 0);
  return (
    <Page>
      <DetailHeader
        artwork={
          <div className="grid size-[clamp(150px,25cqw,232px)] flex-none place-items-center rounded-artwork-lg bg-[linear-gradient(140deg,#0a84ff,#5e5ce6_55%,#bf5af2)] text-white shadow-art">
            <HardDriveDownload size={88} strokeWidth={1.2} />
          </div>
        }
        eyebrow="On this PC"
        title="Downloads"
        meta={[`${done.length} song${done.length === 1 ? '' : 's'}`, size ? mb(size) : '', active.length ? `${active.length} downloading` : ''].filter(Boolean).join(' · ')}
        description={folder ? `Saved in ${folder}. Downloaded songs play from here, even offline.` : undefined}
        actions={
          <>
            <PillButton disabled={!done.length} onClick={() => usePlayer.getState().playTracks(done.map((d) => d.track), 0, { source: { label: 'Downloads' } })}>
              <PlayGlyph size={16} /> Play
            </PillButton>
            <PillButton variant="tinted" onClick={() => void api.openDownloadsFolder()}>
              <FolderOpen size={16} /> Open Folder
            </PillButton>
            <PillButton variant="tinted" onClick={() => void api.chooseDownloadsFolder().then(setFolder)}>
              Change Folder…
            </PillButton>
          </>
        }
      />
      <div className="px-(--body-gutter)">
        {!list.length && (
          <div className="flex animate-rise flex-col items-center py-16 text-center">
            <HardDriveDownload size={40} strokeWidth={1.4} className="mb-3 text-tertiary" />
            <h2 className="type-[700_20px/26px] tracking-apple">No downloads yet</h2>
            <p className="mt-1 max-w-[420px] type-body-reduced text-secondary">Choose Download… from any song’s menu, or the download button on an album or playlist.</p>
          </div>
        )}
        {[
          ['Downloading', active],
          ['Couldn’t download', failed],
          ['Downloaded', done],
        ].map(([title, items]) =>
          (items as DownloadItem[]).length ? (
            <section key={title as string} className="mb-8">
              <h2 className="mb-2 px-2 type-[700_20px/26px] tracking-apple">{title as string}</h2>
              <div role="list" className="flex flex-col gap-0.5">
                {(items as DownloadItem[]).map((d, i) => (
                  <Row key={d.videoId} d={d} index={i} />
                ))}
              </div>
            </section>
          ) : null,
        )}
      </div>
    </Page>
  );
}
