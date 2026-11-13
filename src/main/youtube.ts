/*
 * YouTube Music, through YouTube.js (InnerTube). Everything that leaves the
 * app for YouTube goes from here, in the main process, so the renderer never
 * deals with CORS, cookies or YouTube's headers.
 *
 * The normalizers turn YouTube.js's parsed nodes into the plain JSON shapes in
 * shared/types.ts. They are defensive on purpose: YouTube changes its
 * responses often, and a missing field should drop one item, not a page.
 */
import { matchScore, queriesFor } from './videoMatch';
import { pairedVideo } from './account';
import vm from 'node:vm';
import { Innertube, Platform, UniversalCache, YTNodes, type Types } from 'youtubei.js';
import type {
  Suggestions,
  AlbumPage,
  ArtistPage,
  ArtistRef,
  HomeFeed,
  ImportResult,
  Lockup,
  LockupKind,
  Lyrics,
  PlaylistPage,
  SearchResults,
  Shelf,
  Track,
  Moods,
} from '../shared/types';
import { isYouTubeId } from '../shared/types';
import { log } from './log';

// ---- The player-script evaluator ------------------------------------------------

/*
 * YouTube.js extracts the signature and `n` functions from YouTube's player
 * script and asks the host to run them (YouTube.js 18.3: the script defines
 * `process(n, sp, s)`). They run in a fresh V8 context with only the
 * builtins they need, not with this process's globals.
 */
function evaluate(data: Types.BuildScriptResult, env: Record<string, Types.VMPrimative>) {
  const args = [env.n ?? '', env.sp ?? '', env.sig ?? ''].map((v) => JSON.stringify(String(v))).join(', ');
  const code = `${data.output}\n;process(${args});`;
  try {
    const sandbox = {
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      atob,
      btoa,
      encodeURIComponent,
      decodeURIComponent,
      console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    };
    return vm.runInNewContext(code, sandbox, { timeout: 5000 });
  } catch (error) {
    // The documented approach, should the extracted script need something the
    // sandbox above doesn't offer.
    log.warn(`player script failed in the sandbox (${String(error)}); retrying unsandboxed`);
    return new Function(`${data.output}\nreturn process(${args});`)();
  }
}

Platform.shim.eval = evaluate as typeof Platform.shim.eval;

// ---- The session ------------------------------------------------------------------

let instance: Promise<Innertube> | null = null;
let cacheDir: string | undefined;
let location: string | undefined;
let language = 'en';

export function configureYouTube(options: { cacheDir: string; location?: string; language?: string }) {
  cacheDir = options.cacheDir;
  location = options.location;
  if (options.language) language = options.language;
}

export function getInnertube(): Promise<Innertube> {
  instance ??= (async () => {
    const started = Date.now();
    const yt = await Innertube.create({
      // Through the main process's fetch, which follows the proxy setting.
      fetch: (input, init) => globalThis.fetch(input, init),
      cache: new UniversalCache(true, cacheDir),
      retrieve_player: true,
      lang: language,
      ...(location && { location }),
    });
    log.info(
      `InnerTube ready in ${Date.now() - started}ms (player ${yt.session.player?.player_id ?? 'none'}, gl=${yt.session.context.client.gl})`,
    );
    return yt;
  })().catch((error: unknown) => {
    instance = null;
    log.error(`InnerTube failed to start: ${String(error)}`);
    throw error;
  });
  return instance;
}

/** Drops the session so the next call builds a fresh one (after repeated stream failures). */
export function resetInnertube() {
  instance = null;
}

/** Tests replace the session with one that answers from captured responses. */
export function useInnertubeForTests(yt: Innertube) {
  instance = Promise.resolve(yt);
}

// ---- Small helpers ----------------------------------------------------------------

type AnyNode = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function text(value: AnyNode): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function') {
    const s = value.toString();
    // YouTube.js renders an empty Text as "N/A".
    return s === '[object Object]' || s === 'N/A' ? '' : s;
  }
  return '';
}

/** The largest image in a thumbnail list, whichever shape YouTube.js gave it. */
export function bestThumbnail(value: AnyNode): string | undefined {
  if (!value) return undefined;
  const list: AnyNode[] = Array.isArray(value)
    ? value
    : Array.isArray(value.contents)
      ? value.contents
      : Array.isArray(value.thumbnails)
        ? value.thumbnails
        : value.thumbnail
          ? bestThumbnailList(value.thumbnail)
          : [];
  let best: AnyNode = null;
  for (const t of list) {
    if (!t?.url) continue;
    if (!best || (t.width ?? 0) > (best.width ?? 0)) best = t;
  }
  return best?.url ? normalizeUrl(best.url) : undefined;
}

function bestThumbnailList(value: AnyNode): AnyNode[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.contents)) return value.contents;
  return [];
}

function normalizeUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url;
}

function isExplicit(badges: AnyNode): boolean {
  if (!badges) return false;
  const list = Array.isArray(badges) ? badges : [];
  return list.some((b: AnyNode) => b?.icon_type === 'MUSIC_EXPLICIT_BADGE' || /explicit/i.test(text(b?.label)));
}

/** Words YouTube puts in the artist column that aren't artists. */
const NOT_AN_ARTIST = /^(song|video|single|ep|album|episode|podcast|playlist|profile|artist)$|\b(plays|views|subscribers|monthly audience)$/i;

