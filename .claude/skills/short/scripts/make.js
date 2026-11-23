#!/usr/bin/env node
// node make.js <lesson folder or slug> [flags]   (flags: node make.js)
// A slug is looked up under ~/Movies/lpm-lessons/tiktok (LPM_TIKTOK_DIR); a
// path is used as it is. Takes go into _takes/ like lesson's. A dry run on the
// real clips renders a preview into its take folder, and when it is clean the
// next take uses that recording instead of making it again (dryrun.js).
const fs = require("fs");
const path = require("path");
const shared = require("./shared");
const { recordApp } = shared("record");
const { makeVoice } = shared("voice");
const { DEFAULT_BED } = shared("mix");
const { parseCli, lessonDir } = shared("cli");
const { beginTake, failTake, promote, finishDryTake, keptDryTake, useDryTake } = shared("takes");
const { exitOnSignals, runTeardown, onTeardown } = shared("teardown");
const { checkNarration, lintDir, refuseMistakes } = shared("lint");
const { fitLines, speakWithRollback } = shared("fit");
const { runQa } = shared("qa");
const { setHeard } = shared("words");
const { DEFAULT_LPM_DIR } = shared("state");
const { TikTokStage } = require("./tiktokstage");
const { render, retimeOpening, spokenMs } = require("./render");
const { recordingKey, namedKey, changes } = require("./dryrun");
const { HOOK_MAX_MS, LENGTH_MAX_MS } = require("./checks");
const ROOT = require("./root");

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
const DEFAULT_VOICE = "marin";
const DEFAULT_STYLE =
  "Voiceover for a short vertical video: a developer showing a friend a trick they love. Upbeat, warm and confident, a little playful, with a smile in the voice. Snappy pace, tight pauses, natural stress on the key words. Not an announcer and not a hype-man; every word crisp and easy to catch.";
// Spoken a touch faster than it is read out, pitch kept.
const TEMPO = 1.08;
const WINDOW = { w: 820, h: 1040 };
const PACE = { gapMs: 140, leadMs: 120, tailMs: 700 };

const lesson = JSON.parse(fs.readFileSync(path.join(DIR, "lesson.json"), "utf8"));
const open = lesson.open ?? 1;
setHeard(lesson.heard);
const dry = !!o["no-audio"];
const muxOnly = !!o["mux-only"];
const audioDir = path.join(DIR, "audio");
const framesDir = path.join(DIR, "frames");
const music = o["no-music"] ? null : o.music ?? (lesson.music === false ? null : lesson.music || process.env.LPM_LESSON_MUSIC || DEFAULT_BED);
const voice = makeVoice({ audioDir, voice: o.voice || lesson.voice || DEFAULT_VOICE, style: o.style || lesson.style || DEFAULT_STYLE, respeak: !!o.respeak, tempo: lesson.tempo ?? TEMPO, pronounce: lesson.pronounce });
// The hook is spoken again while it runs over what a scroll allows (voice.js).
const firstSpoken = lesson.narration.findIndex((l) => l.text);
const narration = lesson.narration.map((l, i) => (i === firstSpoken ? { ...l, capMs: HOOK_MAX_MS } : l));
const MEDIA = ["record.mkv", "timeline.json", `${slug}.mp4`, "cut.json", "qa"];
const dirs = { look: path.join(path.dirname(DIR), "_look"), overlay: path.join(DIR, "overlay") };
// The current take and its video.
const P = { home: DIR, raw: path.join(DIR, "record.mkv"), timeline: path.join(DIR, "timeline.json"), mp4: path.join(DIR, `${slug}.mp4`) };
const mode = { mouse: o["dom-mouse"] ? "dom" : "real", keepState: !!o["keep-state"], lpmDir: o["lpm-dir"] || process.env.LPM_LESSON_DIR || DEFAULT_LPM_DIR };

// The last dry run as the take, when it recorded exactly this.
function useDryRun(lines) {
  const kept = o.fresh ? null : keptDryTake(DIR);
  if (!kept) return false;
  const changed = changes(kept.reuse, recordingKey(DIR, lesson, lines, mode));
  if (changed.length) {
    console.log(`the last dry run can't be the take: ${changed.join(", ")} changed since`);
    return false;
  }
  const min = Math.round((Date.now() - fs.statSync(kept.timeline).mtimeMs) / 60000);
  const { archived } = useDryTake(DIR, kept, MEDIA);
  console.log(`take ${kept.id}: the dry run ${min ? `${min} min ago` : "just now"} recorded this script, these clips and this app with no warnings, so it is the take (--fresh records a new one)`);
  if (archived) console.log(`the previous take moved to ${archived}`);
  return true;
}

