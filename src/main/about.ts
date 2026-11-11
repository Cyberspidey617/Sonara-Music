/*
 * About this song (Echo Music's "Music DNA"): the song's story from Wikipedia, or, when it has no
 * article of its own, its artist's. An article counts as the song's only if its title is the song's
 * and it names the artist, so a same-titled film or a cover's article isn't shown.
 */
import { app } from 'electron';
import type { SongAbout } from '../shared/types';
import { normalizeTitle } from './lossless';

const UA = () => `Sonara/${app.getVersion()} (https://github.com/Cyberspidey617/Sonara-Music)`;
const cache = new Map<string, SongAbout | null>();

interface Summary {
  title: string;
  description?: string;
  extract?: string;
  type?: string;
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

async function wiki<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA(), Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
}

const summary = (title: string) => wiki<Summary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);

async function searchTitles(query: string): Promise<string[]> {
  const res = await wiki<{ query?: { search?: { title: string }[] } }>(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=6&srsearch=${encodeURIComponent(query)}`,
  );
  return res?.query?.search?.map((r) => r.title) ?? [];
}

const toAbout = (s: Summary, kind: SongAbout['kind']): SongAbout => ({
  kind,
  title: s.title,
  ...(s.description && { description: s.description }),
  text: s.extract ?? '',
  ...(s.thumbnail?.source && { image: s.thumbnail.source }),
  url: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, '_'))}`,
});

export async function aboutSong(title: string, artist: string): Promise<SongAbout | null> {
  const key = `${title}\n${artist}`;
  if (cache.has(key)) return cache.get(key)!;
  const song = normalizeTitle(title);
  const name = artist.replace(/\s*-\s*Topic$/i, '').trim();
  const mentions = (s: Summary) => {
    const text = `${s.description ?? ''} ${s.extract ?? ''}`.toLowerCase();
    return name.toLowerCase().split(/\s*(?:,|&|\band\b)\s*/).some((a) => a.length > 1 && text.includes(a));
  };
  let found: SongAbout | null = null;
  if (song && name) {
    for (const t of await searchTitles(`${song} ${name} song`)) {
      const base = normalizeTitle(t.replace(/\s*\([^)]*\)\s*$/, ''));
      if (base !== song) continue;
      const s = await summary(t);
      if (s && s.type !== 'disambiguation' && s.extract && mentions(s)) {
        found = toAbout(s, 'song');
        break;
      }
    }
  }
  if (!found && name) {
    for (const t of await searchTitles(`${name} musician`)) {
      if (normalizeTitle(t.replace(/\s*\([^)]*\)\s*$/, '')) !== normalizeTitle(name)) continue;
      const s = await summary(t);
      if (s && s.type !== 'disambiguation' && s.extract && /sing|music|band|rapper|composer|songwriter|producer|musician|artist|group|duo/i.test(`${s.description ?? ''} ${s.extract}`)) {
        found = toAbout(s, 'artist');
        break;
      }
    }
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, found);
  return found;
}