function artistsOf(list: AnyNode): ArtistRef[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a?.name && !NOT_AN_ARTIST.test(String(a.name).trim()))
    .map((a) => ({ name: String(a.name), ...(a.channel_id && { id: String(a.channel_id) }) }));
}

/** Seconds from "3:45" or "1:02:03". */
function parseDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parts = value.split(':').map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return undefined;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function kindFromBrowseId(id: string | undefined, pageType?: string): LockupKind | null {
  if (pageType) {
    if (pageType.includes('ARTIST') || pageType.includes('USER_CHANNEL')) return 'artist';
    if (pageType.includes('ALBUM')) return 'album';
    if (pageType.includes('PLAYLIST')) return 'playlist';
  }
  if (!id) return null;
  if (id.startsWith('UC')) return 'artist';
  if (id.startsWith('MPREb')) return 'album';
  if (id.startsWith('VL') || id.startsWith('PL') || id.startsWith('RD') || id.startsWith('OLAK')) return 'playlist';
  return null;
}

function endpointTarget(endpoint: AnyNode): { videoId?: string; browseId?: string; playlistId?: string; pageType?: string } {
  const payload = endpoint?.payload ?? {};
  return {
    videoId: payload.videoId,
    browseId: payload.browseId,
    playlistId: payload.playlistId,
    pageType: payload.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType,
  };
}

// ---- Normalizers ------------------------------------------------------------------

/** A song or video row (search results, playlists, album tracks, Quick picks). */
export function trackFromListItem(item: AnyNode, fallback?: Partial<Track>): Track | null {
  const videoId: string | undefined =
    (item?.item_type === 'song' || item?.item_type === 'video' || item?.item_type === 'non_music_track' ? item.id : undefined) ??
    item?.overlay?.content?.endpoint?.payload?.videoId ??
    endpointTarget(item?.endpoint).videoId ??
    item?.playlist_item_data?.video_id;
  if (!videoId || !item?.title) return null;
  const artists = artistsOf(item.artists ?? item.authors);
  const thumb = bestThumbnail(item.thumbnail) ?? bestThumbnail(item.thumbnails);
  const track: Track = {
    videoId,
    title: String(item.title),
    artists: artists.length ? artists : (fallback?.artists ?? []),
  };
  const album = item.album?.name ? { name: String(item.album.name), ...(item.album.id && { id: String(item.album.id) }) } : fallback?.album;
  if (album) track.album = album;
  const duration = item.duration?.seconds || parseDuration(item.duration?.text) || fallback?.duration;
  if (duration) track.duration = duration;
  const thumbnail = thumb ?? fallback?.thumbnail;
  if (thumbnail) track.thumbnail = thumbnail;
  if (isExplicit(item.badges)) track.explicit = true;
  if (item.item_type === 'video') track.isVideo = true;
  // Rows without artist links still carry the names in their second column.
  if (!track.artists.length && Array.isArray(item.flex_columns) && item.flex_columns[1]) {
    const runs = item.flex_columns[1].title?.runs ?? [];
    const names = runs
      .map((r: AnyNode) => String(r.text).trim())
      .filter((t: string) => t && !/^[•&,]$/.test(t) && !NOT_AN_ARTIST.test(t) && !/^\d+:\d{2}/.test(t));
    if (names[0]) track.artists = [{ name: names[0] }];
  }
  return track;
}

/** A two-row tile (album, playlist, artist, song) from a carousel. */
export function lockupFromTwoRow(item: AnyNode): Lockup | null {
  const target = endpointTarget(item?.endpoint);
  const title = text(item?.title);
  if (!title) return null;
  const thumbnail = bestThumbnail(item.thumbnail);
  const subtitle = text(item.subtitle) || undefined;
  const type: string = item.item_type ?? '';
  if (target.videoId && (type === 'song' || type === 'video' || type === 'unknown' || !target.browseId)) {
    const kind: LockupKind = type === 'video' ? 'video' : 'song';
    const artists = artistsOf(item.artists);
    const track: Track = { videoId: target.videoId, title, artists, ...(thumbnail && { thumbnail }) };
    if (!artists.length && item.author?.name) track.artists = [{ name: String(item.author.name), ...(item.author.channel_id && { id: item.author.channel_id }) }];
    if (!track.artists.length && subtitle) track.artists = [{ name: subtitle.split(' • ').filter((s) => !/^(Song|Video|Single|EP)$/i.test(s))[0] ?? subtitle }];
    if (kind === 'video') track.isVideo = true;
    if (isExplicit(item.badges)) track.explicit = true;
    return { kind, id: target.videoId, title, subtitle, thumbnail, track };
  }
  const kind = kindFromBrowseId(target.browseId, target.pageType) ?? (type === 'album' ? 'album' : type === 'artist' ? 'artist' : type === 'playlist' ? 'playlist' : null);
  const id = target.browseId ?? item.id;
  if (!kind || !id) return null;
  return { kind, id, title, subtitle, thumbnail };
}

/** A list row that's an album, artist or playlist (search results). */
function lockupFromListItem(item: AnyNode): Lockup | null {
  const target = endpointTarget(item?.endpoint);
  const type: string = item?.item_type ?? '';
  if (type === 'song' || type === 'video') {
    const track = trackFromListItem(item);
    return track ? { kind: track.isVideo ? 'video' : 'song', id: track.videoId, title: track.title, subtitle: track.artists.map((a) => a.name).join(', '), thumbnail: track.thumbnail, track } : null;
  }
  const kind = kindFromBrowseId(target.browseId ?? item?.id, target.pageType) ?? (type === 'library_artist' ? 'artist' : (type as LockupKind));
  const id = target.browseId ?? item?.id;
  const title = text(item?.title ?? item?.name) || text(item?.flex_columns?.[0]?.title);
  if (!id || !title || !['album', 'artist', 'playlist'].includes(kind)) return null;
  const subtitle = text(item?.flex_columns?.[1]?.title) || item?.subscribers || undefined;
  return { kind, id, title, subtitle, thumbnail: bestThumbnail(item.thumbnail) ?? bestThumbnail(item.thumbnails) };
}

