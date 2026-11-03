import { EqualizerPanel } from '@/components/Equalizer';
import { useQueryClient } from '@tanstack/react-query';
import appIcon from '@/assets/app-icon.png';
import { Check, ExternalLink, FolderOpen, FolderPlus, Keyboard, Loader2, RefreshCw, RotateCcw, Server, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type AudioQuality, type DownloadQuality, type Settings } from '@shared/types';
import { api } from '@/lib/api';
import { ACCENTS, LYRIC_FONTS } from '@/lib/appearance';
import { useLocalLibrary, useServerStatus } from '@/lib/queries';
import { enableLosslessIfHigh, useLibrary } from '@/state/library';
import { go, useNav, type SettingsTab } from '@/state/nav';
import { toast, useUi } from '@/state/ui';
import { Segmented, Toggle } from '@/components/Segmented';
import { useConnectServer, useScanProgress } from './YourMusicPage';

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

function useSettings() {
  const settings = useLibrary((s) => s.settings);
  const update = useLibrary((s) => s.updateSettings);
  return { s: settings, set: update };
}

function ResetButton({ keys }: { keys: (keyof Settings)[] }) {
  const { set } = useSettings();
  return (
    <button
      className="inline-flex items-center gap-1.5 type-callout-medium text-tertiary hover:text-primary"
      onClick={() => {
        const patch: Partial<Settings> = {};
        for (const k of keys) (patch as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
        set(patch);
        toast('Restored the defaults');
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
            { value: 'lossless', label: 'Lossless' },
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
      <Section title="Audio" footer="Lossless needs your own files or server (Your Music tab). Songs you don't have a lossless copy of play at High.">
        <Row
          title="Audio quality"
          detail={
            s.quality === 'lossless'
              ? 'Lossless when available: your FLAC/WAV copy of a song plays instead of YouTube’s stream.'
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
        <Row title="Normalize volume" detail="Even out loudness between YouTube songs. Your own files play as mastered.">
          <Toggle label="Normalize volume" on={s.normalize} onChange={(normalize) => set({ normalize })} />
        </Row>
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
        <Row title="Open the immersive player when music starts">
          <Toggle label="Immersive on play" on={s.immersiveOnPlay} onChange={(immersiveOnPlay) => set({ immersiveOnPlay })} />
        </Row>
        <Row title="Keep playing in the tray when the window closes" detail="Quit from the tray icon.">
          <Toggle label="Close to tray" on={s.closeToTray} onChange={(closeToTray) => set({ closeToTray })} />
        </Row>
      </Section>
      <DownloadSettings />
    </>
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
    </>
  );
}

function AppearanceTab() {
  const { s, set } = useSettings();
  return (
    <>
      <Section title="Accent colour" footer={<ResetButton keys={['accent', 'dynamicAccent', 'pageTone', 'ambientGlow', 'glassStyle']} />}>
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
      </Section>
      <Section title="Background">
        <Row title="Page colour" detail="Obsidian black, BitChord’s graphite, or pure black for OLED screens.">
          <Segmented
            value={s.pageTone}
            options={[
              { value: 'obsidian', label: 'Obsidian' },
              { value: 'graphite', label: 'Graphite' },
              { value: 'black', label: 'Black' },
            ]}
            onChange={(pageTone) => set({ pageTone })}
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
          <Segmented<number>
            value={s.lyricsScale}
            options={[
              { value: 0.8, label: 'S' },
              { value: 1, label: 'M' },
              { value: 1.2, label: 'L' },
              { value: 1.4, label: 'XL' },
            ]}
            onChange={(lyricsScale) => set({ lyricsScale })}
          />
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
        <Segmented<number>
          value={s.artworkScale}
          options={[
            { value: 0.85, label: 'Small' },
            { value: 1, label: 'Medium' },
            { value: 1.15, label: 'Large' },
          ]}
          onChange={(artworkScale) => set({ artworkScale })}
        />
      </Row>
    </Section>
  );
}

function LayoutTab() {
  const { s, set } = useSettings();
  return (
    <>
      <Section title="Layout" footer={<ResetButton keys={['zoom', 'compact', 'startPage', 'sidebarSearch', 'sidebarRecent', 'sidebarMusic']} />}>
        <Row title="Interface size">
          <Segmented<number>
            value={s.zoom}
            options={[
              { value: 0.9, label: '90%' },
              { value: 1, label: '100%' },
              { value: 1.1, label: '110%' },
              { value: 1.25, label: '125%' },
            ]}
            onChange={(zoom) => set({ zoom })}
          />
        </Row>
        <Row title="Compact song lists" detail="Shorter rows, more songs on screen.">
          <Toggle label="Compact song lists" on={s.compact} onChange={(compact) => set({ compact })} />
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

function AboutTab() {
  const [dataPath, setDataPath] = useState('');
  useEffect(() => {
    void api.dataPath().then(setDataPath);
  }, []);
  return (
    <>
      <Section title="Library">
        <Row title="Import a YouTube playlist" detail="Paste a YouTube or YouTube Music playlist link. Large playlists are read in full.">
          <button className={button} onClick={() => useUi.getState().openDialog({ kind: 'import' })}>
            Import…
          </button>
        </Row>
        <Row title="Clear listening history">
          <button className={`${button} text-[#ff6b61]`} onClick={() => (useLibrary.getState().clearHistory(), toast('History cleared'))}>
            Clear
          </button>
        </Row>
        <Row title="Keyboard shortcuts">
          <button className={button} onClick={() => useUi.getState().openDialog({ kind: 'shortcuts' })}>
            <Keyboard size={15} /> Show
          </button>
        </Row>
        <Row title="Data folder" detail={dataPath || '…'}>
          <FolderOpen size={16} className="text-tertiary" />
        </Row>
      </Section>
      <Section title="About">
        <div className="flex items-center gap-4 px-5 py-5">
          <img src={appIcon} alt="" className="size-16 flex-none drop-shadow-[0_6px_16px_rgb(0_0_0/0.4)]" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="type-title-3-emphasized">Obsidian Music for PC</span>
            <span className="type-callout text-secondary">Version 1.5.1 · YouTube Music, plus your own lossless files and server · Lyrics via am-lyrics</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          {[
            ['Obsidian Music (Android)', 'https://github.com/Varun7009/Obsidian-Music'],
            ['BitChord (design)', 'https://github.com/kushagrasinghx/BitChord'],
            ['YouTube.js', 'https://github.com/LuanRT/YouTube.js'],
            ['am-lyrics', 'https://github.com/uimaxbai/am-lyrics'],
            ['Navidrome', 'https://www.navidrome.org'],
          ].map(([label, url]) => (
            <button key={url} className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-white/[0.08] px-3 type-callout-medium text-secondary hover:bg-white/15 hover:text-primary" onClick={() => void api.openExternal(url!)}>
              {label} <ExternalLink size={11} />
            </button>
          ))}
        </div>
        <p className="px-5 pb-5 type-footnote text-tertiary">Not affiliated with YouTube, Google, Obsidian Music or BitChord. Use in line with YouTube’s terms and your local laws.</p>
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

export function SettingsPage({ tab = 'playback' }: { tab?: SettingsTab }) {
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
      <div key={tab} className="animate-rise">
      {tab === 'playback' && <PlaybackTab />}
      {tab === 'equalizer' && <EqualizerTab />}
      {tab === 'music' && <MusicTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'lyrics' && <LyricsTab />}
      {tab === 'player' && <PlayerTab />}
      {tab === 'layout' && <LayoutTab />}
      {tab === 'about' && <AboutTab />}
      </div>
    </div>
  );
}