// Returns the dry run's take, for its preview; a take is promoted.
async function record(lines) {
  if (!dry && useDryRun(lines)) return null;
  const key = dry && recordingKey(DIR, lesson, lines, mode);
  const beats = require(path.join(DIR, "beats.js"));
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
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
      ...mode,
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
  if (dry) return { take, timeline, key: { ...key, ...namedKey(DIR) } };
  const archived = promote(DIR, take, MEDIA);
  if (archived) console.log(`the previous take moved to ${archived}`);
  return null;
}

// Renders the take at `P` and checks it, unless it was told not to.
async function finish(P, lines) {
  const { timeline, checks } = await render({ P, dirs, lesson, lines, music });
  return o["no-qa"] ? null : runQa({ dir: DIR, mp4: P.mp4, raw: P.raw, timeline, lesson, cut: { checks } });
}

// A dry run on the real clips is the whole video, in its take's folder: what
// its sheet and checks show is what the take will be. A clean one is kept.
async function preview({ take, timeline, key }, lines) {
  if (!lines.every((l) => l.silent || l.wav)) {
    finishDryTake(take);
    console.log("dry run on estimated lengths: voice the lines first (--speak-only) and it also shows the finished framing, and can be the take");
    return;
  }
  const mp4 = path.join(take.folder, "preview.mp4");
  const report = await finish({ home: take.folder, raw: take.raw, timeline: take.timeline, mp4 }, lines);
  const keep = !timeline.warnings?.length && report?.pass !== false;
  if (keep) fs.writeFileSync(take.timeline, JSON.stringify({ ...timeline, reuse: key }, null, 2));
  else finishDryTake(take);
  console.log(`preview -> ${mp4}\n  look at ${path.join(take.folder, "sheet.jpg")}`);
  console.log(keep ? "dry run kept: the take will render this recording instead of recording again, while the script, the clips and the app stay the same" : "dry run not kept: fix what it warned about, and the next one can be the take");
}

function writePost() {
  const post = lesson.post || {};
  const tags = (post.hashtags || ["lpm", "coding", "devtools", "macos"]).map((h) => `#${h.replace(/^#/, "")}`);
  fs.writeFileSync(path.join(DIR, "post.txt"), `${post.caption || lesson.title}\n\n${tags.join(" ")}\n`);
}

// --speak-only: what the video will run to, before anything is recorded.
function speakReport(lines) {
  const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
  const gaps = (n) => n * PACE.gapMs;
  const opening = lines.slice(0, open).reduce((ms, l) => ms + l.ms, 0) + gaps(open - 1);
  const total = lines.reduce((ms, l) => ms + l.ms, 0) + gaps(lines.length) + PACE.tailMs;
  const hook = lines.find((l) => !l.silent);
  console.log(`about ${s(total)} in all; hook ${s(hook?.ms ?? 0)}, opening over the payoff ${s(opening)}`);
  if (hook?.ms > HOOK_MAX_MS) console.log(`  the hook is over ${s(HOOK_MAX_MS)}: cut words from it`);
  if (total > LENGTH_MAX_MS) console.log(`  over ${s(LENGTH_MAX_MS)}: cut a line`);
  for (const l of lines) if (!l.silent && l.ms - spokenMs(l) > 900) console.log(`  "${l.id}" ends on ${s(l.ms - spokenMs(l))} of silence; --respeak may trim it`);
}

(async () => {
  exitOnSignals();
  if (o["speak-only"]) {
    refuseMistakes(checkNarration(lesson, { kind: "vertical" }));
    return speakReport(await voice.prepare(narration));
  }
  if (!muxOnly) refuseMistakes(lintDir(DIR, { kind: "vertical" }));
  const lines =
    muxOnly && o.speak
      ? await speakWithRollback({
          voice,
          narration,
          audioDir,
          check: (ls) => fitLines(retimeOpening(JSON.parse(fs.readFileSync(P.timeline, "utf8")), ls, open).t, ls).errors,
        })
      : await voice.prepare(narration, { dry, cachedOnly: muxOnly });
  const dryRun = muxOnly ? null : await record(lines);
  if (dry) return preview(dryRun, lines);
  writePost();
  console.log(`post.txt -> ${DIR}`);
  await finish(P, lines);
})().catch(async (e) => {
  console.error(e.stack && !/^Error: /.test(String(e)) ? e.stack : e.message || e);
  await runTeardown();
  process.exit(1);
});
