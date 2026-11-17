// Registers <am-lyrics>: Apple Music–style word-by-word lyrics (MPL-2.0).
import '@uimaxbai/am-lyrics/am-lyrics.js';
import { ChevronDown, Languages, Loader2, MicVocal, Speech, Timer } from 'lucide-react';
import { LyricsResync, retime, useLyricsTiming, type TimedLine } from './LyricsResync';
import { SyncedByYou, SyncYourself, useUserLyrics } from './LyricsSyncYourself';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { create } from 'zustand';
import { alignTranslation, pronunciationKind, romanizeLines, translateLines, TRANSLATE_LANGUAGES } from '@/lib/lyricsTools';
import { api } from '@/lib/api';
import { openMenuAt } from '@/state/menu';
import type { Track } from '@shared/types';
import { LYRIC_FONTS } from '@/lib/appearance';
import { useLyricsFallback } from '@/lib/queries';
import { useLibrary } from '@/state/library';
import { getPlayhead, usePlayer } from '@/state/player';

type AmLyricsElement = HTMLElement & {
  currentTime: number;
  songTitle?: string;
  songArtist?: string;
  songAlbum?: string;
  songDurationMs?: number;
  query?: string;
  interpolate: boolean;
  autoScroll: boolean;
  highlightColor: string;
  fontFamily?: string;
  noBlur: boolean;
  lineMotion: 'staggered' | 'uniform' | 'instant';
};

/** Styles added inside am-lyrics' shadow root for the lyrics settings. */
function customStyles(align: 'left' | 'center', controls: boolean): string {
  let css = '';
  if (align === 'center') {
    css +=
      '.lyrics-line:not(.singer-right):not(.rtl-text) { text-align: center; transform-origin: center; }' +
      '.lyrics-line:not(.singer-right):not(.rtl-text) .lyrics-line-container, .lyrics-line:not(.singer-right):not(.rtl-text) .main-vocal-container { transform-origin: center; }';
  }
  if (!controls) css += '.lyrics-header { display: none !important; }';
  // Pronunciation and translation come from our own toolbar (better for Indian languages).
  css += '.header-controls { display: none !important; }';
  css += '.lyrics-romanization-container, .lyrics-translation-container { opacity: .78; font-weight: 600; }';
  // Machine-translated lines among a person's translation: in italics, a little fainter.
  css += '.lyrics-translation-container.by-machine { font-style: italic; opacity: .55; }';
  return css;
}

/** Strips "(Official Video)", "[Lyrics]", "ft. X" and the like, which lyric searches choke on. */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([](official|lyric|lyrics|audio|video|visualizer|music video|hd|hq|4k|remastered[^)\]]*)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([](feat\.?|ft\.?|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+(feat\.?|ft\.?)\s.*$/i, '')
    .trim();
}

type LyricLine = Omit<TimedLine, 'text'> & { text: (TimedLine['text'][number] & { romanizedText?: string })[]; romanizedText?: string; translation?: string };

