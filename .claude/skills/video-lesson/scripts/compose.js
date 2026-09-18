// The finished picture, built at mux time: for an app take the raw window
// capture gets rounded corners and sits on the warm canvas with a soft shadow;
// zoom keyframes ease the picture in on small targets and back out; the topic
// cards fade in over everything where the timeline says.
const fs = require("fs");
const path = require("path");
const { chromium, CHROME } = require("./browser");
const { CARD_FADE_MS } = require("./appstage");

const FPS = 30;

// Where the window sits in the output, in output pixels.
function frameBox(out, frame, zoom) {
  return {
    x: ((out.width / zoom - frame.width) / 2) * zoom,
    y: ((out.height / zoom - frame.height) / 2) * zoom,
    w: frame.width * zoom,
    h: frame.height * zoom,
  };
}

// Canvas + shadowed box (bg.png) and the box's rounded alpha (mask.png), drawn
// once by Chromium from the same CSS the demo stage uses.
async function frameAssets(dir, { out, frame, box }) {
  fs.mkdirSync(dir, { recursive: true });
  const bg = path.join(dir, `bg-${box.w}x${box.h}.png`);
  const mask = path.join(dir, `mask-${box.w}x${box.h}.png`);
  if (fs.existsSync(bg) && fs.existsSync(mask)) return { bg, mask };
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: out, deviceScaleFactor: 1 });
  const shadow = `0 0 0 ${frame.zoom}px rgba(0,0,0,.10), 0 ${24 * frame.zoom}px ${70 * frame.zoom}px ${-18 * frame.zoom}px rgba(0,0,0,.45), 0 ${6 * frame.zoom}px ${18 * frame.zoom}px ${-8 * frame.zoom}px rgba(0,0,0,.25)`;
  const radius = frame.radius * frame.zoom;
  await page.setContent(`<!doctype html><style>
html, body { margin: 0; background: ${frame.canvas}; width: ${out.width}px; height: ${out.height}px; overflow: hidden; }
#box { position: absolute; left: ${box.x}px; top: ${box.y}px; width: ${box.w}px; height: ${box.h}px; border-radius: ${radius}px; background: #101010; box-shadow: ${shadow}; }
</style><div id="box"></div>`);
  await page.screenshot({ path: bg });
  await page.setContent(`<!doctype html><style>
html, body { margin: 0; background: #000; width: ${box.w}px; height: ${box.h}px; overflow: hidden; }
#box { position: absolute; inset: 0; border-radius: ${radius}px; background: #fff; }
</style><div id="box"></div>`);
  await page.setViewportSize({ width: box.w, height: box.h });
  await page.screenshot({ path: mask });
  await browser.close();
  return { bg, mask };
}

// A value over the input frame count: held between keyframes, eased (cosine)
// over each keyframe's transition from the previous value.
function keyed(keys, initial, pick) {
  let expr = String(initial);
  let prev = initial;
  for (const k of keys) {
    const v = pick(k);
    const p = `((in-${k.f})/${k.d})`;
    const eased = `(${prev}+(${v}-${prev})*(1-cos(PI*${p}))/2)`;
    expr = `if(lt(in,${k.f}),${expr},if(lt(in,${k.f + k.d}),${eased},${v}))`;
    prev = v;
  }
  return expr;
}

// zoompan crops iw/zoom × ih/zoom around the eased centre and scales it back up.
function zoomStage(zooms, out) {
  const keys = zooms
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
    .map((z) => ({ f: Math.round((z.startMs / 1000) * FPS), d: Math.max(1, Math.round((z.ms / 1000) * FPS)), ...z }));
  const z = keyed(keys, 1, (k) => k.scale);
  const cx = keyed(keys, out.width / 2, (k) => k.cx);
  const cy = keyed(keys, out.height / 2, (k) => k.cy);
  const x = `clip(${cx}-iw/zoom/2,0,iw-iw/zoom)`;
  const y = `clip(${cy}-ih/zoom/2,0,ih-ih/zoom)`;
  return `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${out.width}x${out.height}:fps=${FPS}`;
}

// ffmpeg inputs and the video half of the filter graph. Input 0 is the take;
// the caller appends the audio inputs after these. `composite` is false for a
// demo take, which already carries its frame and cards.
function videoGraph({ out, bg, mask, box, cards = [], cardFiles = [], zooms = [], totalMs, composite = true }) {
  const inputs = [];
  const parts = [];
  let last = "0:v";
  let next = 1;
  if (composite) {
    inputs.push("-framerate", String(FPS), "-loop", "1", "-i", bg, "-framerate", String(FPS), "-loop", "1", "-i", mask);
    parts.push(
      `[0:v]scale=${box.w}:${box.h},format=rgba[w0]`,
      `[2:v]format=gray[m]`,
      `[w0][m]alphamerge[w]`,
      `[1:v][w]overlay=x=${box.x}:y=${box.y}:eof_action=repeat[v0]`,
    );
    last = "v0";
    next = 3;
  }
  if (zooms.length) {
    parts.push(`[${last}]${zoomStage(zooms, out)}[vz]`);
    last = "vz";
  }
  const fade = CARD_FADE_MS / 1000;
  cards.forEach((card, i) => {
    inputs.push("-i", cardFiles[i]);
    // The opener covers the take from its first frame; its words come in when
    // the beat ran, so the lead before them is blank canvas, as on the demo.
    const start = card.first ? 0 : card.startMs / 1000;
    const len = (card.first ? card.startMs + card.ms : card.ms) / 1000;
    const end = card.hold ? totalMs / 1000 + 1 : start + len;
    const fades = [];
    if (!card.first) fades.push(`fade=t=in:st=0:d=${fade}:alpha=1`);
    if (!card.hold) fades.push(`fade=t=out:st=${(len - fade).toFixed(3)}:d=${fade}:alpha=1`);
    const chain = ["format=rgba", ...fades, `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB`].join(",");
    parts.push(`[${next + i}:v]${chain}[c${i}]`);
    parts.push(`[${last}][c${i}]overlay=eof_action=${card.hold ? "repeat" : "pass"}:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[v${i + 1}]`);
    last = `v${i + 1}`;
  });
  const count = inputs.filter((a) => a === "-i").length;
  if (!parts.length) return { inputs, filter: null, label: "0:v", count };
  parts.push(`[${last}]format=yuv420p[vout]`);
  return { inputs, filter: parts.join(";"), label: "[vout]", count };
}

module.exports = { FPS, frameBox, frameAssets, videoGraph, zoomStage };
