// The edit after the mux, for viewers who leave in the first seconds or during
// a wait:
// - a cold open (lesson.json "coldOpen"): a spoken hook over shots from later
//   in the take, in place of the first line's narration; the opening card
//   follows, then the lesson from its second line;
// - waits: a stretch longer than the checks' dead-air limit with nothing said
//   between two lines plays faster, under a badge ("speedUpWaits": false keeps
//   them real time).
// The straight render is cut into segments, each encoded once, and joined;
// the soundtrack is mixed again with every clip at its new time.
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { MASTER_OUT, MASTER_TAGS } = require("./compose");
const { OPEN_LIFT } = require("./appstage");

const FPS = 30;
const FRAME_MS = 1000 / FPS;
const WAIT_MIN_MS = 2500;
const WAIT_HEAD_MS = 400;
const WAIT_TAIL_MS = 300;
const WAIT_SHORTEST_MS = 1500;
const HOOK_LEAD_MS = 300;
const HOOK_TAIL_MS = 450;
// The opening card's hand-over (the window gliding into place) ends this long
// after the card does.
const CARD_LIFT_MS = OPEN_LIFT.riseMs - OPEN_LIFT.leadMs + 50;
const RESUME_LEAD_MS = 300;
// The id the hook's clip, caption and timeline entry go by.
const HOOK_ID = "coldOpen";

const snap = (ms) => Math.round(ms / FRAME_MS) * FRAME_MS;
// A cut that must include a moment (the opening card's first frame) starts on
// the frame at or before it.
const snapDown = (ms) => Math.floor(ms / FRAME_MS) * FRAME_MS;
// `maxS` (lesson.json "waitMaxSeconds") caps how long one wait plays, for an
// agent that works for half an hour; past 16x the badge shows the real speed.
const waitSpeed = (ms, maxS) => {
  const speed = ms <= 12000 ? 4 : Math.min(16, Math.ceil(ms / 3000));
  return maxS > 0 ? Math.max(speed, Math.ceil(ms / (maxS * 1000))) : speed;
};
const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

// Pure: the cuts for a take, or null when the render needs none. A cut is
// { kind: "shot" | "card" | "main" | "wait", fromMs, toMs, speed }, in take
// time, in the order they play. `hookMs` is the hook clip's length.
function planEdit({ timeline, lesson, hookMs = 0, log = () => {} }) {
  const lines = timeline.lines || [];
  const totalMs = timeline.totalMs;
  const text = new Map((lesson.narration || []).map((n) => [n.id, n.text]));
  const cuts = [];
  let mainFrom = 0;
  const open = lesson.coldOpen;
  if (open && open.text && (open.shots || []).length) {
    for (const shot of open.shots) {
      const line = lines.find((l) => l.id === shot.line);
      if (!line) throw new Error(`coldOpen: shot on "${shot.line}", a line the take does not have`);
      cuts.push({ kind: "shot", fromMs: snap(line.startMs + shot.from * 1000), toMs: snap(Math.min(totalMs, line.startMs + shot.to * 1000)), speed: 1 });
    }
    const need = HOOK_LEAD_MS + hookMs + HOOK_TAIL_MS;
    const have = cuts.reduce((s, c) => s + c.toMs - c.fromMs, 0);
    if (have < need) {
      const last = cuts.at(-1);
      last.toMs = snap(Math.min(totalMs, last.toMs + need - have));
      log(`coldOpen: the hook runs ${(need / 1000).toFixed(1)} s, so the last shot now ends at ${((last.toMs - lines.find((l) => l.id === open.shots.at(-1).line).startMs) / 1000).toFixed(2)} s into its line`);
    }
    const card = (timeline.cards || []).find((c) => c.first && !c.hold);
    if (card) {
      cuts.push({ kind: "card", fromMs: snapDown(card.startMs), toMs: snap(card.startMs + card.ms + CARD_LIFT_MS), speed: 1 });
      if (card.ms > 3000) log(`coldOpen: the opening card stays up ${(card.ms / 1000).toFixed(1)} s; end it sooner with s.card(title, { until })`);
    }
    const second = lines[1];
    mainFrom = second ? snapDown(Math.max(0, second.startMs - RESUME_LEAD_MS)) : totalMs;
  }
  const waits = [];
  if (lesson.speedUpWaits !== false) {
    for (let i = 0; i + 1 < lines.length; i++) {
      const a = lines[i];
      const b = lines[i + 1];
      if (!text.get(a.id) || a.startMs < mainFrom) continue;
      const end = a.startMs + a.ms;
      if (b.startMs - end <= WAIT_MIN_MS) continue;
      const from = snap(end + WAIT_HEAD_MS);
      const to = snap(b.startMs - WAIT_TAIL_MS);
      if (to - from < WAIT_SHORTEST_MS) continue;
      if ((timeline.cards || []).some((c) => overlaps(from, to, c.startMs, c.startMs + c.ms))) continue;
      waits.push({ kind: "wait", fromMs: from, toMs: to, speed: waitSpeed(to - from, lesson.waitMaxSeconds), after: a.id });
    }
  }
  if (!cuts.length && !waits.length) return null;
  let at = mainFrom;
  for (const w of waits) {
    if (w.fromMs > at) cuts.push({ kind: "main", fromMs: at, toMs: w.fromMs, speed: 1 });
    cuts.push(w);
    at = w.toMs;
  }
  if (totalMs > at) cuts.push({ kind: "main", fromMs: at, toMs: snap(totalMs), speed: 1 });
  return { cuts, dropped: mainFrom > 0 ? lines.filter((l) => l.startMs < mainFrom).map((l) => l.id) : [] };
}

