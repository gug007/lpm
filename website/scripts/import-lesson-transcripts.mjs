import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Copies each lesson's captions into lib/lesson-transcripts.json for the
// transcript on its page. The captions are the .srt the lesson skill writes and
// lesson-publish uploads to YouTube, found in the lesson folder whose
// published.json names the video. It also lists lessons whose length or
// chapters in lib/youtube-chapters.ts no longer match the published video.
//
//   node scripts/import-lesson-transcripts.mjs [lessons folder]

const websiteDir = dirname(dirname(fileURLToPath(import.meta.url)));
const lessonsDir = process.argv[2] ?? join(homedir(), "Movies", "lpm-lessons");
const outFile = join(websiteDir, "lib", "lesson-transcripts.json");

const registry = readFileSync(join(websiteDir, "lib", "youtube-lessons.ts"), "utf8");
const videoIds = new Map(
  [...registry.matchAll(/^ {2}"?([\w-]+)"?: \{\n {4}id: "([\w-]{11})"/gm)].map((m) => [m[1], m[2]]),
);

const folders = readdirSync(lessonsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function publishedByVideo() {
  const found = new Map();
  for (const name of folders) {
    const dir = join(lessonsDir, name);
    const file = join(dir, "published.json");
    if (!existsSync(file)) continue;
    const published = JSON.parse(readFileSync(file, "utf8"));
    if (published.videoId) found.set(published.videoId, { dir, published });
  }
  return found;
}

// A lesson published before register.js wrote published.json is found by its
// folder, `<slug>` or `NN-<slug>`.
function folderNamed(slug) {
  const name = folders.find((f) => f === slug || f.replace(/^\d+-/, "") === slug);
  return name ? { dir: join(lessonsDir, name), published: null } : undefined;
}

const seconds = (stamp) => {
  const [h, m, s] = stamp.replace(",", ".").split(":").map(Number);
  return Math.round((h * 3600 + m * 60 + s) * 10) / 10;
};

function parseSrt(text) {
  return text
    .replace(/\r/g, "")
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.split("\n");
      const timing = lines.findIndex((line) => line.includes("-->"));
      if (timing === -1) return null;
      const words = lines
        .slice(timing + 1)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return words ? [seconds(lines[timing].split("-->")[0].trim()), words] : null;
    })
    .filter(Boolean);
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const chaptersSource = readFileSync(join(websiteDir, "lib", "youtube-chapters.ts"), "utf8");

function siteChapters(slug) {
  const block = chaptersSource.match(new RegExp(`\\n {2}"?${slug}"?: \\{\\n {4}seconds: (\\d+),([\\s\\S]*?)\\n {2}\\},`));
  if (!block) return null;
  const chapters = [...block[2].matchAll(/\[(\d+), "((?:[^"\\]|\\.)*)"\]/g)].map(
    (m) => `${clock(Number(m[1]))} ${m[2]}`,
  );
  return { seconds: Number(block[1]), chapters };
}

const published = publishedByVideo();
const transcripts = {};
const missing = [];
const unverified = [];
const drift = [];

for (const [slug, videoId] of videoIds) {
  const lesson = published.get(videoId) ?? folderNamed(slug);
  const srt = lesson && readdirSync(lesson.dir).find((f) => f.endsWith(".srt"));
  if (!srt) {
    missing.push(slug);
    continue;
  }
  transcripts[slug] = parseSrt(readFileSync(join(lesson.dir, srt), "utf8"));
  if (!lesson.published) {
    unverified.push(`${slug} (${lesson.dir})`);
    continue;
  }

  const site = siteChapters(slug);
  const { durationS, chapters = [] } = lesson.published;
  const lengthOff = site && durationS && Math.abs(site.seconds - durationS) > 1;
  if (!site || lengthOff || site.chapters.join("\n") !== chapters.join("\n")) {
    drift.push(`${slug}: published ${durationS}s\n    ${chapters.join("\n    ")}`);
  }
}

writeFileSync(outFile, `${JSON.stringify(transcripts, null, 1)}\n`);
console.log(`${Object.keys(transcripts).length} transcripts -> ${outFile}`);
if (missing.length) console.log(`\nNo published folder with captions: ${missing.join(", ")}`);
if (unverified.length) {
  console.log(`\nFound by folder name, with no published.json to confirm the video:\n  ${unverified.join("\n  ")}`);
}
if (drift.length) {
  console.log("\nlib/youtube-chapters.ts differs from the published video for:");
  for (const line of drift) console.log(`  ${line}`);
}