function shelfFromCarousel(shelf: AnyNode): Shelf | null {
  const title = text(shelf?.header?.title);
  const contents: AnyNode[] = Array.isArray(shelf?.contents) ? shelf.contents : [];
  if (!contents.length) return null;
  const listRows = contents.filter((c) => c?.type === 'MusicResponsiveListItem');
  if (listRows.length >= contents.length / 2) {
    const items = listRows
      .map((row) => {
        const track = trackFromListItem(row);
        if (track) return { kind: (track.isVideo ? 'video' : 'song') as LockupKind, id: track.videoId, title: track.title, subtitle: track.artists.map((a) => a.name).join(', '), thumbnail: track.thumbnail, track };
        return lockupFromListItem(row);
      })
      .filter((l): l is Lockup => l !== null);
    return items.length ? { title: title || 'Songs', layout: 'songs', items } : null;
  }
  const items = contents
    .filter((c) => c?.type === 'MusicTwoRowItem')
    .map(lockupFromTwoRow)
    .filter((l): l is Lockup => l !== null);
  return items.length ? { title, layout: 'tiles', items } : null;
}

// ---- Pages ------------------------------------------------------------------------

export async function getHome(): Promise<HomeFeed> {
  const yt = await getInnertube();
  let feed = await yt.music.getHomeFeed();
  const shelves: Shelf[] = [];
  const collect = (sections: AnyNode[] | undefined) => {
    for (const section of sections ?? []) {
      if (section?.type !== 'MusicCarouselShelf') continue;
      const shelf = shelfFromCarousel(section);
      if (shelf) shelves.push(shelf);
    }
  };
  collect(feed.sections as AnyNode[]);
  // The first page holds a handful of shelves; two more fill the screen.
  for (let i = 0; i < 2 && feed.has_continuation; i++) {
    try {
      feed = await feed.getContinuation();
      collect(feed.sections as AnyNode[]);
    } catch {
      break;
    }
  }
  // Signed out, Home can be thin: Explore's new releases and charts fill it in.
  if (shelves.length < 6) {
    try {
      const explore = await yt.music.getExplore();
      const titles = new Set(shelves.map((s) => s.title));
      for (const section of (explore.sections ?? []) as AnyNode[]) {
        if (section?.type !== 'MusicCarouselShelf') continue;
        const shelf = shelfFromCarousel(section);
        if (shelf && !titles.has(shelf.title)) shelves.push(shelf);
      }
    } catch (error) {
      log.warn(`explore failed: ${String(error)}`);
    }
  }
  return { shelves };
}

/**
 * Every result row in a search response. YouTube Music used to group results
 * into one shelf per type; since 2026 the unfiltered search is a flat list of
 * single-row item sections. Both shapes are read.
 */
function searchRows(contents: AnyNode[] | undefined): AnyNode[] {
  const rows: AnyNode[] = [];
  for (const section of contents ?? []) {
    if (section?.type === 'MusicShelf' || section?.type === 'ItemSection') {
      for (const row of section.contents ?? []) if (row?.type === 'MusicResponsiveListItem') rows.push(row);
    }
  }
  return rows;
}

/** Podcast episodes and shows, and user profiles, aren't music. */
function isNotMusic(row: AnyNode): boolean {
  const subtitle = text(row?.flex_columns?.[1]?.title);
  if (/^(Episode|Podcast|Profile)\b/.test(subtitle)) return true;
  if (row?.item_type === 'podcast_show' || row?.item_type === 'non_music_track') return true;
  const pageType = endpointTarget(row?.endpoint).pageType ?? '';
  return pageType.includes('USER_CHANNEL') || pageType.includes('PODCAST');
}

function sortRow(row: AnyNode, result: SearchResults, seen: Set<string>, fallback?: Partial<Track>) {
  if (isNotMusic(row)) return;
  const type: string = row.item_type ?? '';
  if (type === 'song' || type === 'video') {
    const track = trackFromListItem(row, fallback);
    if (!track || seen.has(track.videoId)) return;
    seen.add(track.videoId);
    if (type === 'video' || track.isVideo) result.videos.push({ ...track, isVideo: true });
    else result.songs.push(track);
    return;
  }
  const lockup = lockupFromListItem(row);
  if (!lockup || seen.has(lockup.id)) return;
  seen.add(lockup.id);
  if (lockup.kind === 'album') result.albums.push(lockup);
  else if (lockup.kind === 'artist') result.artists.push(lockup);
  else if (lockup.kind === 'playlist') result.playlists.push(lockup);
}

