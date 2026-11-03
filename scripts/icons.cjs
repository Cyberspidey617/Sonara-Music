// Renders the app icon (PNGs and the Windows .ico), the tray icon and the taskbar
// thumbnail-button glyphs from SVG, with Electron's own Chromium:
//
//   npx electron scripts/icons.cjs
//
// A Liquid Glass-style layered icon in black and white: a graphite background layer, and
// Sonara's mark (a sonar ring around a waveform, its ping escaping through the
// gap) as a foreground layer of frosted glass, floating over a soft shadow.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MARK = (fill) => `
  <circle cx="32" cy="32" r="26" fill="none" stroke="${fill}" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="84 16" transform="rotate(62 32 32)"/>
  <circle cx="53.3" cy="46.9" r="4" fill="${fill}"/>
  <g fill="${fill}">
    <rect x="17.1" y="27" width="4.2" height="10" rx="2.1"/>
    <rect x="23.5" y="23" width="4.2" height="18" rx="2.1"/>
    <rect x="29.9" y="18" width="4.2" height="28" rx="2.1"/>
    <rect x="36.3" y="24" width="4.2" height="16" rx="2.1"/>
    <rect x="42.7" y="28.5" width="4.2" height="7" rx="2.1"/>
  </g>`;
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="bg" x1=".1" y1="0" x2=".9" y2="1">
    <stop offset="0" stop-color="#3a3a3c"/><stop offset=".45" stop-color="#1c1c1e"/><stop offset="1" stop-color="#050505"/>
  </linearGradient>
  <radialGradient id="bloom" cx=".28" cy=".18" r=".72"><stop offset="0" stop-color="#ffffff" stop-opacity=".22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <linearGradient id="bodyRim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".3" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".98"/><stop offset=".6" stop-color="#fff" stop-opacity=".82"/><stop offset="1" stop-color="#fff" stop-opacity=".66"/></linearGradient>
  <filter id="shadow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4"/></filter>
  <clipPath id="body"><rect x="64" y="64" width="896" height="896" rx="204"/></clipPath>
</defs>
<g clip-path="url(#body)">
  <rect x="64" y="64" width="896" height="896" fill="url(#bg)"/>
  <rect x="64" y="64" width="896" height="896" fill="url(#bloom)"/>
  <!-- Faint outer ripples on the background layer. -->
  <circle cx="512" cy="512" r="372" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="6"/>
  <circle cx="512" cy="512" r="440" fill="none" stroke="#fff" stroke-opacity=".05" stroke-width="6"/>
  <!-- The mark's shadow on the background layer. -->
  <g transform="translate(192 210) scale(10)" opacity=".45" filter="url(#shadow)">${MARK('#000000')}</g>
</g>
<rect x="66" y="66" width="892" height="892" rx="202" fill="none" stroke="url(#bodyRim)" stroke-width="4"/>
<!-- The foreground glass layer. -->
<g transform="translate(192 192) scale(10)">${MARK('url(#glass)')}</g>
</svg>`;
const glyph = (d, flip) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" ${flip ? 'transform="translate(24 0) scale(-1 1)"' : ''} d="${d}"/></svg>`;
const PLAY = 'M7.2 4.6v14.8c0 1 1.1 1.6 1.9 1.1l11.3-7.4c.8-.5.8-1.6 0-2.1L9.1 3.5c-.8-.5-1.9.1-1.9 1.1z';
const PAUSE = 'M6.6 4h2.8c.6 0 1.1.5 1.1 1.1v13.8c0 .6-.5 1.1-1.1 1.1H6.6c-.6 0-1.1-.5-1.1-1.1V5.1C5.5 4.5 6 4 6.6 4zm8 0h2.8c.6 0 1.1.5 1.1 1.1v13.8c0 .6-.5 1.1-1.1 1.1h-2.8c-.6 0-1.1-.5-1.1-1.1V5.1c0-.6.5-1.1 1.1-1.1z';
const NEXT = 'M4.2 5.7v12.6c0 .9 1 1.4 1.7.9l9.3-6.3c.7-.4.7-1.4 0-1.8L5.9 4.8c-.7-.5-1.7 0-1.7.9zM17.6 4.6h1.3c.6 0 1 .4 1 1v12.8c0 .6-.4 1-1 1h-1.3c-.6 0-1-.4-1-1V5.6c0-.6.4-1 1-1z';

/** A Windows .ico holding PNG images (supported since Windows Vista). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

app.commandLine.appendSwitch('force-device-scale-factor', '1');
// Each image gets its own window; closing one mustn't quit before the rest are drawn.
app.on('window-all-closed', () => undefined);
app.whenReady().then(async () => {
  const render = async (svg, size) => {
    const win = new BrowserWindow({ width: size, height: size, show: false, frame: false, transparent: true, backgroundColor: '#00000000', webPreferences: { offscreen: true } });
    const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
    const page = path.join(os.tmpdir(), `sonara-icon-${size}-${Date.now()}.html`);
    fs.writeFileSync(page, html);
    await win.loadFile(page);
    fs.rmSync(page);
    await new Promise((r) => setTimeout(r, 200));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    win.destroy();
    return image.resize({ width: size, height: size, quality: 'best' }).toPNG();
  };
  fs.writeFileSync('build/icon.svg', ICON);
  const pngs = [];
  for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 256, 512]) {
    const data = await render(ICON, size);
    fs.writeFileSync(`build/icon-${size}.png`, data);
    if (size <= 256) pngs.push({ size, data });
  }
  fs.copyFileSync('build/icon-512.png', 'resources/icon.png');
  fs.copyFileSync('build/icon-512.png', 'build/icon.png');
  fs.copyFileSync('build/icon-128.png', 'src/renderer/src/assets/app-icon.png');
  const icon = ico(pngs);
  fs.writeFileSync('build/icon.ico', icon);
  fs.writeFileSync('resources/icon.ico', icon);
  for (const [name, d, flip] of [['play', PLAY], ['pause', PAUSE], ['next', NEXT], ['previous', NEXT, true]]) {
    fs.writeFileSync(`resources/thumbar/${name}.png`, await render(glyph(d, flip), 32));
  }
  app.quit();
});
