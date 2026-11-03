import type { CSSProperties } from 'react';
import { DownloadButton } from '@/components/Downloads';
import { useQueryClient } from '@tanstack/react-query';
import { Ellipsis, FolderPlus, HardDrive, ListPlus, Loader2, RefreshCw, Search, Server, Shuffle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { LocalAlbum, Track } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { formatTotal, plural } from '@/lib/format';
import { useLocalLibrary, useServerAlbums, useServerStatus, useYourAlbum } from '@/lib/queries';
import { enableLosslessIfHigh, useLibrary } from '@/state/library';
import { openMenuAt } from '@/state/menu';
import { go, type Route } from '@/state/nav';
import { usePlayer } from '@/state/player';
import { toast, useUi } from '@/state/ui';
import { IconButton, PillButton } from '@/components/Buttons';
import { DetailHeader } from '@/components/DetailHeader';
import { PlayGlyph } from '@/components/icons';
import { Lockup } from '@/components/Lockup';
import { Page } from '@/components/Page';
import { EmptyState, ErrorState, HeaderSkeleton, TrackListSkeleton } from '@/components/States';
import { TrackList } from '@/components/TrackList';
import { Segmented } from '@/components/Segmented';

/** Keeps the library fresh while a scan runs. */
export function useScanProgress() {
  const client = useQueryClient();
  const [progress, setProgress] = useState<{ scanned: number; total: number; scanning: boolean } | null>(null);
  useEffect(
    () =>
      api.onScanProgress((state) => {
        setProgress(state);
        if (!state.scanning) void client.invalidateQueries({ queryKey: ['music'] });
      }),
    [client],
  );
  return progress;
}

function AlbumGrid({ albums, kind }: { albums: LocalAlbum[]; kind: 'localAlbum' | 'serverAlbum' }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-5 gap-y-7">
      {albums.map((a, i) => (
        <div key={a.id} className="stagger" style={{ '--i': i } as CSSProperties}>
          <Lockup size={0} lockup={{ kind, id: a.id, title: a.title, subtitle: [a.artist, a.year].filter(Boolean).join(' · '), thumbnail: a.thumbnail }} />
        </div>
      ))}
    </div>
  );
}

const tabClass = 'h-8 rounded-[8px] px-3.5 type-body-emphasized transition-colors';