export async function search(query: string): Promise<SearchResults> {
  const yt = await getInnertube();
  const [all, songs, albums, artists] = await Promise.all([
    yt.music.search(query),
    yt.music.search(query, { type: 'song' }).catch(() => null),
    yt.music.search(query, { type: 'album' }).catch(() => null),
    yt.music.search(query, { type: 'artist' }).catch(() => null),
  ]);
  const result: SearchResults = { query, songs: [], videos: [], albums: [], artists: [], playlists: [] };
  const corrected = all.did_you_mean?.corrected_query ?? (all as AnyNode).showing_results_for?.corrected_query;
  if (corrected) result.correctedQuery = text(corrected);
  const seen = new Set<string>();

  // The top result card, and the rows that come with it.
  // Songs under an artist's card leave the artist out: it's the card's.
  for (const card of ((all.contents ?? []) as AnyNode[]).filter((s) => s?.type === 'MusicCardShelf')) {
    const target = endpointTarget(card.on_tap ?? card.title?.endpoint);
    const fallback: Partial<Track> | undefined =
      kindFromBrowseId(target.browseId, target.pageType) === 'artist' ? { artists: [{ name: text(card.title), ...(target.browseId && { id: target.browseId }) }] } : undefined;
    for (const row of card.contents ?? []) if (row?.type === 'MusicResponsiveListItem') sortRow(row, result, seen, fallback);
  }
  // The filtered searches first: they're longer and better ordered.
  for (const page of [songs, albums, artists]) {
    for (const row of searchRows(page?.contents as AnyNode[])) sortRow(row, result, seen);
  }
  for (const row of searchRows(all.contents as AnyNode[])) sortRow(row, result, seen);

  for (const section of (all.contents ?? []) as AnyNode[]) {
    if (section?.type === 'MusicCardShelf') {
      const target = endpointTarget(section.on_tap ?? section.title?.endpoint);
      const title = text(section.title);
      const thumbnail = bestThumbnail(section.thumbnail);
      const subtitle = text(section.subtitle);
      if (target.videoId) {
        const runs: AnyNode[] = section.subtitle?.runs ?? [];
        const artists: ArtistRef[] = runs
          .filter((r) => r?.endpoint?.payload?.browseId?.startsWith?.('UC'))
          .map((r) => ({ name: String(r.text), id: r.endpoint.payload.browseId }));
        const isVideo = /^video/i.test(subtitle);
        const track: Track = { videoId: target.videoId, title, artists: artists.length ? artists : [{ name: subtitle.split(' • ')[1] ?? subtitle }], ...(thumbnail && { thumbnail }), ...(isVideo && { isVideo }) };
        const durationRun = runs.map((r) => String(r.text)).find((t) => /^\d+:\d{2}(:\d{2})?$/.test(t));
        const duration = parseDuration(durationRun);
        if (duration) track.duration = duration;
        result.top = { kind: isVideo ? 'video' : 'song', id: target.videoId, title, subtitle, thumbnail, track };
      } else {
        const kind = kindFromBrowseId(target.browseId, target.pageType);
        if (kind && target.browseId) {
          result.top = { kind, id: target.browseId, title, subtitle, thumbnail };
          if (kind === 'artist' && !result.artists.some((a) => a.id === target.browseId)) result.artists.unshift(result.top);
        }
      }
    }
  }
  return result;
}

/** As you type: words to search for, and the songs, artists and albums they most likely mean. */
export async function suggest(query: string): Promise<Suggestions> {
  if (!query.trim()) return { queries: [], items: [] };
  const yt = await getInnertube();
  const sections = await yt.music.getSearchSuggestions(query);
  const out: Suggestions = { queries: [], items: [] };
  for (const section of sections as AnyNode[]) {
    for (const item of section.contents ?? []) {
      if (item?.type === 'SearchSuggestion') {
        const s = text(item.suggestion);
        if (s) out.queries.push(s);
      } else if (item?.type === 'MusicResponsiveListItem' && !isNotMusic(item)) {
        const lockup = lockupFromListItem(item);
        if (!lockup) continue;
        // The row's own line ("Song • Coldplay • 2.4B plays") says more than the artist alone.
        const line = text(item.flex_columns?.[1]?.title);
        out.items.push(line ? { ...lockup, subtitle: line } : lockup);
      }
    }
  }
  return { queries: out.queries.slice(0, 6), items: out.items.slice(0, 5) };
}

export async function getAlbum(id: string): Promise<AlbumPage> {
  const yt = await getInnertube();
  const album = await yt.music.getAlbum(id);
  const header: AnyNode = album.header;
  const title = text(header?.title);
  const thumbnail = bestThumbnail(header?.thumbnail) ?? bestThumbnail(header?.thumbnails) ?? bestThumbnail(album.background);
  // The artist line: MusicResponsiveHeader's strapline, or the older header's author.
  const strapRuns: AnyNode[] = header?.strapline_text_one?.runs ?? [];
  let artists: ArtistRef[] = strapRuns
    .filter((r) => r?.text && r.text.trim() && !/^[,&•]$/.test(r.text.trim()))
    .map((r) => ({ name: String(r.text), ...(r.endpoint?.payload?.browseId && { id: r.endpoint.payload.browseId }) }));
  if (!artists.length && header?.author?.name) artists = [{ name: header.author.name, ...(header.author.channel_id && { id: header.author.channel_id }) }];
  const subtitle = text(header?.subtitle);
  const year = subtitle.match(/\b(19|20)\d{2}\b/)?.[0] ?? header?.year;
  const description = text(header?.description?.description ?? header?.description) || undefined;
  const fallback: Partial<Track> = { artists, album: { name: title, id }, ...(thumbnail && { thumbnail }) };
  const tracks = ((album.contents ?? []) as AnyNode[]).map((row) => trackFromListItem(row, fallback)).filter((t): t is Track => t !== null);
  for (const t of tracks) {
    if (!t.album) t.album = { name: title, id };
    if (!t.thumbnail && thumbnail) t.thumbnail = thumbnail;
  }
  const playlistId = album.url?.match(/[?&]list=([^&]+)/)?.[1];
  const more = ((album.sections ?? []) as AnyNode[]).map(shelfFromCarousel).filter((s): s is Shelf => s !== null);
  return { id, title, artists, subtitle, year, description, thumbnail, tracks, playlistId, more };
}