/** The pronunciation / translation toolbar over the lyrics: one capsule of clear glass. */
function LyricsTools({ kind, onResync, resynced }: { kind: 'indic' | 'online' | 'none' | null; onResync?: () => void; resynced?: boolean }) {
  const on = useLibrary((s) => s.settings.lyricsPronunciation);
  const tr = useLibrary((s) => s.settings.lyricsTranslation);
  const to = useLibrary((s) => s.settings.lyricsTranslateTo) || 'en';
  const busy = useLyricsBusy((s) => s.busy);
  const noPronunciation = useLyricsBusy((s) => s.noPronunciation);
  const noTranslation = useLyricsBusy((s) => s.noTranslation);
  const translatedBy = useLyricsBusy((s) => s.translatedBy);
  const set = useLibrary.getState().updateSettings;
  const name = TRANSLATE_LANGUAGES.find((l) => l.code === to)?.name ?? to;
  const btn = 'group/tool relative flex h-8 items-center gap-1.5 rounded-pill px-3 type-callout-emphasized transition-colors';
  // On: filled with the accent. A second click turns it off again.
  const state = (active: boolean) => (active ? 'bg-key text-(--onKeyColor)' : 'text-secondary hover:bg-white/10 hover:text-primary');
  // Kept hoverable when unavailable (a disabled button gets no hover), so it can say why.
  const latinOnly = kind === 'none';
  const pronunciationHint = latinOnly ? 'These lyrics are already in Latin letters, so there’s no pronunciation to add.' : on && noPronunciation ? 'Pronunciation isn’t available for these lyrics.' : null;
  const translationHint = tr && noTranslation ? `No ${name} translation for these lyrics: they may already be in ${name}, or translation can’t be reached right now.` : null;
  // After you pick a language: a note on where the translation came from, for a few seconds.
  const announce = useLyricsBusy((s) => s.announce);
  const sources = useLyricsBusy((s) => s.sources);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!announce || busy || !sources || !tr) return;
    useLyricsBusy.setState({ announce: 0 });
    setNote(sourceNote(sources, translatedBy));
  }, [announce, busy, sources, tr, translatedBy]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 6000);
    return () => clearTimeout(t);
  }, [note]);
  return (
    // In a narrow lyrics panel the names go and the icons stay (each keeps its tooltip), so the
    // toolbar fits instead of running off the panel's edge.
    <div className="glass pointer-events-auto absolute top-2 right-3 z-10 flex max-w-[calc(100%-24px)] animate-rise items-center gap-0.5 rounded-pill p-[3px]">
      <button
        className={`${btn} ${latinOnly ? 'cursor-default text-secondary opacity-40' : state(on)}`}
        aria-pressed={on}
        aria-disabled={latinOnly || undefined}
        aria-label="Pronunciation"
        title={pronunciationHint ? undefined : on ? 'Pronunciation is on: click to turn it off' : 'Pronunciation: how to sing it, in Latin letters'}
        onClick={() => !latinOnly && set({ lyricsPronunciation: !on })}
      >
        <Speech size={15} className="flex-none" /> <span className="@max-[520px]/lyrics:hidden">Pronunciation</span>
        {pronunciationHint && <Hint text={pronunciationHint} />}
      </button>
      {/* Translate opens the list of languages; "Off" turns translation off. */}
      <button
        className={`${btn} ${state(tr)}`}
        aria-pressed={tr}
        aria-haspopup="menu"
        aria-label={tr ? `Translate: ${name}` : 'Translate'}
        title={
          translationHint
            ? undefined
            : tr && translatedBy
              ? `English translation by ${translatedBy}, with any lines it lacks machine-translated (in italics): pick another language, or Off`
              : tr
                ? `Translating to ${name}: pick another language, or Off`
                : 'Translate the lyrics'
        }
        onClick={(e) =>
          openMenuAt(
            e.currentTarget,
            [
              { header: 'Translate lyrics to' },
              { label: 'Off', hint: tr ? undefined : '✓', onSelect: () => set({ lyricsTranslation: false }) },
              { separator: true },
              ...TRANSLATE_LANGUAGES.map((l) => ({
                label: l.name,
                hint: tr && l.code === to ? '✓' : undefined,
                onSelect: () => {
                  // Say where the lines came from once they're translated (at once, if they already are).
                  useLyricsBusy.setState(tr && l.code === to ? { announce: Date.now() } : { announce: Date.now(), sources: null });
                  set({ lyricsTranslateTo: l.code, lyricsTranslation: true });
                },
              })),
            ],
            'below-end',
          )
        }
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />} <span className="max-w-[110px] truncate @max-[520px]/lyrics:hidden">{tr ? name : 'Translate'}</span>
        <ChevronDown size={14} className="-mr-1 opacity-70" />
        {translationHint && <Hint text={translationHint} />}
        {note && <SourceNote text={note} />}
      </button>
      {onResync && (
        <button
          className={`${btn} ${state(!!resynced)}`}
          aria-label="Resync"
          title={resynced ? 'You adjusted the timing: click to change it' : 'Lyrics early or late? Adjust when each line shows'}
          onClick={onResync}
        >
          <Timer size={15} className="flex-none" /> <span className="@max-[520px]/lyrics:hidden">Resync</span>
        </button>
      )}
    </div>
  );
}

