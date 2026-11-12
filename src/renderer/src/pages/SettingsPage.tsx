import { EqualizerPanel } from '@/components/Equalizer';
import { SeekTrack } from '@/components/SeekTrack';
import { useQueryClient } from '@tanstack/react-query';
import appIcon from '@/assets/app-icon.svg';
import { Check, Clock, Download, FolderOpen, FolderPlus, Heart, House, Loader2, RefreshCw, RotateCcw, Server, Sparkles, Trash2, X } from 'lucide-react';
import { Modal, SHORTCUTS } from '@/components/Dialogs';
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { create } from 'zustand';
import { DEFAULT_SETTINGS, seekLookOf, type BackupInfo, type ListeningProfile, type ProxyMode, type ScrobbleStatus, type AudioQuality, type DownloadQuality, type MiniPlayerWhen, type Settings, type SpatialAudio, type UpdateState } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { ACCENTS, LYRIC_FONTS, THEMES, themeVars, useThemeColors } from '@/lib/appearance';
import { artworkAtPixels, largeArtwork } from '@/lib/artwork';
import { rgb, tintFor } from '@/lib/palette';
import { ArtworkBackdrop, MeshBackdrop, SolidBackdrop } from '@/shell/MeshBackdrop';
import { usePlayer } from '@/state/player';
import { LogoMark, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from '@/components/icons';
import { useWaveStops, Waveform } from '@/components/Waveform';
import { useLocalLibrary, useServerStatus } from '@/lib/queries';
import { enableLosslessIfHigh, useLibrary } from '@/state/library';
import { go, useNav, type SettingsTab } from '@/state/nav';
import { toast, useUi } from '@/state/ui';
import { Segmented, Slider, Toggle } from '@/components/Segmented';
import { useConnectServer, useScanProgress } from './YourMusicPage';

/** Slider values that are factors, shown as percentages. */
const percent = (v: number) => `${Math.round(v * 100)}%`;

function Section({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="reveal mb-8">
      <h2 className="mb-2 px-4 type-title-3-emphasized text-secondary">{title}</h2>
      <div className="divide-y divide-divider overflow-hidden rounded-card bg-white/[0.055]">{children}</div>
      {footer && <p className="mt-2 px-4 type-callout text-tertiary">{footer}</p>}
    </section>
  );
}

function Row({ title, detail, children }: { title: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-[60px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-body-reduced text-primary">{title}</span>
        {detail && <span className="type-callout text-secondary">{detail}</span>}
      </div>
      {children !== undefined && <div className="flex-none">{children}</div>}
    </div>
  );
}

const button = 'inline-flex h-8 items-center gap-2 rounded-pill bg-white/10 px-3.5 type-body-emphasized transition-colors hover:bg-white/16 disabled:opacity-40';
const field = 'h-9 w-full rounded-[12px] border-[0.5px] border-search-border bg-white/[0.06] px-3 type-body-reduced placeholder:text-tertiary focus:border-white/35';

/** Appearance and Layout changes wait here, shown in the preview, until Apply. */
const useDraft = create<{ patch: Partial<Settings> }>(() => ({ patch: {} }));
/** Inside it, settings controls edit the draft instead of the saved settings. */
const Drafted = createContext(false);

function useSettings() {
  const drafted = useContext(Drafted);
  const settings = useLibrary((s) => s.settings);
  const update = useLibrary((s) => s.updateSettings);
  const patch = useDraft((d) => d.patch);
  if (!drafted) return { s: settings, set: update, drafted };
  const set = (p: Partial<Settings>) => useDraft.setState((d) => ({ patch: { ...d.patch, ...p } }));
  return { s: { ...settings, ...patch }, set, drafted };
}

/** The draft's changes that differ from what's saved. */
function usePendingChanges(): Partial<Settings> {
  const settings = useLibrary((s) => s.settings);
  const patch = useDraft((d) => d.patch);
  const pending: Partial<Settings> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (JSON.stringify(settings[key as keyof Settings]) !== JSON.stringify(value)) (pending as Record<string, unknown>)[key] = value;
  }
  return pending;
}

function ResetButton({ keys }: { keys: (keyof Settings)[] }) {
  const { set, drafted } = useSettings();
  return (
    <button
      className="inline-flex items-center gap-1.5 type-callout-medium text-tertiary hover:text-primary"
      onClick={() => {
        const patch: Partial<Settings> = {};
        for (const k of keys) (patch as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
        set(patch);
        toast(drafted ? 'Defaults are in the preview: Apply to keep them' : 'Restored the defaults');
      }}
    >
      <RotateCcw size={12} /> Restore defaults
    </button>
  );
}

// ---- Tabs ---------------------------------------------------------------------------------

function DownloadSettings() {
  const { s, set } = useSettings();
  const [folder, setFolder] = useState('');
  useEffect(() => void api.downloadsFolder().then(setFolder, () => undefined), [s.downloadFolder]);
  return (
    <Section title="Downloads" footer="Saved exactly as delivered, never re-encoded. Downloaded songs play from the file, even offline.">
      <Row title="Quality">
        <Segmented<DownloadQuality | 'ask'>
          label="Download quality"
          value={s.downloadQuality ?? 'ask'}
          options={[
            { value: 'ask', label: 'Ask' },
            { value: 'best', label: 'Best' },
            { value: 'compatible', label: 'Compatible' },
            { value: 'small', label: 'Saver' },
          ]}
          onChange={(downloadQuality) => set({ downloadQuality })}
        />
      </Row>
      <Row title="Folder" detail={folder || '…'}>
        <button className={button} onClick={() => void api.chooseDownloadsFolder().then(setFolder)}>
          Change…
        </button>
      </Row>
    </Section>
  );
}

function PlaybackTab() {
  const { s, set } = useSettings();
  return (
    <>
      <Section title="Audio" footer="Lossless needs your own files, your server or a lossless source (Your Music tab). Songs with no lossless copy play at High.">
        <Row
          title="Audio quality"
          detail={
            s.quality === 'lossless'
              ? 'Lossless when available: your FLAC/WAV copy of a song, or one from your lossless sources, plays instead of YouTube’s stream.'
              : s.quality === 'high'
                ? 'YouTube’s best: Opus at about 160 kbps.'
                : s.quality === 'normal'
                  ? 'AAC at 128 kbps.'
                  : 'Smallest streams, to save data.'
          }
        >
          <Segmented<AudioQuality>
            value={s.quality}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
              { value: 'lossless', label: 'Lossless' },
            ]}
            onChange={(quality) => {
              set({ quality });
              toast('Applies from the next song');
            }}
          />
        </Row>
        <Row
          title="Eco mode"
          detail="Uses much less of your PC: plain frosted glass, fewer animation frames, a still full-screen background, and animations you can’t see stop. Auto turns it on while your PC runs on battery; plugged in, Sonara looks and moves as designed."
        >
          <Segmented
            label="Eco mode"
            value={s.powerSaver ?? 'auto'}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            onChange={(powerSaver) => set({ powerSaver })}
          />
        </Row>
        <Row title="Incognito" detail="While it’s on, what you play isn’t kept: no Recently played, no Wrapped listens, no scrobbles, and nothing changes your recommendations. Also in the sidebar.">
          <Toggle label="Incognito" on={!!s.incognito} onChange={(incognito) => set({ incognito })} />
        </Row>
        <Row title="Hide music videos" detail="Songs only on Home and in search: music videos are left out. You can still watch a song’s video in the full-screen player.">
          <Toggle label="Hide music videos" on={s.hideVideos} onChange={(hideVideos) => set({ hideVideos })} />
        </Row>
        <Row title="Normalize volume" detail="Even out loudness between YouTube songs. Your own files play as mastered.">
          <Toggle label="Normalize volume" on={s.normalize} onChange={(normalize) => set({ normalize })} />
        </Row>
        <Row
          title="Spatial Audio"
          detail={
            s.spatialAudio === 'speakers'
              ? 'Widens the stereo image beyond your speakers, with a touch of room. Bass and vocals stay centred.'
              : 'Places the music on virtual speakers around you, with a touch of room, instead of inside your head. Best with headphones.'
          }
        >
          <Segmented<SpatialAudio>
            value={s.spatialAudio}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'headphones', label: 'Headphones' },
              { value: 'speakers', label: 'Speakers' },
            ]}
            onChange={(spatialAudio) => set({ spatialAudio })}
          />
        </Row>
      </Section>
      <Section title="Your music taste">
        <Row
          title="Languages, kinds of songs and artists"
          detail={
            [s.taste.languages.join(', '), s.taste.genres.join(', '), s.taste.artists.map((a) => a.name).join(', ')].filter(Boolean).join(' · ') ||
            'Nothing picked yet. Home’s “Made for you” is made from these.'
          }
        >
          <button className={button} onClick={() => useLibrary.getState().updateSettings({ tasteSeen: false })}>
            <Sparkles size={15} /> {s.taste.languages.length + s.taste.genres.length + s.taste.artists.length ? 'Change' : 'Pick'}
          </button>
        </Row>
        <TasteProfile />
      </Section>
      <Section title="Playback">
        <Row title="Crossfade" detail="Blend the end of one song into the next.">
          <Segmented<number>
            value={s.crossfade}
            options={[
              { value: 0, label: 'Off' },
              { value: 3, label: '3s' },
              { value: 6, label: '6s' },
              { value: 10, label: '10s' },
            ]}
            onChange={(crossfade) => set({ crossfade })}
          />
        </Row>
        <Row title="Autoplay" detail="When the queue ends, keep going with similar songs.">
          <Toggle label="Autoplay" on={s.autoplay} onChange={(autoplay) => set({ autoplay })} />
        </Row>
        <Row title="Keep playing in the tray when the window closes" detail="Quit from the tray icon.">
          <Toggle label="Close to tray" on={s.closeToTray} onChange={(closeToTray) => set({ closeToTray })} />
        </Row>
        <Row
          title="Mini player"
          detail={
            s.miniPlayerWhen === 'away'
              ? 'Floats over other apps whenever you’re using something else, and goes when you come back to Sonara. Ctrl + Alt + M shows or hides it any time.'
              : s.miniPlayerWhen === 'minimised'
                ? 'Floats over other apps when Sonara is minimised or in the tray. Ctrl + Alt + M shows or hides it any time.'
                : 'Only when you ask for it: Ctrl + Alt + M, the player’s mini player button, or the tray menu.'
          }
        >
          <Segmented<MiniPlayerWhen>
            value={s.miniPlayerWhen}
            options={[
              { value: 'away', label: 'Not in use' },
              { value: 'minimised', label: 'Minimised' },
              { value: 'off', label: 'Off' },
            ]}
            onChange={(miniPlayerWhen) => set({ miniPlayerWhen })}
          />
        </Row>
        <Row title="System-wide shortcuts" detail={<ShortcutsDetail on={s.globalShortcuts} />}>
          <Toggle label="System-wide shortcuts" on={s.globalShortcuts} onChange={(globalShortcuts) => set({ globalShortcuts })} />
        </Row>
      </Section>
      <DownloadSettings />
      <Scrobbling />
    </>
  );
}

