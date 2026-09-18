const os = require("os");
const path = require("path");

const PW =
  process.env.PLAYWRIGHT_CORE ||
  path.join(
    os.homedir(),
    ".nvm/versions/node/v24.14.1/lib/node_modules/@playwright/cli/node_modules/playwright-core",
  );
const CHROME =
  process.env.CHROME ||
  path.join(
    os.homedir(),
    "Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );
const { chromium } = require(PW);

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
#lesson-card { position: fixed; inset: 0; z-index: 2147483640; display: flex; align-items: center; justify-content: center; padding: 0 240px; background: #e8e2d6; color: #141414; font: 600 150px/1.12 "Iowan Old Style", "Palatino", Georgia, serif; letter-spacing: -0.02em; text-align: center; text-wrap: balance; opacity: 0; pointer-events: none; }
#lesson-tick { position: fixed; left: 0; top: 0; width: 1px; height: 1px; pointer-events: none; z-index: 2147483647; opacity: 0.02; animation: lesson-tick 1s linear infinite; }
@keyframes lesson-tick { from { transform: translateX(0); } to { transform: translateX(1px); } }
#lesson-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 40px; height: 40px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.65)); will-change: transform; }
#lesson-ring { position: fixed; left: 0; top: 0; z-index: 2147483646; pointer-events: none; width: 76px; height: 76px; margin: -38px 0 0 -38px; border-radius: 50%; border: 5px solid rgba(255,255,255,.92); opacity: 0; }
`;

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.5 3.2v16.3l4.3-4 2.6 5.9 2.9-1.3-2.6-5.8h5.9z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const HOTSPOT = { x: 9, y: 5 };

const HIDDEN_TEXT = ["Demo picker — no real folders are read"];

function installStage({ cursorSvg, hotspot, hiddenText }) {
  const cur = document.createElement("div");
  cur.id = "lesson-cursor";
  cur.innerHTML = cursorSvg;
  const ring = document.createElement("div");
  ring.id = "lesson-ring";
  const card = document.createElement("div");
  card.id = "lesson-card";
  const tick = document.createElement("div");
  tick.id = "lesson-tick";
  document.body.append(card, ring, cur, tick);
  const state = { x: 0, y: 0 };
  const place = (x, y) => {
    state.x = x;
    state.y = y;
    cur.style.transform = `translate(${x - hotspot.x}px, ${y - hotspot.y}px)`;
  };
  const jerk = (t) => t * t * t * (10 + t * (-15 + 6 * t));
  let covered = false;
  // Inline !important beats the stray animation-level override that has been
  // seen zeroing the card's opacity; it is dropped to a plain value only while
  // a fade runs, then restored and the fade cancelled.
  const setOpacity = (v) => card.style.setProperty("opacity", String(v), "important");
  const fadeCard = (from, to, easing) => {
    card.style.setProperty("opacity", String(from));
    const a = card.animate([{ opacity: from }, { opacity: to }], { duration: 300, easing, fill: "forwards" });
    return a.finished.then(() => {
      setOpacity(to);
      a.cancel();
    });
  };
  setOpacity(0);
  window.__lc = {
    place,
    // Blank card canvas up before the first frame, so a lesson opens on it.
    cover() {
      card.replaceChildren();
      setOpacity(1);
      cur.style.visibility = "hidden";
      covered = true;
    },
    isCovered: () => covered,
    reveal() {
      if (!covered) return Promise.resolve();
      return fadeCard(1, 0, "ease-in").then(() => {
        cur.style.visibility = "";
        covered = false;
      });
    },
    // A topic card: the canvas fades in, the words rise and sharpen one after
    // another, the card holds, then fades out. `hold` leaves it up.
    card(title, ms, hold = false) {
      const fade = 300;
      const perWord = 110;
      const wordMs = 640;
      const inner = document.createElement("div");
      const words = title.split(/\s+/);
      words.forEach((w, i) => {
        const span = document.createElement("span");
        span.textContent = w;
        span.style.cssText = "display:inline-block; opacity:0; will-change:transform,filter,opacity";
        inner.append(span);
        if (i < words.length - 1) inner.append(document.createTextNode(" "));
      });
      card.replaceChildren(inner);
      cur.style.visibility = "hidden";
      const shownAt = covered ? Promise.resolve() : fadeCard(0, 1, "ease-out");
      covered = true;
      const reveals = [...inner.children].map((span, i) =>
        span.animate(
          [
            { opacity: 0, transform: "translateY(0.35em)", filter: "blur(12px)" },
            { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
          ],
          { duration: wordMs, delay: 140 + i * perWord, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
        ),
      );
      const up = Math.max(140 + (words.length - 1) * perWord + wordMs, ms - 2 * fade);
      const shown = shownAt.then(() => new Promise((r) => setTimeout(r, up - fade)));
      if (hold) return shown;
      return shown
        .then(() => fadeCard(1, 0, "ease-in"))
        .then(() => {
          reveals.forEach((a) => a.cancel());
          card.replaceChildren();
          cur.style.visibility = "";
          covered = false;
        });
    },
    moveTo(x, y, ms) {
      const from = { ...state };
      const dx = x - from.x;
      const dy = y - from.y;
      const dist = Math.hypot(dx, dy);
      const bow = Math.min(0.12, 18 / Math.max(dist, 1)) * dist;
      const nx = dist ? -dy / dist : 0;
      const ny = dist ? dx / dist : 0;
      const frames = [];
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        const s = jerk(t);
        const b = Math.sin(Math.PI * t) * bow;
        const px = from.x + dx * s + nx * b;
        const py = from.y + dy * s + ny * b;
        frames.push({
          transform: `translate(${px - hotspot.x}px, ${py - hotspot.y}px)`,
        });
      }
      const anim = cur.animate(frames, { duration: ms, easing: "linear", fill: "forwards" });
      return anim.finished.then(() => {
        anim.commitStyles();
        anim.cancel();
        place(x, y);
      });
    },
    tap() {
      ring.style.left = `${state.x}px`;
      ring.style.top = `${state.y}px`;
      ring.animate(
        [
          { transform: "scale(.35)", opacity: 0.95 },
          { transform: "scale(1.1)", opacity: 0 },
        ],
        { duration: 460, easing: "cubic-bezier(.2,.7,.3,1)" },
      );
      cur.animate(
        [{ transform: `${cur.style.transform} scale(1)` }, { transform: `${cur.style.transform} scale(.86)` }, { transform: `${cur.style.transform} scale(1)` }],
        { duration: 180, easing: "ease-out" },
      );
    },
  };
  const hide = (root) => {
    const els = root.querySelectorAll ? root.querySelectorAll("div, span, p") : [];
    for (const el of els) {
      if (hiddenText.includes(el.textContent?.trim()) && el.children.length === 0) {
        el.style.visibility = "hidden";
      }
    }
  };
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) hide(n);
  }).observe(document.body, { childList: true, subtree: true });
  hide(document.body);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (t) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);

// Start time (ms) of each word of `text` in the clip, or null where the
// transcript has no match for it.
function alignWords(text, words) {
  const all = norm(text);
  const spoken = [];
  for (const w of words || []) for (const n of norm(w.word)) spoken.push({ n, ms: w.start * 1000 });
  const times = new Array(all.length).fill(null);
  let j = 0;
  for (let i = 0; i < all.length; i++) {
    for (let k = j; k < Math.min(spoken.length, j + 4); k++) {
      if (spoken[k].n === all[i]) {
        times[i] = spoken[k].ms;
        j = k + 1;
        break;
      }
      if (i + 1 < all.length && spoken[k].n === all[i] + all[i + 1]) {
        times[i] = spoken[k].ms;
        times[i + 1] = spoken[k].ms;
        i += 1;
        j = k + 1;
        break;
      }
      if (k + 1 < spoken.length && spoken[k].n + spoken[k + 1].n === all[i]) {
        times[i] = spoken[k].ms;
        j = k + 2;
        break;
      }
    }
  }
  return { all, times };
}

class Stage {
  constructor(page, opts) {
    this.page = page;
    this.framesDir = opts.framesDir;
    this.frameNo = 0;
    this.log = opts.log || (() => {});
  }

  beginLine(line) {
    this.line = line;
    this.lineStart = Date.now();
  }

  // ms after the line starts at which `text` is spoken. Text words are aligned
  // to the clip's transcript; a word the transcript missed is interpolated
  // between its nearest timed neighbours (or the clip's edges).
  cueMs(text) {
    const want = norm(text);
    const { all, times } = alignWords(this.line.text, this.line.words);
    let at = -1;
    for (let i = 0; i + want.length <= all.length; i++) {
      if (want.every((w, k) => all[i + k] === w)) {
        at = i;
        break;
      }
    }
    if (at < 0) throw new Error(`cue "${text}" is not in line "${this.line.id}"`);
    if (times[at] != null) return Math.round(times[at]);
    let lo = at - 1;
    while (lo >= 0 && times[lo] == null) lo--;
    let hi = at + 1;
    while (hi < all.length && times[hi] == null) hi++;
    const loMs = lo >= 0 ? times[lo] : 0;
    const loIdx = lo >= 0 ? lo : -1;
    const hiMs = hi < all.length ? times[hi] : this.line.ms;
    const hiIdx = hi < all.length ? hi : all.length;
    this.log(`cue "${text}" interpolated (transcript missed it)`);
    return Math.round(loMs + ((at - loIdx) / (hiIdx - loIdx)) * (hiMs - loMs));
  }

  async hold(ms) {
    await sleep(ms);
  }

  async holdUntil(msFromLineStart) {
    const rest = this.lineStart + msFromLineStart - Date.now();
    if (rest > 0) await sleep(rest);
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
    const ms = opts.ms ?? Math.max(2800, this.lineStart + this.line.ms + 400 - Date.now());
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

module.exports = { openStage, alignWords, OUT };
