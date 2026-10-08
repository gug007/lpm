// Turns the raw recording into the review video: the waits between computer
// use actions are cut down to short holds, the two windows sit on a 1920x1080
// frame under "lpm for macOS" / "lpm Link" labels, every mark becomes a
// numbered step caption, and a title and closing card bracket it.
const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const { helper } = require("./session");

const W = 1920;
const H = 1080;
const HEADER = 104;
const FOOTER = 140;
const FPS = 30;
const BG = "#000000";
const ACCENT = "#2f6fed";

function probe(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file], { encoding: "utf8" });
  const j = JSON.parse(out);
  return { w: j.streams[0].width, h: j.streams[0].height, duration: Number(j.format.duration) };
}

// Changed-pixel counts between frames sampled at 10 fps on a 640-wide gray
// copy, per window: the phone is a fifth of the frame, so its changes are
// weighed on their own. A tap's response or a navigation changes 1000+
// pixels of the Mac or 450+ of the phone; a status flip, a rotating tip or a
// typed character a few hundred; the pointer or a blinking caret under 120.
function activity(file, { w, h }, rec) {
  const sw = 640;
  const sh = Math.round((h * sw) / w / 2) * 2;
  const size = sw * sh;
  const k = sw / rec.rect.w;
  const phone = { x0: Math.round((rec.phone.x - rec.rect.x) * k), x1: Math.round((rec.phone.x + rec.phone.w - rec.rect.x) * k) };
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-v", "error", "-i", file, "-vf", `setpts=PTS-STARTPTS,fps=10,scale=${sw}:${sh},format=gray`, "-f", "rawvideo", "pipe:1"]);
    const frames = [];
    let prev = null;
    let buf = Buffer.alloc(0);
    ff.stdout.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= size) {
        const frame = buf.subarray(0, size);
        buf = buf.subarray(size);
        let mac = 0;
        let ph = 0;
        if (prev) {
          for (let i = 0; i < size; i++) {
            if (Math.abs(frame[i] - prev[i]) <= 16) continue;
            const x = i % sw;
            if (x >= phone.x0 && x < phone.x1) ph++;
            else mac++;
          }
        }
        frames.push({ mac, phone: ph });
        prev = Buffer.from(frame);
      }
    });
    ff.on("close", (code) => (code === 0 ? resolve(frames) : reject(new Error("ffmpeg activity pass failed"))));
  });
}

// Spans of the raw recording to keep: every strong change with a lead-in and
// a hold after it, bursts of small ones (typing, a reply arriving), each
// caption's first seconds, and the ends. A lone small change is idle. Short
// gaps between kept spans stay, so nothing jumps. Cut ranges (a fumbled
// stretch) are removed last.
function keepSpans(frames, marks, cuts, duration) {
  const spans = [[0, 1.2], [Math.max(0, duration - 1.5), duration]];
  const weak = frames.map((f) => f.mac + f.phone > 120);
  frames.forEach((f, i) => {
    if (f.mac > 1000 || f.phone > 450) spans.push([i / 10 - 0.6, i / 10 + 1.8]);
    else if (weak[i] && weak.slice(Math.max(0, i - 7), i + 8).filter(Boolean).length >= 3) spans.push([i / 10 - 0.3, i / 10 + 0.8]);
  });
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

// Captions, plus the cuts: `checkpoint` … `cut` in the log, and --cut a-b
// ranges in raw seconds.
function readLog(dir, startedAt, extraCuts = "") {
  const file = path.join(dir, "marks.jsonl");
  const entries = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const src = (t) => Math.max(0, (t - startedAt) / 1000);
  const marks = [];
  const cuts = [];
  let checkpoint = null;
  for (const e of entries) {
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

const outTime = (spans, t) => spans.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, t) - a), 0);

function cards(dir, { rec, layout, marks, info }) {
  const { fit, ox, oy } = layout;
  const center = (win) => Math.round(ox + (win.x - rec.rect.x + win.w / 2) * fit);
  const specs = [
    {
      out: path.join(dir, "frame.png"),
      w: W,
      h: H,
      bg: BG,
      items: [
        { text: "lpm for macOS", x: center(rec.app), y: 22, size: 30, weight: "semibold", align: "center" },
        { text: "The Mac · desktop app", x: center(rec.app), y: 62, size: 19, color: "#8b93a1", align: "center" },
        { text: "lpm Link", x: center(rec.phone), y: 22, size: 30, weight: "semibold", align: "center" },
        { text: "Physical iPhone · live via iPhone Mirroring", x: center(rec.phone), y: 62, size: 19, color: "#8b93a1", align: "center" },
      ],
    },
    ...marks.map((m, i) => ({
      out: path.join(dir, `step-${i + 1}.png`),
      w: W,
      h: FOOTER,
      bg: BG,
      boxes: [{ x: ox, y: 30, w: 64, h: 64, color: ACCENT, radius: 16 }],
      items: [
        { text: String(i + 1), x: ox + 32, y: 39, size: 36, weight: "bold", align: "center" },
        { text: m.text, x: ox + 88, y: m.sub ? 22 : 37, size: 36, weight: "semibold" },
        ...(m.sub ? [{ text: m.sub, x: ox + 88, y: 72, size: 23, color: "#a3abb8" }] : []),
      ],
    })),
    {
      out: path.join(dir, "title.png"),
      w: W,
      h: H,
      bg: BG,
      items: [
        { text: `lpm Link ${info.version}`, x: W / 2, y: 300, size: 84, weight: "bold", align: "center" },
        { text: "App Review demo: a physical iPhone paired with the lpm app on a Mac", x: W / 2, y: 420, size: 36, weight: "medium", color: "#d6dae1", align: "center" },
        { text: `Left: lpm for macOS.  Right: lpm Link on a physical ${info.device}, shown live with iPhone Mirroring.`, x: W / 2, y: 520, size: 28, color: "#a3abb8", align: "center" },
        { text: "Not the iOS Simulator. Recorded in real time; waits between steps are shortened.", x: W / 2, y: 564, size: 28, color: "#a3abb8", align: "center" },
        { text: [info.build && `Build ${info.build}`, `Recorded ${info.date}`].filter(Boolean).join("  ·  "), x: W / 2, y: 680, size: 24, color: "#6b7280", align: "center" },
      ],
    },
    {
      out: path.join(dir, "end.png"),
      w: W,
      h: H,
      bg: BG,
      items: [
        { text: "lpm Link controls the user's own Mac running lpm", x: W / 2, y: 360, size: 48, weight: "semibold", align: "center" },
        { text: "Every command runs on that Mac. No account or sign-in is needed.", x: W / 2, y: 450, size: 30, color: "#d6dae1", align: "center" },
        { text: "Without a Mac, tap “No Mac nearby? Try the demo” on the first screen for the built-in Demo Mode.", x: W / 2, y: 510, size: 28, color: "#a3abb8", align: "center" },
        { text: "lpm for macOS is free at lpm.cx", x: W / 2, y: 620, size: 26, color: "#6b7280", align: "center" },
      ],
    },
  ];
  execFileSync(helper("card"), { input: JSON.stringify(specs) });
}

