// Which stretches of the raw recording the video keeps. With the recorder's
// input log, every click opens a response window: the changes on screen until
// the next click (at most 12 s) stay with a short hold, and anything that
// changes on its own between actions (a server's log, a clock, a rotating
// tip) is idle. Without the log, pixel changes alone decide.
const fs = require("fs");
const path = require("path");
const { strong, weak } = require("./activity");

const RESPONSE_MAX = 12;

function readJsonl(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
}

// Captions, plus the cuts: `checkpoint` … `cut` in the log, and --cut a-b
// ranges in raw seconds.
function readLog(dir, startedAt, extraCuts = "") {
  const src = (t) => Math.max(0, (t - startedAt) / 1000);
  const marks = [];
  const cuts = [];
  let checkpoint = null;
  for (const e of readJsonl(path.join(dir, "marks.jsonl"))) {
    if (e.type === "checkpoint") checkpoint = src(e.t);
    else if (e.type === "cut" && checkpoint != null) cuts.push([checkpoint, src(e.t)]);
    else if (!e.type) marks.push({ ...e, src: src(e.t) });
  }
  for (const r of String(extraCuts).split(",").filter(Boolean)) {
    const [a, b] = r.split("-").map(Number);
    if (!(b > a)) throw new Error(`bad --cut range "${r}" (raw seconds, a-b)`);
    cuts.push([a, b]);
  }
  return { marks, cuts };
}

// The recorder's input log in raw seconds, positions in capture points.
function readEvents(dir, rec) {
  return readJsonl(path.join(dir, "events.jsonl"))
    .map((e) => ({
      kind: e.k,
      src: (e.t - rec.startedAt) / 1000,
      x: e.x != null ? e.x - rec.rect.x : null,
      y: e.y != null ? e.y - rec.rect.y : null,
    }))
    .filter((e) => e.src >= 0 && (e.x == null || (e.x >= 0 && e.y >= 0 && e.x <= rec.rect.w && e.y <= rec.rect.h)));
}

const busy = (frames, i) => strong(frames[i]) || (weak(frames[i]) && frames.slice(Math.max(0, i - 7), i + 8).filter(weak).length >= 3);

function keepSpans({ frames, events, marks, cuts, duration }) {
  const spans = [[0, 1.2], [Math.max(0, duration - 1.5), duration]];
  const clicks = events.filter((e) => e.kind === "down");
  const changeSpan = (i) => (strong(frames[i]) ? [i / 10 - 0.6, i / 10 + 1.8] : [i / 10 - 0.3, i / 10 + 0.8]);
  if (clicks.length) {
    clicks.forEach((c, n) => {
      spans.push([c.src - 0.7, c.src + 1.6]);
      const end = Math.min(clicks[n + 1]?.src ?? duration, c.src + RESPONSE_MAX);
      for (let i = Math.ceil(c.src * 10); i < Math.min(frames.length, end * 10); i++) if (busy(frames, i)) spans.push(changeSpan(i));
    });
    for (const e of events) {
      if (e.kind === "key") spans.push([e.src - 0.3, e.src + 0.7]);
      else if (e.kind === "move") spans.push([e.src - 0.2, e.src + 0.9]);
    }
  } else {
    frames.forEach((_, i) => busy(frames, i) && spans.push(changeSpan(i)));
  }
  for (const m of marks) spans.push([m.src - 0.2, m.src + 3]);
  const sorted = spans.map(([a, b]) => [Math.max(0, a), Math.min(duration, b)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s[0] - last[1] < 0.9) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  return cuts.reduce(
    (kept, [ca, cb]) => kept.flatMap(([a, b]) => [[a, Math.min(b, ca)], [Math.max(a, cb), b]]).filter(([a, b]) => b - a > 0.05),
    merged,
  );
}

// Where a raw moment lands in the edited video; a cut moment lands where the
// cut is.
const outTime = (spans, t) => spans.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, t) - a), 0);
const kept = (spans, t) => spans.some(([a, b]) => t >= a && t <= b);

module.exports = { readLog, readEvents, keepSpans, outTime, kept };