/** ListenBrainz and Last.fm: what you listen to, sent as you listen. */
function Scrobbling() {
  const [status, setStatus] = useState<ScrobbleStatus | null>(null);
  const [lb, setLb] = useState('');
  const [lfm, setLfm] = useState({ key: '', secret: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void api.scrobbleStatus().then(setStatus), []);
  const run = async (what: string, job: () => Promise<ScrobbleStatus>) => {
    setBusy(what);
    setError(null);
    try {
      setStatus(await job());
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(null);
  };
  if (!status) return null;
  return (
    <Section
      title="Scrobbling"
      footer={
        <>
          A song is scrobbled once you’ve heard half of it (or 4 minutes). Your ListenBrainz token is at listenbrainz.org/settings. For Last.fm, make a free API account at last.fm/api/account/create, then paste its key and secret.
          {status.pending > 0 && ` ${status.pending} waiting to be sent.`}
        </>
      }
    >
      <Row title="ListenBrainz" detail={status.listenBrainz ? <span className="inline-flex items-center gap-1.5"><Check size={12} className="text-[#34c759]" /> Scrobbling as {status.listenBrainz.user}</span> : 'Open-source scrobbling, by the MetaBrainz Foundation.'}>
        {status.listenBrainz ? (
          <button className={`${button} text-[#ff6b61]`} onClick={() => void run('lb', () => api.disconnectScrobbling('listenbrainz'))}>
            Disconnect
          </button>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), void run('lb', () => api.connectListenBrainz(lb)).then(() => setLb('')))}>
            <input className={`${field} w-56`} placeholder="User token" type="password" value={lb} onChange={(e) => setLb(e.target.value)} autoComplete="off" />
            <button type="submit" className={button} disabled={!lb.trim() || busy === 'lb'}>
              {busy === 'lb' ? <Loader2 size={14} className="animate-spin" /> : null} Connect
            </button>
          </form>
        )}
      </Row>
      {status.lastFm ? (
        <Row title="Last.fm" detail={<span className="inline-flex items-center gap-1.5"><Check size={12} className="text-[#34c759]" /> Scrobbling as {status.lastFm.user}</span>}>
          <button className={`${button} text-[#ff6b61]`} onClick={() => void run('lfm', () => api.disconnectScrobbling('lastfm'))}>
            Disconnect
          </button>
        </Row>
      ) : status.lastFmWaiting ? (
        <Row title="Last.fm" detail="On the page that opened in your browser, press “Yes, allow access”, then come back and finish.">
          <div className="flex gap-2">
            <button className={`${button} text-[#ff6b61]`} onClick={() => void run('lfm', () => api.disconnectScrobbling('lastfm'))}>
              Cancel
            </button>
            <button className={`${button} bg-pill-bg text-pill hover:bg-white`} disabled={busy === 'lfm'} onClick={() => void run('lfm', () => api.finishLastFm())}>
              {busy === 'lfm' ? <Loader2 size={14} className="animate-spin" /> : null} Finish
            </button>
          </div>
        </Row>
      ) : (
        <form className="flex flex-col gap-3 px-5 py-4" onSubmit={(e) => (e.preventDefault(), void run('lfm', () => api.beginLastFm(lfm.key, lfm.secret)))}>
          <span className="type-body text-primary">Last.fm</span>
          <div className="flex gap-3">
            <input className={field} placeholder="API key" value={lfm.key} onChange={(e) => setLfm({ ...lfm, key: e.target.value })} spellCheck={false} autoComplete="off" />
            <input className={field} placeholder="Shared secret" type="password" value={lfm.secret} onChange={(e) => setLfm({ ...lfm, secret: e.target.value })} autoComplete="off" />
          </div>
          <div className="flex justify-end">
            <button type="submit" className={button} disabled={!lfm.key.trim() || !lfm.secret.trim() || busy === 'lfm'}>
              {busy === 'lfm' ? <Loader2 size={14} className="animate-spin" /> : null} Connect in browser
            </button>
          </div>
        </form>
      )}
      {error && <p className="px-5 pb-4 type-callout text-[#ff6b61]">{error}</p>}
    </Section>
  );
}

function MusicTab() {
  const { s, set } = useSettings();
  const library = useLocalLibrary();
  const server = useServerStatus();
  const progress = useScanProgress();
  const client = useQueryClient();
  const connectServer = useConnectServer();
  const [form, setForm] = useState({ url: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folders = library.data?.folders ?? [];
  const scanning = progress?.scanning ?? library.data?.scan.scanning;
  const lossless = library.data?.tracks.filter((t) => t.format?.lossless).length ?? 0;

  const sourceAdded = () => enableLosslessIfHigh(toast);

  return (
    <>
      <Section
        title="Music folders on this PC"
        footer="FLAC, WAV, MP3, M4A (AAC), Ogg and Opus play. ALAC, AIFF, APE and DSD can't be decoded here; convert them to FLAC."
      >
        {folders.map((f) => (
          <Row key={f} title={f.split(/[\\/]/).pop() || f} detail={f}>
            <button className={`${button} text-[#ff6b61]`} onClick={() => void api.removeMusicFolder(f).then(() => client.invalidateQueries({ queryKey: ['music'] }))}>
              <Trash2 size={14} /> Remove
            </button>
          </Row>
        ))}
        <Row
          title={folders.length ? `${(library.data?.tracks.length ?? 0).toLocaleString()} songs · ${lossless.toLocaleString()} lossless` : 'No folders yet'}
          detail={
            scanning && progress
              ? `Scanning ${progress.scanned.toLocaleString()} of ${progress.total.toLocaleString()} files…`
              : library.data?.scan.unsupported
                ? `${library.data.scan.unsupported.toLocaleString()} files skipped (format not supported)`
                : 'Add the folders where you keep your music.'
          }
        >
          <div className="flex gap-2">
            {folders.length > 0 && (
              <button className={button} disabled={!!scanning} onClick={() => void api.rescanMusic().then(() => client.invalidateQueries({ queryKey: ['music'] }))}>
                <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} /> Rescan
              </button>
            )}
            <button
              className={button}
              onClick={() =>
                void api.addMusicFolder().then((list) => {
                  void client.invalidateQueries({ queryKey: ['music'] });
                  if (list.length > folders.length) sourceAdded();
                })
              }
            >
              <FolderPlus size={14} /> Add Folder
            </button>
          </div>
        </Row>
      </Section>

      <Section title="Music server" footer="Navidrome, Gonic, Airsonic, Ampache or any Subsonic-compatible server. Your password isn’t stored: only a token, encrypted by Windows.">
        {server.data?.configured ? (
          <>
            <Row
              title={server.data.serverName ?? 'Music server'}
              detail={
                <span className="inline-flex items-center gap-1.5">
                  {server.data.ok === false ? <span className="text-[#ff6b61]">Unreachable: {server.data.error}</span> : <><Check size={12} className="text-[#34c759]" /> Connected</>} · {server.data.username} @ {server.data.url}
                </span>
              }
            >
              <div className="flex gap-2">
                <button className={button} onClick={() => go({ name: 'music', tab: 'server' })}>
                  <Server size={14} /> Browse
                </button>
                <button className={`${button} text-[#ff6b61]`} onClick={() => void api.disconnectServer().then(() => client.invalidateQueries({ queryKey: ['music'] }))}>
                  Disconnect
                </button>
              </div>
            </Row>
          </>
        ) : (
          <form
            className="flex flex-col gap-3 px-5 py-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const failure = await connectServer(form.url, form.username, form.password);
              setBusy(false);
              if (failure) setError(failure);
              else {
                setForm({ url: '', username: '', password: '' });
                sourceAdded();
              }
            }}
          >
            <input className={field} placeholder="Server address, e.g. http://192.168.1.20:4533" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} spellCheck={false} />
            <div className="flex gap-3">
              <input className={field} placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} spellCheck={false} autoComplete="off" />
              <input className={field} placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="off" />
            </div>
            {error && <p className="type-callout text-[#ff6b61]">{error}</p>}
            <div className="flex justify-end">
              <button type="submit" className={`${button} bg-pill-bg text-pill hover:bg-white`} disabled={busy || !form.url || !form.username || !form.password}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />} Connect
              </button>
            </div>
          </form>
        )}
      </Section>
      <LosslessSources onAdded={sourceAdded} />
    </>
  );
}