export async function getArtist(id: string): Promise<ArtistPage> {
  const yt = await getInnertube();
  const artist = await yt.music.getArtist(id);
  const header: AnyNode = artist.header;
  const name = text(header?.title);
  const thumbnail = bestThumbnail(header?.thumbnail) ?? bestThumbnail(header?.foreground_thumbnail);
  const description = text(header?.description) || undefined;
  const subscribers = text(header?.subscription_button?.subscriber_count) || undefined;
  const topSongs: Track[] = [];
  const shelves: Shelf[] = [];
  for (const section of (artist.sections ?? []) as AnyNode[]) {
    if (section?.type === 'MusicShelf') {
      const fallback: Partial<Track> = { artists: [{ name, id }] };
      topSongs.push(...((section.contents ?? []) as AnyNode[]).map((r) => trackFromListItem(r, fallback)).filter((t): t is Track => t !== null));
    } else if (section?.type === 'MusicCarouselShelf') {
      const shelf = shelfFromCarousel(section);
      if (shelf) shelves.push(shelf);
    }
  }
  return { id, name, description, thumbnail, subscribers, topSongs, shelves };
}

export async function getPlaylist(id: string, maxPages = 3): Promise<PlaylistPage> {
  const yt = await getInnertube();
  let playlist = await yt.music.getPlaylist(id);
  const header: AnyNode = (playlist.header as AnyNode)?.header ?? playlist.header;
  const title = text(header?.title);
  const thumbnail = bestThumbnail(header?.thumbnail) ?? bestThumbnail(header?.thumbnails) ?? bestThumbnail(playlist.background);
  const author = text(header?.strapline_text_one) || header?.author?.name || undefined;
  const subtitle = [text(header?.subtitle), text(header?.second_subtitle)].filter(Boolean).join(' • ') || undefined;
  const description = text(header?.description?.description ?? header?.description) || undefined;
  const tracks: Track[] = [];
  const take = (items: AnyNode[] | undefined) => {
    for (const row of items ?? []) {
      if (row?.type !== 'MusicResponsiveListItem') continue;
      const t = trackFromListItem(row);
      if (t) tracks.push(t);
    }
  };
  take(playlist.items as AnyNode[]);
  for (let page = 1; page < maxPages && playlist.has_continuation; page++) {
    try {
      playlist = await playlist.getContinuation();
      take(playlist.items as AnyNode[]);
    } catch (error) {
      log.warn(`playlist ${id}: continuation ${page} failed: ${String(error)}`);
      break;
    }
  }
  return { id, title, author, subtitle, description, thumbnail, tracks };
}

function trackFromPanel(item: AnyNode): Track | null {
  const video = item?.type === 'PlaylistPanelVideoWrapper' ? item.primary : item;
  if (!video || video.type !== 'PlaylistPanelVideo' || !video.video_id) return null;
  const artists = artistsOf(video.artists);
  const track: Track = {
    videoId: video.video_id,
    title: text(video.title),
    artists: artists.length ? artists : video.author ? [{ name: String(video.author) }] : [],
  };
  if (video.album?.name) track.album = { name: video.album.name, ...(video.album.id && { id: video.album.id }) };
  if (video.duration?.seconds) track.duration = video.duration.seconds;
  const thumb = bestThumbnail(video.thumbnail);
  if (thumb) track.thumbnail = thumb;
  if (isExplicit(video.badges)) track.explicit = true;
  return track.title ? track : null;
}

/** The radio that follows a track: what YouTube Music queues up after it. */
export async function getUpNext(videoId: string, playlistId?: string): Promise<Track[]> {
  const yt = await getInnertube();
  if (playlistId) {
    const response = await yt.actions.execute('/next', { videoId, playlistId, client: 'YTMUSIC', parse: true, isAudioOnly: true } as AnyNode);
    const panel = (response as AnyNode).contents_memo?.getType(YTNodes.PlaylistPanel)?.[0];
    if (panel) return (panel.contents as AnyNode[]).map(trackFromPanel).filter((t): t is Track => t !== null);
  }
  const panel = await yt.music.getUpNext(videoId, true);
  return ((panel?.contents ?? []) as AnyNode[]).map(trackFromPanel).filter((t): t is Track => t !== null);
}

export async function getLyrics(videoId: string): Promise<Lyrics | null> {
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const yt = await getInnertube();
  try {
    const shelf = await yt.music.getLyrics(videoId);
    const body = text(shelf?.description);
    if (!body.trim()) return null;
    return { text: body, source: text(shelf?.footer) || 'YouTube Music' };
  } catch {
    return null;
  }
}