// Pure: `cuts` with their rendered lengths (outMs) laid end to end.
function layout(cuts) {
  let at = 0;
  return cuts.map((c) => {
    const placed = { ...c, outStartMs: at };
    at += c.outMs;
    return placed;
  });
}

// Pure: where take time `ms` lands in the edit (the main sequence, a wait or
// the opening card; a shot is a copy), or null when it was cut.
function mapTime(placed, ms) {
  for (const c of placed) {
    if (c.kind === "shot" || ms < c.fromMs || ms >= c.toMs) continue;
    return c.outStartMs + (ms - c.fromMs) / c.speed;
  }
  return null;
}

// Pure: the take's timeline as the edited video plays it: the hook first, the
// lines and cards that survived at their new times, and the edit itself.
function editTimeline(timeline, plan, placed, hook) {
  const at = (ms) => mapTime(placed, ms);
  const lines = [];
  if (hook) lines.push({ id: HOOK_ID, startMs: HOOK_LEAD_MS, ms: hook.ms });
  for (const l of timeline.lines) {
    if (plan.dropped.includes(l.id)) continue;
    const startMs = at(l.startMs);
    if (startMs != null) lines.push({ ...l, startMs: Math.round(startMs) });
  }
  const cards = (timeline.cards || []).flatMap((c) => {
    const startMs = at(c.startMs);
    return startMs == null ? [] : [{ ...c, startMs: Math.round(startMs) }];
  });
  const last = placed.at(-1);
  return {
    ...timeline,
    totalMs: Math.round(last.outStartMs + last.outMs),
    lines,
    cards,
    zooms: [],
    edit: placed.map(({ kind, fromMs, toMs, speed, outStartMs, outMs, after }) => ({ kind, fromMs: Math.round(fromMs), toMs: Math.round(toMs), speed, outStartMs: Math.round(outStartMs), outMs: Math.round(outMs), ...(after ? { after } : {}) })),
  };
}

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr.slice(-2000)}`);
}

function frameCount(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(out.trim());
}

// The "4×" pill, drawn once per speed in the frame cache beside the lessons.
async function badge(dir, speed) {
  const file = path.join(dir, `badge-${speed}x.png`);
  if (fs.existsSync(file)) return file;
  const { chromium, CHROME } = require("./browser");
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 260, height: 104 }, deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html><style>
      html, body { margin: 0; background: transparent; }
      .pill { position: absolute; inset: 10px; border-radius: 42px; background: rgba(235, 229, 217, 0.96); box-shadow: 0 6px 22px rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; gap: 14px; font: 700 44px/1 -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; color: #141414; }
      svg { width: 46px; height: 34px; }
    </style><div class="pill"><svg viewBox="0 0 46 34"><path d="M2 3 L22 17 L2 31 Z M24 3 L44 17 L24 31 Z" fill="#141414"/></svg>${speed}×</div>`);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: file, omitBackground: true });
  } finally {
    await browser.close();
  }
  return file;
}

