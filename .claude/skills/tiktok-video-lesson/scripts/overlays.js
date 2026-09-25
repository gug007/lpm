// Renders the look (look.js) to files the mux can use: the canvas and the
// window's rounded mask once per window size, and the text track as
// transparent PNG frames with an ffconcat list that holds each one for exactly
// as long as it is on screen. Frames are named by their content and the look, so
// a re-mux only paints what changed.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const shared = require("./shared");
const { chromium, CHROME } = shared("browser");
const { OUT, OVERLAY_HTML, paintScene, backdropHtml, maskHtml, GUIDES_HTML } = require("./look");

const FRAME_MS = 1000 / 30;
// Part of every frame's name, so a change to the look repaints it.
const LOOK = OVERLAY_HTML + paintScene.toString();
const POP_MS = { sticker: 240, page: 170 };

async function withPage(size, fn) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function shoot(size, html, file, transparent = false) {
  await withPage(size, async (page) => {
    await page.setContent(html);
    await page.screenshot({ path: file, omitBackground: transparent });
  });
}

async function renderBackdrop(dir, g, radius) {
  fs.mkdirSync(dir, { recursive: true });
  const tag = `${g.win.w}x${g.win.h}`;
  const bg = path.join(dir, `canvas-${tag}.png`);
  const mask = path.join(dir, `mask-${tag}.png`);
  if (!fs.existsSync(bg)) await shoot({ width: g.canvas.w, height: g.canvas.h }, backdropHtml(g, radius), bg);
  if (!fs.existsSync(mask)) await shoot({ width: g.win.w, height: g.win.h }, maskHtml(g, radius), mask);
  return { bg, mask };
}

async function renderGuides(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "safe-zones.png");
  if (!fs.existsSync(file)) await shoot(OUT, GUIDES_HTML, file, true);
  return file;
}

const unit = (v) => Math.min(1, Math.max(0, v));
const coarse = (v) => Math.round(v * 20) / 20;

function sceneAt(t, track) {
  const st = track.stickers.find((s) => t >= s.startMs && t < s.endMs);
  const pg = track.pages.find((p) => t >= p.startMs && t < p.endMs);
  let active = 0;
  if (pg) pg.words.forEach((w, i) => t >= w.ms && (active = i));
  return {
    sticker: st && { kind: st.kind, text: st.text, n: st.n ?? null, p: coarse(unit((t - st.startMs) / POP_MS.sticker)) },
    caption: pg && { words: pg.words.map((w) => [w.text, w.emph ? 1 : 0]), active, p: coarse(unit((t - pg.startMs) / POP_MS.page)) },
  };
}

// Every moment the picture changes: sticker and page edges, each spoken
// word, and the frames of every pop-in.
function sampleTimes(track, outMs) {
  const times = new Set([0]);
  const pop = (start, ms) => {
    for (let k = 0; k * FRAME_MS <= ms + FRAME_MS; k++) times.add(start + k * FRAME_MS);
  };
  for (const s of track.stickers) {
    pop(s.startMs, POP_MS.sticker);
    times.add(s.endMs);
  }
  for (const p of track.pages) {
    pop(p.startMs, POP_MS.page);
    times.add(p.endMs);
    for (const w of p.words) times.add(w.ms);
  }
  return [...times].map((t) => Math.round(t)).filter((t) => t >= 0 && t < outMs).sort((a, b) => a - b);
}

async function renderTrack(dir, track, outMs) {
  fs.mkdirSync(dir, { recursive: true });
  const times = [...new Set(sampleTimes(track, outMs))];
  const runs = [];
  for (const t of times) {
    const scene = sceneAt(t, track);
    const key = JSON.stringify(scene);
    if (runs.length && runs.at(-1).key === key) continue;
    runs.push({ t, key, scene });
  }
  const files = new Map();
  for (const r of runs) {
    const name = `t-${crypto.createHash("sha1").update(LOOK).update(r.key).digest("hex").slice(0, 16)}.png`;
    files.set(r.key, { name, scene: r.scene });
  }
  const todo = [...files.values()].filter((f) => !fs.existsSync(path.join(dir, f.name)));
  if (todo.length) {
    await withPage(OUT, async (page) => {
      await page.setContent(OVERLAY_HTML);
      await page.evaluate(() => document.fonts.ready);
      for (const f of todo) {
        await page.evaluate(`(${paintScene.toString()})(${JSON.stringify(f.scene)})`);
        await page.screenshot({ path: path.join(dir, f.name), omitBackground: true });
      }
    });
  }
  const list = ["ffconcat version 1.0"];
  runs.forEach((r, i) => {
    const end = i + 1 < runs.length ? runs[i + 1].t : outMs;
    list.push(`file '${files.get(r.key).name}'`, `duration ${((end - r.t) / 1000).toFixed(4)}`);
  });
  list.push(`file '${files.get(runs.at(-1).key).name}'`);
  const listFile = path.join(dir, "track.ffconcat");
  fs.writeFileSync(listFile, list.join("\n") + "\n");
  return { listFile, painted: todo.length, frames: runs.length };
}

module.exports = { renderBackdrop, renderGuides, renderTrack };
