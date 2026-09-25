#!/usr/bin/env node
// node make.js <slug> [--no-audio] [--frames] [--mux-only] [--respeak] [--keep-state]
//                     [--lpm-dir <dir>] [--dom-mouse] [--voice marin] [--style "…"]
//                     [--music <file>] [--no-music]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const shared = require("./shared");
const { recordApp } = shared("record");
const { makeVoice } = shared("voice");
const { soundtrack } = shared("mix");
const { TikTokStage } = require("./tiktokstage");
const { OUT, FPS, geometry, cameraKeys, cameraFilter } = require("./camera");
const { editList } = require("./edit");
const { textTrack } = require("./texttrack");
const { renderBackdrop, renderGuides, renderTrack } = require("./overlays");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const VALUE_FLAGS = ["--voice", "--style", "--music", "--lpm-dir"];
const slug = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]));
if (!slug) {
  console.error("usage: node make.js <slug> [--no-audio] [--frames] [--mux-only] [--respeak] [--keep-state] [--voice v] [--style s] [--music f|--no-music]");
  process.exit(1);
}

const LESSONS = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons");
const ROOT = process.env.LPM_TIKTOK_DIR || path.join(LESSONS, "tiktok");
const DIR = path.join(ROOT, slug);
const DEFAULT_VOICE = "marin";
const DEFAULT_STYLE =
  "Voiceover for a short vertical video: a developer showing a friend a trick they love. Upbeat, warm and confident, a little playful, with a smile in the voice. Snappy pace, tight pauses, natural stress on the key words. Not an announcer and not a hype-man; every word crisp and easy to catch.";
// Spoken a touch faster than it is read out, pitch kept.
const TEMPO = 1.08;
const WINDOW = { w: 820, h: 1040 };
const PACE = { gapMs: 140, leadMs: 120, tailMs: 700 };
const MUSIC_UNDER_VOICE_LU = 11;
const WINDOW_RADIUS_PT = 14;

const lesson = JSON.parse(fs.readFileSync(path.join(DIR, "lesson.json"), "utf8"));
const beats = require(path.join(DIR, "beats.js"));
const VOICE = opt("--voice", lesson.voice || DEFAULT_VOICE);
const STYLE = opt("--style", lesson.style || DEFAULT_STYLE);
const raw = path.join(DIR, "record.mkv");
const timelineFile = path.join(DIR, "timeline.json");
const framesDir = path.join(DIR, "frames");
const mp4 = path.join(DIR, `${slug}.mp4`);
const music = flag("--no-music")
  ? null
  : opt("--music", lesson.music === false ? null : lesson.music || process.env.LPM_LESSON_MUSIC || path.join(LESSONS, "_music", "bed.mp3"));
const voice = makeVoice({ audioDir: path.join(DIR, "audio"), voice: VOICE, style: STYLE, respeak: flag("--respeak"), tempo: lesson.tempo ?? TEMPO });

async function record(lines) {
  if (flag("--frames")) {
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir, { recursive: true });
  }
  const timeline = await recordApp({
    lines,
    beats,
    raw,
    framesDir: flag("--frames") ? framesDir : null,
    lesson,
    dir: DIR,
    lpmDir: opt("--lpm-dir", process.env.LPM_LESSON_DIR || path.join(os.homedir(), ".lpm-lessons")),
    keepState: flag("--keep-state"),
    mouse: flag("--dom-mouse") ? "dom" : "real",
    win: lesson.window || WINDOW,
    Stage: TikTokStage,
    pace: PACE,
  });
  fs.writeFileSync(timelineFile, JSON.stringify(timeline, null, 2));
  console.log(`recorded ${(timeline.totalMs / 1000).toFixed(1)}s -> ${raw}`);
}

const looped = (file, seconds) => ["-framerate", String(FPS), "-loop", "1", "-t", seconds.toFixed(3), "-i", file];

// The window on its canvas, through the camera: [in] is the capture, `bg` and
// `mask` the input indexes of the canvas and the rounded mask.
function framed(input, bg, mask, g, keys, offset, label) {
  return (
    `[${input}:v]format=rgba[w${label}];[${mask}:v]format=gray[k${label}];[w${label}][k${label}]alphamerge[a${label}];` +
    `[${bg}:v][a${label}]overlay=x=${g.ox}:y=${g.oy}:eof_action=endall:shortest=1,${cameraFilter(keys, g, offset)},setsar=1[${label}]`
  );
}

