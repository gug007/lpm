#!/usr/bin/env node
// node prepare.js <lesson folder or slug> <out-dir> [--accept "<reason>"]
// Gets a finished lesson ready for YouTube Studio in <out-dir> (Chrome's
// file_upload only reads the session scratchpad): the MP4 under the video
// title, the thumbnail, the captions, and the description and tags as text
// files. It refuses a lesson whose checks (qa/report.json, written by
// make.js) failed or are older than the MP4; --accept records why it goes up
// anyway.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chapters, chaptersText } = require("../../video-lesson/scripts/chapters");
const { STILL_OUT } = require("../../video-lesson/scripts/compose");

const args = process.argv.slice(2);
const ai = args.indexOf("--accept");
const accept = ai >= 0 ? args.splice(ai, 2)[1] : null;
const [lessonArg, outArg] = args;
if (!lessonArg || !outArg || (ai >= 0 && !accept)) {
  console.error('usage: node prepare.js <lesson folder or slug> <out-dir> [--accept "<reason>"]');
  process.exit(2);
}
const ROOT = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons");
const dir = lessonArg.includes("/") ? path.resolve(lessonArg) : path.join(ROOT, lessonArg);
const slug = path.basename(dir);
const out = path.resolve(outArg);
const REPO = path.resolve(__dirname, "../../../..");
// Chrome's file_upload counts bytes; a 1080p HEVC two-pass copy keeps the
// terminal text crisp at the bitrate that fits (an H.264 copy smears it).
const UPLOAD_CAP = 10_000_000;
const AUDIO_KBPS = 72;
const LPM_LINE =
  "lpm starts, stops, duplicates and switches between local dev projects on a Mac, with a built-in terminal for AI coding agents such as Claude Code and Codex.";

const lesson = JSON.parse(fs.readFileSync(path.join(dir, "lesson.json"), "utf8"));
const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const mp4 = path.join(dir, `${slug}.mp4`);
const warnings = [];

// The checks make.js ran on this very MP4 must have passed.
const reportFile = path.join(dir, "qa", "report.json");
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : null;
const why = !report
  ? "the lesson has no qa/report.json (re-cut it with make.js --mux-only, or run scripts/qa.js)"
  : Math.abs(report.mp4Mtime - fs.statSync(mp4).mtimeMs) > 1000
    ? "qa/report.json checked an earlier render of the MP4 (run scripts/qa.js again)"
    : !report.pass
      ? `the checks failed:\n${report.checks.filter((c) => c.level === "FAIL").map((c) => `  FAIL ${c.check}: ${c.message}`).join("\n")}`
      : null;
if (why && !accept) {
  console.error(`not ready to publish: ${why}\nfix it, or pass --accept "<reason>" once the user has seen it`);
  process.exit(1);
}
if (why) {
  report && (report.accepted = { reason: accept, at: new Date().toISOString() });
  if (report) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  warnings.push(`publishing despite: ${why.split("\n")[0]} (accepted: ${accept})`);
}

