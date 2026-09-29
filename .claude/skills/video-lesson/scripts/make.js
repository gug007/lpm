#!/usr/bin/env node
// node make.js <lesson folder or slug> [flags]   (flags: node make.js)
// A slug is looked up under ~/Movies/lpm-lessons (LPM_LESSONS_DIR); a path is
// used as it is. Records a take into _takes/ (see takes.js), then renders the
// MP4, its captions, chapters and thumbnail, and checks it (qa.js).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { parseCli, lessonDir } = require("./cli");
const { OUT, FRAME, ZOOM } = require("./stage");
const { recordDemo, recordApp, renderTimelineCards } = require("./record");
const { CARD_LOOK, renderThumbnail } = require("./cards");
const { videoGraph, frameAssets, frameBox, editZooms } = require("./compose");
const { makeVoice } = require("./voice");
const { DEFAULT_BED, RATE, soundtrack } = require("./mix");
const { beginTake, failTake, promote, finishDryTake, findTake, keepPreviousCut } = require("./takes");
const { exitOnSignals, runTeardown, onTeardown } = require("./teardown");
const { fitLines, speakWithRollback } = require("./fit");
const { lintDir } = require("./lint");
const { writeCaptions } = require("./captions");
const { chapters, chaptersText } = require("./chapters");
const { runQa } = require("./qa");
const { DEFAULT_LPM_DIR } = require("./state");

