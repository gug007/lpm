// The YouTube cover when lesson.json has a "cover": the cards' canvas and
// serif, a few big words, and the app itself at a moment of the take.
// "window" sets the words left and the window right, running off the edge;
// "closeup" fills everything under a band of canvas with the crop, big;
// "phone" (a lesson with lpm Link beside the app) sets the words left and the
// phone's screen right, in a drawn iPhone.
// Without a "cover" the thumbnail stays the opening card (cards.js).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { CANVAS, POOLS, POOLS_AT_REST } = require("./overlay");
const { CAPTURE_IN } = require("./compose");

const STYLES = ["window", "closeup", "phone"];
// The pane right of the sidebar, under the header, in the window's points.
const DEFAULT_CROP = [260, 120, 580, 260];
const SERIF = `"Iowan Old Style", "Palatino", Georgia, serif`;

const canvasCss = `
  html, body { margin: 0; width: 2560px; height: 1440px; overflow: hidden; }
  body { position: relative; background: ${CANVAS}; font-family: ${SERIF}; color: #141414; }
  .pools { position: absolute; inset: -20%; filter: blur(60px); background: ${POOLS}; transform: ${POOLS_AT_REST}; }
  .words { position: absolute; font-weight: 600; letter-spacing: -0.025em; line-height: 1.02; text-wrap: balance; }
  .shot { position: absolute; overflow: hidden; }
  .shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top left; }
`;

function layout(style, words, img, aspect) {
  if (style === "phone") {
    const h = 1240;
    const w = Math.round(h * aspect);
    return `<style>${canvasCss}
      .words { left: 128px; top: 50%; transform: translateY(-50%); width: 1300px; font-size: 220px; }
      .phone { position: absolute; left: ${2560 - w - 300}px; top: ${720 - h / 2}px; width: ${w}px; height: ${h}px; padding: 18px; border-radius: 118px; background: #101012; border: 2px solid #4a4a50;
        box-shadow: 0 80px 180px -40px rgba(0,0,0,.55), 0 20px 52px -20px rgba(0,0,0,.35); }
      .phone img { display: block; width: 100%; height: 100%; border-radius: 100px; object-fit: cover; }
    </style>
    <div class="pools"></div>
    <div class="words">${words}</div>
    <div class="phone"><img src="${img}"></div>`;
  }
  if (style === "closeup") {
    return `<style>${canvasCss}
      body { background: #1b1b1b; }
      .shot { left: 0; top: 536px; width: 2560px; height: 904px; }
      .band { position: absolute; left: 0; top: 0; width: 2560px; height: 500px; overflow: hidden; background: ${CANVAS}; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
      .words { left: 0; top: 100px; width: 2560px; text-align: center; font-size: 264px; }
    </style>
    <div class="shot"><img src="${img}"></div>
    <div class="band"><div class="pools"></div></div>
    <div class="words">${words}</div>`;
  }
  const w = 1580;
  const h = Math.round(w / aspect);
  return `<style>${canvasCss}
    .words { left: 128px; top: 50%; transform: translateY(-50%); width: 900px; font-size: 208px; }
    .shot { left: 1080px; top: ${720 - h / 2}px; width: ${w}px; height: ${h}px; border-radius: 36px; background: #1b1b1b; box-shadow: 0 0 0 2px rgba(0,0,0,.14), 0 80px 180px -40px rgba(0,0,0,.55), 0 20px 52px -20px rgba(0,0,0,.35); }
  </style>
  <div class="pools"></div>
  <div class="words">${words}</div>
  <div class="shot"><img src="${img}"></div>`;
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "’");

// `raw` is the take's capture and `timeline` the take's own (the cover's line
// is found in take time); `frame` is the app window's size in points.
async function renderCover({ cover, raw, timeline, frame, file }) {
  const line = timeline.lines.find((l) => l.id === cover.line);
  if (!line) throw new Error(`cover: the take has no line "${cover.line}"`);
  const style = cover.style || "window";
  if (style === "phone" && !timeline.phone) throw new Error('cover: style "phone" needs a take with lpm Link beside the app');
  const rawWidth = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width", "-of", "csv=p=0", raw], { encoding: "utf8" }).trim());
  // The phone's screen is cut where the take found it, in the capture's pixels.
  const k = style === "phone" ? 1 : rawWidth / frame.width;
  const r = timeline.phone?.region;
  const [x, y, w, h] = style === "phone" ? [r.x, r.y, r.w, r.h] : cover.crop || DEFAULT_CROP;
  const work = `${file}.work`;
  fs.mkdirSync(work, { recursive: true });
  try {
    const shot = path.join(work, "shot.png");
    const at = line.startMs / 1000 + (cover.at || 0);
    const crop = [w, h, x, y].map((v) => Math.round(v * k)).join(":");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", at.toFixed(3), "-i", raw, "-frames:v", "1", "-vf", `scale=${CAPTURE_IN},crop=${crop}`, shot]);
    const page = path.join(work, "cover.html");
    fs.writeFileSync(page, `<!doctype html><meta charset="utf-8">${layout(style, escape(cover.words), "shot.png", w / h)}`);
    const { chromium, CHROME } = require("./browser");
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    try {
      const tab = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
      await tab.goto(`file://${page}`, { waitUntil: "load" });
      await tab.evaluate(() => document.fonts.ready);
      await tab.screenshot({ path: path.join(work, "cover.png") });
    } finally {
      await browser.close();
    }
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(work, "cover.png"), "-vf", "scale=1280:720:flags=lanczos", "-q:v", "2", file]);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { STYLES, renderCover };