fs.mkdirSync(out, { recursive: true });
const fileTitle = lesson.title.replace(/[/:]/g, " ").replace(/\s+/g, " ").trim();
if (fileTitle !== lesson.title) warnings.push(`Studio pre-fills the title from the file name, which drops "/" and ":": retype it as "${lesson.title}"`);
const video = path.join(out, `${fileTitle}.mp4`);
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
    // No B-frames, closed 2-second GOPs and limited-range bt709: YouTube's AV1
    // transcode of a B-pyramid, full-range HEVC upload played the first seconds
    // out of order (lesson 08, 2026-09-19) while its H.264 renditions were fine.
    const common = ["-v", "error", "-y", "-i", src, "-vf", "scale=1920:1080:out_range=tv,format=yuv420p", "-c:v", "libx265", "-preset", "medium", "-b:v", `${kbps}k`];
    const x265 = "bframes=0:keyint=60:min-keyint=60:open-gop=0:log-level=error";
    execFileSync("ffmpeg", [...common, "-x265-params", `pass=1:${x265}:stats=${stats}`, "-an", "-f", "null", "/dev/null"]);
    execFileSync("ffmpeg", [...common, "-x265-params", `pass=2:${x265}:stats=${stats}`, "-tag:v", "hvc1", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`, "-movflags", "+faststart", dest]);
    for (const f of fs.readdirSync(out)) if (f.startsWith("x265.stats")) fs.rmSync(path.join(out, f));
    if (fs.statSync(dest).size <= UPLOAD_CAP) return;
    kbps = Math.floor(kbps * 0.9);
  }
  throw new Error(`could not fit ${src} under ${UPLOAD_CAP} bytes`);
}

// make.js renders the thumbnail from the opening card itself; a lesson cut
// before that gets a frame from inside the card, before its words lift away.
const thumb = path.join(out, `${slug}-thumbnail.jpg`);
const rendered = path.join(dir, "thumbnail.jpg");
if (fs.existsSync(rendered) && fs.existsSync(path.join(dir, "thumbnail.json"))) {
  fs.copyFileSync(rendered, thumb);
} else {
  const card = (timeline.cards || [])[0];
  const settle = 140 + ((card?.title || "").split(/\s+/).length - 1) * 110 + 640;
  const at = card ? card.startMs + Math.min(settle + 300, card.ms - 600) : 2000;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", (at / 1000).toFixed(2), "-i", mp4, "-frames:v", "1", "-vf", `scale=1280:720:${STILL_OUT}`, "-q:v", "2", thumb]);
  fs.copyFileSync(thumb, rendered);
}

const srt = path.join(dir, `${slug}.srt`);
const captions = path.join(out, `${slug}.srt`);
if (fs.existsSync(srt)) fs.copyFileSync(srt, captions);
else warnings.push(`no ${slug}.srt: re-cut with make.js --mux-only to write the captions`);

const ch = chapters(timeline, lesson);
for (const p of ch.problems) warnings.push(`chapters: ${p}`);

// The description in the order the skill asks for; lesson.json "youtube"
// ({ hook, learn, tags, hashtags }) carries the lesson's own words.
const yt = lesson.youtube || {};
const todo = JSON.stringify(yt).match(/"[^"]*\bTODO\b[^"]*"/);
if (todo) {
  console.error(`lesson.json "youtube" still has a placeholder (${todo[0]}); write the hook, learn, tags and hashtags first`);
  process.exit(1);
}
if (!lesson.youtube) warnings.push('lesson.json has no "youtube" block ({ hook, learn: [], tags: [], hashtags: [] }); write one so the description can be assembled and reused');
const playlistFile = path.join(REPO, "YOUTUBE_PLAYLIST.md");
const playlist = fs.existsSync(playlistFile) ? fs.readFileSync(playlistFile, "utf8") : "";
const series = (/^#\s+(.+)$/m.exec(playlist) || [])[1];
const seriesUrl = (/^(https:\/\/www\.youtube\.com\/playlist\S+)$/m.exec(playlist) || [])[1];
const hook = [].concat(yt.hook || []).join("\n");
const hashtags = (yt.hashtags || []).map((h) => `#${String(h).replace(/^#/, "")}`);
const description = [
  hook,
  LPM_LINE,
  "https://lpm.cx",
  yt.learn?.length ? `What you'll learn:\n${yt.learn.map((l) => `- ${l}`).join("\n")}` : null,
  `Chapters:\n${chaptersText(ch.list).trim()}`,
  series ? `Part of the series "${series}"${seriesUrl ? `: ${seriesUrl}` : ""}` : null,
  hashtags.join(" ") || null,
]
  .filter(Boolean)
  .join("\n\n");
const tags = (yt.tags || []).join(", ");
fs.writeFileSync(path.join(out, `${slug}-description.txt`), description + "\n");
fs.writeFileSync(path.join(out, `${slug}-tags.txt`), tags + "\n");
if (description.includes("@")) warnings.push('the description contains "@", which opens a mention popup in Studio');
if (lesson.title.length > 100) warnings.push(`the title is ${lesson.title.length} characters; YouTube allows 100`);
if (tags.length > 500) warnings.push(`the tags are ${tags.length} characters; YouTube allows 500`);
if (yt.tags && (yt.tags.length < 15 || yt.tags.length > 20)) warnings.push(`${yt.tags.length} tags; the skill asks for 15–20`);
if (yt.hashtags && (hashtags.length < 5 || hashtags.length > 6)) warnings.push(`${hashtags.length} hashtags; the skill asks for 5–6`);

const size = fs.statSync(video).size;
console.log(`video        ${video} (${(size / 1e6).toFixed(1)} MB${shrunk ? ", 1080p HEVC upload copy of a larger master" : ""})`);
console.log(`thumbnail    ${thumb}`);
if (fs.existsSync(captions)) console.log(`captions     ${captions} (Subtitles > Add language > English > Upload file > With timing)`);
console.log(`description  ${path.join(out, `${slug}-description.txt`)}`);
console.log(`tags         ${path.join(out, `${slug}-tags.txt`)}`);
console.log(`title        ${lesson.title}`);
console.log(`chapters\n${chaptersText(ch.list).replace(/^/gm, "  ").trimEnd()}`);
for (const w of warnings) console.log(`warning      ${w}`);
