// An inset: something the viewer would see outside the recorded apps — the
// sign-in page a click opens in the browser — drawn as a browser window over
// the picture for part of a line (lesson.json "insets"). It stays put while
// the picture zooms underneath and fades in and out.
//   { line, from, to, image, url, box: [x, y, w] }
// `from`/`to` are seconds into the line, `image` a file in the lesson folder
// (a screenshot of the page), `url` the address its bar shows, `box` the
// window's left, top and width in canvas points (1280 x 720).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const FADE_S = 0.35;
const BAR = 30;

function insetTimes(timeline, insets = []) {
  return insets.map((inset) => {
    const line = timeline.lines.find((l) => l.id === inset.line);
    if (!line) throw new Error(`lesson.json insets: no line "${inset.line}" in this take`);
    return { ...inset, startS: line.startMs / 1000 + inset.from, endS: line.startMs / 1000 + inset.to };
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

// ffmpeg inputs and filter parts that lay the insets over `from`, out as
// `to`; `base` is the index the first input gets.
function insetLayer({ from, to, base, insets, fps }) {
  const inputs = [];
  const parts = [];
  insets.forEach((inset, i) => {
    const len = Math.max(inset.endS - inset.startS, 2 * FADE_S);
    inputs.push("-framerate", String(fps), "-loop", "1", "-t", len.toFixed(3), "-i", inset.file);
    parts.push(
      `[${base + i}:v]format=rgba,fade=t=in:st=0:d=${FADE_S}:alpha=1,fade=t=out:st=${(len - FADE_S).toFixed(3)}:d=${FADE_S}:alpha=1,setpts=PTS-STARTPTS+${inset.startS.toFixed(3)}/TB[in${i}]`,
      `[${i ? `ins${i}` : from}][in${i}]overlay=x=0:y=0:eof_action=pass[${i === insets.length - 1 ? to : `ins${i + 1}`}]`,
    );
  });
  return { inputs, parts };
}

module.exports = { insetTimes, insetAsset, insetLayer };
