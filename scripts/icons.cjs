// Renders the app icon, tray icon and taskbar thumbnail-button glyphs from SVG.
const { chromium } = require('playwright');
const fs = require('fs');
// A Liquid Glass-style layered icon (macOS / iOS 26): a vivid background
// layer, and the obsidian shard as a foreground layer of frosted glass with a
// specular rim, floating over a soft shadow.
const SHARD = 'M32 3 53 19l-6 39H17l-6-39z';
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="bg" x1=".15" y1="0" x2=".85" y2="1">
    <stop offset="0" stop-color="#ffb457"/><stop offset=".42" stop-color="#f0612e"/><stop offset=".78" stop-color="#8a1f4a"/><stop offset="1" stop-color="#3a0f2e"/>
  </linearGradient>
  <radialGradient id="bloom" cx=".32" cy=".2" r=".7"><stop offset="0" stop-color="#fff3d6" stop-opacity=".55"/><stop offset="1" stop-color="#fff3d6" stop-opacity="0"/></radialGradient>
  <linearGradient id="bodyRim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".3" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></linearGradient>
  <linearGradient id="glass" x1=".2" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".78"/><stop offset=".55" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity=".22"/></linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".45" stop-color="#fff" stop-opacity=".25"/><stop offset=".7" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".7"/></linearGradient>
  <filter id="shadow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.8"/></filter>
  <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"/></filter>
  <clipPath id="body"><rect x="64" y="64" width="896" height="896" rx="204"/></clipPath>
</defs>
<g clip-path="url(#body)">
  <rect x="64" y="64" width="896" height="896" fill="url(#bg)"/>
  <rect x="64" y="64" width="896" height="896" fill="url(#bloom)"/>
  <!-- The shard's shadow on the background layer. -->
  <g transform="translate(190 150) scale(10.1)" opacity=".5"><path d="${SHARD}" transform="translate(0 4.5)" fill="#2a0618" filter="url(#shadow)"/></g>
</g>
<rect x="66" y="66" width="892" height="892" rx="202" fill="none" stroke="url(#bodyRim)" stroke-width="4"/>
<!-- The foreground glass layer: frosted facets, brightest where light enters. -->
<g transform="translate(190 150) scale(10.1)">
  <path d="${SHARD}" fill="url(#glass)"/>
  <path d="M32 3 30 27 11 19z" fill="#fff" fill-opacity=".42"/>
  <path d="M32 3 53 19 30 27z" fill="#fff" fill-opacity=".16"/>
  <path d="M11 19l19 8-13 31z" fill="#fff" fill-opacity=".22"/>
  <path d="M53 19 30 27l17 31z" fill="#3a0f2e" fill-opacity=".14"/>
  <path d="M30 27 17 58h30z" fill="#fff" fill-opacity=".06"/>
  <path d="M32 3 30 27M11 19l19 8 23-8M30 27 17 58M30 27l17 31" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".45" stroke-linejoin="round"/>
  <!-- Specular rim: the curved edge catching the light. -->
  <path d="${SHARD}" fill="none" stroke="url(#rim)" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M14 18.5 32 5" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".9" filter="url(#soft)" transform="scale(1)"/>
</g>
</svg>`;
const glyph = (d, flip) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" ${flip ? 'transform="translate(24 0) scale(-1 1)"' : ''} d="${d}"/></svg>`;
const PLAY = 'M7.2 4.6v14.8c0 1 1.1 1.6 1.9 1.1l11.3-7.4c.8-.5.8-1.6 0-2.1L9.1 3.5c-.8-.5-1.9.1-1.9 1.1z';
const PAUSE = 'M6.6 4h2.8c.6 0 1.1.5 1.1 1.1v13.8c0 .6-.5 1.1-1.1 1.1H6.6c-.6 0-1.1-.5-1.1-1.1V5.1C5.5 4.5 6 4 6.6 4zm8 0h2.8c.6 0 1.1.5 1.1 1.1v13.8c0 .6-.5 1.1-1.1 1.1h-2.8c-.6 0-1.1-.5-1.1-1.1V5.1c0-.6.5-1.1 1.1-1.1z';
const NEXT = 'M4.2 5.7v12.6c0 .9 1 1.4 1.7.9l9.3-6.3c.7-.4.7-1.4 0-1.8L5.9 4.8c-.7-.5-1.7 0-1.7.9zM17.6 4.6h1.3c.6 0 1 .4 1 1v12.8c0 .6-.4 1-1 1h-1.3c-.6 0-1-.4-1-1V5.6c0-.6.4-1 1-1z';
(async () => {
  const browser = await chromium.launch();
  const render = async (svg, size, file) => {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: file, omitBackground: true });
    await page.close();
  };
  fs.writeFileSync('build/icon.svg', ICON);
  for (const s of [16, 20, 24, 32, 40, 48, 64, 128, 256, 512]) await render(ICON, s, `build/icon-${s}.png`);
  fs.copyFileSync('build/icon-512.png', 'resources/icon.png');
  fs.copyFileSync('build/icon-512.png', 'build/icon.png');
  for (const [name, d, flip] of [['play', PLAY], ['pause', PAUSE], ['next', NEXT], ['previous', NEXT, true]]) {
    await render(glyph(d, flip), 32, `resources/thumbar/${name}.png`);
  }
  await browser.close();
})();
