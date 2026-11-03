// Writes the normalizers' output for the captured fixtures to the renderer's mock data.
import fs from 'node:fs';
import path from 'node:path';
import { Innertube } from 'youtubei.js';
import { getAlbum, getArtist, getHome, getPlaylist, getUpNext, search, suggest, useInnertubeForTests } from '../src/main/youtube';

const dir = process.argv[2]!;
const out = process.argv[3]!;
const load = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');
async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  const body = request.method === 'POST' ? JSON.parse((await request.text()) || '{}') : {};
  const json = (name: string) => new Response(load(name), { status: 200 });
  if (url.pathname.endsWith('/browse')) {
    const id: string = body.browseId ?? '';
    if (body.continuation) return new Response('{}');
    if (id === 'FEmusic_home') return json('browse-home.json');
    if (id === 'FEmusic_explore') return json('browse-explore.json');
    if (id.startsWith('MPREb')) return json('browse-album.json');
    if (id.startsWith('UC')) return json('browse-artist.json');
    if (id.startsWith('VL')) return json('browse-playlist.json');
  }
  if (url.pathname.endsWith('/search')) return json(body.params ? 'search-songs.json' : 'search-all.json');
  if (url.pathname.endsWith('/get_search_suggestions')) return json('search-suggestions.json');
  if (url.pathname.endsWith('/next')) return json('next-radio.json');
  return new Response('{}', { status: 404 });
}
const yt = await Innertube.create({ fetch: mockFetch as typeof fetch, generate_session_locally: true, retrieve_player: false });
useInnertubeForTests(yt);
const data = {
  home: await getHome(),
  search: await search('radiohead'),
  suggest: await suggest('radioh'),
  album: await getAlbum('MPREb_mock'),
  artist: await getArtist('UCmock'),
  playlist: await getPlaylist('VLmock', 1),
  radio: await getUpNext('abcdefghijk', 'RDAMVMabcdefghijk'),
};
fs.writeFileSync(out, JSON.stringify(data));
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0), 'KB');
