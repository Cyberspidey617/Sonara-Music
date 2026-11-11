import { useLiquidLens } from '@/lib/glass';
import { DownloadChooser } from './Downloads';
import { EqualizerPanel } from './Equalizer';
import { Check, Download, ListMusic, Loader2, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, errorMessage } from '@/lib/api';
import { plural } from '@/lib/format';
import { useLibrary } from '@/state/library';
import { go } from '@/state/nav';
import { toast, useUi } from '@/state/ui';
import { Mosaic } from './Mosaic';
import type { SongAbout, Track } from '@shared/types';

export function Modal({ title, children, onClose, width = 420 }: { title: string; children: ReactNode; onClose: () => void; width?: number }) {
  const sheet = useRef<HTMLDivElement>(null);
  const lens = useLiquidLens(sheet, { band: 22, strength: 40, blur: 36 });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[9000] grid animate-fade place-items-center bg-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} role="dialog" aria-modal="true" aria-label={title} className="glass-thick relative max-h-[86vh] max-w-[calc(100vw-32px)] animate-menu-in overflow-hidden rounded-[26px]" style={{ width, backgroundColor: 'var(--dialog-fill)', ...lens }}>
        <h2 className="relative px-7 pt-6 pb-3 type-[700_20px/26px] tracking-apple">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const field =
  'h-10 w-full rounded-[12px] border-[0.5px] border-search-border bg-white/[0.07] px-3.5 type-body-reduced text-primary placeholder:text-tertiary focus:border-white/35 focus:bg-white/[0.09]';
const primaryButton = 'h-9 rounded-pill bg-pill-bg px-5 type-body-emphasized text-pill hover:bg-white disabled:opacity-40';
const secondaryButton = 'h-9 rounded-pill bg-white/10 px-5 type-body-emphasized hover:bg-white/15';