export async function getTrack(videoId: string): Promise<Track | null> {
  const yt = await getInnertube();
  const info = await yt.music.getInfo(videoId);
  const basic: AnyNode = info.basic_info;
  if (!basic?.title) return null;
  const track: Track = {
    videoId,
    title: String(basic.title),
    artists: basic.author ? [{ name: String(basic.author).replace(/ - Topic$/, ''), ...(basic.channel_id && { id: basic.channel_id }) }] : [],
  };
  if (basic.duration) track.duration = basic.duration;
  const thumb = bestThumbnail(basic.thumbnail);
  if (thumb) track.thumbnail = thumb;
  return track;
}

/** Finds the playlist id in a YouTube or YouTube Music URL, or takes a bare id. */
export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const list = url.searchParams.get('list');
    if (list) return list;
    const browse = url.pathname.match(/\/browse\/(VL[\w-]+|MPREb_[\w-]+)/)?.[1];
    if (browse) return browse;
  } catch {
    /* not a URL */
  }
  if (/^(VL|PL|OLAK5uy_|RD|LM|UU|FL|MPREb_)[\w-]+$/.test(trimmed)) return trimmed;
  return null;
}

/** Every track of a YouTube / YouTube Music playlist, following continuations (500+ tracks). */
export async function importPlaylist(input: string): Promise<ImportResult> {
  const id = parsePlaylistId(input);
  if (!id) throw new Error('That doesn’t look like a YouTube playlist link.');
  if (id.startsWith('MPREb_')) {
    const album = await getAlbum(id);
    return { title: album.title, tracks: album.tracks, thumbnail: album.thumbnail };
  }
  if (id.startsWith('RD')) {
    // Mixes aren't browsable; they're watch queues.
    const yt = await getInnertube();
    const response = await yt.actions.execute('/next', { playlistId: id, client: 'YTMUSIC', parse: true } as AnyNode);
    const panel = (response as AnyNode).contents_memo?.getType(YTNodes.PlaylistPanel)?.[0];
    const tracks = ((panel?.contents ?? []) as AnyNode[]).map(trackFromPanel).filter((t): t is Track => t !== null);
    if (!tracks.length) throw new Error('This mix couldn’t be read.');
    return { title: text(panel?.title) || 'Imported mix', tracks };
  }
  try {
    const page = await getPlaylist(id.startsWith('VL') ? id : `VL${id}`, 100);
    if (page.tracks.length) return { title: page.title || 'Imported playlist', tracks: page.tracks, thumbnail: page.thumbnail };
  } catch (error) {
    log.warn(`music playlist import failed for ${id}: ${String(error)}; trying the YouTube playlist`);
  }
  // Plain YouTube playlists that YouTube Music won't browse.
  const yt = await getInnertube();
  let playlist: AnyNode = await yt.getPlaylist(id.replace(/^VL/, ''));
  const tracks: Track[] = [];
  const take = (videos: AnyNode[]) => {
    for (const v of videos ?? []) {
      if (!v?.id || !v?.title) continue;
      tracks.push({
        videoId: v.id,
        title: text(v.title),
        artists: v.author?.name ? [{ name: String(v.author.name).replace(/ - Topic$/, ''), ...(v.author.id && { id: v.author.id }) }] : [],
        ...(v.duration?.seconds && { duration: v.duration.seconds }),
        ...(bestThumbnail(v.thumbnails) && { thumbnail: bestThumbnail(v.thumbnails) }),
      });
    }
  };
  take(playlist.videos);
  for (let i = 0; i < 100 && playlist.has_continuation; i++) {
    playlist = await playlist.getContinuation();
    take(playlist.videos);
  }
  if (!tracks.length) throw new Error('That playlist is empty or private.');
  return { title: text(playlist.info?.title) || 'Imported playlist', tracks, thumbnail: bestThumbnail(playlist.info?.thumbnails) };
}

/** For comparing titles and names: lower case, no accents, punctuation or extras like "(Remastered)". */
function comparable(value: string, keepBrackets = false): string {
  let s = value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  if (!keepBrackets) s = s.replace(/\s[-–]\s.*$/, '').replace(/[([][^)\]]*[)\]]/g, ' ');
  return s.replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** How much of `a`'s words `b` has, and the other way round (0–1). */
function overlap(a: string, b: string): number {
  const x = new Set(a.split(' ').filter(Boolean));
  const y = new Set(b.split(' ').filter(Boolean));
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const word of x) if (y.has(word)) shared++;
  return (shared / x.size + shared / y.size) / 2;
}

/** Live, karaoke or cover versions that a plain studio title isn't asking for. */
const VERSION = /\b(live|karaoke|instrumental|cover|remix|sped up|slowed|reverb|8d|nightcore|acoustic)\b/;

/**
 * The YouTube Music song that best matches a song from elsewhere (a Spotify import): by title,
 * artist and length. None when nothing is close enough, rather than a wrong song.
 */