/** A note under a lyric tool, shown while it's hovered. */
function Hint({ text }: { text: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-full right-0 z-20 mt-2 w-max max-w-[260px] rounded-[10px] px-3 py-2 text-left type-callout text-primary opacity-0 shadow-[0_8px_24px_rgb(0_0_0/0.45)] transition-opacity duration-150 group-hover/tool:opacity-100"
      style={{ backgroundColor: 'var(--dialog-fill)' }}
    >
      {text}
    </span>
  );
}

/** The song and language whose translation's note was last shown. */
let announcedFor = '';

/** Where a song's translated lines came from, in a sentence. */
function sourceNote(sources: { people: number; machine: number }, by: string | null): string {
  const lines = (n: number) => `${n} line${n === 1 ? '' : 's'}`;
  if (!sources.people) return `Machine-translated: ${lines(sources.machine)}.`;
  if (!sources.machine) return `All ${lines(sources.people)} translated by people, from ${by}.`;
  return `${lines(sources.people)} translated by people, from ${by}. ${lines(sources.machine)} machine-translated, shown in italics.`;
}

/** The note on where a translation came from: shown for a few seconds after you pick a language. */
function SourceNote({ text }: { text: string }) {
  return (
    <span
      role="status"
      className="pointer-events-none absolute top-full right-0 z-20 mt-2 w-max max-w-[280px] animate-rise rounded-[10px] px-3 py-2 text-left type-callout text-primary shadow-[0_8px_24px_rgb(0_0_0/0.45)]"
      style={{ backgroundColor: 'var(--dialog-fill)' }}
    >
      {text}
    </span>
  );
}

/**
 * Whether the latest pass found nothing to show: no pronunciation, or no translation; the site a
 * person's translation came from, when it did; how many lines came from people and from the machine;
 * and when you last picked a language (to say so once the lines are in).
 */
const useLyricsBusy = create<{
  busy: boolean;
  noPronunciation: boolean;
  noTranslation: boolean;
  translatedBy: string | null;
  sources: { people: number; machine: number } | null;
  announce: number;
}>(() => ({
  busy: false,
  noPronunciation: false,
  noTranslation: false,
  translatedBy: null,
  sources: null,
  announce: 0,
}));

/**
 * Translations for the lines: into English, a person's translation of the song where there's one
 * (it gets the meaning a machine misses), with machine translation for any lines it doesn't cover.
 */
async function translateSong(lines: string[], to: string, track: Track): Promise<{ trans: string[]; byMachine: boolean[]; by: string | null }> {
  if (to === 'en') {
    const human = await api.humanTranslation(track.title, track.artists.map((a) => a.name), track.album?.name).catch(() => null);
    if (human) {
      const { text, matched } = alignTranslation(lines, human.pairs);
      const sung = lines.filter((l) => l.trim()).length;
      // Most lines matched: it's this song's translation (a few lines can differ from the lyrics shown).
      if (sung && lines.filter((l, i) => l.trim() && matched[i]).length >= sung * 0.5) {
        // Every sung line gets a meaning: machine translation where the person's has none for it.
        const missing = lines.map((l, i) => (text[i] || !l.trim() ? -1 : i)).filter((i) => i >= 0);
        const machine = missing.length ? await translateLines(missing.map((i) => lines[i]!), to).catch(() => [] as string[]) : [];
        const byMachine = lines.map(() => false);
        missing.forEach((i, k) => {
          text[i] = machine[k] ?? '';
          byMachine[i] = !!text[i];
        });
        return { trans: text, byMachine, by: human.source };
      }
    }
  }
  const trans = await translateLines(lines, to).catch(() => [] as string[]);
  return { trans, byMachine: trans.map((t) => !!t), by: null };
}

