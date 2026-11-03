// End-to-end: audio quality is untouched, and the equalizer measurably does what it says.
// Plays a 24-bit FLAC of three test tones (100 Hz, 1 kHz, 10 kHz) and reads the output.
const { _electron: electron } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const [out, profile, music] = process.argv.slice(2);
fs.writeFileSync(path.join(profile, 'library.json'), JSON.stringify({ liked: [], playlists: [], history: [], settings: { quality: 'lossless', musicFolders: [music], normalize: false } }));
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); if (!ok) process.exitCode = 1; };
const r1 = (n) => Math.round(n * 10) / 10;
(async () => {
  const app = await electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '..'), '--no-sandbox', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${profile}`] });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForTimeout(2500);
  await win.evaluate(() => window.obsidian.rescanMusic());
  const lib = await win.evaluate(() => window.obsidian.localLibrary());
  const tones = lib.tracks.find((t) => t.title === 'EQ Tones');

  // 1. Quality: the bytes the player receives are the file's bytes, bit for bit.
  const served = await win.evaluate(async (id) => {
    const r = await fetch(`media://local/${id}`);
    const buf = await r.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  }, tones.videoId);
  const onDisk = crypto.createHash('sha256').update(fs.readFileSync(path.join(music, 'tones.flac'))).digest('hex');
  check('the FLAC reaches the player bit-for-bit (SHA-256 matches the file)', served === onDisk, served.slice(0, 16));

  // Play it.
  await win.getByRole('button', { name: 'Your Music' }).click();
  await win.waitForTimeout(800);
  await win.locator('[role=listitem]', { hasText: 'EQ Tones' }).dblclick();
  await win.waitForTimeout(2500);
  const info = await win.evaluate((id) => window.obsidian.streamInfo(id), tones.videoId);
  const bar = await win.evaluate(() => document.querySelector('[aria-label=Player]')?.textContent);
  check('plays as 24-bit / 48 kHz FLAC, lossless', /HI-RES|LOSSLESS/.test(bar) && tones.format.bitDepth === 24 && tones.format.sampleRate === 48000 && tones.format.lossless, JSON.stringify(tones.format));
  const native = await win.evaluate(() => window.__obsidianEq.path());
  check('equalizer never used → audio takes the original path (no Web Audio at all)', native.path === 'native', JSON.stringify(native));

  // 2. Turn it on, flat.
  await win.getByRole('button', { name: 'Settings' }).click();
  await win.locator('main').getByRole('tab', { name: 'Equalizer' }).click();
  await win.waitForTimeout(500);
  await win.screenshot({ path: `${out}/40-eq-off.png` });
  await win.locator('main').getByRole('switch', { name: 'Equalizer' }).click();
  await win.waitForTimeout(1500);
  const flat = await win.evaluate(() => ({ path: window.__obsidianEq.path(), m: window.__obsidianEq.measure([100, 1000, 10000]) }));
  check('on but flat → filters bypassed (source → output)', flat.path.path === 'direct', JSON.stringify(flat.path));
  check('audio flows through the graph (not silenced)', flat.m.rms > 0.05, `rms ${flat.m.rms.toFixed(3)}`);
  const spread = (m) => Math.max(...Object.values(m.bands)) - Math.min(...Object.values(m.bands));
  check('flat: the three tones come out level', spread(flat.m) < 1, JSON.stringify(Object.fromEntries(Object.entries(flat.m.bands).map(([k, v]) => [k, r1(v)]))));

  // Volume still works through the graph.
  await win.click('[aria-label=Player] button[aria-label="Mute"]');
  await win.waitForTimeout(800);
  const muted = await win.evaluate(() => window.__obsidianEq.measure([1000]).rms);
  await win.click('[aria-label=Player] button[aria-label="Mute"]');
  await win.waitForTimeout(800);
  check('mute / volume still apply with the equalizer on', muted < 0.001, `rms muted ${muted.toFixed(5)}`);

  // 3. Presets change the sound as labelled.
  const measure = async (name) => {
    await win.locator('main').getByRole('radio', { name, exact: true }).click();
    await win.waitForTimeout(1500);
    return win.evaluate(() => ({ path: window.__obsidianEq.path().path, b: window.__obsidianEq.measure([100, 1000, 10000]).bands }));
  };
  const rel = (b, f) => r1(b[f] - b[1000]);
  const base = flat.m.bands;
  const bass = await measure('Bass Booster');
  check('Bass Booster: 100 Hz up vs 1 kHz', bass.path === 'eq' && rel(bass.b, 100) - rel(base, 100) > 3, `100 Hz ${rel(bass.b, 100)} dB, 10 kHz ${rel(bass.b, 10000)} dB rel. 1 kHz`);
  check('Bass Booster: no clipping — level lowered by the boost', bass.b[100] <= base[100] + 0.6, `100 Hz ${r1(bass.b[100])} dB vs flat ${r1(base[100])} dB`);
  await win.screenshot({ path: `${out}/41-eq-bass.png` });
  const treble = await measure('Treble Booster');
  // Treble Booster also lifts 1 kHz a little (+1.25 dB band), so compare the highs with the lows. Theory: +3.3 dB.
  check('Treble Booster: 10 kHz up vs 100 Hz', treble.b[10000] - treble.b[100] - (base[10000] - base[100]) > 2.5, `10 kHz − 100 Hz = ${r1(treble.b[10000] - treble.b[100] - (base[10000] - base[100]))} dB (filters predict +3.3)`);
  const vocal = await measure('Vocal Booster');
  check('Vocal Booster: 1 kHz up vs 100 Hz', vocal.b[1000] - vocal.b[100] - (base[1000] - base[100]) > 4, `1 kHz − 100 Hz = ${r1(vocal.b[1000] - vocal.b[100])} dB`);

  // 4. Basic: the Bass control.
  const bassCtl = win.locator('main').getByRole('slider', { name: 'Bass', exact: true });
  await win.locator('main').getByRole('radio', { name: 'Flat', exact: true }).click();
  await bassCtl.focus();
  for (let i = 0; i < 2; i++) await win.keyboard.press('PageUp');
  await win.waitForTimeout(1500);
  const basic = await win.evaluate(() => window.__obsidianEq.measure([100, 1000, 10000]).bands);
  check('Basic › Bass +6 dB raises the lows only', rel(basic, 100) - rel(base, 100) > 4 && Math.abs(rel(basic, 10000) - rel(base, 10000)) < 1, `100 Hz ${rel(basic, 100)}, 10 kHz ${rel(basic, 10000)} rel. 1 kHz`);
  await win.screenshot({ path: `${out}/42-eq-basic.png` });

  // 5. Advanced: ten bands, and saving a preset.
  await win.locator('main').getByRole('radio', { name: 'Advanced' }).click();
  await win.waitForTimeout(400);
  const sliders = await win.locator('main [role=slider][aria-orientation=vertical]').count();
  check('Advanced: preamp + 10 band sliders', sliders === 11, String(sliders));
  const band10k = win.locator('main').getByRole('slider', { name: '10kHz' });
  if (await band10k.count()) {
    await band10k.focus();
  } else {
    await win.locator('main').getByRole('slider', { name: '8kHz' }).focus();
  }
  for (let i = 0; i < 3; i++) await win.keyboard.press('PageUp');
  await win.getByRole('button', { name: 'Save as Preset' }).click();
  await win.keyboard.type('My Sound');
  await win.keyboard.press('Enter');
  await win.waitForTimeout(800);
  await win.screenshot({ path: `${out}/43-eq-advanced.png` });
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'library.json'), 'utf8')).settings.eq;
  check('custom preset saved and selected', saved.saved.some((p) => p.name === 'My Sound') && saved.preset === 'custom:My Sound', JSON.stringify({ preset: saved.preset, bands: saved.bands }));

  // 6. Off again: back to untouched.
  await win.locator('main').getByRole('switch', { name: 'Equalizer' }).click();
  await win.waitForTimeout(1500);
  const off = await win.evaluate(() => ({ path: window.__obsidianEq.path(), b: window.__obsidianEq.measure([100, 1000, 10000]).bands }));
  check('off → filters out of the path, tones level again', off.path.path === 'direct' && spread({ bands: off.b }) < 1, JSON.stringify(off.path));

  // 7. The full-screen player's equalizer sheet.
  await win.click('button[aria-label="Open the full-screen player"]');
  await win.waitForTimeout(1500);
  await win.click('[data-immersive] button[aria-label="Equalizer"]');
  await win.waitForTimeout(800);
  await win.screenshot({ path: `${out}/44-eq-sheet.png` });
  console.log('output sample rate:', off.path.sampleRate, 'Hz');
  console.log('page errors:', errors.join(' | ') || 'none');
  await app.close();
})().catch((e) => { console.error('E2E FAILED', e); process.exit(1); });