/** Lossless sources: servers speaking the open addon protocol. */
function LosslessSources({ onAdded }: { onAdded: () => void }) {
  const { s, set } = useSettings();
  const sources = s.losslessSources ?? [];
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const move = (i: number, by: number) => {
    const list = [...sources];
    const [item] = list.splice(i, 1);
    list.splice(i + by, 0, item!);
    set({ losslessSources: list });
  };
  return (
    <Section
      title="Lossless sources"
      footer="A lossless source is a server you add by its address. It speaks the open addon protocol, so lossless extensions made for it work here. With Audio quality set to Lossless, a song you don’t have your own copy of is looked up on your sources, in this order, and plays from the first one with the same recording, in FLAC up to 24-bit. Sonara doesn't come with any sources. Only add ones you trust and are allowed to use."
    >
      {sources.map((src, i) => (
        <Row key={src.id} title={src.name} detail={src.url}>
          <div className="flex items-center gap-2">
            {sources.length > 1 && (
              <>
                <button className={button} disabled={i === 0} aria-label={`Move ${src.name} up`} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button className={button} disabled={i === sources.length - 1} aria-label={`Move ${src.name} down`} onClick={() => move(i, 1)}>
                  ↓
                </button>
              </>
            )}
            <Toggle label={`Use ${src.name}`} on={src.enabled} onChange={(enabled) => set({ losslessSources: sources.map((x) => (x.id === src.id ? { ...x, enabled } : x)) })} />
            <button className={`${button} text-[#ff6b61]`} onClick={() => set({ losslessSources: sources.filter((x) => x.id !== src.id) })}>
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </Row>
      ))}
      <form
        className="flex flex-col gap-3 px-5 py-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const result = await api.testLosslessSource(url);
          setBusy(false);
          if (!result.ok) return setError(result.error);
          if (sources.some((x) => x.url === result.url)) return setError('That source is already added.');
          set({ losslessSources: [...sources, { id: crypto.randomUUID(), name: result.name, url: result.url, enabled: true }] });
          setUrl('');
          toast(`Added ${result.name}`);
          onAdded();
        }}
      >
        <input className={field} placeholder="Source address, e.g. https://my-lossless-source.example.com" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
        {error && <p className="type-callout text-[#ff6b61]">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" className={`${button} bg-pill-bg text-pill hover:bg-white`} disabled={busy || !url.trim()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />} Add Source
          </button>
        </div>
      </form>
    </Section>
  );
}

function AppearanceTab() {
  const { s, set } = useSettings();
  return (
    <>
      <Section title="Theme" footer={<ResetButton keys={['pageTone', 'accent', 'dynamicAccent', 'uiFont', 'corners', 'glassStyle', 'glassBlur', 'pageBackground', 'ambientGlow']} />}>
        <div className="grid grid-cols-2 gap-2.5 px-5 py-4 @min-[520px]/page:grid-cols-4">
          {THEMES.map((t) => (
            <button
              key={t.value}
              aria-pressed={s.pageTone === t.value}
              className="group flex flex-col gap-2 rounded-card p-1.5 text-left ring-1 ring-white/10 transition-[box-shadow,background-color] hover:bg-white/[0.05] aria-pressed:ring-2 aria-pressed:ring-key"
              onClick={() => set({ pageTone: t.value })}
            >
              {/* A tiny page: the theme's colour, with a sidebar strip and the accent. */}
              <span className="relative block h-14 overflow-hidden rounded-[calc(var(--radius-card)-6px)] border border-white/10" style={{ background: t.swatch }}>
                <span className="absolute inset-y-1.5 left-1.5 w-3 rounded-[4px] bg-white/10" />
                <span className="absolute top-2.5 left-6 h-1.5 w-10 rounded-full bg-white/40" />
                <span className="absolute top-6 left-6 size-4 rounded-[4px] bg-key/80" />
                <span className="absolute top-6 left-11 size-4 rounded-[4px] bg-white/15" />
              </span>
              <span className="flex items-center justify-between gap-1 px-1 pb-0.5 type-callout-medium text-primary">
                {t.label}
                {t.value === 'obsidian' && <span className="type-footnote text-tertiary">Default</span>}
              </span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Accent colour">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          {ACCENTS.map((a) => (
            <button
              key={a.hex}
              title={a.name}
              aria-label={a.name}
              aria-pressed={!s.dynamicAccent && s.accent.toLowerCase() === a.hex}
              className="grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-[#1b1b1e] transition-transform hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-white"
              style={{ background: a.hex }}
              onClick={() => set({ accent: a.hex, dynamicAccent: false })}
            >
              {!s.dynamicAccent && s.accent.toLowerCase() === a.hex && <Check size={16} className="text-black/70" strokeWidth={3} />}
            </button>
          ))}
          <label className="relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full bg-[conic-gradient(#f44,#fd4,#4f6,#4df,#64f,#f4d,#f44)]" title="Custom colour">
            <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={s.accent} onChange={(e) => set({ accent: e.target.value, dynamicAccent: false })} />
            <span className="size-5 rounded-full border-2 border-white/80" style={{ background: s.accent }} />
          </label>
        </div>
        <Row title="Match the playing song" detail="Take the accent colour from the current artwork.">
          <Toggle label="Dynamic accent" on={s.dynamicAccent} onChange={(dynamicAccent) => set({ dynamicAccent })} />
        </Row>
      </Section>
      <Section title="Liquid Glass" footer="Like the Clear and Tinted options Apple added in macOS and iOS 26.1. With Windows’ Transparency effects turned off, glass becomes solid automatically.">
        <Row title="Glass" detail="Clear lets more of the music show through. Tinted is frostier and easier to read.">
          <Segmented
            label="Liquid Glass"
            value={s.glassStyle}
            options={[
              { value: 'clear', label: 'Clear' },
              { value: 'tinted', label: 'Tinted' },
            ]}
            onChange={(glassStyle) => set({ glassStyle })}
          />
        </Row>
        <Row title="Blur" detail="How much the glass softens what’s behind it. Double-click a slider to reset it, or its number to type one.">
          <Slider label="Glass blur" value={s.glassBlur} min={0} max={2} step={0.05} defaultValue={1} format={percent} onChange={(glassBlur) => set({ glassBlur })} />
        </Row>
      </Section>
      <Section title="Text and shapes">
        <Row title="Font" detail="For the whole app. Lyrics have their own font in Lyrics settings.">
          <Segmented
            label="App font"
            value={s.uiFont}
            options={(Object.keys(LYRIC_FONTS) as Settings['uiFont'][]).map((k) => ({ value: k, label: LYRIC_FONTS[k].label }))}
            onChange={(uiFont) => set({ uiFont })}
          />
        </Row>
        <Row title="Corners" detail="Panels, buttons, artwork and rows: from square to extra round.">
          <Slider label="Corner roundness" value={s.corners} min={0} max={2} step={0.05} defaultValue={1} format={percent} onChange={(corners) => set({ corners })} />
        </Row>
      </Section>
      <Section title="Background">
        <Row title="Page background" detail="Behind every page: the theme colour, a soft gradient in your accent, or the playing song’s artwork, blurred.">
          <Segmented
            label="Page background"
            value={s.pageBackground}
            options={[
              { value: 'plain', label: 'Plain' },
              { value: 'gradient', label: 'Gradient' },
              { value: 'artwork', label: 'Artwork' },
            ]}
            onChange={(pageBackground) => set({ pageBackground })}
          />
        </Row>
        <Row title="Ambient glow" detail="A soft glow in the playing song’s colours behind the whole app.">
          <Toggle label="Ambient glow" on={s.ambientGlow} onChange={(ambientGlow) => set({ ambientGlow })} />
        </Row>
      </Section>
    </>
  );
}

