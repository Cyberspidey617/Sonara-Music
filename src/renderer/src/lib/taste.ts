// Your music taste (the first-run picker, Settings › Playback): the languages, kinds of songs and
// artists you like, and the Home shelves made from them.
import { isYouTubeId, type ArtistRef, type ListeningProfile, type Lockup, type Shelf, type Taste, type Track } from "@shared/types";
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

/** What shapes recommendations besides your picks: your listening, and what you've told Sonara. */
export interface TasteSignals {
  profile: ListeningProfile | null;
  notInterested: string[];
  notInterestedArtists: ArtistRef[];
  tasteExcluded: string[];
  notes: string[];
}

/** Whether a song may be recommended: not one you said no to, nor by an artist you said no to. */
export function recommendable(track: Track, signals: Pick<TasteSignals, "notInterested" | "notInterestedArtists">): boolean {
  if (signals.notInterested.includes(track.videoId)) return false;
  const no = signals.notInterestedArtists;
  return !track.artists.some((a) => no.some((n) => (n.id && a.id ? n.id === a.id : n.name.toLowerCase() === a.name.toLowerCase())));
}

/** The time of day, for the daylist: its name and the kind of songs it suits. */
export function daypart(hour = new Date().getHours()): { name: string; mood: string } {
  if (hour < 5) return { name: "late night", mood: "late night chill" };
  if (hour < 12) return { name: "morning", mood: "morning fresh feel good" };
  if (hour < 17) return { name: "afternoon", mood: "upbeat" };
  if (hour < 21) return { name: "evening", mood: "evening chill" };
  return { name: "night", mood: "night soft melody" };
}

/** YouTube Music's radio for a song: songs like it. */
async function radioFor(videoId: string): Promise<Track[]> {
  return api.upNext(videoId, `RDAMVM${videoId}`).catch(() => [] as Track[]);
}

/**
 * Home's "Made for you". Once you've listened a while it learns from that: what you have on repeat,
 * your most played artists, and new songs like your favourites (YouTube Music's radio for them,
 * leaving out what you already play). Your picks (languages, kinds, artists) and your notes fill in
 * around it, and a daylist suits the time of day. Nothing you said you're not interested in shows up.
 */
export async function madeForYou(taste: Taste, signals: TasteSignals): Promise<Shelf[]> {
  const ok = (t: Track) => recommendable(t, signals);
  const excluded = new Set(signals.tasteExcluded);
  const listened = (signals.profile?.songs ?? []).filter((s) => !excluded.has(s.track.videoId) && ok(s.track));
  const learned = listened.reduce((n, s) => n + s.plays, 0) >= 10;
  const played = new Set(listened.map((s) => s.track.videoId));
  const shelves: Shelf[] = [];
  const add = (title: string, tracks: Track[], min = 4) => {
    const seen = new Set<string>();
    const list = tracks.filter((t) => ok(t) && !seen.has(t.videoId) && (seen.add(t.videoId), true)).slice(0, 15);
    if (list.length >= min) shelves.push(songShelf(title, list));
  };

  // From your listening.
  const recent = Date.now() - 30 * 86_400_000;
  const onRepeat = listened.filter((s) => s.plays >= 2 && s.lastAt >= recent).map((s) => s.track);
  const favourites = listened.filter((s) => isYouTubeId(s.track.videoId)).slice(0, 3);
  // The artists you play most (those with a page), unless their listens were all excluded.
  const counted = new Map<string, number>();
  for (const s of listened) for (const a of s.track.artists) if (a.id) counted.set(a.id, (counted.get(a.id) ?? 0) + s.plays);
  const topArtists = [...counted.entries()].sort((a, b) => b[1] - a[1]).slice(0, learned ? 3 : 0).map(([id]) => id);
  const picked = taste.artists.filter((a) => !topArtists.includes(a.id)).slice(0, learned ? 2 : 4);
  const mixPicks = mixes(taste, learned ? 2 : 4);
  const part = daypart();
  const dayQuery = `${taste.languages[0] ? `${taste.languages[0]} ` : ""}${part.mood} songs`;

  const [radios, listenedArtists, pickedArtists, mixPages, notePages, daylist] = await Promise.all([
    learned ? Promise.all(favourites.map((s) => radioFor(s.track.videoId))) : Promise.resolve([] as Track[][]),
    Promise.all(topArtists.map((id) => api.artist(id).catch(() => null))),
    Promise.all(picked.map((a) => api.artist(a.id).catch(() => null))),
    Promise.all(mixPicks.map((m) => api.search(m.query).catch(() => null))),
    Promise.all(signals.notes.slice(0, 3).map((n) => api.search(n).catch(() => null))),
    taste.languages.length || learned ? api.search(dayQuery).catch(() => null) : Promise.resolve(null),
  ]);

  if (learned) {
    // New for you: the radios of your favourites, taken in turn, without songs you already play.
    const fresh: Track[] = [];
    for (let i = 0; i < 40; i++) for (const radio of radios) if (radio[i + 1] && !played.has(radio[i + 1]!.videoId)) fresh.push(radio[i + 1]!);
    add("New for you", fresh, 5);
    add("On repeat", onRepeat, 4);
  }
  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });
  if (daylist) add(`Your ${weekday} ${part.name}`, daylist.songs.filter((t) => !played.has(t.videoId) || Math.random() < 0.3), 5);
  listenedArtists.forEach((page) => page && add(`Because you listen to ${page.name}`, page.topSongs, 3));
  notePages.forEach((page, i) => page && add(`More of: ${signals.notes[i]}`, page.songs, 4));
  mixPicks.forEach((m, i) => add(m.title, mixPages[i]?.songs ?? [], 4));
  pickedArtists.forEach((page, i) => page && add(`Because you like ${page.name ?? picked[i]!.name}`, page.topSongs, 3));

  // Playlists for your picks and notes, as tiles.
  const playlists: Lockup[] = [];
  const seen = new Set<string>();
  for (const page of [...mixPages, ...notePages])
    for (const p of page?.playlists.slice(0, 4) ?? []) if (!seen.has(p.id)) (seen.add(p.id), playlists.push(p));
  if (playlists.length >= 3) shelves.push({ title: "Playlists for you", layout: "tiles", items: playlists.slice(0, 12) });
  return shelves;
}

/**
 * Songs for a playlist, like the ones in it: YouTube Music's radio for a few of its songs, without
 * the ones already in it or ones you said no to.
 */
export async function recommendForPlaylist(tracks: Track[], signals: Pick<TasteSignals, "notInterested" | "notInterestedArtists">): Promise<Track[]> {
  const ids = tracks.map((t) => t.videoId).filter(isYouTubeId);
  if (!ids.length) return [];
  // Seeds from across the playlist, so a long one isn't judged by its first songs.
  const seeds = [...new Set([ids[ids.length - 1]!, ids[0]!, ids[Math.floor(ids.length / 2)]!])].slice(0, 3);
  const radios = await Promise.all(seeds.map(radioFor));
  const have = new Set(ids);
  const out: Track[] = [];
  for (let i = 1; i < 40 && out.length < 20; i++)
    for (const radio of radios) {
      const t = radio[i];
      if (t && !have.has(t.videoId) && recommendable(t, signals)) {
        have.add(t.videoId);
        out.push(t);
      }
    }
  return out;
}
