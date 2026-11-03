const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5181/index.html');
  await page.waitForTimeout(1500);
  const result = await page.evaluate(async () => {
    const ttml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><body><div>
      <p begin="0.000" end="4.000"><span begin="0.000" end="1.500">मेरा</span> <span begin="1.500" end="3.000">जहां</span> <span begin="3.000" end="4.000">तेरी</span></p>
      <p begin="4.000" end="8.000"><span begin="4.000" end="5.500">Hello</span> <span begin="5.500" end="7.000">world</span></p>
    </div></body></tt>`;
    const el = document.createElement('am-lyrics');
    el.ttml = ttml;
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 1500));
    el.currentTime = 4500;
    await new Promise((r) => setTimeout(r, 300));
    const root = el.shadowRoot;
    const lines = [...root.querySelectorAll('.lyrics-line')];
    return lines.map((l) => ({ text: l.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), charSpans: l.querySelectorAll('span.char').length }));
  });
  console.log(JSON.stringify(result, null, 1));
  await browser.close();
})();