function LyricsTab() {
  const { s, set } = useSettings();
  return (
    <>
      <Section title="Lyrics" footer={<ResetButton keys={['lyricsScale', 'lyricsFont', 'lyricsAlign', 'lyricsBlur', 'lyricsControls', 'lyricsMotion']} />}>
        <Row title="Text size">
          <Slider label="Lyrics text size" value={s.lyricsScale} min={0.7} max={1.6} step={0.05} defaultValue={1} format={percent} onChange={(lyricsScale) => set({ lyricsScale })} />
        </Row>
        <Row title="Font">
          <Segmented
            value={s.lyricsFont}
            options={(Object.keys(LYRIC_FONTS) as Settings['lyricsFont'][]).map((k) => ({ value: k, label: LYRIC_FONTS[k].label }))}
            onChange={(lyricsFont) => set({ lyricsFont })}
          />
        </Row>
        <Row title="Alignment" detail="Right-to-left scripts keep their own direction.">
          <Segmented
            value={s.lyricsAlign}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Centre' },
            ]}
            onChange={(lyricsAlign) => set({ lyricsAlign })}
          />
        </Row>
        <Row title="Line animation">
          <Segmented
            value={s.lyricsMotion}
            options={[
              { value: 'staggered', label: 'Staggered' },
              { value: 'uniform', label: 'Uniform' },
              { value: 'instant', label: 'Instant' },
            ]}
            onChange={(lyricsMotion) => set({ lyricsMotion })}
          />
        </Row>
        <Row title="Blur lines that aren’t being sung">
          <Toggle label="Blur inactive lines" on={s.lyricsBlur} onChange={(lyricsBlur) => set({ lyricsBlur })} />
        </Row>
        <Row title="Show lyric tools" detail="Romanization, translation, and choosing the lyrics source.">
          <Toggle label="Show lyric tools" on={s.lyricsControls} onChange={(lyricsControls) => set({ lyricsControls })} />
        </Row>
      </Section>
      <LyricsPreview />
    </>
  );
}

