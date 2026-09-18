const path = require("path");
const { chromium, CHROME } = require("./browser");
const { sleep, alignWords, Timing } = require("./words");
const { OVERLAY_CSS, CURSOR_SVG, HOTSPOT, installStage } = require("./overlay");

const ZOOM = 2;
const W = 1280;
const H = 720;
const OUT = { width: W * ZOOM, height: H * ZOOM };

// The app window floats on a warm off-white canvas with rounded corners and a
// soft shadow, the way product screencasts are framed.
const FRAME = {
  width: Number(process.env.FRAME_W) || 1100,
  height: Number(process.env.FRAME_H) || 620,
  radius: 14,
  canvas: "#f5f4f0",
};

const CSS = `
nav[aria-label="Main navigation"], footer, nextjs-portal { display: none !important; }
html, body { background: ${FRAME.canvas} !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }
main#main { zoom: ${ZOOM}; width: ${W}px; height: ${H}px; margin: 0 !important; padding: 0 !important; min-height: 0 !important; display: flex; align-items: center; justify-content: center; }
main#main main { width: ${W}px; height: ${H}px; margin: 0 !important; padding: 0 !important; min-height: 0 !important; display: flex; align-items: center; justify-content: center; }
main#main main > div { max-width: none !important; width: ${FRAME.width}px !important; }
.replica-ui [role="status"][aria-live="polite"], .replica-ui div:has(> .lucide-lightbulb) { visibility: hidden !important; }
.replica-ui { height: ${FRAME.height}px !important; border-radius: ${FRAME.radius}px !important; box-shadow: 0 0 0 1px rgba(0,0,0,.10), 0 24px 70px -18px rgba(0,0,0,.45), 0 6px 18px -8px rgba(0,0,0,.25) !important; }
${OVERLAY_CSS}
`;

const HIDDEN_TEXT = ["Demo picker — no real folders are read"];

class Stage extends Timing {
  constructor(page, opts) {
    super(opts);
    this.page = page;
    this.framesDir = opts.framesDir;
    this.frameNo = 0;
  }

  async waitFor(sel, timeout = 8000) {
    await this.page.locator(sel).first().waitFor({ state: "visible", timeout });
  }

  async point(sel, at = [0.5, 0.5]) {
    const loc = this.page.locator(sel).first();
    await loc.waitFor({ state: "visible", timeout: 8000 });
    const r = await loc.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return { x: r.x + r.w * at[0], y: r.y + r.h * at[1] };
  }

  async moveTo(sel, opts = {}) {
    const p = await this.point(sel, opts.at);
    const ms = opts.ms ?? 750;
    if (opts.cue) await this.holdUntil(this.cueMs(opts.cue) - ms - (opts.pause ?? 0));
    await this.page.evaluate(([x, y, ms]) => window.__lc.moveTo(x, y, ms), [p.x, p.y, ms]);
    await this.page.mouse.move(p.x, p.y);
    if (opts.after) await sleep(opts.after);
    return p;
  }

  async click(sel, opts = {}) {
    const pause = opts.pause ?? 160;
    const p = await this.moveTo(sel, { ...opts, pause });
    await sleep(pause);
    await this.page.evaluate(() => window.__lc.tap());
    await this.page.mouse.down();
    await sleep(90);
    await this.page.mouse.up();
    this.log(`click ${sel}`);
    await sleep(opts.settle ?? 350);
    return p;
  }

  // Shows a topic card for `ms`, by default until the line's narration ends.
  // `hold: true` leaves it up (an end card).
  async card(title, opts = {}) {
    const ms = this.cardMs(opts);
    this.log(`card "${title}" ${ms}ms${opts.hold ? " held" : ""}`);
    await this.page.evaluate(([t, ms, hold]) => window.__lc.card(t, ms, hold), [title, ms, !!opts.hold]);
  }

  async cardState() {
    return this.page.evaluate(() => {
      const c = document.getElementById("lesson-card");
      return { computed: getComputedStyle(c).opacity, covered: window.__lc.isCovered(), text: c.textContent };
    });
  }

  // A static page sends no screencast frames; a 1px change forces one.
  async repaint(n) {
    await this.page.evaluate((n) => {
      document.getElementById("lesson-tick").style.background = n % 2 ? "#000" : "#fff";
    }, n);
  }

  async cover() {
    await this.page.evaluate(() => window.__lc.cover());
  }

  async isCovered() {
    return this.page.evaluate(() => window.__lc.isCovered());
  }

  async reveal() {
    await this.page.evaluate(() => window.__lc.reveal());
  }

  async type(text, opts = {}) {
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      const base = ch === " " ? 40 : 55 + Math.random() * 45;
      await sleep(base);
    }
    if (opts.after) await sleep(opts.after);
  }

  async press(key) {
    await this.page.keyboard.press(key);
  }

  async frame(name) {
    if (!this.framesDir) return;
    const file = path.join(this.framesDir, `${String(this.frameNo++).padStart(2, "0")}-${name}.png`);
    await this.page.screenshot({ path: file });
  }
}

async function openStage(opts) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: OUT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(opts.url, { waitUntil: "networkidle" });
  await page.locator('[data-tour="add-project"]').waitFor({ state: "visible", timeout: 20000 });
  await page.addStyleTag({ content: CSS });
  await page.evaluate(installStage, { cursorSvg: CURSOR_SVG, hotspot: HOTSPOT, hiddenText: HIDDEN_TEXT });
  await page.evaluate(([x, y]) => window.__lc.place(x, y), [OUT.width * 0.56, OUT.height * 0.52]);
  await page.mouse.move(OUT.width * 0.56, OUT.height * 0.52);
  await sleep(600);
  const stage = new Stage(page, opts);
  return {
    stage,
    page,
    size: OUT,
    close: () => browser.close(),
  };
}

module.exports = { openStage, alignWords, OUT, FRAME, ZOOM };
