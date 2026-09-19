#!/usr/bin/env node
// node prepare.js <lesson-slug> <out-dir>
// Copies the lesson MP4 into <out-dir> under the video title, extracts the
// title-card thumbnail, and prints the chapter candidates for the description.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const [slug, outArg] = process.argv.slice(2);
if (!slug || !outArg) {
  console.error("usage: node prepare.js <lesson-slug> <out-dir>");
  process.exit(1);
}
const ROOT = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons");
const dir = path.join(ROOT, slug);
const out = path.resolve(outArg);
// Chrome's file_upload counts bytes; a 1080p HEVC two-pass copy keeps the
// terminal text crisp at the bitrate that fits (an H.264 copy smears it).
const UPLOAD_CAP = 10_000_000;
const AUDIO_KBPS = 72;

const lesson = JSON.parse(fs.readFileSync(path.join(dir, "lesson.json"), "utf8"));
const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const mp4 = path.join(dir, `${slug}.mp4`);
const title = lesson.title.replace(/[/:]/g, " ").replace(/\s+/g, " ").trim();

fs.mkdirSync(out, { recursive: true });
const video = path.join(out, `${title}.mp4`);
const shrunk = fs.statSync(mp4).size > UPLOAD_CAP;
if (shrunk) shrinkForUpload(mp4, video);
else fs.copyFileSync(mp4, video);

function durationSec(file) {
  return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }));
}

function shrinkForUpload(src, dest) {
  const seconds = durationSec(src);
  const stats = path.join(out, "x265.stats");
  let kbps = Math.floor(((UPLOAD_CAP * 0.94 * 8) / 1000) / seconds - AUDIO_KBPS);
  for (let attempt = 0; attempt < 3; attempt++) {
    const common = ["-v", "error", "-y", "-i", src, "-vf", "scale=1920:1080", "-c:v", "libx265", "-preset", "medium", "-b:v", `${kbps}k`];
    execFileSync("ffmpeg", [...common, "-x265-params", `pass=1:log-level=error:stats=${stats}`, "-an", "-f", "null", "/dev/null"]);
    execFileSync("ffmpeg", [...common, "-x265-params", `pass=2:log-level=error:stats=${stats}`, "-tag:v", "hvc1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`, "-movflags", "+faststart", dest]);
    for (const f of fs.readdirSync(out)) if (f.startsWith("x265.stats")) fs.rmSync(path.join(out, f));
    if (fs.statSync(dest).size <= UPLOAD_CAP) return;
    kbps = Math.floor(kbps * 0.9);
  }
  throw new Error(`could not fit ${src} under ${UPLOAD_CAP} bytes`);
}

// A frame from inside the opening card: after its words have animated in,
// before it starts fading out.
const card = (timeline.cards || [])[0];
const at = card ? card.startMs + Math.min(card.ms * 0.7, 2500) : 2000;
const thumb = path.join(out, `${slug}-thumbnail.jpg`);
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", (at / 1000).toFixed(2), "-i", mp4, "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "2", thumb]);
fs.copyFileSync(thumb, path.join(dir, "thumbnail.jpg"));

const size = fs.statSync(video).size;
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
console.log(`video      ${video} (${(size / 1e6).toFixed(1)} MB${shrunk ? ", 1080p HEVC upload copy of a larger master" : ""})`);
console.log(`thumbnail  ${thumb} (frame at ${(at / 1000).toFixed(2)} s)`);
console.log(`title      ${lesson.title}`);
console.log("chapters   line starts; first chapter is 0:00, pick 3+ that are 10 s or more apart:");
for (const l of timeline.lines) {
  const text = lesson.narration.find((n) => n.id === l.id)?.text || "(silent)";
  console.log(`  ${mmss(l.startMs).padStart(5)}  ${l.id.padEnd(12)} ${text.slice(0, 72)}`);
}
