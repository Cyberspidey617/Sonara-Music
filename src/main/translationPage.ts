/*
 * Reading lyricstranslatezone.com's pages: which post is the song's, and its line pairs. Its
 * "Translation" tab sets each line out as the original (in Latin letters) and then its meaning, one
 * paragraph per line. No network here (songTranslation.ts asks the site).
 */

import { wordSound } from '../shared/wordSound';

export interface LinePair {
  original: string;
  english: string;
}

const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

/** Text from a piece of HTML: tags gone, entities read. */
export function htmlText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase words, letters and digits only. */
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** The song's name without its packaging: "Senjudare (From "OM Chapter 1")" → "Senjudare". */
export function songName(title: string): string {
  return title.replace(/\s*[([].*$/, '').replace(/\s+-\s+.*$/, '').trim();
}

/**
 * What to search the site for, best first: the song's name, then (for a name spelled another way
 * than the site's) each of its artists, and its film.
 */
export function searchTerms(title: string, artists: string[], album?: string): string[] {
  const film = title.match(/\bfrom\s+["“']?([^"”')\]]+)/i)?.[1] ?? (album && songName(album));
  const terms = [songName(title), ...artists.map((a) => a.replace(/\s*-\s*Topic$/i, '')).slice(0, 3), film]
    .map((t) => t?.trim() ?? '')
    .filter((t) => t.length > 2);
  return [...new Set(terms.map((t) => t.toLowerCase()))];
}

/** The film or album a title names ("From "OM Chapter 1"" → om, chapter, 1). */
function filmWords(title: string, album?: string): string[] {
  const from = title.match(/\bfrom\s+["“']?([^"”')\]]+)/i)?.[1];
  return [from, album].filter((x): x is string => !!x).flatMap((x) => words(x.replace(/\s*[([].*$/, '')));
}

/**
 * Whether a post's title is the song's translation: "<Song> Lyrics English Translation – <Film> |
 * <Singers>", the song's name first, and one of its artists or its film named. The name is
 * compared by its sound, however it's spelled or split into words (Ada Bomale, Ada Bommale;
 * Kunjintachanoru, Kunjinte Achanoru).
 */
export function postIsSong(postTitle: string, title: string, artists: string[], album?: string): boolean {
  const heading = words(htmlText(postTitle));
  const name = words(songName(title));
  if (!name.length || !heading.includes('translation')) return false;
  const sound = wordSound(name.join(''));
  let after = -1;
  for (let k = 1; k <= heading.length && after < 0; k++) if (wordSound(heading.slice(0, k).join('')) === sound) after = k;
  if (after < 0) return false;
  const credits = new Set([...artists.flatMap((a) => words(a.replace(/\s*-\s*Topic$/i, ''))).filter((w) => w.length > 2), ...filmWords(title, album)]);
  return heading.slice(after).some((w) => credits.has(w));
}

/** The line pairs of a post: its Translation tab when it has one, else the content's two-line paragraphs. */
export function linePairs(html: string): LinePair[] {
  let body = html;
  const titles = [...html.matchAll(/wp-block-ub-tabbed-content-tab-title">([\s\S]*?)<\/div>/g)].map((m) => htmlText(m[1]!).toLowerCase());
  const tabs = html.split(/class="wp-block-ub-tabbed-content-tab-content-wrap/).slice(1);
  const at = titles.findIndex((t) => t.includes('translation') || t.includes('english'));
  if (tabs.length && at >= 0 && tabs[at]) body = tabs[at]!;
  const pairs: LinePair[] = [];
  for (const [, inner] of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const lines = inner!.split(/<br\s*\/?>/i).map(htmlText).filter(Boolean);
    if (lines.length === 2) pairs.push({ original: lines[0]!, english: lines[1]! });
  }
  // A handful of pairs is a page of prose, not a translation.
  return pairs.length >= 4 ? pairs : [];
}
