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
const { HOOK_ID, planEdit, renderEdit } = require("./edit");
const { renderCover } = require("./cover");
const { DEFAULT_LPM_DIR } = require("./state");
const { PHONE_LAYOUT, phoneLayout, phoneAssets } = require("./phonecompose");

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
const MEDIA = ["record.mkv", "timeline.json", `${slug}.mp4`, `${slug}.srt`, "chapters.txt", "edit.json", "cards", "qa"];

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
            phone: lesson.phone,
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

// The straight render of the take into `file`: every line where it was
// recorded. Without `audio` it is picture only, for the edit to cut.
async function mux(lines, P, { file, crf = 18, audio = true }) {
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
  } else if (timeline.phone) {
    // The window and lpm Link side by side (phonecompose.js).
    const layout = phoneLayout(OUT, ZOOM);
    const frameDir = path.join(path.dirname(DIR), "_frame");
    const frame = { ...FRAME, width: PHONE_LAYOUT.window.w, height: PHONE_LAYOUT.window.h, zoom: ZOOM };
    const assets = await frameAssets(frameDir, { out: OUT, frame, box: layout.mac });
    const phone = { layout, region: timeline.phone.region, assets: await phoneAssets(frameDir, { out: OUT, layout, zoom: ZOOM }), taps: timeline.taps || [] };
    video = videoGraph({ ...assets, out: OUT, box: layout.mac, cards: timeline.cards || [], cardFiles: timeline.cardFiles || [], zooms, totalMs, take: P.raw, region: timeline.region, phone });
  } else {
    const box = frameBox(OUT, FRAME, ZOOM);
    const assets = await frameAssets(path.join(path.dirname(DIR), "_frame"), { out: OUT, frame: { ...FRAME, zoom: ZOOM }, box });
    video = videoGraph({ ...assets, out: OUT, box, cards: timeline.cards || [], cardFiles: timeline.cardFiles || [], zooms, totalMs, take: P.raw });
  }
  inputs.push(...video.inputs);
  let filter = video.filter;
  const maps = ["-map", video.label];
  if (audio) {
    const sound = mixFor(
      spoken.map((t) => ({ id: t.id, wav: t.line.wav, startMs: t.startMs })),
      totalMs,
      1 + (video.count || 0),
    );
    inputs.push(...sound.inputs);
    filter = filter ? `${filter};${sound.filter}` : sound.filter;
    maps.push("-map", "[a]");
  }
  const argv = [
    "-y", ...inputs,
    ...(filter ? ["-filter_complex", filter] : []),
    ...maps,
    "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", "30", ...video.tags,
    ...(audio ? ["-c:a", "aac", "-b:a", "192k", "-ar", String(RATE)] : ["-an"]),
    "-t", (totalMs / 1000).toFixed(3),
    "-movflags", "+faststart",
    "-f", "mp4", file,
  ];
  const r = spawnSync("ffmpeg", argv, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    fs.rmSync(file, { force: true });
    throw new Error(`ffmpeg failed (${r.error?.code || r.signal || `exit ${r.status}`}):\n${(r.stderr || "").slice(-2000)}`);
  }
  return timeline;
}

// The soundtrack for clips at their times: the bed fades in over the opening
// and out over the closing card. `base` is the first clip's input index.
function mixFor(clips, totalMs, base = 0) {
  const bed = music && fs.existsSync(music) ? music : null;
  if (music && !bed) console.log(`no music: ${music} is missing${music === DEFAULT_BED ? " (preflight.js downloads it)" : ""}`);
  return soundtrack({ clips, base, bed, totalMs, underLu: MUSIC_UNDER_VOICE_LU, fadeInS: 2.5, fadeOutS: 2, voice: VOICE_SHAPE });
}

// A finished render replaces the MP4 only once it is complete; a re-cut keeps
// the one it replaces in its take's cuts/.
function place(part, P, timeline) {
  const kept = muxOnly && !variant ? keepPreviousCut(DIR, P.mp4, timeline.take) : null;
  if (kept) console.log(`the previous render moved to ${kept}`);
  fs.renameSync(part, P.mp4);
  console.log(`muxed -> ${P.mp4}`);
}