const ROOT = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons");
let o, DIR;
try {
  const cli = parseCli(process.argv.slice(2), { script: "make.js" });
  o = cli.o;
  DIR = lessonDir(cli.lesson, ROOT);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const slug = path.basename(DIR);
const DEMO_URL = process.env.DEMO_URL || "http://localhost:3000/demo";
const DEFAULT_VOICE = "marin";
const DEFAULT_STYLE =
  "Talk like a real person casually showing a colleague the app over their shoulder: relaxed, natural, everyday intonation with small pauses. Not a voiceover artist or announcer, no over-enunciation, moderate pace. Keep every word crisp and easy to catch.";
const MUSIC_UNDER_VOICE_LU = 14;
// Every lesson's narrator sounds alike: clips evened out, treble shelved onto
// lesson 02's brightness.
const VOICE_SHAPE = { level: true, brightness: -16.5 };

// A re-cut of an archived take uses the script it was recorded with.
let takeScript = null;
try {
  takeScript = o.take && path.join(findTake(DIR, o.take), "lesson.json");
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const lesson = JSON.parse(fs.readFileSync(takeScript && fs.existsSync(takeScript) ? takeScript : path.join(DIR, "lesson.json"), "utf8"));
const source = o.demo ? "demo" : o.app ? "app" : lesson.source || "app";
const VOICE = o.voice || lesson.voice || DEFAULT_VOICE;
const TTS_STYLE = o.style || lesson.style || DEFAULT_STYLE;
const variant = o.variant || null;
const dry = !!o["no-audio"];
const muxOnly = !!o["mux-only"];
const audioDir = variant ? path.join(DIR, "audio", variant) : path.join(DIR, "audio");
const music = o["no-music"] ? null : o.music || (lesson.music === false ? null : lesson.music || process.env.LPM_LESSON_MUSIC || DEFAULT_BED);
const voice = makeVoice({ audioDir, voice: VOICE, style: TTS_STYLE, respeak: !!o.respeak });
// What moves with a take when a newer one replaces it.
const MEDIA = ["record.mkv", "timeline.json", `${slug}.mp4`, `${slug}.srt`, "chapters.txt", "cards", "qa"];

// Where the take being cut lives: the lesson folder, an archived take
// (--take), or a voice variant's own files.
function paths() {
  if (variant) {
    const home = path.join(DIR, "variants");
    return { home, raw: path.join(home, `${variant}.record.mkv`), timeline: path.join(home, `${variant}.timeline.json`), mp4: path.join(home, `${variant}.mp4`), main: false };
  }
  const home = o.take ? findTake(DIR, o.take) : DIR;
  return { home, raw: path.join(home, "record.mkv"), timeline: path.join(home, "timeline.json"), mp4: path.join(home, `${slug}.mp4`), main: !o.take };
}

async function record(lines) {
  const beats = require(path.join(DIR, "beats.js"));
  const framesDir = path.join(variant ? path.join(DIR, "variants") : DIR, variant ? `${variant}.frames` : "frames");
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const take = variant ? null : beginTake(DIR, { dry });
  if (take) console.log(`take ${take.id} -> ${take.folder}`);
  const P = paths();
  const common = { lines, beats, raw: take ? take.raw : P.raw, framesDir, voice: VOICE };
  const interrupted = take && onTeardown(() => failTake(take, new Error("interrupted (Ctrl-C or a kill signal)")));
  let timeline;
  try {
    timeline =
      source === "demo"
        ? await recordDemo({ ...common, url: DEMO_URL })
        : await recordApp({
            ...common,
            lesson,
            errorShot: take && path.join(take.folder, "error.jpg"),
            lpmDir: o["lpm-dir"] || process.env.LPM_LESSON_DIR || DEFAULT_LPM_DIR,
            keepState: !!o["keep-state"],
            mouse: o["dom-mouse"] ? "dom" : "real",
          });
  } catch (e) {
    if (take) {
      interrupted();
      take.partial = e.partial;
      const where = failTake(take, e);
      console.error(`the take failed${e.partial?.failedLine ? ` in "${e.partial.failedLine}"` : ""}; its log, partial timeline and last screen are in ${where}; the current take is untouched`);
    }
    throw e;
  }
  if (take) {
    interrupted();
    timeline.take = take.id;
  }
  fs.writeFileSync(take ? take.timeline : P.timeline, JSON.stringify(timeline, null, 2));
  console.log(`recorded ${(timeline.totalMs / 1000).toFixed(1)}s (${VOICE})`);
  for (const w of timeline.warnings || []) console.log(`  warning (${w.kind}${w.line ? `, line ${w.line}` : ""}): ${w.message}`);
  if (!take) return;
  if (dry) return finishDryTake(take);
  const archived = promote(DIR, take, MEDIA);
  if (archived) console.log(`the previous take moved to ${archived}`);
}

// An app take's topic cards as clips, rendered once per take (or again when
// their files are gone or the card's look has changed since).
async function ensureCards(P) {
  if (source === "demo") return;
  const timeline = JSON.parse(fs.readFileSync(P.timeline, "utf8"));
  const have =
    timeline.cardLook === CARD_LOOK &&
    timeline.cardFiles &&
    timeline.cardFiles.length === (timeline.cards || []).length &&
    timeline.cardFiles.every((f) => fs.existsSync(f));
  if (have) return;
  timeline.cardFiles = await renderTimelineCards(timeline, P.home);
  timeline.cardLook = CARD_LOOK;
  fs.writeFileSync(P.timeline, JSON.stringify(timeline, null, 2));
  console.log(`cards: ${timeline.cardFiles.length} clip(s)`);
}

async function mux(lines, P) {
  const timeline = JSON.parse(fs.readFileSync(P.timeline, "utf8"));
  const fit = fitLines(timeline, lines);
  for (const n of fit.notes) console.log(n);
  if (fit.errors.length) throw new Error(fit.errors.join("\n"));
  const { totalMs } = timeline;
  const spoken = timeline.lines.map((t) => ({ ...t, line: lines.find((l) => l.id === t.id) })).filter((t) => !t.line.silent);
  const zooms = editZooms(timeline.zooms || [], lesson.zooms, (m) => console.log(m));
  if (zooms.some((z) => z.id)) console.log(`zooms: ${zooms.map((z) => z.id).join(" ")} (lesson.json "zooms" adjusts one by id)`);
  const inputs = ["-i", P.raw];
  let video;
  if (source === "demo") {
    video = videoGraph({ out: OUT, zooms, totalMs, composite: false });
  } else {
    const box = frameBox(OUT, FRAME, ZOOM);
    const assets = await frameAssets(path.join(path.dirname(DIR), "_frame"), { out: OUT, frame: { ...FRAME, zoom: ZOOM }, box });
    video = videoGraph({ ...assets, out: OUT, box, cards: timeline.cards || [], cardFiles: timeline.cardFiles || [], zooms, totalMs });
  }
  inputs.push(...video.inputs);
  const base = 1 + (video.count || 0);
  const bed = music && fs.existsSync(music) ? music : null;
  if (music && !bed) console.log(`no music: ${music} is missing${music === DEFAULT_BED ? " (preflight.js downloads it)" : ""}`);
  // The bed fades in over the opening card and out over the closing one.
  const sound = soundtrack({
    clips: spoken.map((t) => ({ id: t.id, wav: t.line.wav, startMs: t.startMs })),
    base,
    bed,
    totalMs,
    underLu: MUSIC_UNDER_VOICE_LU,
    fadeInS: 2.5,
    fadeOutS: 2,
    voice: VOICE_SHAPE,
  });
  inputs.push(...sound.inputs);
  const filter = video.filter ? `${video.filter};${sound.filter}` : sound.filter;
  // Rendered beside the MP4 and moved into place only once it is complete.
  const part = `${P.mp4}.part`;
  const argv = [
    "-y", ...inputs,
    "-filter_complex", filter,
    "-map", video.label, "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", ...video.tags,
    "-c:a", "aac", "-b:a", "192k", "-ar", String(RATE),
    "-t", (totalMs / 1000).toFixed(3),
    "-movflags", "+faststart",
    "-f", "mp4", part,
  ];
  const r = spawnSync("ffmpeg", argv, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    fs.rmSync(part, { force: true });
    throw new Error(`ffmpeg failed:\n${r.stderr.slice(-2000)}`);
  }
  const kept = muxOnly && !variant ? keepPreviousCut(DIR, P.mp4, timeline.take) : null;
  if (kept) console.log(`the previous render moved to ${kept}`);
  fs.renameSync(part, P.mp4);
  console.log(`muxed -> ${P.mp4}`);
  return timeline;
}

// Captions, chapters and the thumbnail beside the MP4, then the checks.
async function finish(lines, P, timeline) {
  const srt = P.mp4.replace(/\.mp4$/, ".srt");
  console.log(`captions: ${writeCaptions(srt, timeline, lines)} -> ${srt}`);
  const ch = chapters(timeline, lesson);
  fs.writeFileSync(path.join(P.home, "chapters.txt"), chaptersText(ch.list));
  console.log(`chapters: ${ch.list.map((c) => c.name).join(" | ")}`);
  for (const p of ch.problems) console.log(`  chapters: ${p}`);
  const opener = (timeline.cards || []).find((c) => c.first && !c.hold);
  if (P.main && opener) {
    const stampFile = path.join(DIR, "thumbnail.json");
    const want = { title: opener.title, look: CARD_LOOK };
    const have = fs.existsSync(stampFile) ? JSON.parse(fs.readFileSync(stampFile, "utf8")) : null;
    const thumb = path.join(DIR, "thumbnail.jpg");
    if (!fs.existsSync(thumb) || JSON.stringify(have) !== JSON.stringify(want)) {
      await renderThumbnail(opener.title, thumb, OUT);
      fs.writeFileSync(stampFile, JSON.stringify(want));
      console.log(`thumbnail -> ${thumb}`);
    }
  }
  if (!o["no-qa"] && source === "app") runQa({ dir: DIR, mp4: P.mp4, raw: P.raw, timeline, lesson });
}

(async () => {
  exitOnSignals();
  if (!muxOnly) {
    const lint = lintDir(DIR, { kind: "landscape" });
    for (const w of lint.warnings) console.log(`lint: ${w}`);
    if (lint.errors.length) throw new Error(`the lesson has mistakes to fix before a take:\n  ${lint.errors.join("\n  ")}`);
  }
  const lines =
    muxOnly && o.speak
      ? await speakWithRollback({ voice, narration: lesson.narration, audioDir, check: (ls) => fitLines(JSON.parse(fs.readFileSync(paths().timeline, "utf8")), ls).errors })
      : await voice.prepare(lesson.narration, { dry, cachedOnly: muxOnly });
  if (!muxOnly) await record(lines);
  if (dry) return;
  const P = paths();
  await ensureCards(P);
  const timeline = await mux(lines, P);
  await finish(lines, P, timeline);
})().catch(async (e) => {
  if (o.take && /no clip for its current text/.test(e.message)) console.error(`take ${o.take} was recorded with narration whose clips have been spoken again since; its own audio is gone`);
  console.error(e.stack && !/^Error: /.test(String(e)) ? e.stack : e.message || e);
  await runTeardown();
  process.exit(1);
});