async function render({ dir, version, build, device = "iPhone", cut, title = 4, end = 4, log = console.log }) {
  const rec = JSON.parse(fs.readFileSync(path.join(dir, "recording.json"), "utf8"));
  const raw = path.join(dir, "raw.mov");
  const meta = probe(raw);
  const { marks, cuts } = readLog(dir, rec.startedAt, cut);
  log(`raw ${meta.duration.toFixed(1)} s, ${meta.w}x${meta.h}, ${marks.length} steps, ${cuts.length} cuts; finding the idle stretches`);
  const act = await activity(raw, meta, rec);
  const spans = keepSpans(act, marks, cuts, meta.duration);
  const main = outTime(spans, meta.duration);
  log(`kept ${spans.length} spans: ${main.toFixed(1)} s of ${meta.duration.toFixed(1)} s`);

  const areaW = W - 160;
  const areaH = H - HEADER - FOOTER;
  const fit = Math.min(areaW / rec.rect.w, areaH / rec.rect.h);
  const vw = Math.round((rec.rect.w * fit) / 2) * 2;
  const vh = Math.round((rec.rect.h * fit) / 2) * 2;
  const layout = { fit, vw, vh, ox: Math.round((W - vw) / 2), oy: HEADER + Math.round((areaH - vh) / 2) };
  const work = path.join(dir, "render");
  fs.mkdirSync(work, { recursive: true });
  const info = { version, build, device, date: new Date(rec.startedAt).toISOString().slice(0, 10) };
  cards(work, { rec, layout, marks, info });

  const at = marks.map((m) => outTime(spans, m.src));
  const select = spans.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join("+");
  const inputs = ["-i", raw, "-loop", "1", "-framerate", String(FPS), "-t", main.toFixed(3), "-i", path.join(work, "frame.png")];
  marks.forEach((_, i) => inputs.push("-loop", "1", "-framerate", String(FPS), "-t", main.toFixed(3), "-i", path.join(work, `step-${i + 1}.png`)));
  const ti = 2 + marks.length;
  inputs.push("-loop", "1", "-framerate", String(FPS), "-t", String(title), "-i", path.join(work, "title.png"));
  inputs.push("-loop", "1", "-framerate", String(FPS), "-t", String(end), "-i", path.join(work, "end.png"));
  const graph = [
    `[0:v]setpts=PTS-STARTPTS,fps=${FPS},select='${select}',setpts=N/${FPS}/TB,scale=${layout.vw}:${layout.vh}:flags=lanczos[scr]`,
    `[1:v][scr]overlay=${layout.ox}:${layout.oy}:eof_action=endall[m0]`,
  ];
  marks.forEach((_, i) => {
    const from = at[i].toFixed(3);
    const to = (i + 1 < marks.length ? at[i + 1] : main + 1).toFixed(3);
    graph.push(`[m${i}][${i + 2}:v]overlay=0:${H - FOOTER}:enable='between(t,${from},${to})'[m${i + 1}]`);
  });
  graph.push(`[m${marks.length}]format=yuv420p,setsar=1[main]`);
  graph.push(`[${ti}:v]format=yuv420p,setsar=1,fade=t=out:st=${title - 0.4}:d=0.4[title]`);
  graph.push(`[${ti + 1}:v]format=yuv420p,setsar=1,fade=t=in:st=0:d=0.4[end]`);
  graph.push(`[title][main][end]concat=n=3:v=1:a=0[out]`);
  const script = path.join(work, "graph.txt");
  fs.writeFileSync(script, graph.join(";\n"));
  const name = `lpm-link-${version}-app-review.mp4`;
  const out = path.join(dir, name);
  log("encoding");
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-/filter_complex", script, "-map", "[out]", "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
  const total = title + main + end;
  fs.writeFileSync(
    path.join(dir, "steps.txt"),
    marks.map((m, i) => `${fmt(title + at[i])}  ${i + 1}. ${m.text}${m.sub ? ` (${m.sub})` : ""}`).join("\n") + "\n",
  );
  log(`${out}\n${fmt(total)} long, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB; step times in ${path.join(dir, "steps.txt")}`);
  return { out, duration: total, steps: marks.map((m, i) => ({ at: title + at[i], text: m.text })) };
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

module.exports = { render };
