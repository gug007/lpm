// The finished picture, built at mux time: for an app take the raw window
// capture gets rounded corners and sits on the cards' warm canvas with a soft
// shadow, rising into place as the opening card lifts away; zoom keyframes ease
// the picture in on small targets and back out; the topic cards fade in over
// everything where the timeline says.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { CARD_FADE_MS, OPEN_LIFT } = require("./appstage");
const { POOLS, POOLS_AT_REST } = require("./overlay");
const { track, toFrames } = require("./keyframes");

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

// Behind the app the pools stand still and fainter than on a card, so the
// window reads first.
const POOL_OPACITY = 0.5;

// The canvas with its pools (canvas.png), the window's shadow alone on
// transparency (shadow.png, so it can move with the window) and the box's
// rounded alpha (mask.png), drawn once by Chromium from the same CSS the demo
// stage uses. The file names carry the look, so a changed look never reuses a
// stale drawing.
async function frameAssets(dir, { out, frame, box }) {
  fs.mkdirSync(dir, { recursive: true });
  const look = crypto
    .createHash("sha1")
    .update(JSON.stringify([frame.canvas, POOLS, POOLS_AT_REST, POOL_OPACITY, frame.radius, frame.zoom, out, box]))
    .digest("hex")
    .slice(0, 10);
  const file = (kind) => path.join(dir, `${kind}-${box.w}x${box.h}-${look}.png`);
  const assets = { canvas: file("canvas"), shadow: file("shadow"), mask: file("mask") };
  if (Object.values(assets).every((f) => fs.existsSync(f))) return assets;
  const { chromium, CHROME } = require("./browser");
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: out, deviceScaleFactor: 1 });
  const shadow = `0 0 0 ${frame.zoom}px rgba(0,0,0,.10), 0 ${24 * frame.zoom}px ${70 * frame.zoom}px ${-18 * frame.zoom}px rgba(0,0,0,.45), 0 ${6 * frame.zoom}px ${18 * frame.zoom}px ${-8 * frame.zoom}px rgba(0,0,0,.25)`;
  const radius = frame.radius * frame.zoom;
  await page.setContent(`<!doctype html><style>
html, body { margin: 0; background: ${frame.canvas}; width: ${out.width}px; height: ${out.height}px; overflow: hidden; }
#pools { position: absolute; inset: -20%; filter: blur(60px); background: ${POOLS}; transform: ${POOLS_AT_REST}; opacity: ${POOL_OPACITY}; }
</style><div id="pools"></div>`);
  await page.screenshot({ path: assets.canvas });
  // An outer box-shadow is never painted under its own box, so a transparent
  // box leaves the shadow ring alone.
  await page.setContent(`<!doctype html><style>
html, body { margin: 0; background: transparent; width: ${out.width}px; height: ${out.height}px; overflow: hidden; }
#box { position: absolute; left: ${box.x}px; top: ${box.y}px; width: ${box.w}px; height: ${box.h}px; border-radius: ${radius}px; background: transparent; box-shadow: ${shadow}; }
</style><div id="box"></div>`);
  await page.screenshot({ path: assets.shadow, omitBackground: true });
  await page.setContent(`<!doctype html><style>
html, body { margin: 0; background: #000; width: ${box.w}px; height: ${box.h}px; overflow: hidden; }
#box { position: absolute; inset: 0; border-radius: ${radius}px; background: #fff; }
</style><div id="box"></div>`);
  await page.setViewportSize({ width: box.w, height: box.h });
  await page.screenshot({ path: assets.mask });
  await browser.close();
  return assets;
}

// How far below its place the window (and its shadow) sits at time t, in
// output pixels: all the way down under the opening card, easing out (cubic)
// into place from the moment the card starts to lift away.
function riseOffset(opener, box) {
  if (!opener) return "0";
  const at = ((opener.startMs + opener.ms - OPEN_LIFT.leadMs) / 1000).toFixed(3);
  const d = (OPEN_LIFT.riseMs / 1000).toFixed(3);
  const dist = Math.round(box.h * OPEN_LIFT.rise);
  return `if(lt(t,${at}),${dist},if(lt(t,${at}+${d}),${dist}*pow(1-(t-${at})/${d},3),0))`;
}

// zoompan crops iw/zoom × ih/zoom around the eased centre and scales it back
// up; a zoom that starts before the last one has finished eases on from
// wherever the picture had got to.
function zoomStage(zooms, out) {
  const keys = toFrames(zooms, FPS);
  const z = track(keys, 1, (k) => k.scale);
  const cx = track(keys, out.width / 2, (k) => k.cx);
  const cy = track(keys, out.height / 2, (k) => k.cy);
  const x = `clip(${cx}-iw/zoom/2,0,iw-iw/zoom)`;
  const y = `clip(${cy}-ih/zoom/2,0,ih-ih/zoom)`;
  return `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${out.width}x${out.height}:fps=${FPS}`;
}