export function YourMusicPage({ tab = 'songs' }: { tab?: 'songs' | 'albums' | 'server' }) {
  const { data, isLoading, error, refetch } = useLocalLibrary();
  const server = useServerStatus();
  const serverOn = !!server.data?.configured;
  const serverAlbums = useServerAlbums(serverOn && tab === 'server');
  const progress = useScanProgress();
  const [filter, setFilter] = useState('');
  const scanning = progress?.scanning ?? data?.scan.scanning ?? false;

  const tracks = useMemo(() => {
    const all = data?.tracks ?? [];
    const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return all;
    return all.filter((t) => {
      const hay = `${t.title} ${t.artists.map((a) => a.name).join(' ')} ${t.album?.name ?? ''}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [data, filter]);

  if (isLoading) return <div className="px-(--body-gutter) pt-6"><TrackListSkeleton /></div>;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const noFolders = data.folders.length === 0;
  const lossless = data.tracks.filter((t) => t.format?.lossless).length;
  const setTab = (t: 'songs' | 'albums' | 'server') => go({ name: 'music', tab: t } as Route, { replace: true, tab: true });

  return (
    <div className="pt-4 pb-10">
      <div className="mb-2 flex items-end justify-between gap-4 px-(--body-gutter)">
        <div>
          <h1 className="type-header-emphasized tracking-apple">Your Music</h1>
          <p className="mt-1 type-body-reduced text-secondary">
            {noFolders && !serverOn
              ? 'Your own lossless files: folders on this PC, or a music server.'
              : `${plural(data.tracks.length, 'song')} on this PC${lossless ? ` · ${lossless.toLocaleString()} lossless` : ''}${serverOn ? ` · ${server.data?.serverName ?? 'server'} connected` : ''}`}
            {scanning && progress && (
              <span className="ml-2 inline-flex items-center gap-1.5 text-tertiary">
                <Loader2 size={12} className="animate-spin" /> Scanning {progress.scanned.toLocaleString()} / {progress.total.toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <PillButton variant="tinted" className="min-w-0 px-3.5 type-body-emphasized" onClick={() => void api.addMusicFolder().then((list) => (list.length && enableLosslessIfHigh(toast), refetch()))}>
            <FolderPlus size={15} /> Add Folder
          </PillButton>
          {!noFolders && (
            <IconButton aria-label="Rescan" title="Rescan your folders" disabled={scanning} onClick={() => void api.rescanMusic().then(() => refetch())}>
              <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="mt-5 mb-5 flex items-center justify-between gap-4 px-(--body-gutter)">
        <Segmented
          tabs
          label="Your Music"
          value={tab}
          options={[
            { value: 'songs', label: 'Songs' },
            { value: 'albums', label: 'Albums' },
            { value: 'server', label: 'Server' },
          ]}
          onChange={setTab}
        />
        {tab === 'songs' && data.tracks.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-tertiary" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter songs"
                className="h-[34px] w-56 rounded-pill border-[0.5px] border-search-border bg-white/[0.06] pr-2 pl-8 type-body-reduced placeholder:text-tertiary focus:border-white/30"
              />
            </div>
            <PillButton className="h-8 min-w-0 px-3.5 type-body-emphasized" onClick={() => usePlayer.getState().playTracks(tracks, 0, { source: { label: 'Your Music' } })}>
              <PlayGlyph size={13} /> Play
            </PillButton>
            <PillButton variant="tinted" className="h-8 min-w-0 px-3.5 type-body-emphasized" onClick={() => usePlayer.getState().playTracks(tracks, 0, { shuffle: true, source: { label: 'Your Music' } })}>
              <Shuffle size={14} /> Shuffle
            </PillButton>
          </div>
        )}
      </div>

      <div className="px-(--body-gutter)">
        {tab !== 'server' && noFolders && (
          <EmptyState
            icon={<HardDrive size={38} strokeWidth={1.4} />}
            title="Add your music folders"
            body="Point Sonara at folders of FLAC, WAV, MP3, M4A or Ogg files. They play here in full quality, and with “Lossless when available” on, YouTube songs you own are played from your lossless copy instead."
            action={
              <PillButton className="mt-3" onClick={() => void api.addMusicFolder().then((list) => (list.length && enableLosslessIfHigh(toast), refetch()))}>
                <FolderPlus size={16} /> Add Folder
              </PillButton>
            }
          />
        )}
        <div key={tab} className="animate-rise">
        {tab === 'songs' && !noFolders && (tracks.length ? <TrackList tracks={tracks} source={{ label: 'Your Music' }} /> : <p className="py-12 text-center type-body-reduced text-tertiary">{scanning ? 'Reading your music…' : filter ? 'No songs match.' : 'No playable music in these folders yet.'}</p>)}
        {tab === 'albums' && !noFolders && (data.albums.length ? <AlbumGrid albums={data.albums} kind="localAlbum" /> : <p className="py-12 text-center type-body-reduced text-tertiary">{scanning ? 'Reading your music…' : 'No albums found — files need album tags.'}</p>)}
        {tab === 'server' &&
          (!serverOn ? (
            <EmptyState
              icon={<Server size={38} strokeWidth={1.4} />}
              title="Connect your music server"
              body="Stream your own FLAC library from Navidrome or any Subsonic-compatible server, at full quality."
              action={
                <PillButton className="mt-3" onClick={() => go({ name: 'settings', tab: 'music' })}>
                  <Server size={16} /> Set Up Server
                </PillButton>
              }
            />
          ) : serverAlbums.isLoading ? (
            <TrackListSkeleton rows={6} />
          ) : serverAlbums.error ? (
            <ErrorState error={serverAlbums.error} onRetry={() => void serverAlbums.refetch()} />
          ) : (
            <AlbumGrid albums={serverAlbums.data ?? []} kind="serverAlbum" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** An album from your folders or your server. */
export function YourAlbumPage({ source, id }: { source: 'local' | 'server'; id: string }) {
  const { data, error, isLoading, refetch } = useYourAlbum(source, id);
  if (isLoading)
    return (
      <>
        <HeaderSkeleton />
        <div className="px-(--body-gutter)">
          <TrackListSkeleton />
        </div>
      </>
    );
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const play = (shuffle: boolean) => usePlayer.getState().playTracks(data.tracks, 0, { shuffle, source: { label: data.title } });
  const add = (tracks: Track[]) => useUi.getState().openDialog({ kind: 'add-to-playlist', tracks });
  return (
    <Page tintUrl={data.thumbnail}>
      <DetailHeader
        thumbnail={data.thumbnail}
        eyebrow={source === 'local' ? 'Album · On this PC' : 'Album · Your server'}
        title={data.title}
        artists={data.artists}
        meta={[data.year, plural(data.tracks.length, 'song'), formatTotal(data.tracks)].filter(Boolean).join(' · ')}
        description={data.description}
        actions={
          <>
            <PillButton onClick={() => play(false)}>
              <PlayGlyph size={16} /> Play
            </PillButton>
            <PillButton variant="tinted" onClick={() => play(true)}>
              <Shuffle size={16} strokeWidth={2.2} /> Shuffle
            </PillButton>
            {source === 'server' && <DownloadButton tracks={data.tracks} />}
            <IconButton
              aria-label="More"
              onClick={(e) =>
                openMenuAt(e.currentTarget, [
                  { header: data.title },
                  { label: 'Add to Playlist…', icon: <ListPlus size={15} />, onSelect: () => add(data.tracks) },
                  { label: 'Add All to Liked Songs', onSelect: () => (useLibrary.getState().likeAll(data.tracks), toast('Added to Liked Songs')) },
                  { label: 'Play Next', onSelect: () => (usePlayer.getState().playNext(data.tracks), toast('Playing next')) },
                  { label: 'Add to Queue', onSelect: () => (usePlayer.getState().addToQueue(data.tracks), toast('Added to queue')) },
                ], 'below-start')
              }
            >
              <Ellipsis size={18} />
            </IconButton>
          </>
        }
      />
      <div className="px-(--body-gutter) pb-10">
        <TrackList tracks={data.tracks} numbered showAlbum={false} source={{ label: data.title }} />
      </div>
    </Page>
  );
}

export function useConnectServer() {
  const client = useQueryClient();
  return async (url: string, username: string, password: string) => {
    try {
      const status = await api.connectServer({ url, username, password });
      await client.invalidateQueries({ queryKey: ['music'] });
      toast(`Connected to ${status.serverName ?? 'your server'}`);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  };
}
