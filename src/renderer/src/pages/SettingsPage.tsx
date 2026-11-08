import { EqualizerPanel } from '@/components/Equalizer';
import { useQueryClient } from '@tanstack/react-query';
import appIcon from '@/assets/app-icon.png';
import { Check, Clock, Download, FolderOpen, FolderPlus, Heart, House, Loader2, RefreshCw, RotateCcw, Server, Sparkles, Trash2 } from 'lucide-react';
import { SHORTCUTS } from '@/components/Dialogs';
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { create } from 'zustand';
import { DEFAULT_SETTINGS, type AudioQuality, type DownloadQuality, type MiniPlayerWhen, type Settings, type SpatialAudio, type UpdateState } from '@shared/types';
import { api } from '@/lib/api';
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
      <Section title="Getting started">
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
            <span className="type-callout text-secondary">Version 2.2.3 · Based on Obsidian Music for PC · YouTube Music, plus your own lossless files and server · Lyrics via am-lyrics</span>
          </div>
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
            <span className="mt-3 block h-1 w-48 overflow-hidden rounded-full bg-white/20">
              <span className="block h-full w-2/5 bg-white/85" />
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
