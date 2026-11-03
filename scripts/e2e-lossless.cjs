// End-to-end: local library scan, media:// streaming, lossless matching, UI playback of a FLAC.
const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');
const [out, profile, music] = process.argv.slice(2);
fs.writeFileSync(path.join(profile, 'library.json'), JSON.stringify({ liked: [], playlists: [], history: [], settings: { quality: 'lossless', musicFolders: [music] } }));
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); if (!ok) process.exitCode = 1; };
(async () => {
  const app = await electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '..'), '--no-sandbox', `--user-data-dir=${profile}`] });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForTimeout(2500);
  await win.evaluate(() => window.obsidian.rescanMusic());
  const lib = await win.evaluate(() => window.obsidian.localLibrary());
  check('scan found 5 playable files', lib.tracks.length === 5, lib.tracks.map((t) => `${t.title} [${t.format.codec}${t.format.bitDepth ? ' ' + t.format.bitDepth + '-bit' : ''}${t.format.sampleRate ? ' ' + t.format.sampleRate : ''}${t.format.lossless ? ' lossless' : ''}]`).join(' | '));
  const yellow = lib.tracks.find((t) => t.title === 'Yellow');
  const alfaaz = lib.tracks.find((t) => t.title === 'Alfaaz');
  check('tags read (artist, album, duration)', yellow && yellow.artists[0].name === 'Coldplay' && yellow.album.name === 'Parachutes' && Math.abs(yellow.duration - 267) <= 1, JSON.stringify(yellow).slice(0, 220));
  check('hi-res detected', alfaaz && alfaaz.format.bitDepth === 24 && alfaaz.format.sampleRate === 96000, JSON.stringify(alfaaz?.format));
  check('albums grouped', lib.albums.some((a) => a.title === 'Parachutes' && a.trackCount === 2 && a.thumbnail), JSON.stringify(lib.albums.map((a) => [a.title, a.trackCount, !!a.thumbnail])));
  const trouble = lib.tracks.find((t) => t.title === 'Trouble');
  check('folder cover.jpg used when no embedded art', !!trouble?.thumbnail, trouble?.thumbnail);

  const probe = await win.evaluate(async ({ id, art }) => {
    const r = await fetch(`media://local/${id}`, { headers: { Range: 'bytes=0-99' } });
    const bytes = new Uint8Array(await r.arrayBuffer());
    const a = await fetch(art);
    return { status: r.status, len: bytes.length, magic: String.fromCharCode(...bytes.slice(0, 4)), range: r.headers.get('content-range'), type: r.headers.get('content-type'), artType: a.headers.get('content-type'), artStatus: a.status };
  }, { id: yellow.videoId, art: yellow.thumbnail });
  check('media:// serves byte ranges of the FLAC', probe.status === 206 && probe.len === 100 && probe.magic === 'fLaC' && probe.type === 'audio/flac', JSON.stringify(probe));
  check('media:// serves embedded artwork', probe.artStatus === 200 && /image/.test(probe.artType), probe.artType);

  // A YouTube request for the same song comes back as the local FLAC, without touching YouTube.
  const match = await win.evaluate(async () => {
    const r = await fetch('ytstream://track/ZZZZZZZZZZ1?q=lossless&t=' + encodeURIComponent('Yellow (Official Video)') + '&a=Coldplay&d=266', { headers: { Range: 'bytes=0-3' } });
    const b = new Uint8Array(await r.arrayBuffer());
    const info = await window.obsidian.streamInfo('ZZZZZZZZZZ1');
    return { status: r.status, magic: String.fromCharCode(...b), info };
  });
  check('lossless match: YouTube "Yellow (Official Video)" → local FLAC', match.status === 206 && match.magic === 'fLaC' && match.info?.source === 'local', JSON.stringify(match));
  const featured = await win.evaluate(async () => {
    const r = await fetch('ytstream://track/ZZZZZZZZZZ2?q=lossless&t=' + encodeURIComponent('Alfaaz') + '&a=' + encodeURIComponent('Hamza Malik & Zain Zohaib') + '&d=181', { headers: { Range: 'bytes=0-3' } });
    return { status: r.status, magic: String.fromCharCode(...new Uint8Array(await r.arrayBuffer())) };
  });
  check('lossless match with "A & B" artists → 24-bit FLAC', featured.magic === 'fLaC', JSON.stringify(featured));
  const live = await win.evaluate(async () => {
    const r = await fetch('ytstream://track/ZZZZZZZZZZ3?q=lossless&t=' + encodeURIComponent('Yellow (Live in Buenos Aires)') + '&a=Coldplay&d=340', { headers: { Range: 'bytes=0-3' } });
    return { status: r.status };
  });
  check('a live version (other length) is NOT swapped (falls back to YouTube)', live.status !== 206, JSON.stringify(live));
  const lossy = await win.evaluate(async () => {
    const r = await fetch('ytstream://track/ZZZZZZZZZZ4?q=lossless&t=' + encodeURIComponent('Lossy Song') + '&a=Someone&d=200', { headers: { Range: 'bytes=0-3' } });
    return { status: r.status };
  });
  check('an MP3 is never used as a "lossless" copy', lossy.status !== 206, JSON.stringify(lossy));
  const yours = await win.evaluate(() => window.obsidian.searchYourMusic('coldplay'));
  check('search Your Music', yours.length === 2, yours.map((t) => t.title).join(', '));

  // UI: Your Music → play Alfaaz (24-bit FLAC) → badge.
  await win.getByRole('button', { name: 'Your Music' }).click();
  await win.waitForTimeout(800);
  await win.screenshot({ path: `${out}/20-your-music.png` });
  await win.locator('[role=listitem]', { hasText: 'Alfaaz' }).hover();
  await win.click('button[aria-label="Play Alfaaz"]');
  await win.waitForTimeout(3000);
  const state = await win.evaluate(() => ({ text: document.querySelector('[aria-label=Player]')?.textContent }));
  check('local FLAC plays in the UI with a HI-RES badge', /Alfaaz/.test(state.text) && /HI-RES/.test(state.text), state.text);
  const pos = await win.evaluate(async () => { const a = performance.now(); await new Promise((r) => setTimeout(r, 2000)); return document.querySelector('[aria-label=Player]')?.textContent; });
  check('still playing', /HI-RES/.test(pos), '');
  await win.screenshot({ path: `${out}/21-playing-local.png` });
  await win.click('button[aria-label="Open the full-screen player"]');
  await win.waitForTimeout(2000);
  await win.screenshot({ path: `${out}/22-fullscreen-hires.png` });
  await win.keyboard.press('Escape');
  await win.getByRole('tab', { name: 'Albums', exact: true }).click();
  await win.waitForTimeout(600);
  await win.screenshot({ path: `${out}/23-albums.png` });
  console.log('page errors:', errors.join(' | ') || 'none');
  await app.close();
})().catch((e) => { console.error('E2E FAILED', e); process.exit(1); });
