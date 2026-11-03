import { useEffect, useState } from 'react';
import type { PageTone, Settings } from '@shared/types';
import { api } from './api';
import { hexToRgb, readableAccent, rgb, tintFor, vibrantColor, type Rgb } from './palette';
import { useLibrary } from '@/state/library';
import { usePlayer } from '@/state/player';

export const ACCENTS: { name: string; hex: string }[] = [
  { name: 'Apple Music Red', hex: '#fa586a' },
  { name: 'Apple Blue', hex: '#0a84ff' },
  { name: 'Obsidian Amber', hex: '#f0a14a' },
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
};

export const LYRIC_FONTS: Record<Settings['lyricsFont'], { label: string; family: string }> = {
  inter: { label: 'Inter', family: "'Inter Variable', 'Inter', system-ui, sans-serif" },
  'dm-sans': { label: 'DM Sans', family: "'DM Sans Variable', 'DM Sans', system-ui, sans-serif" },
  system: { label: 'Segoe UI', family: "'Segoe UI Variable Display', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif" },
  serif: { label: 'Serif', family: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif" },
  rounded: { label: 'Rounded', family: "'Nunito Variable', 'Nunito', system-ui, sans-serif" },
};

/** The colours of the song playing now, read from its artwork (for the dynamic accent and the glow). */
function useArtworkColors(enabled: boolean) {
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

/** Applies the appearance settings to the whole app: colours, density, zoom. */
export function useAppearance() {
  const s = useLibrary((state) => state.settings);
  const art = useArtworkColors(s.dynamicAccent || s.ambientGlow);
  const accent = s.dynamicAccent && art.accent ? art.accent : readableAccent(hexToRgb(s.accent));

  useEffect(() => {
    const root = document.documentElement.style;
    const tone = TONES[s.pageTone] ?? TONES.obsidian;
    const [r, g, b] = accent;
    root.setProperty('--keyColor', rgb(accent));
    root.setProperty('--keyColor-rgb', `${r} ${g} ${b}`);
    root.setProperty('--keyColorBG', rgb(accent));
    root.setProperty('--pageBG', rgb(tone.page));
    root.setProperty('--pageBG-rgb', tone.page.join(' '));
    root.setProperty('--glassMaterialBackground', tone.glass);
    root.setProperty('--headerMaterial', tone.header);
    root.setProperty('--menuBG', tone.menu);
    root.setProperty('--genericJoeColor', tone.joe);
  }, [accent[0], accent[1], accent[2], s.pageTone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.dataset.density = s.compact ? 'compact' : 'comfortable';
  }, [s.compact]);

  useEffect(() => {
    document.documentElement.dataset.glass = s.glassStyle ?? 'clear';
    document.documentElement.dataset.sidebar = s.sidebarMode ?? 'compact';
  }, [s.glassStyle, s.sidebarMode]);

  useEffect(() => {
    api.setZoom(s.zoom || 1);
  }, [s.zoom]);

  return { glow: s.ambientGlow ? art.tint : null };
}