/** Adds pronunciation and translations to lines, as the settings ask. */
async function withAlternates(lines: string[], wantRoman: boolean, wantTrans: boolean, to: string, track: Track): Promise<{ roman: string[]; trans: string[]; byMachine: boolean[] }> {
  useLyricsBusy.setState({ busy: true });
  try {
    const [roman, { trans, byMachine, by }] = await Promise.all([
      wantRoman ? romanizeLines(lines) : Promise.resolve([] as string[]),
      wantTrans ? translateSong(lines, to, track) : Promise.resolve({ trans: [] as string[], byMachine: [] as boolean[], by: null }),
    ]);
    const empty = (list: string[]) => !list.some((line) => line.trim());
    const machine = byMachine.filter(Boolean).length;
    const sources = wantTrans && !empty(trans) ? { people: trans.filter((t) => t.trim()).length - machine, machine } : null;
    useLyricsBusy.setState({ noPronunciation: wantRoman && empty(roman), noTranslation: wantTrans && empty(trans), translatedBy: by, sources });
    // With translation on, each song's translation says where it came from as it shows up (once per
    // song and language, not again when pronunciation is turned on or off).
    const key = `${track.videoId}|${to}`;
    if (sources && key !== announcedFor) {
      announcedFor = key;
      useLyricsBusy.setState({ announce: Date.now() });
    }
    return { roman, trans, byMachine };
  } finally {
    useLyricsBusy.setState({ busy: false });
  }
}

/**
 * Marks the machine-translated lines am-lyrics shows among a person's translation (styled in
 * customStyles), by their text: it draws each line's translation as plain text, with nothing to tell
 * them apart. Kept up as it redraws. Returns the cleanup.
 */
function markMachineLines(el: HTMLElement | null, alt: { trans: string[]; byMachine: boolean[] } | null): (() => void) | undefined {
  const root = el?.shadowRoot;
  if (!root || !alt) return undefined;
  const machine = new Set<string>();
  const people = new Set<string>();
  alt.trans.forEach((t, i) => t.trim() && (alt.byMachine[i] ? machine : people).add(t.trim()));
  // All from one source: nothing to tell apart.
  if (!machine.size || !people.size) {
    root.querySelectorAll('.lyrics-translation-container.by-machine').forEach((n) => n.classList.remove('by-machine'));
    return undefined;
  }
  const mark = () =>
    root.querySelectorAll('.lyrics-translation-container').forEach((n) => {
      const t = n.textContent?.trim() ?? '';
      n.classList.toggle('by-machine', machine.has(t) && !people.has(t));
    });
  mark();
  let queued = 0;
  const watch = new MutationObserver(() => {
    if (!queued) queued = requestAnimationFrame(() => ((queued = 0), mark()));
  });
  watch.observe(root, { childList: true, subtree: true });
  return () => {
    watch.disconnect();
    cancelAnimationFrame(queued);
  };
}

/**
 * am-lyrics, fed the track's names (it asks lrc.red, BiniLyrics, LRCLIB and
 * others itself) and the media clock each frame. When none of its sources has
 * the song, YouTube Music's own (unsynced) lyrics are shown instead.
 */