function LyricsPreview() {
  const { s } = useSettings();
  const lines = ['Look at the stars', 'Look how they shine for you', 'And everything you do'];
  return (
    <div className="mb-8 overflow-hidden rounded-[12px] bg-[linear-gradient(135deg,#6b3a12,#2b1a10)] px-8 py-6" aria-hidden="true">
      {lines.map((line, i) => (
        <p
          key={line}
          className={`font-bold ${s.lyricsAlign === 'center' ? 'text-center' : ''}`}
          style={{
            fontFamily: LYRIC_FONTS[s.lyricsFont].family,
            fontSize: 26 * s.lyricsScale,
            lineHeight: 1.25,
            marginBottom: 14 * s.lyricsScale,
            color: i === 1 ? '#fff' : 'rgba(255,255,255,0.45)',
            filter: s.lyricsBlur && i !== 1 ? 'blur(1.5px)' : undefined,
          }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

function PlayerTab() {
  const { s, set } = useSettings();
  return (
    <>
    <Section title="Full-screen player" footer={<ResetButton keys={['backdrop', 'backdropMotion', 'artworkScale']} />}>
      <Row title="Background" detail="The moving colour mesh, the artwork itself blurred, or one calm colour.">
        <Segmented
          value={s.backdrop}
          options={[
            { value: 'mesh', label: 'Mesh' },
            { value: 'artwork', label: 'Blurred artwork' },
            { value: 'solid', label: 'Solid' },
          ]}
          onChange={(backdrop) => set({ backdrop })}
        />
      </Row>
      <Row title="Background motion">
        <Segmented<number>
          value={s.backdropMotion}
          options={[
            { value: 0, label: 'Still' },
            { value: 0.4, label: 'Slow' },
            { value: 1, label: 'Normal' },
          ]}
          onChange={(backdropMotion) => set({ backdropMotion })}
        />
      </Row>
      <Row title="Artwork size">
        <Slider label="Artwork size" value={s.artworkScale} min={0.7} max={1.3} step={0.05} defaultValue={1} format={percent} onChange={(artworkScale) => set({ artworkScale })} />
      </Row>
    </Section>
    <Section title="Seek bar" footer={<ResetButton keys={['seekStyle', 'seekColor', 'seekCustomColor', 'seekThickness', 'seekKnob', 'seekTimes']} />}>
      <Row title="Style" detail="For every seek bar: the full-screen player, music videos, the player bar and the mini player. Wave moves while music plays. Expressive is a wave with an upright handle that flattens when paused. Capsule is a thick bar with no knob that grows under the pointer.">
        <Segmented
          label="Seek bar style"
          value={s.seekStyle ?? 'rounded'}
          options={[
            { value: 'rounded', label: 'Rounded' },
            { value: 'line', label: 'Line' },
            { value: 'wave', label: 'Wave' },
            { value: 'expressive', label: 'Expressive' },
            { value: 'capsule', label: 'Capsule' },
          ]}
          onChange={(seekStyle) => set({ seekStyle })}
        />
      </Row>
      <Row title="Colour" detail="Accent follows the song when the accent does.">
        <div className="flex items-center gap-3">
          {s.seekColor === 'custom' && (
            <label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full ring-1 ring-white/20" title="Seek bar colour">
              <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={s.seekCustomColor ?? '#a78bfa'} onChange={(e) => set({ seekCustomColor: e.target.value })} />
              <span className="size-full" style={{ background: s.seekCustomColor ?? '#a78bfa' }} />
            </label>
          )}
          <Segmented
            label="Seek bar colour"
            value={s.seekColor ?? 'white'}
            options={[
              { value: 'white', label: 'White' },
              { value: 'accent', label: 'Accent' },
              { value: 'custom', label: 'Custom' },
            ]}
            onChange={(seekColor) => set({ seekColor })}
          />
        </div>
      </Row>
      <Row title="Thickness">
        <Slider label="Seek bar thickness" value={s.seekThickness ?? 1} min={0.5} max={2} step={0.1} defaultValue={1} format={percent} onChange={(seekThickness) => set({ seekThickness })} />
      </Row>
      <Row title="Knob" detail="The handle at the playing point, for every style.">
        <Segmented
          label="Seek bar knob"
          value={s.seekKnob ?? 'hover'}
          options={[
            { value: 'hover', label: 'On hover' },
            { value: 'always', label: 'Always' },
            { value: 'drag', label: 'While dragging' },
          ]}
          onChange={(seekKnob) => set({ seekKnob })}
        />
      </Row>
      <Row title="Times" detail="The time played and the time left, beside the bar.">
        <Toggle label="Seek bar times" on={s.seekTimes ?? true} onChange={(seekTimes) => set({ seekTimes })} />
      </Row>
    </Section>
    <Section
      title="Waveform"
      footer={<ResetButton keys={['waveColor', 'waveCustomColor', 'waveBars', 'waveThickness', 'waveHeight', 'waveSensitivity', 'waveAutoLevel', 'waveSmoothing', 'waveShape', 'waveStyle', 'waveIdle']} />}
    >
      <Row title="Colour" detail="Song takes its colours from the playing artwork.">
        <div className="flex items-center gap-3">
          {s.waveColor === 'custom' && (
            <label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full ring-1 ring-white/20" title="Waveform colour">
              <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={s.waveCustomColor} onChange={(e) => set({ waveCustomColor: e.target.value })} />
              <span className="size-full" style={{ background: s.waveCustomColor }} />
            </label>
          )}
          <Segmented
            label="Waveform colour"
            value={s.waveColor}
            options={[
              { value: 'song', label: 'Song' },
              { value: 'accent', label: 'Accent' },
              { value: 'lavender', label: 'Lavender' },
              { value: 'custom', label: 'Custom' },
            ]}
            onChange={(waveColor) => set({ waveColor })}
          />
        </div>
      </Row>
      <Row title="Bars">
        <Slider label="Waveform bars" value={s.waveBars} min={16} max={64} step={1} defaultValue={40} format={(v) => String(v)} onChange={(waveBars) => set({ waveBars })} />
      </Row>
      <Row title="Thickness">
        <Slider label="Bar thickness" value={s.waveThickness} min={0.2} max={0.85} step={0.05} defaultValue={0.5} format={percent} onChange={(waveThickness) => set({ waveThickness })} />
      </Row>
      <Row title="Height" detail="How tall the bars reach for the same sound.">
        <Slider label="Waveform height" value={s.waveHeight} min={0.4} max={1.6} step={0.05} defaultValue={1} format={percent} onChange={(waveHeight) => set({ waveHeight })} />
      </Row>
      <Row title="Sensitivity" detail="Higher makes quiet passages move more.">
        <Slider label="Waveform sensitivity" value={s.waveSensitivity} min={0} max={1} step={0.05} defaultValue={0.5} format={percent} onChange={(waveSensitivity) => set({ waveSensitivity })} />
      </Row>
      <Row title="Auto level" detail="Adapts to each song’s loudness as it plays, so quiet songs still move and loud ones don’t max out.">
        <Toggle label="Auto level" on={s.waveAutoLevel} onChange={(waveAutoLevel) => set({ waveAutoLevel })} />
      </Row>
      <Row title="Smoothness" detail="Low follows every beat; high glides.">
        <Slider label="Waveform smoothness" value={s.waveSmoothing} min={0} max={1} step={0.05} defaultValue={0.5} format={percent} onChange={(waveSmoothing) => set({ waveSmoothing })} />
      </Row>
      <Row title="Shape" detail="Balanced is small at the ends and tallest in the middle.">
        <Segmented
          label="Waveform shape"
          value={s.waveShape}
          options={[
            { value: 'balanced', label: 'Balanced' },
            { value: 'even', label: 'Even' },
          ]}
          onChange={(waveShape) => set({ waveShape })}
        />
      </Row>
      <Row title="Style">
        <Segmented
          label="Waveform style"
          value={s.waveStyle}
          options={[
            { value: 'mirrored', label: 'Mirrored' },
            { value: 'rising', label: 'Rising' },
          ]}
          onChange={(waveStyle) => set({ waveStyle })}
        />
      </Row>
      <Row title="Breathe while paused" detail="Off, the bars rest still.">
        <Toggle label="Breathe while paused" on={s.waveIdle} onChange={(waveIdle) => set({ waveIdle })} />
      </Row>
    </Section>
    </>
  );
}

function LayoutTab() {
  const { s, set } = useSettings();
  return (
    <>
      <Section title="Layout" footer={<ResetButton keys={['zoom', 'rowHeight', 'coverSize', 'playerStyle', 'startPage', 'sidebarSearch', 'sidebarRecent', 'sidebarMusic']} />}>
        <Row title="Interface size" detail="Double-click a slider to reset it, or its number to type one.">
          <Slider label="Interface size" value={s.zoom} min={0.8} max={1.5} step={0.05} defaultValue={1} format={percent} onChange={(zoom) => set({ zoom })} />
        </Row>
        <Row title="Song row height" detail="Lower fits more songs on screen; higher gives bigger artwork.">
          <Slider label="Song row height" value={s.rowHeight} min={40} max={76} step={1} defaultValue={56} format={(v) => `${v}px`} onChange={(rowHeight) => set({ rowHeight })} />
        </Row>
        <Row title="Cover size" detail="Album, playlist and song covers in the rows on Home, Search and artist pages.">
          <Slider label="Cover size" value={s.coverSize} min={0.7} max={1.5} step={0.05} defaultValue={1} format={percent} onChange={(coverSize) => set({ coverSize })} />
        </Row>
        <Row title="Player" detail="Pebble keeps just the cover and controls until you point at it, then opens into the full bar.">
          <Segmented
            label="Player style"
            value={s.playerStyle}
            options={[
              { value: 'pebble', label: 'Pebble' },
              { value: 'full', label: 'Always full' },
            ]}
            onChange={(playerStyle) => set({ playerStyle })}
          />
        </Row>
        <Row title="Open on">
          <Segmented
            value={s.startPage}
            options={[
              { value: 'home', label: 'Home' },
              { value: 'liked', label: 'Liked' },
              { value: 'music', label: 'Your Music' },
              { value: 'last', label: 'Last page' },
            ]}
            onChange={(startPage) => set({ startPage })}
          />
        </Row>
      </Section>
      <Section title="Sidebar">
        <Row title="Style" detail="Compact shows icons and opens over the page when you point at it.">
          <Segmented
            label="Sidebar style"
            value={s.sidebarMode ?? 'compact'}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'expanded', label: 'Always open' },
            ]}
            onChange={(sidebarMode) => set({ sidebarMode })}
          />
        </Row>
        <Row title="Search page link" detail="Search itself is always at the top.">
          <Toggle label="Show Search" on={s.sidebarSearch} onChange={(sidebarSearch) => set({ sidebarSearch })} />
        </Row>
        <Row title="Your Music">
          <Toggle label="Show Your Music" on={s.sidebarMusic} onChange={(sidebarMusic) => set({ sidebarMusic })} />
        </Row>
        <Row title="Recently Played">
          <Toggle label="Show Recently Played" on={s.sidebarRecent} onChange={(sidebarRecent) => set({ sidebarRecent })} />
        </Row>
      </Section>
    </>
  );
}

/** Settings › About: updates — check, download inside the app, restart into it. */
/** The system-wide shortcuts, and any the system kept for itself (another app, or the desktop's keys). */
function ShortcutsDetail({ on }: { on: boolean }) {
  const [taken, setTaken] = useState<string[]>([]);
  useEffect(() => {
    // Asked again when the toggle changes, once the shortcuts have been registered again.
    const timer = setTimeout(() => void api.takenShortcuts().then(setTaken, () => undefined), 300);
    return () => clearTimeout(timer);
  }, [on]);
  const words = (a: string) =>
    a.replace('CommandOrControl', navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl').replace('Right', '→').replace('Left', '←').replace('Up', '↑').replace('Down', '↓').replaceAll('+', ' + ');
  return (
    <>
      Control Sonara from any app: Ctrl + Alt + Space or P (play / pause), → / ← or N / B (next / previous), ↑ / ↓ (volume), L (like) and M (mini player). ⌘ instead of Ctrl on a Mac.
      {on && taken.length > 0 && (
        <span className="mt-1 block text-[#ff9f0a]">
          Kept by your system or another app, so they won’t work here: {taken.map(words).join(', ')}.
          {navigator.userAgent.includes('Linux') ? ' On Linux, your desktop may use them (GNOME switches workspaces with Ctrl + Alt + arrows), or need its global shortcuts support (Wayland).' : ''}
        </span>
      )}
    </>
  );
}

/**
 * Your taste profile: what Sonara learned from your listening, notes that ask for more of something,
 * and what you said no to, each one undoable. Saved at once, like the rest of Playback.
 */
function TasteProfile() {
  const settings = useLibrary((l) => l.settings);
  const update = useLibrary.getState().updateSettings;
  const notes = settings.tasteNotes ?? [];
  const noSongs = settings.notInterested ?? [];
  const noArtists = settings.notInterestedArtists ?? [];
  const excluded = settings.tasteExcluded ?? [];
  const [draft, setDraft] = useState('');
  const [learned, setLearned] = useState<ListeningProfile | null>(null);
  useEffect(() => {
    void api.listeningProfile(60).then(setLearned, () => undefined);
  }, []);
  const learnedArtists = (learned?.artists ?? []).slice(0, 6).map((a) => a.name);
  const addNote = () => {
    const note = draft.trim().slice(0, 60);
    if (!note || notes.includes(note)) return;
    update({ tasteNotes: [...notes, note].slice(-5) });
    setDraft('');
    toast('Got it. Home will show more of this.');
  };
  const chip = 'inline-flex items-center gap-1 rounded-pill bg-white/8 py-1 pr-1.5 pl-3 type-callout text-primary';
  const remove = 'grid size-5 place-items-center rounded-full text-secondary hover:bg-white/12 hover:text-primary';
  return (
    <>
      <Row
        title="Learned from your listening"
        detail={
          learned && learned.plays >= 10
            ? `From your last 60 days (${learned.plays} listens): ${learnedArtists.join(', ')}. Home’s “Made for you” follows what you play.`
            : 'Once you’ve listened a while (songs count after 30 seconds), Home’s “Made for you” follows what you play, not only your picks.'
        }
      />
      <Row title="Tell us more" detail="“I want more of…”: a few words, like “90s Tamil melodies” or “calm piano for studying”. Each becomes a shelf on Home (up to 5).">
        <div className="flex w-[300px] max-w-full flex-col items-end gap-2">
          <form
            className="flex w-full items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addNote();
            }}
          >
            <input
              className="h-9 min-w-0 flex-1 rounded-[10px] bg-white/8 px-3 type-body-reduced text-primary outline-none placeholder:text-tertiary focus:bg-white/12"
              placeholder="I want more of…"
              maxLength={60}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className={button} disabled={!draft.trim()}>
              Add
            </button>
          </form>
          {notes.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {notes.map((note) => (
                <span key={note} className={chip}>
                  {note}
                  <button className={remove} aria-label={`Delete the note “${note}”`} onClick={() => update({ tasteNotes: notes.filter((n) => n !== note) })}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Row>
      <Row
        title="Not interested"
        detail={
          noSongs.length || noArtists.length
            ? 'Sonara won’t recommend these, on Home, in Smart Shuffle or in autoplay. Remove one to see it again.'
            : 'Say “Not interested” in any song’s menu, for the song or its artist.'
        }
      >
        {(noSongs.length > 0 || noArtists.length > 0) && (
          <div className="flex max-w-[320px] flex-wrap justify-end gap-1.5">
            {noArtists.map((a) => (
              <span key={a.id ?? a.name} className={chip}>
                {a.name}
                <button className={remove} aria-label={`Recommend ${a.name} again`} onClick={() => update({ notInterestedArtists: noArtists.filter((n) => n !== a) })}>
                  <X size={12} />
                </button>
              </span>
            ))}
            {noSongs.length > 0 && (
              <span className={chip}>
                {noSongs.length} {noSongs.length === 1 ? 'song' : 'songs'}
                <button className={remove} aria-label="Recommend these songs again" onClick={() => update({ notInterested: [] })}>
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        )}
      </Row>
      <Row
        title="Excluded from your taste"
        detail={
          excluded.length
            ? `Listening to ${excluded.length === 1 ? 'this song' : `these ${excluded.length} songs`} doesn’t shape your recommendations (they still count in Wrapped).`
            : 'Sleep sounds or a song for someone else? “Exclude from your taste profile” in its menu keeps it out of your recommendations.'
        }
      >
        {excluded.length > 0 && (
          <button className={button} onClick={() => update({ tasteExcluded: [] })}>
            Include all again
          </button>
        )}
      </Row>
      <Row title="Smart Shuffle" detail="The shuffle button offers Smart Shuffle too: your songs shuffled, with recommendations like them mixed in (marked with a sparkle in Up Next).">
        <Toggle label="Smart Shuffle" on={settings.smartShuffle ?? true} onChange={(smartShuffle) => update({ smartShuffle })} />
      </Row>
    </>
  );
}

function UpdateSettings() {
  const { s, set } = useSettings();
  const [u, setU] = useState<UpdateState | null>(null);
  useEffect(() => {
    void api.updateState().then(setU);
    return api.onUpdateState(setU);
  }, []);
  const detail = !u
    ? '…'
    : u.phase === 'checking'
      ? 'Looking for a newer version…'
      : u.phase === 'available'
        ? u.canInstall
          ? `Sonara ${u.latest} is available. You have ${u.current}. It downloads here, then a restart installs it.`
          : `Sonara ${u.latest} is available. You have ${u.current}. This copy can’t update itself (on macOS, or the portable or .deb version), so the download page opens.`
        : u.phase === 'downloading'
          ? `Downloading Sonara ${u.latest}… ${u.percent ?? 0}%`
          : u.phase === 'ready'
            ? `Sonara ${u.latest} is downloaded. Restart to install it.`
            : u.phase === 'none'
              ? `You have the latest version (${u.current}).`
              : u.phase === 'error'
                ? (u.error ?? 'The update didn’t work. Try again.')
                : `You have ${u.current}.`;
  return (
    <Section title="Updates">
      <Row title="Look for updates" detail="When Sonara starts, and every few hours, it asks GitHub for its latest release and tells you when there’s a newer one.">
        <Toggle label="Look for updates" on={s.updateNotices} onChange={(updateNotices) => set({ updateNotices })} />
      </Row>
      <Row title="Sonara updates" detail={detail}>
        {u?.phase === 'available' ? (
          <button className={button} onClick={() => void api.downloadUpdate()}>
            <Download size={15} /> {u.canInstall ? `Download ${u.latest}` : 'Open the download page'}
          </button>
        ) : u?.phase === 'downloading' ? (
          <span className="inline-flex h-8 w-36 items-center overflow-hidden rounded-pill bg-white/10" role="progressbar" aria-valuenow={u.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <span className="h-full bg-key transition-[width] duration-300" style={{ width: `${u.percent ?? 0}%` }} />
          </span>
        ) : u?.phase === 'ready' ? (
          <button className={`${button} bg-key text-white hover:bg-key`} onClick={() => api.installUpdate()}>
            <RotateCcw size={15} /> Restart to update
          </button>
        ) : (
          <button className={button} disabled={u?.phase === 'checking'} onClick={() => void api.checkForUpdate()}>
            {u?.phase === 'checking' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Check
          </button>
        )}
      </Row>
    </Section>
  );
}

/** Backups of everything that's yours: weekly by themselves, or by hand, and restorable. */
function YourData() {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const refresh = () => void api.backups().then(setInfo, () => undefined);
  useEffect(refresh, []);
  const when = info?.latest ? new Date(info.latest).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
  return (
    <Section title="Your data">
      <Row
        title="Back up"
        detail="One file with your liked songs, playlists, history, settings and listening (for Wrapped and recommendations). Keep it somewhere safe, or move it to another PC."
      >
        <button
          className={button}
          onClick={() =>
            void api.exportBackup().then((file) => {
              if (file) toast('Backup saved');
            })
          }
        >
          <Download size={15} /> Back up…
        </button>
      </Row>
      <Row title="Restore" detail="Replaces what's here with a backup (what's here is backed up first), then restarts Sonara.">
        <button
          className={button}
          onClick={() =>
            void api.importBackup().then((r) => {
              if (r.error) toast(r.error);
            })
          }
        >
          <RotateCcw size={15} /> Restore…
        </button>
      </Row>
      <Row
        title="Automatic backups"
        detail={`Sonara backs itself up once a week, and before restoring or resetting; the last 8 are kept. ${when ? `Latest: ${when}.` : 'None yet.'}`}
      >
        <div className="flex items-center gap-2">
          <button className={button} onClick={() => void api.backupNow().then((f) => (f ? toast('Backed up') : toast('Backup failed')), () => undefined).finally(refresh)}>
            Back up now
          </button>
          <button className={button} onClick={() => void api.openBackups()}>
            <FolderOpen size={15} /> Open
          </button>
        </div>
      </Row>
    </Section>
  );
}

/** The proxy: off (as before), the system's, or one you give. */
function NetworkSettings() {
  const mode = useLibrary((l) => l.settings.proxy ?? 'off');
  const saved = useLibrary((l) => l.settings.proxyUrl ?? '');
  const [url, setUrl] = useState(saved);
  const [bad, setBad] = useState(false);
  const update = useLibrary.getState().updateSettings;
  const useCustom = async () => {
    const ok = await api.validProxy(url);
    setBad(!ok);
    if (ok) {
      update({ proxy: 'custom', proxyUrl: url.trim() });
      toast('Using your proxy');
    }
  };
  return (
    <Section title="Network">
      <Row
        title="Proxy"
        detail="For networks that block YouTube (a college or office). System uses your PC's proxy settings for everything; Custom goes through the one you give."
      >
        <Segmented<ProxyMode>
          label="Proxy"
          value={mode}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'system', label: 'System' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(proxy) => (proxy === 'custom' ? void useCustom() : update({ proxy }))}
        />
      </Row>
      {(mode === 'custom' || url) && (
        <Row title="Proxy address" detail={bad ? 'That isn’t a proxy address: like http://10.0.0.1:3128 or socks5://127.0.0.1:1080.' : 'http, https or socks5, with the port: e.g. http://10.0.0.1:3128'}>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void useCustom();
            }}
          >
            <input
              className={`h-9 w-[240px] rounded-[10px] bg-white/8 px-3 type-body-reduced text-primary outline-none placeholder:text-tertiary focus:bg-white/12 ${bad ? 'ring-1 ring-[#ff6b61]' : ''}`}
              placeholder="http://host:port"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setBad(false);
              }}
            />
            <button type="submit" className={button} disabled={!url.trim()}>
              Use
            </button>
          </form>
        </Row>
      )}
    </Section>
  );
}

/** When something's wrong: a report to send, the caches, and settings back to the start. */
function Troubleshooting() {
  const [report, setReport] = useState<{ text: string; issuesUrl: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <Section title="Troubleshooting">
      <Row title="Report a problem" detail="Shows what to send: your Sonara version, system and the end of its log (nothing is sent until you choose to).">
        <button className={button} onClick={() => void api.problemReport().then(setReport)}>
          Report…
        </button>
      </Row>
      <Row title="Clear cache" detail="Frees space and fixes stale artwork or playback trouble. Your music, downloads and settings stay.">
        <button className={button} onClick={() => void api.clearCaches().then(() => toast('Cache cleared'))}>
          <Trash2 size={15} /> Clear
        </button>
      </Row>
      <Row title="Reset settings" detail="Every setting back to how it was at install (after a backup). Your music, playlists, listening, taste and folders stay.">
        <button className={`${button} text-[#ff6b61]`} onClick={() => setConfirmReset(true)}>
          <RotateCcw size={15} /> Reset…
        </button>
      </Row>
      {report && (
        <Modal title="Report a problem" onClose={() => setReport(null)} width={560}>
          <div className="px-7">
            <p className="type-callout text-secondary">Copy this, then open an issue on GitHub, say what happened, and paste it in.</p>
            <pre className="no-scrollbar mt-3 max-h-[300px] overflow-auto rounded-[12px] bg-black/40 p-3 type-[500_11px/15px] whitespace-pre-wrap text-secondary select-text">{report.text}</pre>
          </div>
          <div className="flex justify-end gap-2 px-7 pt-4 pb-6">
            <button
              className={button}
              onClick={() => {
                void navigator.clipboard.writeText(report.text);
                toast('Copied');
              }}
            >
              Copy
            </button>
            <button
              className="inline-flex h-9 items-center rounded-pill bg-pill-bg px-5 type-body-emphasized text-pill hover:bg-white"
              onClick={() => {
                void navigator.clipboard.writeText(report.text);
                void api.openExternal(report.issuesUrl);
                toast('Copied: paste it into the issue');
              }}
            >
              Copy and open GitHub
            </button>
          </div>
        </Modal>
      )}
      {confirmReset && (
        <Modal title="Reset settings?" onClose={() => setConfirmReset(false)} width={440}>
          <p className="px-7 type-body-reduced text-secondary">
            Every setting goes back to how it was when you installed Sonara, and Sonara restarts. Your liked songs, playlists, downloads, listening, music taste and folders stay, and a backup is made first.
          </p>
          <div className="flex justify-end gap-2 px-7 pt-5 pb-6">
            <button className={button} onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button className="inline-flex h-9 items-center rounded-pill bg-[#ff453a] px-5 type-body-emphasized text-white hover:brightness-110" onClick={() => void api.resetSettings()}>
              Reset and restart
            </button>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function AboutTab() {
  const [dataPath, setDataPath] = useState('');
  useEffect(() => {
    void api.dataPath().then(setDataPath);
  }, []);
  return (
    <>
      <UpdateSettings />
      <Section title="Library">
        <Row title="Import a playlist" detail="Paste a YouTube or YouTube Music playlist link (read in full), or a Spotify playlist, album or song (its songs are found on YouTube Music).">
          <button className={button} onClick={() => useUi.getState().openDialog({ kind: 'import' })}>
            Import…
          </button>
        </Row>
        <Row title="Clear listening history">
          <button className={`${button} text-[#ff6b61]`} onClick={() => (useLibrary.getState().clearHistory(), toast('History cleared'))}>
            Clear
          </button>
        </Row>
        <Row title="Data folder" detail={dataPath || '…'}>
          <FolderOpen size={16} className="text-tertiary" />
        </Row>
      </Section>
      <YourData />
      <NetworkSettings />
      <Troubleshooting />
      <Section title="Getting started">
        <Row title="Getting started checklist" detail="The card on Home with five things to try.">
          <button className={button} onClick={() => useLibrary.getState().updateSettings({ checklistHidden: false })}>
            Show on Home
          </button>
        </Row>
        <Row title="Welcome guide" detail="The short tour shown the first time you open Sonara.">
          <button className={button} onClick={() => useLibrary.getState().updateSettings({ guideSeen: false })}>
            <Sparkles size={15} /> Show again
          </button>
        </Row>
      </Section>
      <Section title="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5 px-5 py-4">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="contents">
              <dt className="type-body-emphasized whitespace-nowrap text-primary">{keys}</dt>
              <dd className="type-body-reduced text-secondary">{what}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="About">
        <div className="flex items-center gap-4 px-5 py-5">
          <img src={appIcon} alt="" className="size-16 flex-none drop-shadow-[0_6px_16px_rgb(0_0_0/0.4)]" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="type-title-3-emphasized">Sonara</span>
            <span className="type-callout text-secondary">Version 2.3.2 · YouTube Music, plus your own lossless files, server and lossless sources · Lyrics via am-lyrics</span>
          </div>
        </div>
        <p className="px-5 pb-5 type-footnote text-tertiary">Not affiliated with YouTube or Google. Use in line with YouTube’s terms and your local laws.</p>
      </Section>
    </>
  );
}

function EqualizerTab() {
  return (
    <Section
      title="Equalizer"
      footer="Off, songs play exactly as streamed: the equalizer isn’t in the audio path at all. On, it runs at your output device’s own sample rate in 32-bit float, and with every band at 0 dB the filters are bypassed. Prevent clipping keeps boosts from distorting."
    >
      <div className="px-5 py-5">
        <EqualizerPanel />
      </div>
    </Section>
  );
}

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'playback', label: 'Playback' },
  { id: 'equalizer', label: 'Equalizer' },
  { id: 'music', label: 'Your Music' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'lyrics', label: 'Lyrics' },
  { id: 'player', label: 'Player' },
  { id: 'layout', label: 'Layout' },
  { id: 'about', label: 'About' },
];

const PREVIEW_COVERS = ['linear-gradient(135deg,#5b2a86,#fa586a)', 'linear-gradient(135deg,#1f6fd1,#3ee8cf)', 'linear-gradient(135deg,#c2410c,#f4a261)', 'linear-gradient(135deg,#0f766e,#a3e635)'];

/**
 * A small copy of the app drawn with the draft settings: the same stylesheet, given the
 * draft's values on this element (.theme-scope makes fonts, corners and blur follow them).
 */
function SettingsPreview() {
  const { s } = useSettings();
  const { accent } = useThemeColors(s);
  const vars = themeVars(s, accent);
  vars['--font-family'] ??= LYRIC_FONTS.inter.family;
  const thumbnail = usePlayer((p) => p.queue[p.index]?.track.thumbnail);
  const cover = Math.round(52 * (s.coverSize ?? 1));
  const row = (title: string, artist: string, art: string, current = false) => (
    <div className={`flex h-(--row-h) items-center gap-2.5 rounded-row px-1.5 ${current ? 'bg-white/[0.06]' : ''}`}>
      <span className="size-(--row-art) flex-none rounded-artwork-sm" style={{ background: art }} />
      <span className="flex min-w-0 flex-col">
        <span className={`truncate type-body-emphasized ${current ? 'text-key' : 'text-primary'}`}>{title}</span>
        <span className="truncate type-callout text-secondary">{artist}</span>
      </span>
    </div>
  );
  return (
    <div className="sticky top-[calc(var(--titlebar-height)+6px)] z-10 mb-6" aria-label="Preview" role="img">
      <div className="theme-scope relative h-[196px] overflow-hidden rounded-panel border border-white/10 bg-page text-primary shadow-[0_14px_40px_rgb(0_0_0/0.5)]" style={vars as CSSProperties} data-glass={s.glassStyle}>
        {s.pageBackground === 'gradient' && (
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 85% 60% at 90% -10%, ${rgb(accent, 0.32)}, transparent 70%), radial-gradient(ellipse 70% 55% at -5% 105%, ${rgb(accent, 0.16)}, transparent 70%)` }} />
        )}
        {s.pageBackground === 'artwork' && thumbnail && <img src={artworkAtPixels(thumbnail, 200)} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-30 blur-[40px] saturate-150" />}
        <div className="absolute inset-0" style={{ zoom: s.zoom || 1 }}>
          {/* Colour passing behind the glass, so the blur setting shows. */}
          <span className="absolute top-7 -left-3 size-14 rounded-full" style={{ background: PREVIEW_COVERS[0] }} />
          <span className="absolute top-[104px] left-1 h-5 w-16 rounded-full" style={{ background: PREVIEW_COVERS[1] }} />
          <span className="absolute bottom-3 left-[38%] h-7 w-24 rounded-full" style={{ background: PREVIEW_COVERS[3] }} />
          <div className="glass-thick absolute top-2 bottom-2 left-2 flex w-11 flex-col items-center gap-3.5 rounded-panel pt-3 text-secondary">
            <LogoMark size={20} className="text-key" />
            <House size={15} className="text-key" />
            <Heart size={15} />
            <Clock size={15} />
          </div>
          <div className="absolute inset-y-0 right-3 left-16 overflow-hidden pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate type-title-1-emphasized">Good evening</span>
              <Toggle label="Preview switch" on onChange={() => undefined} />
            </div>
            <div className="mt-2.5 flex gap-2">
              {PREVIEW_COVERS.map((bg) => (
                <span key={bg} className="flex-none rounded-artwork-md shadow-[0_4px_12px_rgb(0_0_0/0.3)]" style={{ width: cover, height: cover, background: bg }} />
              ))}
            </div>
            <div className="mt-2 flex flex-col">
              {row('Nightfall', 'Pebble', PREVIEW_COVERS[0]!, true)}
              {row('Golden Hour', 'Sonara Sessions', PREVIEW_COVERS[2]!)}
            </div>
          </div>
          {/* The player, in the chosen style. */}
          <div className="absolute inset-x-0 bottom-2.5 left-14 flex justify-center">
            {s.playerStyle === 'full' ? (
              <div className="glass flex h-10 w-[78%] items-center gap-3 rounded-pill px-3">
                <PreviousGlyph size={13} />
                <PlayGlyph size={16} />
                <NextGlyph size={13} />
                <span className="size-6 flex-none rounded-[6px]" style={{ background: PREVIEW_COVERS[0] }} />
                <span className="h-1 flex-1 rounded-full bg-white/15" />
              </div>
            ) : (
              <div className="glass flex h-10 items-center rounded-pill pr-2.5 pl-1.5">
                <span className="size-7 flex-none rounded-[7px]" style={{ background: PREVIEW_COVERS[0] }} />
                <span className="mx-2 h-5 w-px bg-white/15" />
                <PreviousGlyph size={12} />
                <span className="mx-2 grid size-7 place-items-center rounded-full bg-key text-(--onKeyColor)">
                  <PauseGlyph size={13} />
                </span>
                <NextGlyph size={12} />
              </div>
            )}
          </div>
        </div>
        <span className="absolute top-2 right-2 rounded-pill bg-black/45 px-2 py-0.5 type-subhead-emphasized text-secondary">Preview</span>
      </div>
    </div>
  );
}

/** The full-screen player in miniature, with the draft's background, motion and artwork size. */
function PlayerPreview() {
  const { s } = useSettings();
  const track = usePlayer((p) => p.queue[p.index]?.track ?? null);
  const playing = usePlayer((p) => p.status === 'playing');
  const art = track ? (largeArtwork(track.thumbnail) ?? track.thumbnail) : undefined;
  const [solid, setSolid] = useState<string | null>(null);
  useEffect(() => {
    if (s.backdrop !== 'solid' || !track?.thumbnail) return;
    let alive = true;
    tintFor(track.thumbnail).then((c) => alive && setSolid(rgb(c)), () => undefined);
    return () => {
      alive = false;
    };
  }, [s.backdrop, track?.thumbnail]);
  const size = Math.round(118 * (s.artworkScale || 1));
  const stops = useWaveStops(s);
  return (
    <div className="sticky top-[calc(var(--titlebar-height)+6px)] z-10 mb-6" aria-label="Preview" role="img">
      <div className="relative isolate h-[196px] overflow-hidden rounded-panel border border-white/10 shadow-[0_14px_40px_rgb(0_0_0/0.5)]" data-immersive>
        {s.backdrop === 'artwork' ? (
          <ArtworkBackdrop artworkUrl={art} speed={playing ? s.backdropMotion : 0} />
        ) : s.backdrop === 'solid' ? (
          <SolidBackdrop color={solid} />
        ) : (
          <MeshBackdrop artworkUrl={art} playing={playing} speed={s.backdropMotion} />
        )}
        <div className="absolute inset-0 flex items-center gap-5 px-8">
          <span className="flex-none overflow-hidden rounded-[12px] shadow-[0_14px_36px_rgb(0_0_0/0.45)] transition-[width,height] duration-300" style={{ width: size, height: size, background: PREVIEW_COVERS[0] }}>
            {art && <img src={art} alt="" className="size-full object-cover" />}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate type-title-1-emphasized text-primary">{track?.title ?? 'Nightfall'}</span>
            <span className="truncate type-title-3 text-secondary">{track ? track.artists.map((a) => a.name).join(', ') : 'Pebble'}</span>
            {/* The draft's seek bar, two fifths of the way in. */}
            <span className="group/scrub mt-2 block w-56 [--progress:0.4]">
              <SeekTrack look={seekLookOf(s)} playing={playing} />
              {(s.seekTimes ?? true) && (
                <span className="flex justify-between type-[500_11px/13px] tabular-nums text-tertiary">
                  <span>1:24</span>
                  <span>-2:06</span>
                </span>
              )}
            </span>
          </span>
        </div>
        {/* The pebble, with the draft's waveform: live while music plays. */}
        <div className="glass absolute right-4 bottom-4 flex h-12 w-[230px] items-center rounded-pill pr-3.5 pl-1.5">
          <span className="size-9 flex-none overflow-hidden rounded-[9px]" style={{ background: PREVIEW_COVERS[0] }}>
            {art && <img src={art} alt="" className="size-full object-cover" />}
          </span>
          <span className="mx-2.5 h-6 w-px flex-none bg-white/15" />
          <Waveform active playing={playing} options={s} stops={stops} className="h-8 min-w-0 flex-1" />
        </div>
        <span className="absolute top-2 right-2 rounded-pill bg-black/45 px-2 py-0.5 type-subhead-emphasized text-secondary">Preview</span>
      </div>
    </div>
  );
}

/** Shown while the preview differs from what's saved. */
function ApplyBar() {
  const pending = usePendingChanges();
  const count = Object.keys(pending).length;
  if (!count) return null;
  return (
    <div className="sticky bottom-[calc(var(--player-pill-height)+var(--player-bottom-offset)+14px)] z-10 mt-2 flex justify-center">
      <div className="glass-thick flex animate-rise items-center gap-3 rounded-pill py-1.5 pr-1.5 pl-5" style={{ backgroundColor: 'var(--dialog-fill)' }}>
        <span className="type-body-reduced text-secondary">{count === 1 ? '1 change' : `${count} changes`} in the preview</span>
        <button className="h-8 rounded-pill bg-white/10 px-4 type-body-emphasized hover:bg-white/15" onClick={() => useDraft.setState({ patch: {} })}>
          Discard
        </button>
        <button
          className="h-8 rounded-pill bg-key px-4 type-body-emphasized text-(--onKeyColor) hover:brightness-110"
          onClick={() => {
            useLibrary.getState().updateSettings(pending);
            useDraft.setState({ patch: {} });
            toast('Changes applied');
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export function SettingsPage({ tab = 'playback' }: { tab?: SettingsTab }) {
  // Changes not applied are dropped when you leave Settings.
  useEffect(() => () => useDraft.setState({ patch: {} }), []);
  const drafted = tab === 'appearance' || tab === 'layout' || tab === 'player';
  return (
    <div className="mx-auto max-w-[800px] px-(--body-gutter) pt-4 pb-16">
      <h1 className="mb-6 type-header-emphasized tracking-apple">Settings</h1>
      <div className="no-scrollbar mb-8 overflow-x-auto rounded-pill">
      <Segmented
        className="min-w-max"
        stretch
        tabs
        label="Settings sections"
        value={tab}
        options={TABS.map((t) => ({ value: t.id, label: t.label }))}
        onChange={(id) => useNav.getState().go({ name: 'settings', tab: id }, { replace: true, tab: true })}
      />
      </div>
      {drafted ? (
        <Drafted.Provider value>
          {tab === 'player' ? <PlayerPreview /> : <SettingsPreview />}
          <div key={tab} className="animate-rise">
            {tab === 'appearance' ? <AppearanceTab /> : tab === 'layout' ? <LayoutTab /> : <PlayerTab />}
          </div>
          <ApplyBar />
        </Drafted.Provider>
      ) : (
        <div key={tab} className="animate-rise">
          {tab === 'playback' && <PlaybackTab />}
          {tab === 'equalizer' && <EqualizerTab />}
          {tab === 'music' && <MusicTab />}
          {tab === 'lyrics' && <LyricsTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      )}
    </div>
  );
}
