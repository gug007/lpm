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
const UPLOAD_CAP = 10 * 1024 * 1024;

const lesson = JSON.parse(fs.readFileSync(path.join(dir, "lesson.json"), "utf8"));
const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const mp4 = path.join(dir, `${slug}.mp4`);
const title = lesson.title.replace(/[/:]/g, " ").replace(/\s+/g, " ").trim();

fs.mkdirSync(out, { recursive: true });
const video = path.join(out, `${title}.mp4`);
fs.copyFileSync(mp4, video);

// A frame from inside the opening card: after its words have animated in,
// before it starts fading out.
const card = (timeline.cards || [])[0];
const at = card ? card.startMs + Math.min(card.ms * 0.7, 2500) : 2000;
const thumb = path.join(out, `${slug}-thumbnail.jpg`);
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", (at / 1000).toFixed(2), "-i", mp4, "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "2", thumb]);
fs.copyFileSync(thumb, path.join(dir, "thumbnail.jpg"));

const size = fs.statSync(video).size;
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
console.log(`video      ${video} (${(size / 1048576).toFixed(1)} MB${size > UPLOAD_CAP ? " — over Chrome's 10 MB upload cap" : ""})`);
console.log(`thumbnail  ${thumb} (frame at ${(at / 1000).toFixed(2)} s)`);
console.log(`title      ${lesson.title}`);
console.log("chapters   line starts; first chapter is 0:00, pick 3+ that are 10 s or more apart:");
for (const l of timeline.lines) {
  const text = lesson.narration.find((n) => n.id === l.id)?.text || "(silent)";
  console.log(`  ${mmss(l.startMs).padStart(5)}  ${l.id.padEnd(12)} ${text.slice(0, 72)}`);
}
