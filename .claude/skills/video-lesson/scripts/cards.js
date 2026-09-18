// Renders each topic card of an app recording as its own clip (the same DOM
// card the demo stage paints, in headless Chromium), for compose.js to lay over
// the screen capture with alpha fades.
const path = require("path");
const { sleep } = require("./words");
const { OVERLAY_CSS, CURSOR_SVG, HOTSPOT, installStage } = require("./overlay");
const { Recorder } = require("./recorder");
const { chromium, CHROME } = require("./browser");

const CARD_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; background: #e8e2d6; overflow: hidden; }
${OVERLAY_CSS}
</style></head><body></body></html>`;

async function renderCards(cards, dir, size) {
  if (!cards.length) return [];
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(CARD_HTML);
  await page.evaluate(installStage, { cursorSvg: CURSOR_SVG, hotspot: HOTSPOT, hiddenText: [] });
  const files = [];
  for (const [i, card] of cards.entries()) {
    const file = path.join(dir, `card-${String(i).padStart(2, "0")}.mkv`);
    await page.evaluate(() => window.__lc.cover());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const rec = new Recorder(file);
    await page.screencast.start({ size, quality: 92, onFrame: (f) => rec.frame(f) });
    const startedAt = Date.now();
    for (let n = 0; !rec.started && Date.now() - startedAt < 5000; n++) {
      await page.evaluate((n) => (document.getElementById("lesson-tick").style.background = n % 2 ? "#000" : "#fff"), n);
      await sleep(20);
    }
    if (!rec.started) throw new Error("card screencast never started");
    const t0 = rec.startWall;
    // An opener holds blank canvas until its beat ran, then the words animate
    // in over the opaque card; the fades are added at mux time. Held cards never
    // resolve, so that promise is dropped with the browser.
    const lead = card.first ? card.startMs : 0;
    const length = lead + card.ms;
    if (lead > 0) await sleep(Math.max(0, t0 + lead - Date.now()));
    page.evaluate(({ t, ms }) => window.__lc.card(t, ms, true), { t: card.title, ms: card.ms + 2000 }).catch(() => {});
    const rest = t0 + length - Date.now();
    if (rest > 0) await sleep(rest);
    await page.screencast.stop();
    await rec.stop(length);
    files.push(file);
  }
  await browser.close();
  return files;
}

module.exports = { renderCards };
