#!/usr/bin/env node
// Covers a system popup in a take without retaking it. The popup sits over
// static UI (a pane header), so the same box from a clean frame before it hides
// it; then `take.sh --mux-only` re-cuts the MP4 from the patched record.mkv.
//   node patch.js where <slug|dir> <mp4 seconds>     → the take's own time
//   node patch.js peek  <slug|dir> <t0> <t1> [x,y,w,h] → a tile of the take's frames, every 0.5 s
//   node patch.js apply <slug|dir> <t0>-<t1> <x,y,w,h> <clean t> [<t0>-<t1> <x,y,w,h> <clean t> …]
// Times are the take's (record.mkv) in seconds; boxes are record.mkv pixels.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const FPS = 30;
const ROOT = process.env.LPM_TIKTOK_DIR || path.join(process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons"), "tiktok");
const [cmd, target, ...rest] = process.argv.slice(2);
if (!cmd || !target) {
  console.error("usage: patch.js where|peek|apply <slug|dir> …");
  process.exit(1);
}
const dir = fs.existsSync(target) ? path.resolve(target) : path.join(ROOT, target);
const record = path.join(dir, "record.mkv");
const original = path.join(dir, "record.popup.mkv");
const ffmpeg = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: ["ignore", "inherit", "inherit"] });
const box = (s) => {
  const [x, y, w, h] = s.split(",").map(Number);
  if ([x, y, w, h].some((v) => !Number.isFinite(v))) throw new Error(`box "${s}": write it as x,y,w,h`);
  return { x, y, w, h };
};

if (cmd === "where") {
  const { edit } = JSON.parse(fs.readFileSync(path.join(dir, "cut.json"), "utf8"));
  let f = Math.round(Number(rest[0]) * FPS);
  let at;
  if (f < edit.hook) at = edit.payoff[0] + f;
  else {
    f -= edit.hook;
    for (const [a, b] of edit.main) {
      if (f < b - a) {
        at = a + f;
        break;
      }
      f -= b - a;
    }
  }
  if (at == null) throw new Error(`${rest[0]} s is past the end of the video`);
  console.log(`${rest[0]} s of the MP4 = ${(at / FPS).toFixed(2)} s of record.mkv${Number(rest[0]) * FPS < edit.hook ? " (the opening, cut from the payoff)" : ""}`);
} else if (cmd === "peek") {
  const [t0, t1] = rest.slice(0, 2).map(Number);
  const crop = rest[2] ? box(rest[2]) : null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peek-"));
  const times = [];
  for (let t = t0; t <= t1 + 1e-6; t += 0.5) times.push(Number(t.toFixed(2)));
  times.forEach((t, i) => {
    const vf = [crop && `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`, "scale=450:-2"].filter(Boolean).join(",");
    ffmpeg("-ss", String(t), "-i", record, "-frames:v", "1", "-vf", vf, path.join(tmp, `${String(i).padStart(3, "0")}.png`));
  });
  const out = path.join(dir, "_patch", "peek.png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const cols = Math.min(4, times.length);
  ffmpeg("-pattern_type", "glob", "-i", path.join(tmp, "*.png"), "-filter_complex", `tile=${cols}x${Math.ceil(times.length / cols)}`, "-frames:v", "1", out);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${out}\n  left to right, top to bottom: ${times.join(", ")} s of record.mkv`);
} else if (cmd === "apply") {
  if (rest.length === 0 || rest.length % 3) throw new Error("apply takes <t0>-<t1> <x,y,w,h> <clean t>, once per popup");
  const patches = [];
  for (let i = 0; i < rest.length; i += 3) {
    const [t0, t1] = rest[i].split("-").map(Number);
    patches.push({ t0, t1, ...box(rest[i + 1]), from: Number(rest[i + 2]) });
  }
  // Every run starts from the untouched take, so a re-run replaces the patches
  // instead of stacking them.
  if (!fs.existsSync(original)) fs.renameSync(record, original);
  const pix = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", original], { encoding: "utf8" }).trim();
  const inputs = ["-i", original];
  const graph = [];
  let prev = "0:v";
  patches.forEach((p, i) => {
    inputs.push("-ss", String(p.from), "-i", original);
    graph.push(`[${i + 1}:v]trim=end_frame=1,crop=${p.w}:${p.h}:${p.x}:${p.y},setpts=PTS-STARTPTS[p${i}]`);
    graph.push(`[${prev}][p${i}]overlay=${p.x}:${p.y}:enable='between(t,${p.t0},${p.t1})':format=yuv444:eof_action=repeat[v${i}]`);
    prev = `v${i}`;
  });
  ffmpeg(...inputs, "-filter_complex", graph.join(";"), "-map", `[${prev}]`, "-c:v", "libx264", "-crf", "12", "-preset", "veryfast", "-pix_fmt", pix, "-fps_mode", "passthrough", record);
  fs.writeFileSync(path.join(dir, "PATCHED.json"), JSON.stringify({ untouched: "record.popup.mkv", patches }, null, 2) + "\n");
  console.log(`patched ${patches.length} span(s) into record.mkv; the untouched take is record.popup.mkv\n  check: peek the same span again\n  then:  ${dir}/take.sh --mux-only`);
} else {
  console.error(`unknown command "${cmd}": where, peek or apply`);
  process.exit(1);
}
