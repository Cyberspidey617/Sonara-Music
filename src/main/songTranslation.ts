/*
 * English lyric translations written by people, for songs a machine translates badly (Tamil, Telugu,
 * Hindi…), from lyricstranslatezone.com through its WordPress search. translationPage.ts reads its
 * pages; this asks the site and remembers the answers.
 */
import { app } from 'electron';
import type { HumanTranslation } from '../shared/types';
import { log } from './log';
import { linePairs, postIsSong, searchTerms, songName } from './translationPage';

const SITE = 'https://lyricstranslatezone.com';
const UA = () => `Sonara/${app.getVersion()} (https://github.com/Cyberspidey617/Sonara-Music)`;
const cache = new Map<string, HumanTranslation | null>();

interface Post {
  id: number;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
}

async function ask<T>(query: string): Promise<T | null> {
  const res = await fetch(`${SITE}/wp-json/wp/v2/posts${query}`, { headers: { 'User-Agent': UA(), Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  return res.ok ? ((await res.json()) as T) : null;
}

export async function humanTranslation(title: string, artists: string[], album?: string): Promise<HumanTranslation | null> {
  const key = `${songName(title)}\n${artists.join(',')}\n${album ?? ''}`;
  if (cache.has(key)) return cache.get(key)!;
  let found: HumanTranslation | null = null;
  try {
    // By the song's name first; a name the site spells another way (Ada Bomale, Ada Bommale) is
    // found through its artists or its film. Titles only, then the one post's page.
    const tried = new Set<number>();
    search: for (const term of searchTerms(title, artists, album)) {
      const posts = await ask<Pick<Post, 'id' | 'title'>[]>(`?search=${encodeURIComponent(term)}&per_page=20&_fields=id,title`);
      for (const post of Array.isArray(posts) ? posts : []) {
        if (tried.has(post.id) || !postIsSong(post.title.rendered, title, artists, album)) continue;
        tried.add(post.id);
        const page = await ask<Pick<Post, 'link' | 'content'>>(`/${post.id}?_fields=link,content`);
        const pairs = page ? linePairs(page.content.rendered) : [];
        if (page && pairs.length) {
          found = { pairs, url: page.link, source: 'lyricstranslatezone.com' };
          break search;
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