// lesson.json "zooms" edits a take's zooms by id (`<line>#<n>`, see the mux
// log): `scale`, `at` (re-aimed inside the recorded target), `ms` (same end,
// longer or shorter ease) or `drop`.
function editZooms(zooms, edits = {}, log = () => {}) {
  const known = new Set(zooms.map((z) => z.id));
  for (const id of Object.keys(edits)) if (!known.has(id)) throw new Error(`lesson.json zooms: no zoom "${id}" in this take (it has ${[...known].join(", ") || "none"})`);
  return zooms.flatMap((z) => {
    const e = edits[z.id];
    if (!e) return [z];
    if (e.drop) {
      log(`zoom ${z.id}: dropped`);
      return [];
    }
    const next = { ...z };
    if (e.scale != null) next.scale = Math.min(3, Math.max(1, e.scale));
    if (e.at) {
      if (!z.rect) throw new Error(`lesson.json zooms: ${z.id} was recorded without its target, so "at" cannot move it; record it again`);
      next.cx = Math.round(z.rect.x + z.rect.w * e.at[0]);
      next.cy = Math.round(z.rect.y + z.rect.h * e.at[1]);
    }
    if (e.ms != null) {
      next.startMs = z.startMs + z.ms - e.ms;
      next.ms = e.ms;
    }
    log(`zoom ${z.id}: ${JSON.stringify(e)}`);
    return [next];
  });
}

// The capture is BT.709 video; the cards and canvas are sRGB drawings. The
// picture is composed in RGB and written as limited-range BT.709, tagged so.
const CAPTURE_IN = "in_color_matrix=bt709:in_range=pc";
const MASTER_OUT = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv";
const MASTER_TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
// A still grabbed from a master (cover, thumbnail, contact sheet) is a JPEG,
// which every viewer decodes as full-range BT.601.
const STILL_OUT = "out_color_matrix=bt601:out_range=pc";

// ffmpeg inputs and the video half of the filter graph. Input 0 is the take;
// the caller appends the audio inputs after these. `composite` is false for a
// demo take, which already carries its frame and cards.
function videoGraph({ out, canvas, shadow, mask, box, cards = [], cardFiles = [], zooms = [], totalMs, composite = true }) {
  const inputs = [];
  const parts = [];
  let last = "0:v";
  let next = 1;
  const opener = cards.find((c) => c.first && !c.hold);
  if (composite) {
    const still = (file) => ["-framerate", String(FPS), "-loop", "1", "-i", file];
    inputs.push(...still(canvas), ...still(shadow), ...still(mask));
    const dy = riseOffset(opener, box);
    parts.push(
      `[0:v]scale=${box.w}:${box.h}:${CAPTURE_IN},format=rgba[w0]`,
      `[3:v]format=gray[m]`,
      `[w0][m]alphamerge[w]`,
      `[2:v]format=rgba[s]`,
      `[1:v][s]overlay=x=0:y='${dy}'[bg]`,
      `[bg][w]overlay=x=${box.x}:y='${box.y}+${dy}':eof_action=repeat[v0]`,
    );
    last = "v0";
    next = 4;
  }
  if (zooms.length) {
    parts.push(`[${last}]${zoomStage(zooms, out)}[vz]`);
    last = "vz";
  }
  const fade = CARD_FADE_MS / 1000;
  cards.forEach((card, i) => {
    inputs.push("-i", cardFiles[i]);
    // The opener covers the take from its first frame; its words come in when
    // the beat ran, so the lead before them is blank canvas, as on the demo. It
    // fades out slower, over the window rising in, and runs on past its end.
    const start = card.first ? 0 : card.startMs / 1000;
    const lifts = card === opener && composite;
    const len = (card.first ? card.startMs + card.ms : card.ms) / 1000 + (lifts ? (OPEN_LIFT.fadeMs - OPEN_LIFT.leadMs) / 1000 : 0);
    const end = card.hold ? totalMs / 1000 + 1 : start + len;
    const fadeOut = lifts ? OPEN_LIFT.fadeMs / 1000 : fade;
    const fades = [];
    if (!card.first) fades.push(`fade=t=in:st=0:d=${fade}:alpha=1`);
    if (!card.hold) fades.push(`fade=t=out:st=${(len - fadeOut).toFixed(3)}:d=${fadeOut}:alpha=1`);
    const chain = ["format=rgba", ...fades, `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB`].join(",");
    parts.push(`[${next + i}:v]${chain}[c${i}]`);
    parts.push(`[${last}][c${i}]overlay=eof_action=${card.hold ? "repeat" : "pass"}:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[v${i + 1}]`);
    last = `v${i + 1}`;
  });
  const count = inputs.filter((a) => a === "-i").length;
  if (!parts.length) return { inputs, filter: null, label: "0:v", count, tags: [] };
  if (!composite) {
    parts.push(`[${last}]format=yuv420p[vout]`);
    return { inputs, filter: parts.join(";"), label: "[vout]", count, tags: [] };
  }
  parts.push(`[${last}]${MASTER_OUT}[vout]`);
  return { inputs, filter: parts.join(";"), label: "[vout]", count, tags: MASTER_TAGS };
}

module.exports = { FPS, frameBox, frameAssets, videoGraph, zoomStage, editZooms, CAPTURE_IN, MASTER_OUT, MASTER_TAGS, STILL_OUT };