// The straight render, or with a cold open or long waits, the edit of it
// (edit.js). Returns the timeline as the MP4 plays it.
async function render(lines, P, hook) {
  const taken = JSON.parse(fs.readFileSync(P.timeline, "utf8"));
  const plan = source === "app" ? planEdit({ timeline: taken, lesson, hookMs: hook?.ms, log: (m) => console.log(m) }) : null;
  const part = `${P.mp4}.part`;
  const editFile = path.join(P.home, "edit.json");
  if (!plan) {
    await mux(lines, P, { file: part });
    place(part, P, taken);
    fs.rmSync(editFile, { force: true });
    return taken;
  }
  const work = path.join(P.home, ".edit");
  const straight = path.join(work, "straight.mp4");
  fs.mkdirSync(work, { recursive: true });
  try {
    // Nearly lossless, since the edit encodes it once more.
    await mux(lines, P, { file: straight, crf: 12, audio: false });
    const edited = await renderEdit({
      src: straight,
      out: part,
      plan,
      timeline: taken,
      clips: lines,
      hook,
      mix: (clips, totalMs) => mixFor(clips, totalMs),
      badgeDir: path.join(path.dirname(DIR), "_frame"),
      workDir: work,
      size: OUT,
    });
    place(part, P, taken);
    fs.writeFileSync(editFile, JSON.stringify(edited.edit, null, 2));
    return edited;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(part, { force: true });
  }
}

// Captions, chapters and the thumbnail beside the MP4, then the checks.
// `timeline` is the MP4's (edited when there is an edit), `taken` the take's.
async function finish(lines, P, timeline, taken) {
  const srt = P.mp4.replace(/\.mp4$/, ".srt");
  console.log(`captions: ${writeCaptions(srt, timeline, lines)} -> ${srt}`);
  const ch = chapters(timeline, lesson);
  fs.writeFileSync(path.join(P.home, "chapters.txt"), chaptersText(ch.list));
  console.log(`chapters: ${ch.list.map((c) => c.name).join(" | ")}`);
  for (const p of ch.problems) console.log(`  chapters: ${p}`);
  const opener = (timeline.cards || []).find((c) => c.first && !c.hold);
  if (P.main && (opener || lesson.cover)) {
    const stampFile = path.join(DIR, "thumbnail.json");
    const want = lesson.cover ? { cover: lesson.cover, take: taken.take || null, look: CARD_LOOK } : { title: opener.title, look: CARD_LOOK };
    const have = fs.existsSync(stampFile) ? JSON.parse(fs.readFileSync(stampFile, "utf8")) : null;
    const thumb = path.join(DIR, "thumbnail.jpg");
    if (!fs.existsSync(thumb) || JSON.stringify(have) !== JSON.stringify(want)) {
      // With a phone the take holds both windows; the cover's crop is in its points.
      const frame = taken.phone ? { width: taken.phone.captureW } : FRAME;
      if (lesson.cover) await renderCover({ cover: lesson.cover, raw: P.raw, timeline: taken, frame, file: thumb });
      else await renderThumbnail(opener.title, thumb, OUT);
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
  // The cold open's hook is voiced like a line, the first time a render needs
  // it (--mux-only too: it is not part of the take's timing).
  const hook = lesson.coldOpen?.text ? (await voice.prepare([{ id: HOOK_ID, text: lesson.coldOpen.text }]))[0] : null;
  const timeline = await render(lines, P, hook);
  const taken = JSON.parse(fs.readFileSync(P.timeline, "utf8"));
  await finish(hook ? [hook, ...lines] : lines, P, timeline, taken);
})().catch(async (e) => {
  if (o.take && /no clip for its current text/.test(e.message)) console.error(`take ${o.take} was recorded with narration whose clips have been spoken again since; its own audio is gone`);
  console.error(e.stack && !/^Error: /.test(String(e)) ? e.stack : e.message || e);
  await runTeardown();
  process.exit(1);
});
