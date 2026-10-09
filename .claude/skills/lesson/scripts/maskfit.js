// A phone mask's edges, fitted to the recording: the beat starts and ends a
// mask when the accessibility tree says so, which runs a few frames behind
// what is on screen. A mask with `fit` keeps the frames where its spot on the
// screen looks as it does mid-way (a sheet's address bar at rest), and the
// still stretch just before (the page still loading under it). Around that,
// while the sheet slides in and out, the dark marks it hides (the address's
// letters) are followed up and down the screen and the mask moves with them
// (`track`: [[ms, dy], …] in device points), so nothing shows through.
const { execFileSync } = require("child_process");

const FPS = 30;
const REACH_S = 3;
const SAME = 6;
const LEAD = 5;
const LEAD_FRAMES = 6;
const SETTLE_FRAMES = 12;
const TRACK_S = 2.5;
const MATCH = 0.3;
const INK = 110;

// The capture runs at a steady FPS, its frames offset from whole frame times
// by `phase` (the first frame's time).
const phases = new Map();
function phase(raw) {
  if (!phases.has(raw)) {
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "frame=pts_time", "-read_intervals", "%+#1", "-of", "csv=p=0", raw], { encoding: "utf8" });
    phases.set(raw, parseFloat(out) || 0);
  }
  return phases.get(raw);
}

// The capture's own frames from `fromS` on (the first at or after it), so
// frame i is on screen from `t(i)` seconds, the time the compositor sees.
function grayFrames(raw, fromS, lenS, crop) {
  const [w, h, x, y] = crop;
  const buf = execFileSync("ffmpeg", ["-v", "error", "-ss", fromS.toFixed(3), "-t", lenS.toFixed(3), "-i", raw,
    "-vf", `crop=${w}:${h}:${x}:${y},format=gray`, "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 28 });
  const size = w * h;
  const n = Math.floor(buf.length / size);
  const p = phase(raw);
  const t0 = p + Math.ceil((fromS - p) * FPS - 1e-3) / FPS;
  return { n, at: (i) => buf.subarray(i * size, (i + 1) * size), t: (i) => t0 + i / FPS };
}

const mad = (a, b) => {
  let d = 0;
  for (let j = 0; j < a.length; j++) d += Math.abs(a[j] - b[j]);
  return d / a.length;
};

// Where the hidden marks sit in each frame of a strip the mask's width and
// the screen's height: the vertical offset (in capture pixels) at which the
// rows that hold them match best. Only the marks' own pixels and the dark
// pixels around them count, so a blank card or other text never passes; the
// list ends at the first frame without them.
function follow(strip, frames, glyph, rows, y0) {
  const w = glyph.length / rows;
  const out = [];
  for (const i of frames) {
    const f = strip.at(i);
    const height = f.length / w;
    let best = null;
    for (let y = 0; y + rows <= height; y++) {
      let ink = 0;
      let miss = 0;
      for (let j = 0, o = y * w; j < glyph.length; j++) {
        const g = glyph[j];
        const v = f[o + j];
        if (g < INK || v < INK) {
          ink++;
          if (Math.abs(g - v) > 60) miss++;
        }
      }
      const d = ink ? miss / ink : 1;
      if (!best || d < best.d) best = { y, d };
    }
    if (!best || best.d > MATCH) break;
    out.push({ i, dy: best.y - y0 });
  }
  return out;
}

function fitMask(raw, region, device, mask) {
  const k = region.w / device.w;
  const [x, y, w, h] = mask.rect.map((v) => Math.round(v * k));
  const from = Math.max(0, mask.fromMs / 1000 - REACH_S);
  const len = mask.toMs / 1000 + REACH_S - from;
  const cw = Math.max(2, Math.round(w / 2) * 2);
  const ch = Math.max(2, Math.round(h / 2) * 2);
  const spot = grayFrames(raw, from, len, [cw, ch, region.x + x, region.y + y]);
  const { at } = spot;
  const ms = (i) => Math.round(spot.t(i) * 1000);
  const mid = Math.min(spot.n - 1, Math.round(((mask.fromMs + mask.toMs) / 2000 - spot.t(0)) * FPS));
  const ref = at(mid);
  const same = (i, to, max = SAME) => mad(at(i), to) < max;
  let a = mid;
  while (a > 0 && same(a - 1, ref)) a--;
  // The still stretch before, past the few frames where it settled (a label
  // easing into place): each frame close to the one after it.
  for (let j = a - 1; j >= Math.max(1, a - SETTLE_FRAMES); j--) {
    let lead = j;
    while (lead > 0 && same(lead - 1, at(lead), LEAD)) lead--;
    if (j - lead >= LEAD_FRAMES) {
      a = lead;
      break;
    }
  }
  let b = mid;
  while (b + 1 < spot.n && same(b + 1, ref)) b++;
  const still = { ...mask, fromMs: ms(a), toMs: ms(b + 1) };

  // The rows of the still spot that hold dark marks (the letters) are what
  // gets followed while the sheet moves.
  const dark = [];
  for (let r = 0; r < ch; r++) {
    const row = ref.subarray(r * cw, (r + 1) * cw);
    if (row.some((v) => v < INK)) dark.push(r);
  }
  if (!dark.length) return [still];
  const r0 = Math.max(0, dark[0] - 2);
  const rows = Math.min(ch, dark.at(-1) + 3) - r0;
  const glyph = ref.subarray(r0 * cw, (r0 + rows) * cw);
  const strip = grayFrames(raw, from, len, [cw, region.h, region.x + x, region.y]);
  const y0 = y + r0;
  const span = Math.round(TRACK_S * FPS);
  const before = follow(strip, Array.from({ length: Math.min(span, a) }, (_, n) => a - 1 - n), glyph, rows, y0).reverse();
  const after = follow(strip, Array.from({ length: Math.min(span, strip.n - b - 1) }, (_, n) => b + 1 + n), glyph, rows, y0);
  const moving = (list) =>
    list.length && {
      ...mask,
      fromMs: ms(list[0].i),
      toMs: ms(list.at(-1).i + 1),
      track: list.map(({ i, dy }) => [ms(i), +(dy / k).toFixed(1)]),
    };
  return [moving(before), still, moving(after)].filter(Boolean);
}

function fitMasks(raw, timeline, masks, device, log = () => {}) {
  return masks.flatMap((m) => {
    if (!m.fit) return [m];
    const fitted = fitMask(raw, timeline.phone.region, device, m);
    const parts = fitted.map((f) => `${f.fromMs}-${f.toMs}${f.track ? " moving" : ""}`).join(", ");
    log(`phone mask ${m.rect.join(",")}: ${m.fromMs}-${m.toMs} ms fitted to ${parts} ms`);
    return fitted;
  });
}

module.exports = { fitMasks };
