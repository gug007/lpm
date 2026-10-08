// The camera: it frames whatever each click changed. A tap whose response
// stays on one device and fills only part of it (a menu, the message field,
// a reply arriving) eases the picture in on that part, up to 1.8x; a response
// on both devices (a tap on the phone that starts something on the Mac)
// eases back out so cause and effect are both in view. A click outside the
// current close-up always pulls back first.
const { strong, weak } = require("./activity");
const { outTime } = require("./edit");

const MAX_SCALE = 1.8;
const MIN_SCALE = 1.25;
const LOOK = 4;
const PAD = 36;
const MOVE = 0.55;

const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const rel = (win, rect) => ({ x: win.x - rect.x, y: win.y - rect.y, w: win.w, h: win.h });

// The stage rectangle a target shows, for checking what is in view.
function view(t, stage) {
  const w = stage.w / t.scale;
  const h = stage.h / t.scale;
  const x = Math.min(Math.max(t.cx - w / 2, 0), stage.w - w);
  const y = Math.min(Math.max(t.cy - h / 2, 0), stage.h - h);
  return { x, y, w, h };
}

function plan({ events, frames, rec, layout, spans, duration }) {
  const stage = { w: layout.stageW, h: layout.stageH };
  const wide = { scale: 1, cx: stage.w / 2, cy: stage.h / 2, side: "both" };
  const sides = { phone: rel(rec.phone, rec.rect), mac: rel(rec.app, rec.rect) };
  const toStage = (x, y) => [layout.ox + x * layout.fit, layout.oy + y * layout.fit];
  const clicks = events.filter((e) => e.kind === "down");
  const keys = [];
  let current = wide;

  const target = (c, n) => {
    const side = inside(sides.phone, c.x, c.y) ? "phone" : "mac";
    const other = side === "phone" ? "mac" : "phone";
    const end = Math.min(clicks[n + 1]?.src ?? duration, c.src + LOOK);
    let box = null;
    let otherMoved = false;
    for (let i = Math.ceil(c.src * 10); i <= Math.min(frames.length - 1, end * 10); i++) {
      const f = frames[i];
      if (strong({ mac: other === "mac" ? f.mac : 0, phone: other === "phone" ? f.phone : 0 })) otherMoved = true;
      const b = f[`${side}Box`];
      if (!b || !weak({ mac: f[side], phone: 0 })) continue;
      box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
    }
    if (otherMoved) return wide;
    if (!box) return null;
    const r = sides[side];
    const x0 = Math.max(r.x, Math.min(box[0], c.x - 40) - PAD);
    const y0 = Math.max(r.y, Math.min(box[1], c.y - 40) - PAD);
    const x1 = Math.min(r.x + r.w, Math.max(box[2], c.x + 40) + PAD);
    const y1 = Math.min(r.y + r.h, Math.max(box[3], c.y + 40) + PAD);
    const scale = Math.min(stage.w / ((x1 - x0) * layout.fit), stage.h / ((y1 - y0) * layout.fit), MAX_SCALE);
    if (scale < MIN_SCALE) return wide;
    const [cx, cy] = toStage((x0 + x1) / 2, (y0 + y1) / 2);
    return { scale, cx, cy, side };
  };

  const same = (a, b) => Math.abs(a.scale - b.scale) < 0.15 && Math.hypot(a.cx - b.cx, a.cy - b.cy) < 80;
  const move = (t, next) => {
    if (same(current, next)) return;
    keys.push({ startMs: Math.max(0, t - 0.25) * 1000, ms: MOVE * 1000, ...next });
    current = next;
  };

  clicks.forEach((c, n) => {
    const t = outTime(spans, c.src);
    const [sx, sy] = toStage(c.x, c.y);
    if (current.scale > 1) {
      const v = view(current, stage);
      if (!inside(v, sx, sy)) move(t - 0.3, wide);
    }
    const next = target(c, n);
    if (next) move(t, next);
  });
  if (current.scale > 1) move(outTime(spans, duration) - 1.2, wide);
  return { keys, stage };
}

// Which header goes over the stage when: both device names at 1x, the one in
// view while zoomed in, in output seconds.
function headerWindows(keys, main) {
  const out = [];
  let side = "both";
  let from = 0;
  for (const k of keys) {
    if (k.side === side) continue;
    out.push({ side, from, to: k.startMs / 1000 });
    side = k.side;
    from = k.startMs / 1000;
  }
  out.push({ side, from, to: main + 1 });
  return out.filter((w) => w.to > w.from);
}

module.exports = { plan, headerWindows };
