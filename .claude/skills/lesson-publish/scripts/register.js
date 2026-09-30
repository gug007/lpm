#!/usr/bin/env node
// node register.js <lesson folder or slug> <video id or youtu.be link>
// After Publish: records the upload in the lesson folder (published.json),
// puts the link on the lesson's line in YOUTUBE_PLAYLIST.md (appending the
// line when it is not there yet), and prints the entry for the website's
// lesson registry (website/lib/youtube-lessons.ts) to paste in.
const fs = require("fs");
const os = require("os");
const path = require("path");

const [lessonArg, videoArg] = process.argv.slice(2);
const id = (/(?:youtu\.be\/|v=|\/shorts\/|^)([A-Za-z0-9_-]{11})(?:\b|$)/.exec(videoArg || "") || [])[1];
if (!lessonArg || !id) {
  console.error("usage: node register.js <lesson folder or slug> <video id or youtu.be link>");
  process.exit(2);
}
const ROOT = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons");
const dir = lessonArg.includes("/") ? path.resolve(lessonArg) : path.join(ROOT, lessonArg);
const slug = path.basename(dir);
const REPO = path.resolve(__dirname, "../../../..");
const lesson = JSON.parse(fs.readFileSync(path.join(dir, "lesson.json"), "utf8"));
const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const url = `https://youtu.be/${id}`;
const today = new Date().toISOString().slice(0, 10);

const chaptersFile = path.join(dir, "chapters.txt");
const record = {
  videoId: id,
  url,
  title: lesson.title,
  publishedAt: new Date().toISOString(),
  durationS: Math.round(timeline.totalMs / 1000),
  chapters: fs.existsSync(chaptersFile) ? fs.readFileSync(chaptersFile, "utf8").trim().split("\n") : [],
};
fs.writeFileSync(path.join(dir, "published.json"), JSON.stringify(record, null, 2) + "\n");
console.log(`published.json -> ${path.join(dir, "published.json")}`);

const playlistFile = path.join(REPO, "YOUTUBE_PLAYLIST.md");
const lines = fs.readFileSync(playlistFile, "utf8").split("\n");
const at = lines.findIndex((l) => l.startsWith(`- ${lesson.title}`));
const entry = `- ${lesson.title} — ${url}`;
if (at >= 0) lines[at] = entry;
else {
  while (lines.length && lines.at(-1) === "") lines.pop();
  lines.push(entry, "");
  console.log(`YOUTUBE_PLAYLIST.md had no "- ${lesson.title}" line; appended it at the end (move it if the series order differs)`);
}
fs.writeFileSync(playlistFile, lines.join("\n"));
console.log(`YOUTUBE_PLAYLIST.md: ${entry}`);

const key = slug.replace(/^\d+[a-z]?-/, "");
const summary = [].concat(lesson.youtube?.hook || [])[0] || lesson.title;
console.log(`\nwebsite/lib/youtube-lessons.ts entry (add it to LESSONS, then link it from the matching page):
  "${key}": {
    id: "${id}",
    name: ${JSON.stringify(lesson.title)},
    description:
      ${JSON.stringify(summary)},
    uploadDate: "${today}T09:00:00+00:00",
  },`);