// Cuts `src` (the straight render) into `out`. `mix(clips, totalMs)` returns
// the soundtrack's { inputs, filter } ending in [a]; `clips` are the voiced
// lines ({ id, wav }) by id, `hook` the hook's clip. `badgeAt` ({ x, y, scale })
// places the speed pill, by default in the pane's empty rows. Returns the
// edited timeline.
async function renderEdit({ src, out, plan, timeline, clips, hook, mix, badgeDir, workDir, size, badgeAt, log = console.log }) {
  fs.mkdirSync(workDir, { recursive: true });
  const segments = [];
  for (const [i, c] of plan.cuts.entries()) {
    const file = path.join(workDir, `${String(i).padStart(2, "0")}-${c.kind}.mp4`);
    const args = ["-ss", (c.fromMs / 1000).toFixed(6), "-to", (c.toMs / 1000).toFixed(6), "-i", src];
    let graph = `[0:v]setpts=(PTS-STARTPTS)/${c.speed}${c.speed > 1 ? `,fps=${FPS}` : ""}`;
    if (c.speed > 1) {
      args.push("-loop", "1", "-i", await badge(badgeDir, c.speed));
      // In the pane's empty rows, right of the sidebar, unless the layout
      // names a free spot.
      const at = badgeAt || { x: size.width * 0.59, y: size.height / 2, scale: 1 };
      const shrink = at.scale && at.scale !== 1 ? `,scale=iw*${at.scale}:-1` : "";
      graph += `[sp];[1:v]format=rgba${shrink},scale=out_color_matrix=bt709:out_range=tv,format=yuva420p[b];[sp][b]overlay=x=${Math.round(at.x)}-overlay_w/2:y=${Math.round(at.y)}-overlay_h/2:shortest=1`;
    }
    graph += `,${MASTER_OUT}[v]`;
    ffmpeg([...args, "-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", String(FPS), ...MASTER_TAGS, "-video_track_timescale", "15360", file]);
    segments.push({ ...c, file, outMs: (frameCount(file) * 1000) / FPS });
  }
  const placed = layout(segments);
  const edited = editTimeline(timeline, plan, placed, hook);
  const byId = new Map(clips.map((c) => [c.id, c]));
  const voiced = edited.lines.filter((l) => (l.id === HOOK_ID ? hook : byId.get(l.id)?.wav)).map((l) => ({ id: l.id, wav: l.id === HOOK_ID ? hook.wav : byId.get(l.id).wav, startMs: l.startMs }));
  const sound = mix(voiced, edited.totalMs);
  const audio = path.join(workDir, "soundtrack.wav");
  ffmpeg([...sound.inputs, "-filter_complex", sound.filter, "-map", "[a]", "-t", (edited.totalMs / 1000).toFixed(3), "-ar", "48000", audio]);
  const list = path.join(workDir, "segments.txt");
  fs.writeFileSync(list, segments.map((s) => `file '${s.file.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", (edited.totalMs / 1000).toFixed(3), "-movflags", "+faststart", "-f", "mp4", out]);
  for (const c of placed) {
    if (c.kind === "wait") log(`edit: the wait after "${c.after}" plays at ${c.speed}x (${((c.toMs - c.fromMs) / 1000).toFixed(1)} s -> ${(c.outMs / 1000).toFixed(1)} s)`);
  }
  if (hook) log(`edit: cold open ${(placed.filter((c) => c.kind === "shot").reduce((s, c) => s + c.outMs, 0) / 1000).toFixed(1)} s, then the card, then "${timeline.lines[1]?.id}"`);
  return edited;
}

module.exports = { HOOK_ID, planEdit, layout, mapTime, editTimeline, renderEdit };
