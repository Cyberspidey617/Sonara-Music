/*
 * Runs the YouTube Music normalizers against real captured InnerTube
 * responses (BitChord's web/fixtures, captured anonymously from YouTube
 * Music). No network: every request is answered from those files.
 *
 *   npx esbuild test/fixtures.test.ts --bundle --platform=node --format=esm --outfile=test/out.mjs && node test/out.mjs <fixtures dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { Innertube } from 'youtubei.js';
import { getAlbum, getArtist, getHome, getPlaylist, getUpNext, parsePlaylistId, search, suggest, useInnertubeForTests } from '../src/main/youtube';

const dir = process.argv[2] ?? 'fixtures/innertube';
const load = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');

let searchCount = 0;
async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  const body = request.method === 'POST' ? JSON.parse((await request.text()) || '{}') : {};
  const json = (name: string) => new Response(load(name), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.pathname.endsWith('/browse')) {
    const id: string = body.browseId ?? '';
    if (body.continuation || url.searchParams.get('continuation')) return new Response('{}', { status: 200 });
    if (id === 'FEmusic_home') return json('browse-home.json');
    if (id === 'FEmusic_explore') return json('browse-explore.json');
    if (id.startsWith('MPREb')) return json('browse-album.json');
    if (id.startsWith('UC')) return json('browse-artist.json');
    if (id.startsWith('VL')) return json('browse-playlist.json');
  }
  if (url.pathname.endsWith('/search')) {
    searchCount++;
    return json(body.params ? 'search-songs.json' : 'search-all.json');
  }
  if (url.pathname.endsWith('/get_search_suggestions')) return json('search-suggestions.json');
  if (url.pathname.endsWith('/next')) return json('next-radio.json');
  return new Response('not mocked: ' + url.pathname, { status: 404 });
}

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
}

const yt = await Innertube.create({ fetch: mockFetch as typeof fetch, generate_session_locally: true, retrieve_player: false });
useInnertubeForTests(yt);

const home = await getHome();
check('home has shelves', home.shelves.length >= 3, `${home.shelves.length} shelves: ${home.shelves.map((s) => `${s.title} [${s.layout}:${s.items.length}]`).join(' | ')}`);
const songsShelf = home.shelves.find((s) => s.layout === 'songs');
check('home songs shelves (if any) are playable', !songsShelf || songsShelf.items.every((i) => i.track?.videoId), songsShelf ? `${songsShelf.title}: ${JSON.stringify(songsShelf.items[0]).slice(0, 300)}` : 'none on this page');
const tiles = home.shelves.find((s) => s.layout === 'tiles');
check('home tiles have titles + thumbnails', !!tiles?.items.every((i) => i.title && i.thumbnail && i.id), tiles ? JSON.stringify(tiles.items[0]).slice(0, 300) : 'none');

const results = await search('radiohead let down');
check('search: songs', results.songs.length >= 5, `${results.songs.length} songs; first: ${JSON.stringify(results.songs[0]).slice(0, 300)}`);
check('search: songs have artists + duration', results.songs.slice(0, 5).every((s) => s.artists.length && s.duration), results.songs.slice(0, 5).map((s) => `${s.title}/${s.artists.map((a) => a.name).join(',')}/${s.duration}`).join(' ; '));
check('search: top result', !!results.top, JSON.stringify(results.top).slice(0, 300));
check('search: albums', results.albums.length > 0, JSON.stringify(results.albums[0]).slice(0, 200));
check('search: artists', results.artists.length > 0, JSON.stringify(results.artists[0]).slice(0, 200));
console.log('      playlists:', results.playlists.length, 'videos:', results.videos.length);

const suggestions = await suggest('radioh');
check('suggestions', suggestions.length > 0, suggestions.join(', '));

const album = await getAlbum('MPREb_test');
check('album header', !!album.title && album.artists.length > 0 && !!album.thumbnail, `${album.title} by ${album.artists.map((a) => `${a.name}(${a.id})`).join(', ')} ${album.year} ${album.subtitle}`);
check('album tracks', album.tracks.length >= 5 && album.tracks.every((t) => t.videoId && t.artists.length && t.thumbnail), `${album.tracks.length} tracks; first: ${JSON.stringify(album.tracks[0]).slice(0, 250)}`);
console.log('      album playlistId:', album.playlistId, 'more shelves:', album.more.map((s) => s.title).join(', '));

const artist = await getArtist('UCtest');
check('artist header', !!artist.name && !!artist.thumbnail, `${artist.name} subs=${artist.subscribers} desc=${(artist.description ?? '').slice(0, 60)}`);
check('artist top songs', artist.topSongs.length >= 3, `${artist.topSongs.length}: ${artist.topSongs.slice(0, 3).map((t) => t.title).join(', ')}`);
check('artist shelves', artist.shelves.length >= 2, artist.shelves.map((s) => `${s.title}[${s.items.length}]`).join(' | '));

const playlist = await getPlaylist('VLtest', 1);
check('playlist', !!playlist.title && playlist.tracks.length >= 5, `${playlist.title} by ${playlist.author}; ${playlist.tracks.length} tracks; ${playlist.subtitle}; first: ${JSON.stringify(playlist.tracks[0]).slice(0, 200)}`);

const radio = await getUpNext('abcdefghijk', 'RDAMVMabcdefghijk');
check('up next / radio', radio.length >= 5, `${radio.length}: ${radio.slice(0, 3).map((t) => `${t.title} — ${t.artists.map((a) => a.name).join(', ')} (${t.duration}s)`).join(' ; ')}`);

check('parse playlist URL (music)', parsePlaylistId('https://music.youtube.com/playlist?list=PLabc123_-x') === 'PLabc123_-x');
check('parse playlist URL (youtube watch)', parsePlaylistId('https://www.youtube.com/watch?v=xyz&list=PLq1w2e3') === 'PLq1w2e3');
check('parse bare id', parsePlaylistId('OLAK5uy_abc') === 'OLAK5uy_abc');
check('reject junk', parsePlaylistId('hello world') === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
