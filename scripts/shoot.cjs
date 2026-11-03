// Screenshots the renderer (mock mode) for visual checks.
const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.goto('http://localhost:5180/index.html');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/01-home.png` });
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
