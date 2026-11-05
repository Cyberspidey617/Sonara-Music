// Your music taste (the first-run picker, Settings › Playback): the languages, kinds of songs and
// artists you like, and the Home shelves made from them.
import type { Lockup, Shelf, Taste, Track } from "@shared/types";
import { api } from "./api";

export const LANGUAGES = [
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Malayalam",
  "Kannada",
  "Punjabi",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Spanish",
  "Portuguese",
  "French",
  "Arabic",
  "Korean",
  "Japanese",
] as const;

/** Kinds of songs, each with the words that find it on YouTube Music. */
export const GENRES: { label: string; query: string }[] = [
  { label: "Pop", query: "pop" },
  { label: "Hip-Hop & Rap", query: "hip hop rap" },
  { label: "Romantic", query: "romantic love" },
  { label: "Party", query: "party dance" },
  { label: "Chill & Lo-fi", query: "lofi chill" },
  { label: "Sad", query: "sad" },
  { label: "Rock", query: "rock" },
  { label: "Indie", query: "indie" },
  { label: "Electronic", query: "electronic edm" },
  { label: "R&B & Soul", query: "r&b soul" },
  { label: "Devotional", query: "devotional" },
  { label: "Classical", query: "classical" },
  { label: "Jazz", query: "jazz" },
  { label: "Folk", query: "folk" },
  { label: "Metal", query: "metal" },
  { label: "Workout", query: "workout" },
  { label: "Retro & 90s", query: "90s retro" },
  { label: "K-Pop", query: "k-pop" },
];

export const EMPTY_TASTE: Taste = { languages: [], genres: [], artists: [] };

const genreQuery = (label: string) =>
  GENRES.find((g) => g.label === label)?.query ?? label.toLowerCase();

/**
 * Language and genre pairs to suggest from, most specific first: each language with each genre,
 * then each on its own. Capped, so a long list of picks still means a handful of searches.
 */
function mixes(
  taste: Taste,
  limit: number,
): { title: string; query: string }[] {
  const out: { title: string; query: string }[] = [];
  for (const language of taste.languages)
    for (const genre of taste.genres)
      out.push({
        title: `${language} ${genre}`,
        query: `${language} ${genreQuery(genre)} songs`,
      });
  if (!taste.genres.length)
    for (const language of taste.languages)
      out.push({
        title: `Top ${language} songs`,
        query: `top ${language} songs`,
      });
  if (!taste.languages.length)
    for (const genre of taste.genres)
      out.push({ title: genre, query: `${genreQuery(genre)} songs` });
  return out.slice(0, limit);
}

/** Artists to offer in the picker's last step, from the languages and kinds of songs chosen. */
export async function suggestArtists(taste: Taste): Promise<Lockup[]> {
  const queries = mixes(taste, 4).map((m) =>
    m.query.replace(/ songs$/, " artists"),
  );
  if (!queries.length) queries.push("top artists", "popular singers");
  const pages = await Promise.all(
    queries.map((q) => api.search(q).catch(() => null)),
  );
  const seen = new Set<string>();
  const artists: Lockup[] = [];
  // Round-robin, so every pick is represented near the top.
  for (let i = 0; i < 12; i++) {
    for (const page of pages) {
      const a = page?.artists[i];
      if (a && !seen.has(a.id)) {
        seen.add(a.id);
        artists.push(a);
      }
    }
  }
  return artists.slice(0, 24);
}

const songShelf = (title: string, tracks: Track[]): Shelf => ({
  title,
  layout: "songs",
  items: tracks.map((t) => ({
    kind: "song",
    id: t.videoId,
    title: t.title,
    subtitle: t.artists.map((a) => a.name).join(", "),
    thumbnail: t.thumbnail,
    track: t,
  })),
});

/** Home's "Made for you": songs in your languages and kinds, your artists' top songs, and playlists. */
export async function madeForYou(taste: Taste): Promise<Shelf[]> {
  const picks = mixes(taste, 4);
  const [mixPages, artistPages] = await Promise.all([
    Promise.all(picks.map((m) => api.search(m.query).catch(() => null))),
    Promise.all(
      taste.artists.slice(0, 4).map((a) => api.artist(a.id).catch(() => null)),
    ),
  ]);
  const shelves: Shelf[] = [];
  picks.forEach((m, i) => {
    const songs = mixPages[i]?.songs.slice(0, 12) ?? [];
    if (songs.length >= 4) shelves.push(songShelf(m.title, songs));
  });
  artistPages.forEach((page, i) => {
    const songs = page?.topSongs.slice(0, 12) ?? [];
    if (songs.length >= 3)
      shelves.push(
        songShelf(
          `Because you like ${page?.name ?? taste.artists[i]!.name}`,
          songs,
        ),
      );
  });
  // Playlists for your picks, as tiles.
  const playlists: Lockup[] = [];
  const seen = new Set<string>();
  for (const page of mixPages)
    for (const p of page?.playlists.slice(0, 4) ?? [])
      if (!seen.has(p.id)) (seen.add(p.id), playlists.push(p));
  if (playlists.length >= 3)
    shelves.push({
      title: "Playlists for you",
      layout: "tiles",
      items: playlists.slice(0, 12),
    });
  return shelves;
}
