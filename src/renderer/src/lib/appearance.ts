import { useEffect, useState } from 'react';
import type { PageTone, Settings } from '@shared/types';
import { api } from './api';
import { hexToRgb, readableAccent, rgb, tintFor, vibrantColor, type Rgb } from './palette';
import { useLibrary } from '@/state/library';
import { usePlayer } from '@/state/player';

export const ACCENTS: { name: string; hex: string }[] = [
  { name: 'Apple Music Red', hex: '#fa586a' },
  { name: 'Apple Blue', hex: '#0a84ff' },
  { name: 'Amber', hex: '#f0a14a' },
  { name: 'Mint', hex: '#4fd1a5' },
  { name: 'Violet', hex: '#a78bfa' },
  { name: 'Lime', hex: '#a3e635' },
  { name: 'Coral', hex: '#ff7a59' },
  { name: 'Mono', hex: '#f2f2f2' },
];

const TONES: Record<PageTone, { page: Rgb; glass: string; header: string; menu: string; joe: string }> = {
  obsidian: { page: [14, 14, 16], glass: '#1c1c1fb8', header: '#0e0e10cc', menu: '#2a2a2df2', joe: '#2a2a2d' },
  graphite: { page: [31, 31, 31], glass: '#2b2b2db0', header: '#1f1f1fcc', menu: '#333336f2', joe: '#323232' },
  black: { page: [0, 0, 0], glass: '#121214cc', header: '#000000cc', menu: '#1f1f22f2', joe: '#1e1e20' },
  midnight: { page: [11, 15, 28], glass: '#161d33b8', header: '#0b0f1ccc', menu: '#222b45f2', joe: '#212a40' },
  forest: { page: [10, 19, 15], glass: '#15241db8', header: '#0a130fcc', menu: '#203229f2', joe: '#1e2d25' },
  wine: { page: [23, 10, 15], glass: '#28131bb8', header: '#170a0fcc', menu: '#381c27f2', joe: '#321f28' },
  mocha: { page: [23, 17, 13], glass: '#28201ab8', header: '#17110dcc', menu: '#382c24f2', joe: '#32281f' },
};

/** The page themes, in the order Settings shows them. Obsidian is the default. */
export const THEMES: { value: PageTone; label: string; swatch: string }[] = (
  [
    ['obsidian', 'Obsidian'],
    ['graphite', 'Graphite'],
    ['black', 'OLED Black'],
    ['midnight', 'Midnight Blue'],
    ['forest', 'Forest'],
    ['wine', 'Wine'],
    ['mocha', 'Mocha'],
  ] as const
).map(([value, label]) => ({ value, label, swatch: rgb(TONES[value].page) }));

export const LYRIC_FONTS: Record<Settings['lyricsFont'], { label: string; family: string }> = {
  inter: { label: 'Inter', family: "'Inter Variable', 'Inter', system-ui, sans-serif" },
  'dm-sans': { label: 'DM Sans', family: "'DM Sans Variable', 'DM Sans', system-ui, sans-serif" },
  system: { label: 'Segoe UI', family: "'Segoe UI Variable Display', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif" },
  serif: { label: 'Serif', family: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif" },
  rounded: { label: 'Rounded', family: "'Nunito Variable', 'Nunito', system-ui, sans-serif" },
};

/** The colours of the song playing now, read from its artwork (for the dynamic accent, the glow and the waveform). */
export function useArtworkColors(enabled: boolean) {
  const url = usePlayer((s) => s.queue[s.index]?.track.thumbnail);
  const [colors, setColors] = useState<{ accent: Rgb | null; tint: Rgb | null }>({ accent: null, tint: null });
  useEffect(() => {
    if (!enabled || !url) {
      setColors({ accent: null, tint: null });
      return;
    }
    let alive = true;
    void Promise.all([vibrantColor(url).catch(() => null), tintFor(url).catch(() => null)]).then(([accent, tint]) => alive && setColors({ accent, tint }));
    return () => {
      alive = false;
    };
  }, [enabled, url]);
  return colors;
}

/**
 * The stylesheet inputs for a set of appearance settings: theme and accent colours, the
 * sliders and the font. The app puts them on the root; Settings' preview on itself.
 * A missing '--font-family' means the stylesheet's own default (Inter).
 */
export function themeVars(s: Settings, accent: Rgb): Record<string, string> {
  const tone = TONES[s.pageTone] ?? TONES.obsidian;
  const rowHeight = s.rowHeight ?? 56;
  const vars: Record<string, string> = {
    '--keyColor': rgb(accent),
    '--keyColor-rgb': accent.join(' '),
    '--keyColorBG': rgb(accent),
    '--onKeyColor': onAccent(accent),
    '--pageBG': rgb(tone.page),
    '--pageBG-rgb': tone.page.join(' '),
    '--glassMaterialBackground': tone.glass,
    '--headerMaterial': tone.header,
    '--menuBG': tone.menu,
    '--genericJoeColor': tone.joe,
    '--corner-scale': String(s.corners ?? 1),
    '--glass-blur-scale': String(s.glassBlur ?? 1),
    '--row-h': `${rowHeight}px`,
    '--row-art': `${Math.round(rowHeight * 0.72)}px`,
  };
  if (s.uiFont && s.uiFont !== 'inter' && LYRIC_FONTS[s.uiFont]) vars['--font-family'] = LYRIC_FONTS[s.uiFont].family;
  return vars;
}

/** Text on an accent fill: near-black on light accents, so it never turns white on white. */
function onAccent([r, g, b]: Rgb): string {
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? '#111114' : '#ffffff';
}

/** The accent and glow for a set of settings, taking them from the playing artwork when asked to. */
export function useThemeColors(s: Settings) {
  const art = useArtworkColors(s.dynamicAccent || s.ambientGlow);
  const accent = s.dynamicAccent && art.accent ? art.accent : readableAccent(hexToRgb(s.accent));
  return { accent, glow: s.ambientGlow ? art.tint : null };
}

/** Applies the appearance settings to the whole app: colours, density, zoom. */
export function useAppearance() {
  const s = useLibrary((state) => state.settings);
  const { accent, glow } = useThemeColors(s);
  const vars = themeVars(s, accent);
  const key = JSON.stringify(vars);

  useEffect(() => {
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) root.setProperty(name, value);
    if (!vars['--font-family']) root.removeProperty('--font-family');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const data = document.documentElement.dataset;
    data.glass = s.glassStyle ?? 'clear';
    data.sidebar = s.sidebarMode ?? 'compact';
    data.ui = s.uiStyle ?? 'apple';
  }, [s.glassStyle, s.sidebarMode, s.uiStyle]);

  useEffect(() => {
    api.setZoom(s.zoom || 1);
  }, [s.zoom]);

  return { glow, accent, background: s.pageBackground ?? 'plain' };
}
