#!/usr/bin/env node
// node make.js <lesson folder or slug> [flags]   (flags: node make.js)
// A slug is looked up under ~/Movies/lpm-lessons/tiktok (LPM_TIKTOK_DIR); a
// path is used as it is. Takes go into _takes/ like lesson's.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const shared = require("./shared");
const { recordApp } = shared("record");
const { makeVoice } = shared("voice");
const { DEFAULT_BED, RATE, soundtrack } = shared("mix");
const { parseCli, lessonDir } = shared("cli");
const { beginTake, failTake, promote, finishDryTake } = shared("takes");
const { exitOnSignals, runTeardown, onTeardown } = shared("teardown");
const { lintDir } = shared("lint");
const { fitLines, speakWithRollback } = shared("fit");
const { runQa } = shared("qa");
const { DEFAULT_LPM_DIR } = shared("state");
const { CAPTURE_IN, MASTER_OUT, MASTER_TAGS, STILL_OUT } = shared("compose");
const { TikTokStage } = require("./tiktokstage");
const { OUT, FPS, geometry, cameraKeys, cameraFilter } = require("./camera");
const { editList } = require("./edit");
const { textTrack } = require("./texttrack");
const { renderBackdrop, renderGuides, renderTrack } = require("./overlays");
const { SLAM } = require("./look");