export async function matchSong(title: string, artists: string[], seconds?: number): Promise<Track | null> {
  const yt = await getInnertube();
  const wanted = comparable(title);
  const wantedFull = comparable(title, true);
  const names = artists.map((a) => comparable(a)).filter(Boolean);
  const score = (track: Track) => {
    const got = comparable(track.title);
    const titleScore = Math.max(overlap(wanted, got), overlap(wantedFull, comparable(track.title, true)));
    const byline = comparable(track.artists.map((a) => a.name).join(' '));
    const artistScore = names.length ? Math.max(...names.map((n) => (byline.includes(n) || n.includes(byline) ? 1 : overlap(n, byline)))) : 0.5;
    let lengthScore = 0.5;
    if (seconds && track.duration) {
      const off = Math.abs(track.duration - seconds);
      lengthScore = off <= 3 ? 1 : off <= 8 ? 0.8 : off <= 20 ? 0.4 : 0;
    }
    // A version the title doesn't ask for (a live take for a studio song) loses out.
    const unasked = VERSION.test(comparable(track.title, true)) && !VERSION.test(wantedFull) ? 0.25 : 0;
    return titleScore * 0.5 + artistScore * 0.3 + lengthScore * 0.2 - unasked;
  };
  let best: { track: Track; score: number } | null = null;
  for (const type of ['song', 'video'] as const) {
    const results = await yt.music.search(`${title} ${artists[0] ?? ''}`.trim(), { type });
    for (const row of searchRows(results.contents as AnyNode[]).slice(0, 6)) {
      const track = trackFromListItem(row);
      if (!track) continue;
      const s = score(track) - (type === 'video' ? 0.05 : 0); // songs (the studio audio) first
      if (!best || s > best.score) best = { track, score: s };
    }
    if (best && best.score >= 0.75) break; // a clear song match: no need to look at videos
  }
  return best && best.score >= 0.55 ? best.track : null;
}

/** The YouTube Music song for a title and artist (radio after a local or server song). */
export async function findOnYouTube(title: string, artist: string): Promise<string | null> {
  const yt = await getInnertube();
  const results = await yt.music.search(`${title} ${artist}`.trim(), { type: 'song' });
  for (const row of searchRows(results.contents as AnyNode[])) {
    const track = trackFromListItem(row);
    if (track) return track.videoId;
  }
  return null;
}

/** Not a music video: a lyric video, the audio on a still picture, a fan edit, a clip. */
const NOT_A_VIDEO = /\b(lyrics?|lyrical|audio|visuali[sz]er|jukebox|bass boosted|lofi|tutorial|status|whatsapp|shorts?|teaser|trailer|eclipsa|8d|reaction|making of|subs?|subtitles?|subbed|translations?|traduction|tradução|traducida|letra|legendado)\b|แปล|中字|歌詞/;

export interface FoundVideo {
  videoId: string;
  /** As long as the song (within 3 s), so it plays in time with it. */
  synced: boolean;
  title: string;
  channel: string;
  /** From YouTube Music's own Song/Video pairing: song-time → video-time stretches, when it gave them. */
  timeMap?: { from: number; to: number; length: number }[];
}

const musicVideos = new Map<string, FoundVideo | null>();
/** Forget what was found (after signing in or out, the answers change). */
export const clearMusicVideos = () => musicVideos.clear();

/** Narrower than this (width / height) is a cover held still, not a picture worth showing. */
const MIN_VIDEO_ASPECT = 1.2;
/** Whether a video's picture is a real video, judged by the shape of its largest frame. */
async function realPicture(yt: Innertube, videoId: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info: any = await yt.getBasicInfo(videoId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (info.streaming_data?.adaptive_formats ?? []).filter((f: any) => f.has_video && f.width && f.height);
    if (!frames.length) return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const biggest = frames.reduce((a: any, b: any) => (b.height > a.height ? b : a));
    return biggest.width / biggest.height >= MIN_VIDEO_ASPECT;
  } catch {
    return true;
  }
}

/**
 * A song's music video. First YouTube Music's own Song/Video pairing (when you're signed in: the
 * switch its app shows, with how the two line up); otherwise its Videos results, judged strictly
 * (the same title, take and artist, a length within 90 s, a real picture). Never a lyric video or the
 * audio on a still picture. Nothing is better than the wrong video.
 */
