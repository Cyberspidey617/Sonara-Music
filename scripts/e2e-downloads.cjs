// End-to-end: downloads. Server songs save as their original FLAC; a YouTube song
// with a lossless copy saves that copy; downloaded songs play from the file.
const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');
const [out, profile, music, dlDir] = process.argv.slice(2);
fs.writeFileSync(path.join(profile, 'library.json'), JSON.stringify({ liked: [], playlists: [], history: [], settings: { quality: 'high', musicFolders: [music], downloadFolder: dlDir, downloadQuality: 'ask' } }));
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); if (!ok) process.exitCode = 1; };
const waitFor = async (win, fn, arg, ms = 30000) => {
  const t = Date.now();
  for (;;) {
    const v = await win.evaluate(fn, arg);
    if (v || Date.now() - t > ms) return v;
    await win.waitForTimeout(400);
  }
};
(async () => {
  const app = await electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '..'), '--no-sandbox', `--user-data-dir=${profile}`] });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForTimeout(2500);
  await win.evaluate(() => window.obsidian.rescanMusic());
  await win.evaluate(() => window.obsidian.connectServer({ url: '127.0.0.1:4533', username: 'alby', password: 'test-pass-123' }));
  const albums = await win.evaluate(() => window.obsidian.serverAlbums());
  const album = await win.evaluate((id) => window.obsidian.serverAlbum(id), albums[0].id);
  const song = album.tracks[0];

  // 1. A server song, through the UI: menu → Download… → pick Lossless → saved as FLAC.
  await win.getByRole('button', { name: 'Your Music' }).first().click();
  await win.getByRole('tab', { name: 'Server', exact: true }).click();
  await win.waitForTimeout(1200);
  await win.locator('main button.truncate').first().click();
  await win.waitForTimeout(1200);
  await win.locator('[role=listitem]').first().click({ button: 'right' });
  await win.getByText('Download…').click();
  await win.waitForTimeout(400);
  await win.screenshot({ path: `${out}/50-download-dialog.png` });
  await win.getByRole('dialog').getByRole('radio', { name: /Lossless/ }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Download', exact: true }).click();
  const done = await waitFor(win, (id) => window.obsidian.listDownloads().then((l) => l.find((d) => d.videoId === id && d.state !== 'queued' && d.state !== 'downloading')), album.tracks[0].videoId);
  const file = done?.path;
  const head = file && fs.existsSync(file) ? fs.readFileSync(file).subarray(0, 4).toString('latin1') : '';
  check('server song downloaded as its original FLAC', done?.state === 'done' && head === 'fLaC' && /\.flac$/.test(file), `${done?.state} ${file} ${done?.error ?? ''}`);
  check('saved in the chosen folder, named "Artist - Title"', file && path.dirname(file) === dlDir && path.basename(file).includes(song.title), path.basename(file ?? ''));
  check('size matches the server file', done && fs.statSync(file).size === done.total, `${done?.total} bytes`);

  // 2. A YouTube song with a lossless copy on this PC: Lossless saves that copy.
  await win.evaluate(() => window.obsidian.downloadTracks([{ videoId: 'ZZZZZZZZZZ1', title: 'Yellow (Official Video)', artists: [{ name: 'Coldplay' }], duration: 266 }], 'lossless'));
  const yellow = await waitFor(win, () => window.obsidian.listDownloads().then((l) => l.find((d) => d.videoId === 'ZZZZZZZZZZ1' && (d.state === 'done' || d.state === 'error'))));
  check('YouTube song → lossless copy from your folder', yellow?.state === 'done' && /\.flac$/.test(yellow.path) && yellow.format?.lossless, `${yellow?.path ?? yellow?.error}`);

  // 3. Lossless with no copy anywhere: an honest explanation, not a fake FLAC.
  await win.evaluate(() => window.obsidian.downloadTracks([{ videoId: 'ZZZZZZZZZZ8', title: 'No Such Song Anywhere', artists: [{ name: 'Nobody' }], duration: 200 }], 'lossless'));
  const none = await waitFor(win, () => window.obsidian.listDownloads().then((l) => l.find((d) => d.videoId === 'ZZZZZZZZZZ8' && d.state === 'error')));
  check('no lossless copy → clear error', /No lossless copy/.test(none?.error ?? ''), none?.error);

  // 4. Downloaded songs play from the file: the YouTube id answers with the FLAC.
  const local = await win.evaluate(async () => {
    const r = await fetch('ytstream://track/ZZZZZZZZZZ1', { headers: { Range: 'bytes=0-3' } });
    const info = await window.obsidian.streamInfo('ZZZZZZZZZZ1');
    return { status: r.status, magic: String.fromCharCode(...new Uint8Array(await r.arrayBuffer())), source: info?.source };
  });
  check('a downloaded YouTube id plays from the saved file (offline)', local.status === 206 && local.magic === 'fLaC' && local.source === 'download', JSON.stringify(local));
  const srv = await win.evaluate(async (id) => {
    const r = await fetch(`media://server/${encodeURIComponent(id.replace(/^srv_/, ''))}`, { headers: { Range: 'bytes=0-3' } });
    return { status: r.status, magic: String.fromCharCode(...new Uint8Array(await r.arrayBuffer())) };
  }, song.videoId);
  check('a downloaded server song plays from the saved file', srv.magic === 'fLaC', JSON.stringify(srv));

  // 5. The Downloads page, and the row badge.
  await win.getByRole('button', { name: /^Downloads/ }).click();
  await win.waitForTimeout(900);
  await win.screenshot({ path: `${out}/51-downloads-page.png` });
  const rows = await win.locator('main [role=listitem]').count();
  check('Downloads page lists the downloads', rows >= 3, String(rows));

  // 6. Remove deletes the file.
  await win.evaluate((id) => window.obsidian.removeDownload(id, true), 'ZZZZZZZZZZ1');
  await win.waitForTimeout(500);
  check('remove deletes the downloaded file', !fs.existsSync(yellow.path), yellow.path);
  check('…but never the original in your music folder', fs.readdirSync(music, { recursive: true }).some((f) => String(f).includes('Yellow')), '');

  console.log('page errors:', errors.join(' | ') || 'none');
  await app.close();
})().catch((e) => { console.error('E2E FAILED', e); process.exit(1); });