const LESSONS = process.env.LPM_LESSONS_DIR || path.join(os.homedir(), "Movies/lpm-lessons");
const ROOT = process.env.LPM_TIKTOK_DIR || path.join(LESSONS, "tiktok");
let o, DIR;
try {
  const cli = parseCli(process.argv.slice(2), { script: "make.js" });
  o = cli.o;
  DIR = lessonDir(cli.lesson, ROOT);
  const unsupported = ["demo", "variant", "take"].filter((k) => o[k]);
  if (unsupported.length) throw new Error(`--${unsupported.join(", --")} is not available for vertical lessons`);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const slug = path.basename(DIR);
const flag = (name) => !!o[name.replace(/^--/, "")];
const opt = (name, def) => o[name.replace(/^--/, "")] ?? def;
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
const VOICE = opt("--voice", lesson.voice || DEFAULT_VOICE);
const STYLE = opt("--style", lesson.style || DEFAULT_STYLE);
const raw = path.join(DIR, "record.mkv");
const timelineFile = path.join(DIR, "timeline.json");
const framesDir = path.join(DIR, "frames");
const mp4 = path.join(DIR, `${slug}.mp4`);
const music = flag("--no-music")
  ? null
  : opt("--music", lesson.music === false ? null : lesson.music || process.env.LPM_LESSON_MUSIC || DEFAULT_BED);
const voice = makeVoice({ audioDir: path.join(DIR, "audio"), voice: VOICE, style: STYLE, respeak: flag("--respeak"), tempo: lesson.tempo ?? TEMPO });

const MEDIA = ["record.mkv", "timeline.json", `${slug}.mp4`, "cut.json", "qa"];

async function record(lines) {
  const beats = require(path.join(DIR, "beats.js"));
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const dry = flag("--no-audio");
  const take = beginTake(DIR, { dry });
  console.log(`take ${take.id} -> ${take.folder}`);
  const interrupted = onTeardown(() => failTake(take, new Error("interrupted (Ctrl-C or a kill signal)")));
  let timeline;
  try {
    timeline = await recordApp({
      lines,
      beats,
      raw: take.raw,
      framesDir,
      errorShot: path.join(take.folder, "error.jpg"),
      lesson,
      lpmDir: opt("--lpm-dir", process.env.LPM_LESSON_DIR || DEFAULT_LPM_DIR),
      keepState: flag("--keep-state"),
      mouse: flag("--dom-mouse") ? "dom" : "real",
      win: lesson.window || WINDOW,
      Stage: TikTokStage,
      pace: PACE,
    });
  } catch (e) {
    interrupted();
    take.partial = e.partial;
    const where = failTake(take, e);
    console.error(`the take failed${e.partial?.failedLine ? ` in "${e.partial.failedLine}"` : ""}; its log, partial timeline and last screen are in ${where}; the current take is untouched`);
    throw e;
  }
  interrupted();
  timeline.take = take.id;
  fs.writeFileSync(take.timeline, JSON.stringify(timeline, null, 2));
  console.log(`recorded ${(timeline.totalMs / 1000).toFixed(1)}s`);
  for (const w of timeline.warnings || []) console.log(`  warning (${w.kind}${w.line ? `, line ${w.line}` : ""}): ${w.message}`);
  if (dry) return finishDryTake(take);
  const archived = promote(DIR, take, MEDIA);
  if (archived) console.log(`the previous take moved to ${archived}`);
}

const looped = (file, seconds) => ["-framerate", String(FPS), "-loop", "1", "-t", seconds.toFixed(3), "-i", file];

// The window on its canvas, through the camera: [in] is the capture, `bg` and
// `mask` the input indexes of the canvas and the rounded mask.
function framed(input, bg, mask, g, keys, offset, label) {
  return (
    `[${input}:v]scale=${CAPTURE_IN},format=rgba[w${label}];[${mask}:v]format=gray[k${label}];[w${label}][k${label}]alphamerge[a${label}];` +
    `[${bg}:v][a${label}]overlay=x=${g.ox}:y=${g.oy}:eof_action=endall:shortest=1,${cameraFilter(keys, g, offset)},setsar=1[${label}]`
  );
}

// The opening lines play over the cold open, not over their own beats, so a
// re-spoken hook only re-times the opening (saved to the timeline); every
// other line still has to fit the slot its take recorded.
function retimeOpening(t, lines) {
  const open = lesson.open ?? 1;
  const out = { ...t, lines: t.lines.map((tl, i) => {
    const line = lines.find((l) => l.id === tl.id);
    return i < open && line && !line.silent && line.ms != null && line.ms !== tl.ms ? { ...tl, ms: line.ms } : tl;
  }) };
  return { t: out, changed: out.lines.some((tl, i) => tl !== t.lines[i]) };
}

async function compose(lines) {
  const retimed = retimeOpening(JSON.parse(fs.readFileSync(timelineFile, "utf8")), lines);
  const t = retimed.t;
  if (retimed.changed) {
    fs.writeFileSync(timelineFile, JSON.stringify(t, null, 2));
    console.log(`opening re-timed to the new hook: ${(t.lines[0].ms / 1000).toFixed(2)}s`);
  }
  const fit = fitLines(t, lines);
  for (const n of fit.notes) console.log(n);
  if (fit.errors.length) throw new Error(fit.errors.join("\n"));
  const log = (m) => console.log(m);
  const g = geometry({ w: t.box.w, h: t.box.h }, { shiftY: lesson.windowShiftY });
  const open = lesson.open ?? 1;
  const edit = editList({ lines: t.lines, totalMs: t.totalMs, cuts: t.cuts, payoffMs: t.payoffMs, open, log });
  const keys = cameraKeys({ zooms: t.zooms, pointer: t.pointer, g, scale: t.box.scale });
  const timed = t.lines.map((tl) => ({ ...tl, line: lines.find((l) => l.id === tl.id), outMs: edit.toOutMs(tl.startMs) }));
  const labels = (t.labels || []).map((l) => ({ ...l, startMs: edit.toOutMs(l.startMs) }));
  const track = {
    ...textTrack({
      lines: timed,
      labels,
      outMs: edit.outMs,
      headline: lesson.headline ?? timed[0].line.headline,
      cta: lesson.cta === false ? null : lesson.cta || "lpm.cx",
      open,
      slam: lesson.slam,
    }),
    stickerTop: lesson.stickerTop,
  };
  const look = await renderBackdrop(path.join(path.dirname(DIR), "_look"), g, WINDOW_RADIUS_PT * t.box.scale);
  const overlay = await renderTrack(path.join(DIR, "overlay"), track, edit.outMs);
  console.log(`text track: ${overlay.frames} changes, ${overlay.painted} painted`);

  console.log(`opening on the payoff: ${(edit.hook / FPS).toFixed(2)}s`);
  // Each shot is read on its own from its first frame, so the camera runs over
  // the frames the video keeps rather than the whole take (a 58-minute race
  // took as long again to render).
  const inputs = [];
  let count = 0;
  const input = (...args) => {
    inputs.push(...args);
    return count++;
  };
  const shot = ([a, b], label) => {
    const seconds = (b - a) / FPS;
    const capture = input("-ss", (a / FPS).toFixed(3), "-t", seconds.toFixed(3), "-i", raw);
    return framed(capture, input(...looped(look.bg, seconds)), input(...looped(look.mask, seconds)), g, keys, a, label);
  };
  const shots = [[edit.payoff[0], edit.payoff[0] + edit.hook], ...edit.main];
  const parts = shots.map((range, i) => shot(range, `s${i}`));
  parts.push(`${shots.map((_, i) => `[s${i}]`).join("")}concat=n=${shots.length}:v=1:a=0[cut]`);
  const text = input("-f", "concat", "-safe", "0", "-i", overlay.listFile);
  parts.push(`[${text}:v]format=rgba[text];[cut][text]overlay=0:0:eof_action=pass:format=auto,${MASTER_OUT}[vout]`);

  const bed = music && fs.existsSync(music) ? music : null;
  if (music && !bed) console.log(`no music: ${music} is missing${music === DEFAULT_BED ? " (preflight.js downloads it)" : ""}`);
  const clips = timed.filter((l) => !l.line.silent).map((l) => ({ id: l.id, wav: l.line.wav, startMs: Math.round(l.outMs) }));
  // The bed starts at full level under the hook and is gone with the last frame.
  const sound = soundtrack({ clips, base: count, bed, totalMs: edit.outMs, underLu: MUSIC_UNDER_VOICE_LU, fadeInS: 0.15, fadeOutS: 0.8 });
  inputs.push(...sound.inputs);
  parts.push(sound.filter);

  const argv = [
    "-y", ...inputs,
    "-filter_complex", parts.join(";"),
    "-map", "[vout]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS), ...MASTER_TAGS,
    "-c:a", "aac", "-b:a", "192k", "-ar", String(RATE),
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

// The opening frame (hook headline, or the slammed names, over the payoff) as
// the cover, a contact sheet with TikTok's interface zones drawn in for
// review, and the post text.
async function extras(edit) {
  const coverS = lesson.slam ? SLAM.coverMs / 1000 : 0.6;
  ffmpeg(["-ss", String(coverS), "-i", mp4, "-frames:v", "1", "-vf", `scale=${STILL_OUT}`, "-q:v", "2", path.join(DIR, "cover.jpg")]);
  const guides = await renderGuides(path.join(path.dirname(DIR), "_look"));
  const every = 1.5;
  const count = Math.ceil(edit.outMs / 1000 / every);
  const cols = 8;
  ffmpeg([
    "-i", mp4, "-loop", "1", "-i", guides,
    "-filter_complex", `[0:v]fps=1/${every},scale=${STILL_OUT},format=rgb24[s];[s][1:v]overlay=shortest=1[g];[g]scale=270:480,tile=${cols}x${Math.ceil(count / cols)}`,
    "-frames:v", "1", "-q:v", "3", path.join(DIR, "sheet.jpg"),
  ]);
  const post = lesson.post || {};
  const tags = (post.hashtags || ["lpm", "coding", "devtools", "macos"]).map((h) => `#${h.replace(/^#/, "")}`);
  fs.writeFileSync(path.join(DIR, "post.txt"), `${post.caption || lesson.title}\n\n${tags.join(" ")}\n`);
  console.log(`cover.jpg, sheet.jpg, post.txt -> ${DIR}`);
}

(async () => {
  exitOnSignals();
  if (!flag("--mux-only")) {
    const lint = lintDir(DIR, { kind: "vertical" });
    for (const w of lint.warnings) console.log(`lint: ${w}`);
    if (lint.errors.length) throw new Error(`the lesson has mistakes to fix before a take:\n  ${lint.errors.join("\n  ")}`);
  }
  const lines =
    flag("--mux-only") && flag("--speak")
      ? await speakWithRollback({
          voice,
          narration: lesson.narration,
          audioDir: path.join(DIR, "audio"),
          check: (ls) => fitLines(retimeOpening(JSON.parse(fs.readFileSync(timelineFile, "utf8")), ls).t, ls).errors,
        })
      : await voice.prepare(lesson.narration, { dry: flag("--no-audio"), cachedOnly: flag("--mux-only") });
  if (!flag("--mux-only")) await record(lines);
  if (flag("--no-audio")) return;
  await extras(await compose(lines));
  if (!flag("--no-qa")) {
    const timeline = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
    runQa({ dir: DIR, mp4, raw, timeline, lesson, vertical: true });
  }
})().catch(async (e) => {
  console.error(e.stack && !/^Error: /.test(String(e)) ? e.stack : e.message || e);
  await runTeardown();
  process.exit(1);
});
