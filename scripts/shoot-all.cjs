const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !/ERR_|Failed to load resource|net::/.test(m.text()) && errors.push('console: ' + m.text()));
  const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${out}/${name}.png` }); };
  await page.goto('http://localhost:5180/index.html');
  await page.waitForTimeout(1200);

  if (process.argv[3] === 'tail') { await page.locator('text=Liked Songs').first().isVisible(); }
  // Search
  await page.fill('input[placeholder^="Search"]', 'radiohead');
  await page.waitForTimeout(400);
  await shot('02-suggestions');
  await page.press('input[placeholder^="Search"]', 'Enter');
  await page.waitForTimeout(900);
  await shot('03-search');

  // Play the first song row (double-click) and open the queue panel
  await page.locator('[role=listitem]').first().dblclick();
  await page.waitForTimeout(1500);
  await shot('04-playing');

  // Artist (top result)
  await page.getByText('Radiohead', { exact: true }).first().click();
  await page.waitForTimeout(1000);
  await shot('05-artist');

  // Album: from the artist's Albums shelf
  await page.locator('section:has(h2:text("Albums")) button.truncate').first().click();
  await page.waitForTimeout(1200);
  await shot('06-album');

  // Side panel: up next, lyrics
  await page.click('button[aria-label="Up Next"]');
  await shot('07-queue-panel');
  await page.click('button[aria-label="Lyrics"]');
  await page.waitForTimeout(6000);
  await shot('08-lyrics-panel');
  await page.click('button[aria-label="Close panel"]');

  // Full-screen player
  await page.click('button[aria-label="Open the full-screen player"]');
  await page.waitForTimeout(2500);
  await shot('09-fullscreen');
  await page.click('[data-immersive] button[aria-label="Up Next"]');
  await shot('10-fullscreen-queue');
  await page.keyboard.press('Escape');

  // Track menu + add to playlist dialog
  await page.locator('[role=listitem]').nth(2).click({ button: 'right' });
  await shot('11-context-menu');
  await page.getByText('Add to Playlist…').click();
  await shot('12-add-dialog');
  await page.getByText('New Playlist…').click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  // Import dialog
  await page.mouse.move(30, 300); await page.waitForTimeout(800); // the compact sidebar opens on hover
  await page.click('button[aria-label="Import a YouTube playlist"]');
  await page.fill('input[placeholder^="https://music"]', 'https://music.youtube.com/playlist?list=PLx');
  await shot('13-import');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await shot('14-local-playlist');

  // Sleep timer menu
  await page.click('[aria-label="Player"] button[aria-label="Sleep timer"]');
  await shot('15-sleep-menu');
  await page.keyboard.press('Escape');

  // Settings, and the Clear / Tinted glass choice
  await page.getByRole('button', { name: 'Settings' }).click();
  await shot('16-settings');
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await shot('16b-appearance');
  await page.getByRole('radio', { name: 'Tinted' }).click();
  await shot('17-settings-tinted');
  await page.getByRole('radio', { name: 'Clear' }).click();
  await page.getByRole('tab', { name: 'Lyrics' }).click();
  await shot('18-settings-lyrics');

  // Home, with a tile's glass hover controls
  await page.getByRole('button', { name: 'Home' }).first().click();
  await page.waitForTimeout(900);
  await shot('19-home');
  await page.locator('main section .group > .relative.cursor-pointer').first().hover();
  await page.waitForTimeout(500);
  await shot('20-tile-hover');
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(500);
  await shot('21-home-scrolled');
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED', e.message); process.exit(1); });