function NamePlaylist({ initial, title, action, onSubmit, onClose }: { initial: string; title: string; action: string; onSubmit: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="relative px-7 pb-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
      >
        <input ref={input} className={field} value={name} maxLength={120} placeholder="Playlist name" onChange={(e) => setName(e.target.value)} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={!name.trim()}>
            {action}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportPlaylist({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A Spotify import's progress, as its songs are found on YouTube Music.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    void navigator.clipboard
      .readText()
      .then((text) => /youtube\.com|youtu\.be|list=|spotify\.com|spotify\.link|^spotify:/.test(text) && setUrl((v) => v || text.trim()))
      .catch(() => undefined);
    return api.onImportProgress((done, total) => setProgress({ done, total }));
  }, []);
  const run = async () => {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const result = await api.importPlaylist(url);
      const id = useLibrary.getState().createPlaylist(result.title, result.tracks, url);
      onClose();
      go({ name: 'local', id });
      const notes = [
        result.missing?.length && `${plural(result.missing.length, 'song')} couldn’t be found`,
        result.limitedTo && `Spotify only shares the first ${result.limitedTo}`,
      ].filter(Boolean);
      toast(`Imported ${plural(result.tracks.length, 'song')} into “${result.title}”${notes.length ? `. ${notes.join('; ')}.` : ''}`);
      if (result.missing?.length) console.info('Not found on YouTube Music:', result.missing);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal title="Import a Playlist" onClose={busy ? () => undefined : onClose} width={480}>
      <form
        className="relative px-7 pb-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() && !busy) void run();
        }}
      >
        <p className="mb-3 type-body-reduced text-secondary">
          Paste a link to a playlist on YouTube or YouTube Music (every song, even 500 or more), or a Spotify playlist, album or song: each song is found on YouTube Music, up to the first 100.
        </p>
        <input ref={input} className={field} value={url} disabled={busy} placeholder="A YouTube, YouTube Music or Spotify link" onChange={(e) => setUrl(e.target.value)} />
        {error && <p className="mt-2 type-callout text-[#ff6b61]">{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          {busy && (
            <span className="mr-auto inline-flex items-center gap-2 type-callout text-secondary">
              <Loader2 size={14} className="animate-spin" /> {progress ? `Finding songs… ${progress.done} of ${progress.total}` : 'Reading the playlist…'}
            </span>
          )}
          <button type="button" className={secondaryButton} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`${primaryButton} inline-flex items-center gap-2`} disabled={!url.trim() || busy}>
            <Download size={15} /> Import
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddToPlaylist({ tracks, onClose }: { tracks: import('@shared/types').Track[]; onClose: () => void }) {
  const playlists = useLibrary((s) => s.playlists);
  const openDialog = useUi((s) => s.openDialog);
  const what = tracks.length === 1 ? `“${tracks[0]!.title}”` : plural(tracks.length, 'song');
  return (
    <Modal title="Add to Playlist" onClose={onClose}>
      <p className="relative -mt-1 truncate px-7 pb-3 type-callout text-secondary">{what}</p>
      <div className="relative max-h-[50vh] overflow-y-auto px-3.5 pb-4">
        <button className="flex h-12 w-full items-center gap-3 rounded-[8px] px-3 text-left hover:bg-white/8" onClick={() => openDialog({ kind: 'new-playlist', tracks })}>
          <span className="grid size-9 place-items-center rounded-[6px] bg-white/10">
            <Plus size={18} />
          </span>
          <span className="type-body-reduced">New Playlist…</span>
        </button>
        {playlists.map((p) => {
          const has = tracks.length === 1 && p.tracks.some((t) => t.videoId === tracks[0]!.videoId);
          return (
            <button
              key={p.id}
              className="flex h-12 w-full items-center gap-3 rounded-[8px] px-3 text-left hover:bg-white/8"
              onClick={() => {
                const added = useLibrary.getState().addToPlaylist(p.id, tracks);
                onClose();
                toast(added ? `Added ${tracks.length === 1 ? '' : `${plural(added, 'song')} `}to “${p.name}”` : `Already in “${p.name}”`, { label: 'Open', run: () => go({ name: 'local', id: p.id }) });
              }}
            >
              <Mosaic tracks={p.tracks} size={36} className="flex-none rounded-[6px]" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate type-body-reduced">{p.name}</span>
                <span className="type-callout text-tertiary">{plural(p.tracks.length, 'song')}</span>
              </span>
              {has && <Check size={16} className="text-key" />}
            </button>
          );
        })}
        {!playlists.length && (
          <p className="flex items-center gap-2 px-3 py-3 type-callout text-tertiary">
            <ListMusic size={14} /> You don’t have any playlists yet.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Every keyboard shortcut (the Keyboard Shortcuts dialog, Settings › About, the first-run guide). */
export const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['Ctrl + → / ←', 'Next / previous song'],
  ['→ / ←', 'Seek 5 seconds'],
  ['↑ / ↓', 'Volume'],
  ['M', 'Mute'],
  ['S', 'Shuffle'],
  ['R', 'Repeat'],
  ['L', 'Lyrics'],
  ['Q', 'Up Next'],
  ['H', 'Like the current song'],
  ['F', 'Immersive player'],
  ['F11', 'Full screen'],
  ['Ctrl + K', 'Search'],
  ['Alt + ← / →', 'Back / forward'],
  ['Esc', 'Close the immersive player'],
  ['Ctrl + Alt + Space or P', 'Play / pause, from any app'],
  ['Ctrl + Alt + → / ← (or N / B)', 'Next / previous song, from any app'],
  ['Ctrl + Alt + ↑ / ↓', 'Volume, from any app'],
  ['Ctrl + Alt + L', 'Like the current song, from any app'],
  ['Ctrl + Alt + M', 'Show or hide the mini player'],
];

/** A song's story from Wikipedia (or its artist's), as Echo Music's Music DNA shows. */
function AboutSong({ track, onClose }: { track: Track; onClose: () => void }) {
  const [about, setAbout] = useState<SongAbout | null | undefined>(undefined);
  const artist = track.artists?.[0]?.name ?? '';
  useEffect(() => {
    void api.aboutSong(track.title, artist).then(setAbout, () => setAbout(null));
  }, [track.title, artist]);
  return (
    <Modal title="About This Song" onClose={onClose} width={520}>
      <div className="relative max-h-[min(64vh,560px)] overflow-y-auto px-7 pb-7">
        <p className="type-callout text-tertiary">
          {track.title} · {artist}
        </p>
        {about === undefined ? (
          <div className="grid h-32 place-items-center text-tertiary">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : about === null ? (
          <p className="mt-4 type-body-reduced text-secondary">Wikipedia has nothing about this song or its artist yet.</p>
        ) : (
          <>
            {about.kind === 'artist' && <p className="mt-3 type-callout text-tertiary">This song has no article of its own, so here’s its artist.</p>}
            <div className="mt-4 flex gap-4">
              {about.image && <img src={about.image} alt="" className="size-24 flex-none rounded-[12px] object-cover" />}
              <div className="min-w-0">
                <h3 className="type-title3 text-primary">{about.title}</h3>
                {about.description && <p className="type-callout text-secondary">{about.description}</p>}
              </div>
            </div>
            <p className="mt-4 type-body-reduced leading-relaxed whitespace-pre-line text-secondary">{about.text}</p>
            <button className="mt-4 type-callout-emphasized text-key hover:underline" onClick={() => void api.openExternal(about.url)}>
              Read more on Wikipedia
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

export function DialogLayer() {
  const dialog = useUi((s) => s.dialog);
  const close = useUi((s) => s.closeDialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'add-to-playlist':
      return <AddToPlaylist tracks={dialog.tracks} onClose={close} />;
    case 'new-playlist':
      return (
        <NamePlaylist
          initial={dialog.tracks?.length === 1 ? `${dialog.tracks[0]!.title} Mix` : 'New Playlist'}
          title="New Playlist"
          action="Create"
          onClose={close}
          onSubmit={(name) => {
            const id = useLibrary.getState().createPlaylist(name, dialog.tracks ?? []);
            close();
            toast(dialog.tracks?.length ? `Added to “${name}”` : `Created “${name}”`, { label: 'Open', run: () => go({ name: 'local', id }) });
          }}
        />
      );
    case 'rename-playlist': {
      const playlist = useLibrary.getState().playlists.find((p) => p.id === dialog.id);
      if (!playlist) return null;
      return (
        <NamePlaylist
          initial={playlist.name}
          title="Rename Playlist"
          action="Rename"
          onClose={close}
          onSubmit={(name) => {
            useLibrary.getState().renamePlaylist(dialog.id, name);
            close();
          }}
        />
      );
    }
    case 'import':
      return <ImportPlaylist onClose={close} />;
    case 'download':
      return (
        <Modal title="Download" onClose={close} width={560}>
          <DownloadChooser tracks={dialog.tracks} onDone={close} />
        </Modal>
      );
    case 'about-song':
      return <AboutSong track={dialog.track} onClose={close} />;
    case 'equalizer':
      return (
        <Modal title="Equalizer" onClose={close} width={680}>
          <div className="relative max-h-[calc(80vh-70px)] overflow-y-auto px-7 pb-7">
            <EqualizerPanel compact />
          </div>
        </Modal>
      );
    case 'shortcuts':
      return (
        <Modal title="Keyboard Shortcuts" onClose={close} width={440}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 px-7 pb-7 relative">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt className="type-body-emphasized whitespace-nowrap text-primary">{keys}</dt>
                <dd className="type-body-reduced text-secondary">{what}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      );
  }
}
