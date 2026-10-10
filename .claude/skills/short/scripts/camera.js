// The vertical camera. The window capture floats on a tall 9:16 canvas; the
// camera is a 9:16 crop of that canvas, scaled to 1080x1920. Scale 1 is the
// wide shot (the whole window width with a thin margin); a push-in centres its
// target a little above the middle, clear of the caption band, and the camera
// pans after the pointer when it leaves a pushed-in shot. The canvas is wide
// enough that any edge of the window can be centred without running out.
const { track } = require("./shared")("keyframes");

const OUT = { width: 1080, height: 1920 };
const FPS = 30;
const MARGIN = 0.05;
const SPAN = 1.8;
const ANCHOR_Y = 0.36;

const even = (n) => Math.round(n / 2) * 2;

// `win` is the capture in physical pixels. `shiftY` shows the window that many
// output pixels below centre in the wide shot.
function geometry(win, { shiftY = 0 } = {}) {
  const cw = even(win.w * SPAN);
  const ch = even((cw * 16) / 9);
  if (win.h > ch) throw new Error(`a ${win.w}x${win.h} window is too tall for the vertical canvas`);
  const g = {
    win,
    canvas: { w: cw, h: ch },
    ox: even((cw - win.w) / 2),
    oy: even((ch - win.h) / 2),
    zFit: cw / (win.w * (1 + 2 * MARGIN)),
  };
  g.centre = { cx: g.ox + win.w / 2, cy: g.oy + win.h / 2 - (shiftY * crop(g, 1).h) / OUT.height };
  return g;
}

function crop(g, s) {
  const w = g.canvas.w / (g.zFit * s);
  return { w, h: (w * 16) / 9 };
}

// Camera keyframes { startMs, ms, s, cx, cy } (crop centre, canvas pixels)
// from the stage's focus/wide calls (points, `scale` physical px per point)
// and its pointer moves. A pan never starts before the previous move is over.
function cameraKeys({ zooms = [], pointer = [], g, scale }) {
  const { centre } = g;
  const aim = (s, x, y) => ({ cx: g.ox + x * scale, cy: g.oy + y * scale + (0.5 - ANCHOR_Y) * crop(g, s).h });
  const events = [
    ...zooms.map((z) => ({ t: z.startMs, zoom: z })),
    ...pointer.map((p) => ({ t: p.startMs, move: p })),
  ].sort((a, b) => a.t - b.t);
  const keys = [];
  let cur = { s: 1, ...centre };
  let busyUntil = 0;
  for (const e of events) {
    if (e.zoom) {
      const z = e.zoom;
      while (keys.length && keys.at(-1).startMs >= z.startMs) keys.pop();
      cur = z.x == null ? { s: 1, ...centre } : { s: z.scale, ...aim(z.scale, z.x, z.y) };
      keys.push({ startMs: z.startMs, ms: z.ms, ...cur });
      busyUntil = z.startMs + z.ms;
      continue;
    }
    if (cur.s <= 1.05) continue;
    const p = e.move;
    const q = { x: g.ox + p.x * scale, y: g.oy + p.y * scale };
    const c = crop(g, cur.s);
    const left = cur.cx - c.w / 2;
    const top = cur.cy - c.h / 2;
    const inside = q.x > left + 0.1 * c.w && q.x < left + 0.9 * c.w && q.y > top + 0.12 * c.h && q.y < top + 0.78 * c.h;
    if (inside) continue;
    cur = { s: cur.s, ...aim(cur.s, p.x, p.y) };
    const startMs = Math.max(p.startMs, busyUntil);
    const ms = Math.max(p.ms, 450);
    keys.push({ startMs, ms, ...cur });
    busyUntil = startMs + ms;
  }
  return keys;
}

// The zoompan stage for a stream whose first frame is take frame `offset`.
function cameraFilter(keys, g, offset = 0) {
  const fk = keys.map((k) => ({ ...k, f: Math.round((k.startMs / 1000) * FPS), d: Math.max(1, Math.round((k.ms / 1000) * FPS)) }));
  const n = offset ? `(in+${offset})` : "in";
  const { centre } = g;
  const z = track(fk, g.zFit, (k) => g.zFit * k.s, n);
  const cx = track(fk, centre.cx, (k) => k.cx, n);
  const cy = track(fk, centre.cy, (k) => k.cy, n);
  const x = `clip(${cx}-iw/zoom/2,0,iw-iw/zoom)`;
  const y = `clip(${cy}-ih/zoom/2,0,ih-ih/zoom)`;
  return `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${OUT.width}x${OUT.height}:fps=${FPS}`;
}

module.exports = { OUT, FPS, geometry, cameraKeys, cameraFilter, crop };
