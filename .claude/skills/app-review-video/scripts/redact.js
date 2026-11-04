// Blurs other people's names before anyone sees the video: the phone's list
// of Macs on the Wi-Fi shows every lpm Mac nearby by its owner's name
// ("Someone's MacBook Pro"). Frames of the kept stretches are read twice a
// second with Vision; a line in someone's possessive form, an email address or
// a --redact pattern gets a blur box for as long as it is on screen. Wherever
// such a line appears, disappears or is missed for a moment, every frame is
// read, so a line that moves is followed instead of sliding out from under its
// blur. The review Mac's own name stays readable.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { helper } = require("./session");
const { outTime } = require("./edit");

const COARSE_FPS = 2;
const FINE_FPS = 30;
const STEP = 1 / COARSE_FPS;
// Vision's box for a line that has not moved stays within this, in video pixels.
const SAME_PLACE = 6;
// A line OCR misses for a moment stays blurred: a flash of it is worse than a
// blur held a little long. Measured in the finished video, so a cut between two
// sightings does not open a gap.
const BRIDGE = 2;
const CHECK_FPS = 6;
// The address rule leaves out npm's `> name@1.2.3 script`; `root@10.0.0.5` still counts.
const PRIVATE = [/\S[’']s\s/, /[\w.+-]+@(?!\d+\.\d+\.\d+(?:[-+\s]|$))[\w-]+\.[\w.]+/];

function sampleFrames(raw, spans, dir, fps) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const within = spans.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+");
  const args = [
    "-v", "error", "-i", raw,
    "-vf", `setpts=PTS-STARTPTS,fps=${fps},select='${within}'`,
    "-fps_mode", "passthrough", "-frame_pts", "1", "-q:v", "3", path.join(dir, "%06d.jpg"),
  ];
  try {
    execFileSync("ffmpeg", args, { stdio: "pipe" });
  } catch (e) {
    // A window can fall between frames; any other failure must stop the render,
    // or the video would go out unblurred.
    if (!/Nothing was written/.test(String(e.stderr))) throw e;
    return [];
  }
  return fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort().map((f) => ({ file: path.join(dir, f), src: Number(f.slice(0, -4)) / fps }));
}

function matcher(patterns, keepName) {
  const rules = [...PRIVATE, ...patterns.map((p) => new RegExp(p, "i"))];
  return (text) => text.trim() !== keepName && rules.some((r) => r.test(text));
}

const readLines = (files) =>
  execFileSync(helper("ocrboxes"), files, { encoding: "utf8", maxBuffer: 256 << 20 })
    .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

function readHits({ raw, windows, fps, layout, isPrivate, dir }) {
  if (!windows.length) return [];
  const frames = sampleFrames(raw, windows, dir, fps);
  if (!frames.length) return [];
  return readLines(frames.map((f) => f.file))
    .filter((l) => isPrivate(l.text))
    .map((l) => ({
      src: frames[l.i].src,
      x: Math.max(0, l.x * layout.vw - 6),
      y: Math.max(0, l.y * layout.vh - 2),
      w: l.w * layout.vw + 12,
      h: l.h * layout.vh + 4,
    }));
}

function groupHits(hits, spans) {
  const at = (t) => outTime(spans, t);
  const groups = [];
  for (const h of [...hits].sort((a, b) => a.src - b.src)) {
    const g = groups.find((g) => at(h.src) - at(g.last) <= BRIDGE && Math.abs(g.x - h.x) < SAME_PLACE && Math.abs(g.y - h.y) < SAME_PLACE);
    if (g) {
      const x1 = Math.max(g.x + g.w, h.x + h.w);
      const y1 = Math.max(g.y + g.h, h.y + h.h);
      g.x = Math.min(g.x, h.x);
      g.y = Math.min(g.y, h.y);
      g.w = x1 - g.x;
      g.h = y1 - g.y;
      g.last = h.src;
      g.seen.push(h.src);
    } else {
      groups.push({ ...h, first: h.src, last: h.src, seen: [h.src] });
    }
  }
  return groups;
}

// Where a closer look pays: the moments a blur starts and ends, the gaps between
// its sightings, and stretches too short to hold a coarse sample. A coarse frame
// can come from up to a step away from its label, so the edges reach a full step
// past the sighting on both sides.
function closeLook(groups, spans) {
  const moments = groups.flatMap((g) => [
    [g.first - 2 * STEP, g.first + STEP],
    [g.last - STEP, g.last + 2 * STEP],
    ...g.seen.slice(1).map((t, i) => [g.seen[i], t]).filter(([a, b]) => b - a > STEP * 1.5),
  ]);
  const clipped = moments.flatMap(([a, b]) => spans.map(([c, d]) => [Math.max(a, c), Math.min(b, d)]));
  return [...clipped, ...spans.filter(([a, b]) => b - a < STEP * 2)].filter(([a, b]) => b > a);
}

function redactions({ raw, spans, layout, keepName, patterns = [], work }) {
  const dir = path.join(work, "ocr");
  const isPrivate = matcher(patterns, keepName);
  const coarse = readHits({ raw, windows: spans, fps: COARSE_FPS, layout, isPrivate, dir });
  const fine = readHits({ raw, windows: closeLook(groupHits(coarse, spans), spans), fps: FINE_FPS, layout, isPrivate, dir });
  fs.rmSync(dir, { recursive: true, force: true });
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  return groupHits([...coarse, ...fine], spans).map((g) => ({
    x: even(g.x),
    y: even(g.y),
    w: Math.min(even(g.w), layout.vw - even(g.x)),
    h: Math.min(even(g.h), layout.vh - even(g.y)),
    from: outTime(spans, g.first - STEP),
    to: outTime(spans, g.last + STEP),
  }));
}

// Reads the finished video the way a viewer would: the seconds where a line
// that should be blurred can still be read. Only the recording itself, as a
// caption or a card can say "The Mac's projects" and be meant to. The times go
// back, never the text, so a name the blur missed does not end up in a log.
function stillReadable({ video, from, seconds, stage, keepName, patterns = [], work }) {
  const dir = path.join(work, "check");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-ss", String(from), "-t", String(seconds), "-i", video, "-vf", `crop=${stage.w}:${stage.h}:0:${stage.y},fps=${CHECK_FPS}`, "-q:v", "2", path.join(dir, "%06d.jpg")]);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort().map((f) => path.join(dir, f));
  const isPrivate = matcher(patterns, keepName);
  const found = files.length ? readLines(files).filter((l) => isPrivate(l.text)).map((l) => Math.floor(from + l.i / CHECK_FPS)) : [];
  fs.rmSync(dir, { recursive: true, force: true });
  return [...new Set(found)].sort((a, b) => a - b);
}

module.exports = { redactions, stillReadable };
