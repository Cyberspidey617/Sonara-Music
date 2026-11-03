// Launches the real Electron app (built output) under Xvfb and screenshots it.
const { _electron: electron } = require('playwright');
const path = require('path');
const out = process.argv[2];
(async () => {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [path.resolve(__dirname, '..'), '--no-sandbox', '--disable-gpu-sandbox'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  });
  const logs = [];
  app.process().stdout.on('data', (d) => logs.push(String(d).trim()));
  app.process().stderr.on('data', (d) => logs.push(String(d).trim()));
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  win.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 200)));
  await win.waitForTimeout(4000);
  const info = await win.evaluate(() => ({ url: location.href, hasApi: !!window.obsidian, title: document.title, root: document.getElementById('root')?.children.length }));
  console.log('window:', JSON.stringify(info));
  await win.screenshot({ path: `${out}/electron-home.png` });
  // The stream protocol answers (YouTube is unreachable here, so expect the explained failure).
  const probe = await win.evaluate(async () => {
    const r = await fetch('ytstream://track/dQw4w9WgXcQ?q=high', { headers: { Range: 'bytes=0-1' } });
    return { status: r.status, error: decodeURIComponent(r.headers.get('X-Obsidian-Error') || '') };
  });
  console.log('stream probe:', JSON.stringify(probe));
  const lib = await win.evaluate(() => window.obsidian.loadLibrary().then((l) => Object.keys(l)));
  console.log('library keys:', lib.join(','));
  console.log('page errors:\n' + (errors.join('\n') || 'none'));
  await app.close();
  console.log('main log tail:\n' + logs.filter(Boolean).slice(-15).join('\n'));
})().catch((e) => { console.error('SMOKE FAILED', e); process.exit(1); });
