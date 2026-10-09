// An inset: something the viewer would see outside the recorded apps — the
// sign-in page a click opens in the browser — drawn as a browser window over
// the picture for part of a line (lesson.json "insets"). It stays put while
// the picture zooms underneath and fades in and out.
//   { line, from, to, image, url, box: [x, y, w], click: { at: [x, y], t } }
// `from`/`to` are seconds into the line, `image` a file in the lesson folder
// (a screenshot of the page), `url` the address its bar shows, `box` the
// window's left, top and width in canvas points (1280 x 720). `click` draws
// the pointer gliding onto a spot of the page (`at`, a share of the
// screenshot's width and height) and clicking it `t` seconds into the line.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const FADE_S = 0.35;
const BAR = 30;
const POINTER = 26;
const RING = 34;
const RING_S = 0.35;
const GLIDE_S = 0.7;

function insetTimes(timeline, insets = []) {
  return insets.map((inset) => {
    const line = timeline.lines.find((l) => l.id === inset.line);
    if (!line) throw new Error(`lesson.json insets: no line "${inset.line}" in this take`);
    const start = line.startMs / 1000;
    return { ...inset, startS: start + inset.from, endS: start + inset.to, ...(inset.click && { clickS: start + inset.click.t }) };
  });
}

// The window, drawn once into `dir` as a full-frame PNG on transparency.
async function insetAsset(dir, { out, zoom, inset, lessonDir }) {
  const image = path.resolve(lessonDir, inset.image);
  if (!fs.existsSync(image)) throw new Error(`lesson.json insets: ${image} is missing`);
  const look = crypto.createHash("sha1").update(JSON.stringify([out, zoom, inset.box, inset.url, BAR, fs.statSync(image).mtimeMs])).digest("hex").slice(0, 10);
  const file = path.join(dir, `inset-${look}.png`);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(dir, { recursive: true });
  const { chromium, CHROME } = require("./browser");
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: out, deviceScaleFactor: 1 });
    const [x, y, w] = inset.box.map((v) => v * zoom);
    const bar = BAR * zoom;
    const src = `data:image/png;base64,${fs.readFileSync(image).toString("base64")}`;
    await page.setContent(`<!doctype html><style>
html, body { margin: 0; background: transparent; width: ${out.width}px; height: ${out.height}px; overflow: hidden; }
.win { position: absolute; left: ${x}px; top: ${y}px; width: ${w}px; border-radius: ${10 * zoom}px; overflow: hidden; background: #fff;
  box-shadow: 0 0 0 ${zoom}px rgba(0,0,0,.14), 0 ${26 * zoom}px ${70 * zoom}px ${-16 * zoom}px rgba(0,0,0,.5), 0 ${6 * zoom}px ${18 * zoom}px ${-8 * zoom}px rgba(0,0,0,.25); }
.bar { height: ${bar}px; background: #ececec; border-bottom: ${zoom}px solid #d6d6d6; display: flex; align-items: center; padding: 0 ${10 * zoom}px; gap: ${6 * zoom}px; box-sizing: border-box; }
.dot { width: ${10 * zoom}px; height: ${10 * zoom}px; border-radius: 50%; }
.url { margin-left: ${14 * zoom}px; flex: 1; height: ${19 * zoom}px; border-radius: ${6 * zoom}px; background: #fff; color: #3a3a3a;
  font: ${11 * zoom}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif; display: flex; align-items: center; justify-content: center; }
img { display: block; width: 100%; }
</style><div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="url">${inset.url || ""}</span></div><img src="${src}"></div>`);
    await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = r))))));
    await page.screenshot({ path: file, omitBackground: true });
  } finally {
    await browser.close();
  }
  return file;
}

