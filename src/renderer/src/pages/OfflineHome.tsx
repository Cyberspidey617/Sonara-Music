import { CloudOff, HardDriveDownload, Loader2, RotateCw, Shuffle } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Artwork } from '@/components/Artwork';
import { PillButton } from '@/components/Buttons';
import { PlayGlyph } from '@/components/icons';
import { useDownloads } from '@/state/downloads';
import { checkOnline } from '@/state/online';
import { usePlayer } from '@/state/player';

/**
 * Home with no connection: what still plays. Downloaded songs, with their kept covers; click one to
 * play it (and the rest after it). Everything else comes back with the connection.
 */
export function OfflineHome() {
  const done = useDownloads((s) => s.list).filter((d) => d.state === 'done');
  const tracks = done.map((d) => d.track);
  const playing = usePlayer((s) => s.queue[s.index]?.track.videoId);
  const [checking, setChecking] = useState(false);
  const play = (start: number, shuffle = false) => usePlayer.getState().playTracks(tracks, start, { shuffle, source: { label: 'Downloads' } });
  const retry = () => {
    setChecking(true);
    void checkOnline().finally(() => setChecking(false));
  };

  return (
    <div className="px-(--body-gutter) pt-6 pb-10">
      <div className="mb-8 flex animate-rise flex-wrap items-end gap-6">
        <div className="grid size-28 flex-none place-items-center rounded-[28px] bg-[linear-gradient(140deg,#2a3352,#151a2c)] text-secondary shadow-art">
          <CloudOff size={52} strokeWidth={1.4} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="type-callout-emphasized tracking-wide text-tertiary uppercase">No connection</span>
          <h1 className="type-header-emphasized">You’re offline</h1>
          <p className="type-body-reduced text-secondary">Your downloaded songs still play. Search, Home and streaming come back when you’re connected again.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PillButton disabled={!tracks.length} onClick={() => play(0)}>
            <PlayGlyph size={16} /> Play all
          </PillButton>
          <PillButton variant="tinted" disabled={!tracks.length} onClick={() => play(0, true)}>
            <Shuffle size={16} /> Shuffle
          </PillButton>
          <PillButton variant="tinted" disabled={checking} onClick={retry}>
            {checking ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />} Try again
          </PillButton>
        </div>
      </div>

      {tracks.length ? (
        <>
          <h2 className="mb-3 type-title-1-emphasized">Downloaded songs</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-5 gap-y-6">
            {tracks.map((t, i) => (
              <button
                key={t.videoId}
                className="group stagger flex min-w-0 flex-col gap-2 text-left"
                style={{ '--i': i } as CSSProperties}
                title={`Play “${t.title}”`}
                onClick={() => play(i)}
              >
                <span className="relative block aspect-square w-full transition-[scale] duration-200 group-hover:scale-[1.03] group-active:scale-[0.97]">
                  <Artwork url={t.thumbnail} size={200} radius="lg" className="size-full shadow-[0_10px_28px_rgb(0_0_0/0.35)]" />
                  <span className={`glass-prominent absolute right-2 bottom-2 grid size-10 place-items-center rounded-full transition-opacity ${playing === t.videoId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <PlayGlyph size={16} />
                  </span>
                </span>
                <span className="truncate type-body-emphasized text-primary">{t.title}</span>
                <span className="-mt-1.5 truncate type-callout text-secondary">{t.artists.map((a) => a.name).join(', ')}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center py-16 text-center text-tertiary">
          <HardDriveDownload size={40} strokeWidth={1.4} className="mb-3" />
          <h2 className="type-[700_20px/26px] text-primary">Nothing downloaded yet</h2>
          <p className="mt-1 max-w-[440px] type-body-reduced">Download songs while you’re online (right-click a song › Download), and they’ll play here with no connection.</p>
        </div>
      )}
    </div>
  );
}
