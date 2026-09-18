// The floating-window frame for an app recording, built at mux time: the raw
// window capture gets rounded corners and sits on the warm canvas with a soft
// shadow, and the topic cards fade in over it where the timeline says.
const fs = require("fs");
const path = require("path");
const { chromium, CHROME } = require("./browser");
const { CARD_FADE_MS } = require("./appstage");

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

// ffmpeg inputs and the video half of the filter graph. Input 0 is the window
// capture; the caller appends the audio inputs after these.
function videoGraph({ bg, mask, box, cards, cardFiles, totalMs }) {
  const inputs = ["-loop", "1", "-i", bg, "-loop", "1", "-i", mask];
  for (const f of cardFiles) inputs.push("-i", f);
  const parts = [
    `[0:v]scale=${box.w}:${box.h},format=rgba[w0]`,
    `[2:v]format=gray[m]`,
    `[w0][m]alphamerge[w]`,
    `[1:v][w]overlay=x=${box.x}:y=${box.y}:eof_action=repeat[v0]`,
  ];
  let last = "v0";
  const fade = CARD_FADE_MS / 1000;
  cards.forEach((card, i) => {
    // The opener covers the take from its first frame; its words come in when
    // the beat ran, so the lead before them is blank canvas, as on the demo.
    const start = card.first ? 0 : card.startMs / 1000;
    const len = (card.first ? card.startMs + card.ms : card.ms) / 1000;
    const end = card.hold ? totalMs / 1000 + 1 : start + len;
    const fades = [];
    if (!card.first) fades.push(`fade=t=in:st=0:d=${fade}:alpha=1`);
    if (!card.hold) fades.push(`fade=t=out:st=${(len - fade).toFixed(3)}:d=${fade}:alpha=1`);
    const chain = ["format=rgba", ...fades, `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB`].join(",");
    parts.push(`[${3 + i}:v]${chain}[c${i}]`);
    parts.push(`[${last}][c${i}]overlay=eof_action=${card.hold ? "repeat" : "pass"}:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[v${i + 1}]`);
    last = `v${i + 1}`;
  });
  parts.push(`[${last}]format=yuv420p[vout]`);
  return { inputs, filter: parts.join(";"), label: "[vout]", count: 2 + cardFiles.length };
}

module.exports = { frameAssets, videoGraph };