export async function findMusicVideo(track: { videoId: string; title: string; artists: string[]; duration?: number; isVideo?: boolean; album?: string; explicit?: boolean }): Promise<FoundVideo | null> {
  if (track.isVideo) return { videoId: track.videoId, synced: true, title: track.title, channel: track.artists[0] ?? '' };
  if (musicVideos.has(track.videoId)) return musicVideos.get(track.videoId)!;
  const remember = (found: FoundVideo | null) => {
    if (musicVideos.size > 300) musicVideos.clear();
    musicVideos.set(track.videoId, found);
    log.info(`[${track.videoId}] music video: ${found ? `${found.videoId} (${found.timeMap ? 'paired by YouTube Music' : found.synced ? 'in time' : 'may not be in time'}, ${found.channel})` : 'none'}`);
    return found;
  };

  // 1. YouTube Music's own pairing (signed in only: it pairs nothing for a signed-out request).
  const paired = isYouTubeId(track.videoId) ? await pairedVideo(track.videoId, track.duration).catch(() => null) : null;
  if (paired) return remember(paired);

  // A song from a search suggestion comes without its length: ask for it.
  const duration = track.duration ?? (isYouTubeId(track.videoId) ? (await getTrack(track.videoId).catch(() => null))?.duration : undefined);
  const yt = await getInnertube();
  const target = { title: track.title, artists: track.artists, ...(duration && { duration }), ...(track.album && { album: track.album }), ...(track.explicit !== undefined && { explicit: track.explicit }) };
  const seen = new Set<string>();
  const official: { score: number; video: Track }[] = [];

  const judge = async (query: string) => {
    const results = await yt.music.search(query, { type: 'video' }).catch(() => null);
    if (!results) return;
    for (const row of searchRows(results.contents as AnyNode[]).slice(0, 10)) {
      const video = trackFromListItem(row);
      if (!video || seen.has(video.videoId) || video.videoId === track.videoId) continue;
      const title = video.title.toLowerCase();
      if (NOT_A_VIDEO.test(title)) continue;
      seen.add(video.videoId);
      // Some rows come without their credit or length: the video's own details have them.
      if ((!video.artists.length || !video.duration) && matchScore({ title: video.title, artists: track.artists }, { title: track.title, artists: track.artists }) !== null) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const info: any = await yt.getBasicInfo(video.videoId);
          const author = String(info.basic_info?.author ?? '').replace(/\s*-\s*Topic$/i, '');
          if (!video.artists.length && author) video.artists = [{ name: author }];
          if (!video.duration && Number(info.basic_info?.duration)) video.duration = Number(info.basic_info.duration);
        } catch {
          // Judged on what the row says.
        }
      }
      const score = matchScore({ title: video.title, artists: video.artists.map((a) => a.name), ...(video.duration && { duration: video.duration }), ...(video.explicit !== undefined && { explicit: video.explicit }), ...(video.album?.name && { album: video.album.name }) }, target);
      if (score !== null) official.push({ score, video });
    }
  };

  // 2. YouTube Music's Videos results.
  for (const query of queriesFor(target)) {
    await judge(query);
    // A sure match from the first search needs no second.
    if (official.some((o) => o.score >= 150)) break;
  }
  const pick = async (list: { score: number; video: Track }[]) => {
    // Best first; a still picture (a cover held still) is passed over for the next.
    for (const { video } of list.sort((a, b) => b.score - a.score).slice(0, 6)) if (await realPicture(yt, video.videoId)) return video;
    return null;
  };
  let video = await pick(official);
  // 3. Not in YouTube Music's Videos: YouTube's own search, judged the same way (the artist's channel
  // or a trusted label's, never anyone else's upload).
  if (!video) {
    const more: { score: number; video: Track }[] = [];
    // Judged afresh, by its channel this time (YouTube Music may have listed it with other credits).
    const judged = new Set<string>();
    const [first] = queriesFor(target);
    // The film or album too: labels title their uploads "Song - Film | Video Song".
    const albumWord = track.album ? track.album.replace(/\s*\(.*$/, '').trim() : '';
    const queries = [...new Set([...queriesFor(target).slice(0, 2), ...(first && albumWord ? [`${first} ${albumWord} video song`] : [])])];
    for (const query of queries) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any = await yt.search(query, { type: 'video' }).catch(() => null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const v of ((results?.videos ?? []) as any[]).slice(0, 12)) {
        const id = String(v.id ?? v.video_id ?? '');
        const title = String(v.title?.text ?? v.title ?? '');
        const channel = String(v.author?.name ?? '').replace(/\s*-\s*Topic$/i, '');
        const seconds = Number(v.duration?.seconds) || undefined;
        if (!id || !title || !channel || judged.has(id) || id === track.videoId || NOT_A_VIDEO.test(title.toLowerCase())) continue;
        judged.add(id);
        const score = matchScore({ title, artists: [channel], ...(seconds && { duration: seconds }) }, target);
        if (score !== null) more.push({ score, video: { videoId: id, title, artists: [{ name: channel }], ...(seconds && { duration: seconds }) } });
      }
    }
    video = await pick(more);
  }
  return remember(
    video
      ? {
          videoId: video.videoId,
          synced: !!(duration && video.duration && Math.abs(video.duration - duration) <= 3),
          title: video.title,
          channel: video.artists.map((a) => a.name).join(', '),
        }
      : null,
  );
}

/** YouTube Music's Moods & genres: its sections (Moods & moments, Genres), each a list of buttons. */
export async function getMoods(): Promise<Moods> {
  const yt = await getInnertube();
  const raw = (await yt.actions.execute('/browse', { browseId: 'FEmusic_moods_and_genres', client: 'YTMUSIC' } as AnyNode)) as { data?: unknown };
  const grids: AnyNode[] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === 'gridRenderer') grids.push(v as AnyNode);
      else walk(v);
    }
  };
  walk(raw.data);
  const argb = (n: unknown) => {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? `#${(v & 0xffffff).toString(16).padStart(6, '0')}` : undefined;
  };
  return {
    sections: grids
      .map((g) => ({
        title: String(g.header?.gridHeaderRenderer?.title?.runs?.[0]?.text ?? ''),
        items: ((g.items ?? []) as AnyNode[])
          .map((i) => i.musicNavigationButtonRenderer)
          .filter((b) => b?.clickCommand?.browseEndpoint?.params)
          .map((b) => ({ title: String(b.buttonText?.runs?.[0]?.text ?? ''), params: String(b.clickCommand.browseEndpoint.params), ...(argb(b.solid?.leftStripeColor) && { color: argb(b.solid?.leftStripeColor) }) })),
      }))
      .filter((s) => s.title && s.items.length),
  };
}

/** One mood or genre: its shelves of playlists (and sometimes songs and albums). */
export async function getMood(params: string): Promise<Shelf[]> {
  if (!/^[\w-]+=*$/.test(params)) return [];
  const yt = await getInnertube();
  const response = (await yt.actions.execute('/browse', { browseId: 'FEmusic_moods_and_genres_category', params, client: 'YTMUSIC', parse: true } as AnyNode)) as AnyNode;
  const shelves: Shelf[] = [];
  for (const section of (response.contents_memo?.getType(YTNodes.MusicCarouselShelf) ?? []) as AnyNode[]) {
    const shelf = shelfFromCarousel(section);
    if (shelf) shelves.push(shelf);
  }
  return shelves;
}
