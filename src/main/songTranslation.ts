/*
 * English lyric translations written by people, for songs a machine translates badly (Tamil, Telugu,
 * Hindi…), from lyricstranslatezone.com through its WordPress search. translationPage.ts reads its
 * pages; this asks the site and remembers the answers.
 */
import { app } from 'electron';
import type { HumanTranslation } from '../shared/types';
import { log } from './log';
import { linePairs, postIsSong, songName } from './translationPage';

const SITE = 'https://lyricstranslatezone.com';
const UA = () => `Sonara/${app.getVersion()} (https://github.com/Cyberspidey617/Sonara-Music)`;
const cache = new Map<string, HumanTranslation | null>();

interface Post {
  link: string;
  title: { rendered: string };
  content: { rendered: string };
}

export async function humanTranslation(title: string, artists: string[], album?: string): Promise<HumanTranslation | null> {
  const name = songName(title);
  const key = `${name}\n${artists.join(',')}\n${album ?? ''}`;
  if (cache.has(key)) return cache.get(key)!;
  let found: HumanTranslation | null = null;
  try {
    if (name) {
      const url = `${SITE}/wp-json/wp/v2/posts?search=${encodeURIComponent(name)}&per_page=6&_fields=link,title,content`;
      const res = await fetch(url, { headers: { 'User-Agent': UA(), Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      const posts = res.ok ? ((await res.json()) as Post[]) : [];
      for (const post of Array.isArray(posts) ? posts : []) {
        if (!postIsSong(post.title.rendered, title, artists, album)) continue;
        const pairs = linePairs(post.content.rendered);
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
