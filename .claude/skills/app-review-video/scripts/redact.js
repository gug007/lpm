// Blurs other people's names before anyone sees the video: the phone's list
// of Macs on the Wi-Fi shows every lpm Mac nearby by its owner's name
// ("Someone's MacBook Pro"). Frames of the kept stretches are read twice a
// second with Vision; a line in someone's possessive form, an email address
// or a --redact pattern gets a blur box for as long as it is on screen. The
// review Mac's own name stays readable.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { helper } = require("./session");
const { outTime } = require("./edit");

const STEP = 0.5;
const PRIVATE = [/\S[’']s\s/, /[\w.+-]+@[\w-]+\.[\w.]+/];

function sampleFrames(raw, spans, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const within = spans.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+");
  execFileSync("ffmpeg", [
    "-v", "error", "-i", raw,
    "-vf", `setpts=PTS-STARTPTS,fps=${1 / STEP},select='${within}'`,
    "-fps_mode", "passthrough", "-frame_pts", "1", "-q:v", "3", path.join(dir, "%06d.jpg"),
  ]);
  return fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort().map((f) => ({ file: path.join(dir, f), src: Number(f.slice(0, -4)) * STEP }));
}

function redactions({ raw, spans, layout, keepName, patterns = [], work }) {
  const frames = sampleFrames(raw, spans, path.join(work, "ocr"));
  if (!frames.length) return [];
  const rules = [...PRIVATE, ...patterns.map((p) => new RegExp(p, "i"))];
  const lines = execFileSync(helper("ocrboxes"), frames.map((f) => f.file), { encoding: "utf8", maxBuffer: 64 << 20 })
    .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const hits = lines
    .filter((l) => l.text.trim() !== keepName && rules.some((r) => r.test(l.text)))
    .map((l) => ({
      src: frames[l.i].src,
      x: Math.max(0, l.x * layout.vw - 6),
      y: Math.max(0, l.y * layout.vh - 4),
      w: l.w * layout.vw + 12,
      h: l.h * layout.vh + 8,
    }))
    .sort((a, b) => a.src - b.src);
  const groups = [];
  for (const h of hits) {
    const g = groups.find((g) => h.src - g.last <= STEP * 1.5 && Math.abs(g.x - h.x) < 12 && Math.abs(g.y - h.y) < 12);
    if (g) {
      const x1 = Math.max(g.x + g.w, h.x + h.w);
      const y1 = Math.max(g.y + g.h, h.y + h.h);
      g.x = Math.min(g.x, h.x);
      g.y = Math.min(g.y, h.y);
      g.w = x1 - g.x;
      g.h = y1 - g.y;
      g.last = h.src;
    } else {
      groups.push({ ...h, first: h.src, last: h.src });
    }
  }
  fs.rmSync(path.join(work, "ocr"), { recursive: true, force: true });
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  return groups.map((g) => ({
    x: even(g.x),
    y: even(g.y),
    w: Math.min(even(g.w), layout.vw - even(g.x)),
    h: Math.min(even(g.h), layout.vh - even(g.y)),
    from: outTime(spans, g.first - STEP),
    to: outTime(spans, g.last + STEP),
  }));
}

module.exports = { redactions };
