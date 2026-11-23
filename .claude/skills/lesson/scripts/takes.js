// Every recording gets its own folder under <lesson>/_takes/, with its raw
// capture, timeline, log and a copy of the script that produced it. A take
// that finishes replaces the lesson's current one, whose files move into its
// own folder; a take that fails or is interrupted never touches them. A clean
// dry run on the real clips can keep its capture (its timeline's `reuse` says
// for what), and the next take uses it instead of recording the same thing
// again (short).
const fs = require("fs");
const path = require("path");

const TAKES = "_takes";
const SCRIPT_FILES = ["lesson.json", "beats.js", "compare.json"];
// The text the checks read off a capture (qa.js), beside its video.
const SCREEN = path.join("qa", "screen.json");
const pad = (n) => String(n).padStart(3, "0");

function stamp(d = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
}

function takeFolders(dir) {
  const root = path.join(dir, TAKES);
  return fs.existsSync(root) ? fs.readdirSync(root).filter((n) => /^\d{3}-/.test(n)).sort() : [];
}

const takeAt = (dir, id) => {
  const folder = path.join(dir, TAKES, id);
  return { id, folder, raw: path.join(folder, "record.mkv"), timeline: path.join(folder, "timeline.json") };
};

function readTimeline(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// Output also goes to `file`, so a take's log survives the terminal.
function teeLog(file) {
  const streams = [process.stdout, process.stderr];
  const originals = streams.map((s) => s.write.bind(s));
  streams.forEach((s, i) => {
    s.write = (chunk, ...rest) => {
      try {
        fs.appendFileSync(file, chunk);
      } catch {
        // the log is a convenience; the take goes on without it
      }
      return originals[i](chunk, ...rest);
    };
  });
  return () => streams.forEach((s, i) => (s.write = originals[i]));
}

function beginTake(dir, { dry = false } = {}) {
  const n = takeFolders(dir).reduce((m, name) => Math.max(m, parseInt(name, 10)), 0) + 1;
  const take = takeAt(dir, `${pad(n)}-${stamp()}${dry ? "-dry" : ""}`);
  // Only the newest take can stand in for the next.
  const kept = keptDryTake(dir);
  if (kept) fs.rmSync(kept.raw);
  fs.mkdirSync(take.folder, { recursive: true });
  for (const f of SCRIPT_FILES) {
    if (fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(dir, f), path.join(take.folder, f));
  }
  return { ...take, stopLog: teeLog(path.join(take.folder, "take.log")) };
}

// Safe to call twice: a Ctrl-C marks the take from the signal handler, and
// the take's own error path may still get there too.
function failTake(take, error) {
  if (take.failedAt) return take.failedAt;
  take.stopLog();
  if (take.partial) fs.writeFileSync(path.join(take.folder, "timeline.partial.json"), JSON.stringify(take.partial, null, 2));
  fs.writeFileSync(path.join(take.folder, "error.txt"), `${error.stack || error}\n`);
  take.failedAt = `${take.folder}-failed`;
  fs.renameSync(take.folder, take.failedAt);
  return take.failedAt;
}

function rewriteCardFiles(timelineFile, fromDir, toDir) {
  if (!fs.existsSync(timelineFile)) return;
  const t = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
  if (!t.cardFiles) return;
  t.cardFiles = t.cardFiles.map((f) => (f.startsWith(fromDir + path.sep) ? path.join(toDir, path.relative(fromDir, f)) : f));
  fs.writeFileSync(timelineFile, JSON.stringify(t, null, 2));
}

// The current take's files (`media`, relative to the lesson folder) move into
// its folder, then the new take's raw capture and timeline become current.
function promote(dir, take, media) {
  const hasCurrent = ["record.mkv", "timeline.json"].some((f) => fs.existsSync(path.join(dir, f)));
  let archived = null;
  if (hasCurrent) {
    // Without a timeline the raw capture alone moves.
    const oldId = readTimeline(path.join(dir, "timeline.json"))?.take;
    const named = oldId && path.join(dir, TAKES, oldId);
    const earlier = path.join(dir, TAKES, "000-earlier");
    const earlierFree = !["record.mkv", "timeline.json"].some((f) => fs.existsSync(path.join(earlier, f)));
    archived = named && fs.existsSync(named) ? named : earlierFree ? earlier : freeFolder(earlier);
    fs.mkdirSync(archived, { recursive: true });
    for (const name of media) {
      const from = path.join(dir, name);
      const to = path.join(archived, name);
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
    }
    rewriteCardFiles(path.join(archived, "timeline.json"), path.join(dir, "cards"), path.join(archived, "cards"));
  }
  for (const name of ["record.mkv", "timeline.json"]) fs.renameSync(path.join(take.folder, name), path.join(dir, name));
  return archived;
}

// A dry run's capture is only for its frames; its log and timeline stay.
function finishDryTake(take) {
  fs.rmSync(take.raw, { force: true });
}

// The newest take, when it is a dry run kept with no warnings. Null otherwise.
function keptDryTake(dir) {
  const id = takeFolders(dir).at(-1);
  if (!id?.endsWith("-dry")) return null;
  const take = takeAt(dir, id);
  const timeline = fs.existsSync(take.raw) && readTimeline(take.timeline);
  return timeline && timeline.reuse && !timeline.warnings?.length ? { ...take, reuse: timeline.reuse } : null;
}

// The dry run made the take: its log carries on with the render, and once
// promoted its timeline is a take's like any other. Returns where the
// previous take went, if there was one, and how to stop the log.
function useDryTake(dir, take, media) {
  const stopLog = teeLog(path.join(take.folder, "take.log"));
  const archived = promote(dir, take, media);
  const screen = path.join(take.folder, SCREEN);
  if (fs.existsSync(screen)) {
    fs.mkdirSync(path.join(dir, path.dirname(SCREEN)), { recursive: true });
    fs.renameSync(screen, path.join(dir, SCREEN));
  }
  const file = path.join(dir, "timeline.json");
  const { reuse, ...timeline } = readTimeline(file);
  fs.writeFileSync(file, JSON.stringify(timeline, null, 2));
  return { archived, stopLog };
}

function freeFolder(base) {
  if (!fs.existsSync(base)) return base;
  for (let i = 2; ; i++) if (!fs.existsSync(`${base}-${i}`)) return `${base}-${i}`;
}

// A render about to be replaced (a re-cut) moves into its take's folder under
// cuts/, so a published version is never lost.
function keepPreviousCut(dir, mp4, takeId) {
  if (!fs.existsSync(mp4)) return null;
  const home = path.dirname(mp4) === dir ? path.join(dir, TAKES, takeId || "000-earlier") : path.dirname(mp4);
  const cuts = path.join(home, "cuts");
  fs.mkdirSync(cuts, { recursive: true });
  const to = path.join(cuts, `${path.basename(mp4, ".mp4")}-${stamp(fs.statSync(mp4).mtime)}.mp4`);
  fs.renameSync(mp4, fs.existsSync(to) ? to.replace(/\.mp4$/, `-${Date.now()}.mp4`) : to);
  return to;
}

// An archived take by its number ("7", "007") or full folder name.
function findTake(dir, which) {
  const names = takeFolders(dir).filter((n) => !n.endsWith("-failed"));
  const hit = names.find((n) => n === which) || names.find((n) => parseInt(n, 10) === parseInt(which, 10) && /^\d+$/.test(which));
  if (!hit) throw new Error(`no take "${which}" in ${path.join(dir, TAKES)} (there: ${names.join(", ") || "none"})`);
  const folder = path.join(dir, TAKES, hit);
  if (!["record.mkv", "timeline.json"].every((f) => fs.existsSync(path.join(folder, f)))) {
    throw new Error(`${folder} holds no complete recording (the current take's files live in the lesson folder)`);
  }
  return folder;
}

module.exports = { TAKES, SCREEN, beginTake, failTake, promote, finishDryTake, keptDryTake, useDryTake, findTake, keepPreviousCut, teeLog };
