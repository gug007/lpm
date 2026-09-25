#!/usr/bin/env node
// node prepare.js <slug> <out-dir>
// Copies a vertical lesson's MP4 and cover into <out-dir> (Chrome's
// file_upload only reads the session scratchpad), shrinks the video when it is
// over the upload cap, and prints the caption to type.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const [slug, outArg] = process.argv.slice(2);
if (!slug || !outArg) {
  console.error("usage: node prepare.js <slug> <out-dir>");
  process.exit(1);
}
const ROOT = process.env.LPM_TIKTOK_DIR || path.join(os.homedir(), "Movies/lpm-lessons/tiktok");
const dir = path.join(ROOT, slug);
const out = path.resolve(outArg);
const UPLOAD_CAP = 10_000_000;
const AUDIO_KBPS = 128;
const CAPTION_MAX = 4000;
const MAX_HASHTAGS = 5;
const LEDGER = path.join(ROOT, "POSTED.md");

const lesson = JSON.parse(fs.readFileSync(path.join(dir, "lesson.json"), "utf8"));
const mp4 = path.join(dir, `${slug}.mp4`);
const cover = path.join(dir, "cover.jpg");
for (const f of [mp4, cover]) if (!fs.existsSync(f)) throw new Error(`missing ${f}: render the lesson first`);

const probe = (file, entries) =>
  execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", entries, "-of", "csv=p=0", file], {
    encoding: "utf8",
  }).trim();
const seconds = parseFloat(
  execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4], { encoding: "utf8" }),
);
const [w, h] = probe(mp4, "stream=width,height").split(",").map(Number);

fs.mkdirSync(out, { recursive: true });
// The uploader pre-fills the caption with the file name.
const video = path.join(out, `${slug}.mp4`);
const shrunk = fs.statSync(mp4).size > UPLOAD_CAP;
if (shrunk) shrinkForUpload(mp4, video);
else fs.copyFileSync(mp4, video);
const coverOut = path.join(out, `${slug}-cover.jpg`);
fs.copyFileSync(cover, coverOut);

// TikTok re-encodes every upload; a two-pass H.264 at the bitrate that fits
// keeps the text sharp for a short vertical clip.
function shrinkForUpload(src, dest) {
  const log = path.join(out, "x264");
  let kbps = Math.floor((UPLOAD_CAP * 0.94 * 8) / 1000 / seconds - AUDIO_KBPS);
  for (let attempt = 0; attempt < 3; attempt++) {
    const common = ["-v", "error", "-y", "-i", src, "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p", "-b:v", `${kbps}k`, "-passlogfile", log];
    execFileSync("ffmpeg", [...common, "-pass", "1", "-an", "-f", "null", "/dev/null"]);
    execFileSync("ffmpeg", [...common, "-pass", "2", "-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`, "-movflags", "+faststart", dest]);
    for (const f of fs.readdirSync(out)) if (f.startsWith("x264")) fs.rmSync(path.join(out, f));
    if (fs.statSync(dest).size <= UPLOAD_CAP) return;
    kbps = Math.floor(kbps * 0.9);
  }
  throw new Error(`could not fit ${src} under ${UPLOAD_CAP} bytes`);
}

// post.txt is written by the tiktok-video-lesson mux: caption, blank line,
// hashtags.
const postFile = path.join(dir, "post.txt");
const post = lesson.post || {};
const [text, tagLine] = fs.existsSync(postFile)
  ? fs.readFileSync(postFile, "utf8").trim().split(/\n\s*\n/)
  : [post.caption || lesson.title, (post.hashtags || []).map((t) => `#${t.replace(/^#/, "")}`).join(" ")];
const caption = text.trim();
const hashtags = (tagLine || "").trim().split(/\s+/).filter(Boolean);
const full = `${caption}\n\n${hashtags.join(" ")}`;

const warnings = [];
if (w !== 1080 || h !== 1920) warnings.push(`video is ${w}x${h}, not 1080x1920`);
if (seconds > 60) warnings.push(`video runs ${seconds.toFixed(1)} s; the lessons aim for 45 s or less`);
if (full.length > CAPTION_MAX) warnings.push(`caption is ${full.length} characters (max ${CAPTION_MAX})`);
if (/@/.test(full)) warnings.push("caption contains @, which opens the mention picker");
if (hashtags.length > MAX_HASHTAGS) warnings.push(`${hashtags.length} hashtags; TikTok keeps ${MAX_HASHTAGS}, pick the ones to post`);
if (hashtags.some((t) => !/^#[\p{L}\p{N}_]+$/u.test(t))) warnings.push(`odd hashtag in: ${hashtags.join(" ")}`);
const posted = fs.existsSync(LEDGER) && fs.readFileSync(LEDGER, "utf8").split("\n").find((l) => l.includes(` ${slug} `));
if (posted) warnings.push(`already posted: ${posted.trim()}`);

const size = fs.statSync(video).size;
console.log(`video     ${video} (${(size / 1e6).toFixed(1)} MB, ${seconds.toFixed(1)} s, ${w}x${h}${shrunk ? ", H.264 upload copy of a larger master" : ""})`);
console.log(`cover     ${coverOut}`);
console.log(`title     ${lesson.title}`);
console.log(`caption   (${full.length} chars)`);
console.log(caption);
console.log(`hashtags  ${hashtags.join(" ")}`);
for (const note of warnings) console.log(`WARNING   ${note}`);
