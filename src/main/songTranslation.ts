/*
 * English lyric translations written by people, for songs a machine translates badly (Tamil, Telugu,
 * Hindi…), from lyricstranslatezone.com through its WordPress search. Its "Translation" tab sets each
 * line out as the original (in Latin letters) and then its meaning, one paragraph per line. A post
 * counts as the song's only when its title names the song and one of its artists or its film.
 */
import { app } from 'electron';
import type { HumanTranslation } from '../shared/types';
import { log } from './log';

const SITE = 'https://lyricstranslatezone.com';
const UA = () => `Sonara/${app.getVersion()} (https://github.com/Cyberspidey617/Sonara-Music)`;
const cache = new Map<string, HumanTranslation | null>();

interface Post {
  link: string;
  title: { rendered: string };
  content: { rendered: string };
}

const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
/** Text from a piece of HTML: tags gone, entities read. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase words, letters and digits only. */
const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The song's name without its packaging: "Senjudare (From "OM Chapter 1")" → "Senjudare". */
function songName(title: string): string {
  return title.replace(/\s*[([].*$/, '').replace(/\s+-\s+.*$/, '').trim();
}

/** The film or album a title names ("From "OM Chapter 1"" → OM Chapter 1). */
function filmOf(title: string, album?: string): string[] {
  const from = title.match(/\bfrom\s+["“']?([^"”')\]]+)/i)?.[1];
  return [from, album].filter((x): x is string => !!x).flatMap((x) => words(x.replace(/\s*[([].*$/, '')));
}

/** The line pairs of a post: its Translation tab when it has one, else the content's two-line paragraphs. */
function pairsOf(html: string): { original: string; english: string }[] {
  let body = html;
  const titles = [...html.matchAll(/wp-block-ub-tabbed-content-tab-title">([\s\S]*?)<\/div>/g)].map((m) => text(m[1]!).toLowerCase());
  const tabs = html.split(/class="wp-block-ub-tabbed-content-tab-content-wrap/).slice(1);
  const at = titles.findIndex((t) => t.includes('translation') || t.includes('english'));
  if (tabs.length && at >= 0 && tabs[at]) body = tabs[at]!;
  const pairs: { original: string; english: string }[] = [];
  for (const [, inner] of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const lines = inner!.split(/<br\s*\/?>/i).map(text).filter(Boolean);
    if (lines.length === 2) pairs.push({ original: lines[0]!, english: lines[1]! });
  }
  // A handful of pairs is a page of prose, not a translation.
  return pairs.length >= 4 ? pairs : [];
}

export async function humanTranslation(title: string, artists: string[], album?: string): Promise<HumanTranslation | null> {
  const name = songName(title);
  const key = `${name}\n${artists.join(',')}\n${album ?? ''}`;
  if (cache.has(key)) return cache.get(key)!;
  let found: HumanTranslation | null = null;
  try {
    const nameWords = words(name);
    const credits = new Set([...artists.flatMap((a) => words(a.replace(/\s*-\s*Topic$/i, ''))).filter((w) => w.length > 2), ...filmOf(title, album)]);
    if (nameWords.length) {
      const url = `${SITE}/wp-json/wp/v2/posts?search=${encodeURIComponent(name)}&per_page=6&_fields=link,title,content`;
      const res = await fetch(url, { headers: { 'User-Agent': UA(), Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      const posts = res.ok ? ((await res.json()) as Post[]) : [];
      for (const post of Array.isArray(posts) ? posts : []) {
        const heading = words(text(post.title.rendered));
        // "<Song> Lyrics English Translation – <Film> | <Singers>": the song's words in order at the start.
        const named = nameWords.every((w, i) => heading[i] === w);
        if (!named || !heading.includes('translation') || !heading.some((w) => credits.has(w))) continue;
        const pairs = pairsOf(post.content.rendered);
        if (pairs.length) {
          found = { pairs, url: post.link, source: 'lyricstranslatezone.com' };
          break;
        }
      }
    }
  } catch (e) {
    log.warn(`lyric translation lookup failed: ${e instanceof Error ? e.message : e}`);
    return null; // Not remembered: tried again next time.
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, found);
  return found;
}