function SyncedLyrics({ track, full, onMissing }: { track: Track; full: boolean; onMissing: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<AmLyricsElement | null>(null);
  const [kind, setKind] = useState<'indic' | 'online' | 'none' | null>(null);
  const [loaded, setLoaded] = useState<LyricLine[] | null>(null);
  const wantRoman = useLibrary((s) => s.settings.lyricsPronunciation);
  const wantTrans = useLibrary((s) => s.settings.lyricsTranslation);
  const to = useLibrary((s) => s.settings.lyricsTranslateTo) || 'en';
  const scale = useLibrary((s) => s.settings.lyricsScale);
  const font = useLibrary((s) => s.settings.lyricsFont);
  const align = useLibrary((s) => s.settings.lyricsAlign);
  const blur = useLibrary((s) => s.settings.lyricsBlur);
  const controls = useLibrary((s) => s.settings.lyricsControls);
  const motion = useLibrary((s) => s.settings.lyricsMotion);

  useEffect(() => {
    const el = document.createElement('am-lyrics') as AmLyricsElement;
    const artist = track.artists[0]?.name ?? '';
    const title = cleanTitle(track.title);
    // Set before attaching: it starts fetching the moment it connects.
    el.songTitle = title;
    el.songArtist = artist;
    if (track.album?.name) el.songAlbum = track.album.name;
    if (track.duration) el.songDurationMs = Math.round(track.duration * 1000);
    el.query = `${title} ${artist}`.trim();
    el.interpolate = true;
    el.autoScroll = true;
    el.highlightColor = '#ffffff';
    el.fontFamily = LYRIC_FONTS[font]?.family ?? LYRIC_FONTS['dm-sans'].family;
    el.noBlur = !blur;
    el.lineMotion = motion;
    // Its own Google calls stay off; the toolbar fills in pronunciation and translation.
    (el as unknown as { noAutoAlternates: boolean }).noAutoAlternates = true;
    element.current = el;
    el.className = 'block h-full w-full overflow-hidden';
    const k = scale || 1;
    el.style.setProperty('--am-lyrics-highlight-color', '#ffffff');
    el.style.setProperty('--lyplus-font-size-base', full ? `calc(clamp(28px, 2.6vw, 40px) * ${k})` : `${Math.round(24 * k)}px`);
    el.style.setProperty('--am-lyrics-compact-font-size', full ? `calc(clamp(26px, 2.4vw, 36px) * ${k})` : `${Math.round(22 * k)}px`);
    el.style.setProperty('--am-lyrics-wide-font-size', full ? `calc(clamp(32px, 2.8vw, 44px) * ${k})` : `${Math.round(26 * k)}px`);
    el.style.setProperty('--am-lyrics-line-spacing', `${Math.round((full ? 26 : 18) * k)}px`);
    el.style.setProperty('--am-lyrics-inline-padding', full ? '0px' : '20px');
    el.style.setProperty('--lyrics-scroll-padding-top', full ? '28%' : '18%');
    el.addEventListener('line-click', (event) => {
      const timestamp = (event as CustomEvent<{ timestamp: number }>).detail?.timestamp;
      if (typeof timestamp === 'number') usePlayer.getState().seek(timestamp / 1000);
    });
    host.current?.appendChild(el);

    // The alignment and controls settings, inside its shadow root.
    const css = customStyles(align, controls);
    if (css) {
      const apply = () => {
        if (!el.shadowRoot) return false;
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
        return true;
      };
      if (!apply()) requestAnimationFrame(() => void apply());
    }

    // The clock: the media time, every frame.
    let frame = 0;
    const tick = () => {
      el.currentTime = Math.round(getPlayhead() * 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // "No lyrics found." is drawn inside its shadow root; new lyrics (or another source) appear on el.lyrics.
    let checks = 0;
    let seen: unknown = null;
    const watcher = setInterval(() => {
      checks++;
      const lines = (el as unknown as { lyrics?: LyricLine[] }).lyrics;
      if (lines && lines.length && lines !== seen && !(lines as { __ours?: boolean }).__ours) {
        seen = lines;
        setLoaded(lines);
        setKind(pronunciationKind(lines.map((l) => l.text.map((x) => x.text).join(''))));
      }
      if (el.shadowRoot?.querySelector('.no-lyrics')) {
        clearInterval(watcher);
        onMissing();
      } else if (checks > 600) clearInterval(watcher);
    }, 400);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(watcher);
      el.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.videoId, full, scale, font, align, blur, controls, motion]);

  // Pronunciation / translation: worked out for the loaded lines.
  const [alt, setAlt] = useState<{ roman: string[]; trans: string[]; byMachine: boolean[]; wantRoman: boolean; wantTrans: boolean } | null>(null);
  useEffect(() => {
    const el = element.current as unknown as { showRomanization: boolean; showTranslation: boolean } | null;
    if (!el || !loaded) return;
    // Turning one off hides it at once, without waiting for the other to be worked out.
    if (!wantRoman) el.showRomanization = false;
    if (!wantTrans) el.showTranslation = false;
    let alive = true;
    const texts = loaded.map((l) => l.text.map((x) => x.text).join(''));
    void withAlternates(texts, wantRoman && kind !== 'none', wantTrans, to, track).then(({ roman, trans, byMachine }) => alive && setAlt({ roman, trans, byMachine, wantRoman, wantTrans }));
    return () => {
      alive = false;
    };
  }, [loaded, wantRoman, wantTrans, to, kind]);

  // The lines am-lyrics shows: your timing, then pronunciation and translation, written back onto them.
  const timing = useLyricsTiming(track.videoId);
  const [resyncing, setResyncing] = useState(false);
  useEffect(() => {
    const el = element.current as unknown as { lyrics?: LyricLine[]; showRomanization: boolean; showTranslation: boolean } | null;
    if (!el || !loaded || (!alt && !timing && !(el.lyrics as { __ours?: boolean } | undefined)?.__ours)) return;
    const next = retime(loaded, timing).map((l, i) => ({
      ...l,
      // Keep word-level pronunciation a source already had.
      romanizedText: l.text.some((x) => x.romanizedText) ? l.romanizedText : alt?.roman[i] || l.romanizedText,
      translation: alt?.trans[i] || undefined,
    })) as LyricLine[] & { __ours?: boolean };
    next.__ours = true;
    el.lyrics = next;
    if (alt) {
      el.showRomanization = alt.wantRoman;
      el.showTranslation = alt.wantTrans;
    }
    return markMachineLines(element.current, alt);
  }, [loaded, alt, timing]);

  return (
    <div className="@container/lyrics relative size-full min-h-0">
      {controls && loaded && !resyncing && <LyricsTools kind={kind} onResync={() => setResyncing(true)} resynced={!!timing} />}
      {/* Hidden, not removed, while you resync: it keeps its place and timing. */}
      <div ref={host} className={`size-full min-h-0 ${resyncing ? 'invisible' : ''}`} />
      {resyncing && loaded && <LyricsResync videoId={track.videoId} lines={loaded} onClose={() => setResyncing(false)} />}
    </div>
  );
}

function PlainLyrics({ track, full }: { track: Track; full: boolean }) {
  const { data, isLoading } = useLyricsFallback(track.videoId, true);
  const controls = useLibrary((s) => s.settings.lyricsControls);
  const wantRoman = useLibrary((s) => s.settings.lyricsPronunciation);
  const wantTrans = useLibrary((s) => s.settings.lyricsTranslation);
  const to = useLibrary((s) => s.settings.lyricsTranslateTo) || 'en';
  const lines = useMemo(() => (data?.text ?? '').split('\n'), [data?.text]);
  const kind = useMemo(() => (lines.some((l) => l.trim()) ? pronunciationKind(lines) : null), [lines]);
  const [alt, setAlt] = useState<{ roman: string[]; trans: string[]; byMachine: boolean[] }>({ roman: [], trans: [], byMachine: [] });
  useEffect(() => {
    if (!data?.text) return;
    let alive = true;
    void withAlternates(lines, wantRoman && kind !== 'none', wantTrans, to, track).then((r) => alive && setAlt(r));
    return () => {
      alive = false;
    };
  }, [lines, wantRoman, wantTrans, to, kind, data?.text]);
  // Machine-translated lines among a person's translation: in italics.
  const mixed = alt.byMachine.some(Boolean) && alt.byMachine.some((m, i) => !m && !!alt.trans[i]);
  const scale = useLibrary((s) => s.settings.lyricsScale) || 1;
  const font = useLibrary((s) => s.settings.lyricsFont);
  const align = useLibrary((s) => s.settings.lyricsAlign);
  const mine = useUserLyrics(track.videoId);
  const [syncing, setSyncing] = useState(false);
  if (isLoading) return <div className="grid size-full place-items-center type-body-reduced text-tertiary">Looking for lyrics…</div>;
  if (!data)
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center text-tertiary">
        <MicVocal size={30} strokeWidth={1.5} />
        <span className="type-title-3">No lyrics for this song</span>
      </div>
    );
  const lyricStyle = { fontFamily: LYRIC_FONTS[font]?.family, fontSize: (full ? 28 : 20) * scale, lineHeight: 1.42 };
  if (syncing) return <div className="relative size-full"><SyncYourself videoId={track.videoId} text={lines} onDone={() => setSyncing(false)} /></div>;
  if (mine?.length)
    return (
      <div className={`no-scrollbar size-full overflow-y-auto ${full ? 'pr-4' : 'px-5'} pt-14 pb-24 [mask-image:linear-gradient(180deg,transparent,#000_56px,#000_calc(100%-80px),transparent)]`}>
        <SyncedByYou videoId={track.videoId} lines={mine} style={lyricStyle} center={align === 'center'} onResync={() => setSyncing(true)} />
      </div>
    );
  return (
    <div className="@container/lyrics relative size-full">
      {controls && <LyricsTools kind={kind} />}
    <div className={`no-scrollbar size-full overflow-y-auto ${full ? 'pr-4' : 'px-5'} pt-14 pb-24 [mask-image:linear-gradient(180deg,transparent,#000_56px,#000_calc(100%-80px),transparent)]`}>
      <div
        className={`font-bold text-primary/80 select-text ${align === 'center' ? 'text-center' : ''}`}
        style={{ fontFamily: LYRIC_FONTS[font]?.family, fontSize: (full ? 28 : 20) * scale, lineHeight: 1.42 }}
      >
        {lines.map((line, i) =>
          line.trim() ? (
            <div key={i} className="stagger mb-1" style={{ '--i': i } as CSSProperties}>
              <div>{line}</div>
              {wantRoman && alt.roman[i] && <div className="text-[0.62em] leading-snug font-semibold text-secondary">{alt.roman[i]}</div>}
              {wantTrans && alt.trans[i] && (
                <div className={`mb-2 text-[0.62em] leading-snug font-semibold text-tertiary ${mixed && alt.byMachine[i] ? 'italic opacity-70' : ''}`}>{alt.trans[i]}</div>
              )}
            </div>
          ) : (
            <div key={i} className="h-[0.7em]" />
          ),
        )}
      </div>
      <p className="mt-6 flex flex-wrap items-center gap-3 type-callout text-tertiary">
        {data.source} · not synced
        <button className="flex items-center gap-1 text-key hover:underline" onClick={() => setSyncing(true)}>
          <Timer size={14} /> Sync it yourself
        </button>
      </p>
    </div>
    </div>
  );
}

export function LyricsView({ full = false }: { full?: boolean }) {
  const track = usePlayer((s) => s.queue[s.index]?.track ?? null);
  const [missingFor, setMissingFor] = useState<string | null>(null);
  if (!track)
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 text-tertiary">
        <MicVocal size={30} strokeWidth={1.5} />
        <span className="type-title-3">Play something to see its lyrics</span>
      </div>
    );
  if (missingFor === track.videoId) return <PlainLyrics track={track} full={full} />;
  return <SyncedLyrics key={track.videoId} track={track} full={full} onMissing={() => setMissingFor(track.videoId)} />;
}