async function compose(lines) {
  const t = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
  const log = (m) => console.log(m);
  const g = geometry({ w: t.box.w, h: t.box.h });
  const edit = editList({ lines: t.lines, totalMs: t.totalMs, cuts: t.cuts, payoffMs: t.payoffMs, log });
  const keys = cameraKeys({ zooms: t.zooms, pointer: t.pointer, g, scale: t.box.scale });
  const timed = t.lines.map((tl) => ({ ...tl, line: lines.find((l) => l.id === tl.id), outMs: edit.toOutMs(tl.startMs) }));
  const labels = (t.labels || []).map((l) => ({ ...l, startMs: edit.toOutMs(l.startMs) }));
  const track = textTrack({
    lines: timed,
    labels,
    outMs: edit.outMs,
    headline: lesson.headline ?? timed[0].line.headline,
    cta: lesson.cta === false ? null : lesson.cta || "lpm.cx",
  });
  const look = await renderBackdrop(path.join(ROOT, "_look"), g, WINDOW_RADIUS_PT * t.box.scale);
  const overlay = await renderTrack(path.join(DIR, "overlay"), track, edit.outMs);
  console.log(`text track: ${overlay.frames} changes, ${overlay.painted} painted`);

  const totalS = t.totalMs / 1000;
  const hookS = edit.hook / FPS;
  const inputs = [
    "-i", raw,
    "-ss", (edit.payoff[0] / FPS).toFixed(3), "-t", hookS.toFixed(3), "-i", raw,
    ...looped(look.bg, totalS), ...looped(look.mask, totalS),
    ...looped(look.bg, hookS), ...looped(look.mask, hookS),
    "-f", "concat", "-safe", "0", "-i", overlay.listFile,
  ];
  const parts = [framed(0, 2, 3, g, keys, 0, "main"), framed(1, 4, 5, g, keys, edit.payoff[0], "hook")];
  const segs = edit.main.map((_, i) => `[m${i}]`).join("");
  parts.push(`[main]split=${edit.main.length}${segs}`);
  edit.main.forEach(([a, b], i) => parts.push(`[m${i}]trim=start_frame=${a}:end_frame=${b},setpts=PTS-STARTPTS[s${i}]`));
  parts.push(`[hook]${edit.main.map((_, i) => `[s${i}]`).join("")}concat=n=${edit.main.length + 1}:v=1:a=0[cut]`);
  parts.push(`[6:v]format=rgba[text];[cut][text]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[vout]`);

  const bed = music && fs.existsSync(music) ? music : null;
  if (music && !bed) console.log(`no music: ${music} is missing`);
  const clips = timed.filter((l) => !l.line.silent).map((l) => ({ wav: l.line.wav, startMs: Math.round(l.outMs) }));
  // The bed starts at full level under the hook and is gone with the last frame.
  const sound = soundtrack({ clips, base: 7, bed, totalMs: edit.outMs, underLu: MUSIC_UNDER_VOICE_LU, fadeInS: 0.15, fadeOutS: 0.8 });
  inputs.push(...sound.inputs);
  parts.push(sound.filter);

  const argv = [
    "-y", ...inputs,
    "-filter_complex", parts.join(";"),
    "-map", "[vout]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-t", (edit.outMs / 1000).toFixed(3),
    "-movflags", "+faststart",
    mp4,
  ];
  const started = Date.now();
  const r = spawnSync("ffmpeg", argv, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr.slice(-2500)}`);
  fs.writeFileSync(path.join(DIR, "cut.json"), JSON.stringify({ edit: { ...edit, toOutMs: undefined }, camera: keys, track }, null, 2));
  console.log(`muxed ${(edit.outMs / 1000).toFixed(1)}s in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${mp4}`);
  return edit;
}

function ffmpeg(argv) {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...argv], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-800)}`);
}

// The opening frame (hook headline over the payoff) as the cover, a contact
// sheet with TikTok's interface zones drawn in for review, and the post text.
async function extras(edit) {
  ffmpeg(["-ss", "0.6", "-i", mp4, "-frames:v", "1", "-q:v", "2", path.join(DIR, "cover.jpg")]);
  const guides = await renderGuides(path.join(ROOT, "_look"));
  const every = 1.5;
  const count = Math.ceil(edit.outMs / 1000 / every);
  const cols = 8;
  ffmpeg([
    "-i", mp4, "-loop", "1", "-i", guides,
    "-filter_complex", `[0:v]fps=1/${every}[s];[s][1:v]overlay=shortest=1[g];[g]scale=270:480,tile=${cols}x${Math.ceil(count / cols)}`,
    "-frames:v", "1", "-q:v", "3", path.join(DIR, "sheet.jpg"),
  ]);
  const post = lesson.post || {};
  const tags = (post.hashtags || ["lpm", "coding", "devtools", "macos"]).map((h) => `#${h.replace(/^#/, "")}`);
  fs.writeFileSync(path.join(DIR, "post.txt"), `${post.caption || lesson.title}\n\n${tags.join(" ")}\n`);
  console.log(`cover.jpg, sheet.jpg, post.txt -> ${DIR}`);
}

(async () => {
  const lines = await voice.prepare(lesson.narration, { dry: flag("--no-audio") });
  if (!flag("--mux-only")) await record(lines);
  if (!flag("--no-audio")) await extras(await compose(lines));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
