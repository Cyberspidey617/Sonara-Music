import { create } from 'zustand';
import type { DownloadItem, DownloadQuality, Track } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useLibrary } from './library';
import { toast, useUi } from './ui';

interface DownloadsState {
  items: Record<string, DownloadItem>;
  list: DownloadItem[];
}

export const useDownloads = create<DownloadsState>(() => ({ items: {}, list: [] }));

const apply = (list: DownloadItem[]) => useDownloads.setState({ list, items: Object.fromEntries(list.map((d) => [d.videoId, d])) });

let started = false;
export function initDownloads() {
  if (started) return;
  started = true;
  void api.listDownloads().then(apply, () => undefined);
  let previous = new Map<string, DownloadItem['state']>();
  api.onDownloadsChanged((list) => {
    // A short note when something finishes or fails.
    for (const d of list) {
      const was = previous.get(d.videoId);
      if (was && was !== 'done' && d.state === 'done') toast(`Downloaded “${d.track.title}”`, { label: 'Show', run: () => void api.showDownload(d.videoId) });
      if (was && was !== 'error' && d.state === 'error') toast(`Couldn’t download “${d.track.title}”: ${d.error ?? 'error'}`);
    }
    previous = new Map(list.map((d) => [d.videoId, d.state]));
    apply(list);
  });
}

export const QUALITY_LABEL: Record<DownloadQuality, string> = {
  best: 'Best',
  compatible: 'Compatible',
  small: 'Data Saver',
  lossless: 'Lossless',
};

/** Downloads with the saved quality, or asks first. */
export function downloadTracks(tracks: Track[]) {
  const usable = tracks.filter((t) => t.source !== 'local');
  if (!usable.length) {
    toast(tracks.length ? 'These songs are already on this PC.' : 'Nothing to download.');
    return;
  }
  const q = useLibrary.getState().settings.downloadQuality ?? 'ask';
  if (q === 'ask') useUi.getState().openDialog({ kind: 'download', tracks: usable });
  else startDownload(usable, q);
}

export function startDownload(tracks: Track[], quality: DownloadQuality) {
  api.downloadTracks(tracks, quality).then(
    () => toast(tracks.length === 1 ? `Downloading “${tracks[0]!.title}”` : `Downloading ${tracks.length} songs`),
    (e) => toast(errorMessage(e)),
  );
}