// The drawn pointer and the ring a click leaves, at the picture's scale.
async function pointerAssets(dir, zoom) {
  const cursor = path.join(dir, `inset-cursor-${zoom}.png`);
  const ring = path.join(dir, `inset-ring-${zoom}.png`);
  if (fs.existsSync(cursor) && fs.existsSync(ring)) return { cursor, ring, size: POINTER * zoom, ringSize: RING * zoom };
  fs.mkdirSync(dir, { recursive: true });
  const { chromium, CHROME } = require("./browser");
  const { CURSOR_SVG } = require("./overlay");
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const shot = async (file, size, html) => {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: zoom });
      await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}</style>${html}`);
      await page.screenshot({ path: file, omitBackground: true });
      await page.close();
    };
    await shot(cursor, POINTER, CURSOR_SVG.replace("<svg ", `<svg width="${POINTER}" height="${POINTER}" `));
    await shot(ring, RING, `<div style="width:${RING - 4}px;height:${RING - 4}px;margin:2px;border-radius:50%;border:2px solid rgba(17,17,17,.55);background:rgba(17,17,17,.12);box-sizing:border-box"></div>`);
  } finally {
    await browser.close();
  }
  return { cursor, ring, size: POINTER * zoom, ringSize: RING * zoom };
}

// The screenshot's size in pixels (a PNG's header).
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ffmpeg inputs and filter parts that lay the insets over `from`, out as
// `to`; `base` is the index the first input gets. An inset with a click
// adds the pointer and its ring (`pointer`, from pointerAssets; the inset
// carries `zoom` and its screenshot's `imageSize`).
function insetLayer({ from, to, base, insets, fps, pointer = null }) {
  const inputs = [];
  const parts = [];
  let n = base;
  let last = from;
  insets.forEach((inset, i) => {
    const len = Math.max(inset.endS - inset.startS, 2 * FADE_S);
    inputs.push("-framerate", String(fps), "-loop", "1", "-t", len.toFixed(3), "-i", inset.file);
    const out = `ins${i}`;
    parts.push(
      `[${n++}:v]format=rgba,fade=t=in:st=0:d=${FADE_S}:alpha=1,fade=t=out:st=${(len - FADE_S).toFixed(3)}:d=${FADE_S}:alpha=1,setpts=PTS-STARTPTS+${inset.startS.toFixed(3)}/TB[in${i}]`,
      `[${last}][in${i}]overlay=x=0:y=0:eof_action=pass[${out}]`,
    );
    last = out;
    if (inset.click && pointer) {
      const zoom = inset.zoom;
      const img = inset.imageSize;
      const [bx, by, bw] = inset.box.map((v) => v * zoom);
      const shown = { w: bw, h: (bw * img.h) / img.w };
      const tx = bx + inset.click.at[0] * shown.w;
      const ty = by + BAR * zoom + inset.click.at[1] * shown.h;
      const hot = { x: (9 / 24) * pointer.size, y: (5 / 24) * pointer.size };
      const t1 = inset.clickS;
      const t0 = t1 - GLIDE_S;
      const sx = tx + shown.w * 0.22;
      const sy = ty + shown.h * 0.3;
      const p = `clip((t-${t0.toFixed(3)})/${GLIDE_S},0,1)`;
      const e = `if(lt(${p},0.5),4*pow(${p},3),1-pow(-2*${p}+2,3)/2)`;
      const x = `${(sx - hot.x).toFixed(1)}+${(tx - sx).toFixed(1)}*(${e})`;
      const y = `${(sy - hot.y).toFixed(1)}+${(ty - sy).toFixed(1)}*(${e})`;
      const shownFrom = Math.max(inset.startS + FADE_S, t0 - 0.2);
      const until = inset.endS - FADE_S;
      inputs.push("-framerate", String(fps), "-loop", "1", "-i", pointer.ring, "-framerate", String(fps), "-loop", "1", "-i", pointer.cursor);
      parts.push(
        `[${last}][${n++}:v]overlay=x=${(tx - pointer.ringSize / 2).toFixed(1)}:y=${(ty - pointer.ringSize / 2).toFixed(1)}:enable='between(t,${t1.toFixed(3)},${(t1 + RING_S).toFixed(3)})':shortest=0:repeatlast=1[inr${i}]`,
        `[inr${i}][${n++}:v]overlay=x='${x}':y='${y}':enable='between(t,${shownFrom.toFixed(3)},${until.toFixed(3)})':shortest=0:repeatlast=1[inp${i}]`,
      );
      last = `inp${i}`;
    }
  });
  parts.push(`[${last}]null[${to}]`);
  return { inputs, parts, count: n - base };
}

module.exports = { insetTimes, insetAsset, insetLayer, pointerAssets, pngSize };
