#!/usr/bin/env node
// node make.js <lesson-slug> [--no-audio] [--frames] [--mux-only] [--respeak] [--demo|--app]
//                             [--keep-state] [--lpm-dir <dir>] [--dom-mouse]
//                             [--variant name] [--voice ash] [--style "how to read it"]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { OUT, FRAME, ZOOM } = require("./stage");
const { recordDemo, recordApp, renderTimelineCards } = require("./record");
const { videoGraph, frameAssets, frameBox } = require("./compose");
const { makeVoice } = require("./voice");
const { soundtrack } = require("./mix");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const VALUE_FLAGS = ["--voice", "--style", "--variant", "--music", "--lpm-dir"];
const slug = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]));
if (!slug) {
  console.error("usage: node make.js <lesson-slug> [--no-audio] [--frames] [--mux-only] [--demo|--app] [--keep-state] [--variant name] [--voice ash] [--style text]");
  process.exit(1);
}

const ROOT = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons");
const DIR = path.join(ROOT, slug);
const DEMO_URL = process.env.DEMO_URL || "http://localhost:3000/demo";
const DEFAULT_VOICE = "marin";
const DEFAULT_STYLE =
  "Talk like a real person casually showing a colleague the app over their shoulder: relaxed, natural, everyday intonation with small pauses. Not a voiceover artist or announcer, no over-enunciation, moderate pace. Keep every word crisp and easy to catch.";
const MUSIC_UNDER_VOICE_LU = 14;

const lesson = JSON.parse(fs.readFileSync(path.join(DIR, "lesson.json"), "utf8"));
const beats = require(path.join(DIR, "beats.js"));
const source = flag("--demo") ? "demo" : flag("--app") ? "app" : lesson.source || "app";
const VOICE = opt("--voice", lesson.voice || DEFAULT_VOICE);
const TTS_STYLE = opt("--style", lesson.style || DEFAULT_STYLE);
const variant = opt("--variant", null);
const outDir = variant ? path.join(DIR, "variants") : DIR;
const stem = variant ? variant : slug;
const audioDir = variant ? path.join(DIR, "audio", variant) : path.join(DIR, "audio");
const framesDir = path.join(outDir, variant ? `${variant}.frames` : "frames");
const raw = path.join(outDir, variant ? `${variant}.record.mkv` : "record.mkv");
const timelineFile = path.join(outDir, variant ? `${variant}.timeline.json` : "timeline.json");
const mp4 = path.join(outDir, `${stem}.mp4`);
const music = flag("--no-music")
  ? null
  : opt("--music", lesson.music === false ? null : lesson.music || process.env.LPM_LESSON_MUSIC || path.join(ROOT, "_music", "bed.mp3"));
fs.mkdirSync(outDir, { recursive: true });
const voice = makeVoice({ audioDir, voice: VOICE, style: TTS_STYLE, respeak: flag("--respeak") });

async function record(lines) {
  if (flag("--frames")) {
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir, { recursive: true });
  }
  const common = { lines, beats, raw, framesDir: flag("--frames") ? framesDir : null, voice: VOICE };
  const timeline =
    source === "demo"
      ? await recordDemo({ ...common, url: DEMO_URL })
      : await recordApp({
          ...common,
          lesson,
          dir: DIR,
          lpmDir: opt("--lpm-dir", process.env.LPM_LESSON_DIR || path.join(os.homedir(), ".lpm-lessons")),
          keepState: flag("--keep-state"),
          mouse: flag("--dom-mouse") ? "dom" : "real",
        });
  fs.writeFileSync(timelineFile, JSON.stringify(timeline, null, 2));
  console.log(`recorded ${(timeline.totalMs / 1000).toFixed(1)}s (${VOICE}) -> ${raw}`);
}

// An app take's topic cards as clips, rendered once per take (or again when
// their files are gone).
async function ensureCards() {
  if (source === "demo") return;
  const timeline = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
  const have = timeline.cardFiles && timeline.cardFiles.length === (timeline.cards || []).length && timeline.cardFiles.every((f) => fs.existsSync(f));
  if (have) return;
  timeline.cardFiles = await renderTimelineCards(timeline, DIR);
  fs.writeFileSync(timelineFile, JSON.stringify(timeline, null, 2));
  console.log(`cards: ${timeline.cardFiles.length} clip(s)`);
}

async function mux(lines) {
  const timeline = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
  const { totalMs } = timeline;
  const spokenLines = timeline.lines
    .map((t) => ({ ...t, line: lines.find((l) => l.id === t.id) }))
    .filter((t) => !t.line.silent);
  const inputs = ["-i", raw];
  const zooms = timeline.zooms || [];
  let video;
  if (source === "demo") {
    video = videoGraph({ out: OUT, zooms, totalMs, composite: false });
  } else {
    const box = frameBox(OUT, FRAME, ZOOM);
    const assets = await frameAssets(path.join(ROOT, "_frame"), { out: OUT, frame: { ...FRAME, zoom: ZOOM }, box });
    video = videoGraph({ ...assets, out: OUT, box, cards: timeline.cards || [], cardFiles: timeline.cardFiles || [], zooms, totalMs });
  }
  inputs.push(...video.inputs);
  const base = 1 + (video.count || 0);
  const bed = music && fs.existsSync(music) ? music : null;
  if (music && !bed) console.log(`no music: ${music} is missing`);
  // The bed fades in over the opening card and out over the closing one.
  const sound = soundtrack({
    clips: spokenLines.map((t) => ({ wav: t.line.wav, startMs: t.startMs })),
    base,
    bed,
    totalMs,
    underLu: MUSIC_UNDER_VOICE_LU,
    fadeInS: 2.5,
    fadeOutS: 2,
  });
  inputs.push(...sound.inputs);
  const audio = sound.filter;
  const filter = video.filter ? `${video.filter};${audio}` : audio;
  const argv = [
    "-y", ...inputs,
    "-filter_complex", filter,
    "-map", video.label, "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "192k",
    "-t", (totalMs / 1000).toFixed(3),
    "-movflags", "+faststart",
    mp4,
  ];
  const r = spawnSync("ffmpeg", argv, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr.slice(-2000)}`);
  console.log(`muxed -> ${mp4}`);
}

(async () => {
  const lines = await voice.prepare(lesson.narration, { dry: flag("--no-audio") });
  if (!flag("--mux-only")) await record(lines);
  if (!flag("--no-audio")) {
    await ensureCards();
    await mux(lines);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
