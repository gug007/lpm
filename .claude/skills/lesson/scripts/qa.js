#!/usr/bin/env node
// node qa.js <lesson folder> [--vertical]
// Checks a finished take before it is published, and writes qa/report.json
// (lesson-publish's prepare.js refuses a lesson without a passing one):
// - the screen, read with macOS's text recognition once a second: the user's
//   account name, full name, computer name, email and home path, any email
//   address, and error text an agent or the app printed ("Hook failed")
// - the agent replies and clicks the take had to retry (timeline warnings)
// - dead air: pauses between lines longer than 2.5 s
// - loudness and true peak of the finished MP4
// - qa/sheet.jpg, one frame per narration line, to look over in one glance
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync, spawnSync } = require("child_process");
const { mmss } = require("./chapters");
const { MASTER } = require("./mix");
const { helper } = require("./helpers");
const { STILL_OUT } = require("./compose");
const { editTimeline } = require("./edit");

const DEAD_AIR_MS = 2500;
const ERROR_TEXT = [
  "hook failed",
  "hook exited with code",
  "transcript saving is off",
  "command not found",
  "permission denied",
  "eaddrinuse",
  "address already in use",
  "something went wrong",
  "panicked at",
  "traceback (most recent call last)",
  "unhandled promise rejection",
  "npm err!",
];

const run = (cmd, argv) => spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 26 });
const out = (cmd, argv) => (run(cmd, argv).stdout || "").trim();

// Who is recording: never written to the repo, only matched against the take.
function identity() {
  const terms = [];
  const add = (text, why, min = 3) => {
    const t = (text || "").trim().toLowerCase();
    if (t.length >= min && !terms.some((x) => x.text === t)) terms.push({ text: t, why });
  };
  add(os.userInfo().username, "account name");
  add(os.homedir(), "home folder path");
  const full = out("id", ["-F"]);
  add(full, "full name");
  for (const part of full.split(/\s+/)) add(part, "full name", 4);
  add(out("scutil", ["--get", "ComputerName"]), "computer name");
  add(out("scutil", ["--get", "LocalHostName"]), "computer name");
  add(out("git", ["config", "--global", "user.email"]), "email");
  return terms.map((t) => ({ ...t, re: new RegExp(`(?<![a-z0-9])${t.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`) }));
}

// Text on screen per second of the take, reading each distinct frame once.
function readScreen(raw) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lesson-qa-"));
  try {
    execFileSync("ffmpeg", ["-v", "error", "-i", raw, "-vf", "fps=1", "-q:v", "3", path.join(tmp, "%05d.jpg")]);
    const frames = fs.readdirSync(tmp).filter((f) => f.endsWith(".jpg")).sort();
    const byHash = new Map();
    for (const f of frames) {
      const h = crypto.createHash("sha1").update(fs.readFileSync(path.join(tmp, f))).digest("hex");
      if (!byHash.has(h)) byHash.set(h, []);
      byHash.get(h).push(f);
    }
    const unique = [...byHash.values()].map((fs2) => path.join(tmp, fs2[0]));
    const text = new Map();
    const bin = helper("ocr");
    for (let i = 0; i < unique.length; i += 40) {
      const r = run(bin, unique.slice(i, i + 40));
      if (r.status !== 0) throw new Error(`text recognition failed (${r.status ?? r.signal}): ${(r.stderr || "").slice(-200)}`);
      for (const line of r.stdout.split("\n")) {
        const [file, ...rest] = line.split("\t");
        if (!file) continue;
        text.set(file, `${text.get(file) || ""}\n${rest.join("\t")}`);
      }
    }
    if (unique.length && ![...text.values()].some((t) => t.trim())) throw new Error("text recognition read nothing on any frame");
    const perSecond = [];
    for (const [, group] of byHash) {
      const t = text.get(path.join(tmp, group[0])) || "";
      for (const f of group) perSecond.push({ s: parseInt(f, 10) - 1, text: t });
    }
    return perSecond.sort((a, b) => a.s - b.s);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Seconds where `match` holds, as "m:ss–m:ss" ranges.
function ranges(seconds) {
  const out2 = [];
  for (const s of seconds.sort((a, b) => a - b)) {
    const last = out2.at(-1);
    if (last && s - last[1] <= 2) last[1] = s;
    else out2.push([s, s]);
  }
  return out2.map(([a, b]) => (a === b ? mmss(a * 1000) : `${mmss(a * 1000)}–${mmss(b * 1000)}`)).join(", ");
}

function screenChecks(raw, clock) {
  const checks = [];
  const screen = readScreen(raw);
  const hits = new Map();
  const note = (key, level, message, s) => {
    if (!hits.has(key)) hits.set(key, { level, message, seconds: [] });
    hits.get(key).seconds.push(s);
  };
  const terms = identity();
  for (const { s, text } of screen) {
    const low = text.toLowerCase();
    for (const t of terms) if (t.re.test(low)) note(`id:${t.text}`, "FAIL", `your ${t.why} ("${t.text}") is on screen`, s);
    for (const m of low.match(/[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z.]{2,}/g) || []) {
      if (!/@example\./.test(m)) note(`mail:${m}`, "FAIL", `an email address (${m}) is on screen`, s);
    }
    for (const e of ERROR_TEXT) if (low.includes(e)) note(`err:${e}`, "FAIL", `error text on screen: "${e}"`, s);
  }
  for (const h of hits.values()) checks.push({ level: h.level, check: "screen", message: `${h.message} at ${ranges(h.seconds)}${clock}` });
  if (!hits.size) checks.push({ level: "OK", check: "screen", message: `read ${screen.length} s of the take: no names, emails or error text` });
  return checks;
}

// A pause a card fills, or one the edit plays faster (edit.js), is not dead air.
function deadAir(timeline) {
  const checks = [];
  const busy = [
    ...(timeline.cards || []).map((c) => [c.startMs, c.startMs + c.ms]),
    ...(timeline.edit || []).filter((c) => c.kind === "wait").map((c) => [c.outStartMs, c.outStartMs + c.outMs]),
  ];
  timeline.lines.forEach((t, i) => {
    const next = timeline.lines[i + 1];
    if (!next) return;
    const from = t.startMs + t.ms;
    const gap = next.startMs - from;
    if (gap <= DEAD_AIR_MS || busy.some(([a, b]) => a < next.startMs && from < b)) return;
    checks.push({ level: "WARN", check: "dead air", message: `${(gap / 1000).toFixed(1)} s with nothing said after "${t.id}" at ${mmss(from)}` });
  });
  return checks;
}

function loudnessCheck(mp4) {
  const err = run("ffmpeg", ["-hide_banner", "-nostats", "-i", mp4, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]).stderr || "";
  const summary = err.split("Summary").pop() || "";
  const i = parseFloat((/I:\s+(-?[\d.]+) LUFS/.exec(summary) || [])[1]);
  const tp = parseFloat((/Peak:\s+(-?[\d.]+) dBFS/.exec(summary) || [])[1]);
  if (!Number.isFinite(i)) return [{ level: "WARN", check: "loudness", message: "could not measure the MP4's loudness" }];
  const level = Math.abs(i - MASTER.lufs) > 1.5 || tp > -1 ? "WARN" : "OK";
  return [{ level, check: "loudness", message: `${i.toFixed(1)} LUFS (target ${MASTER.lufs}), true peak ${tp.toFixed(1)} dBTP` }];
}

function sheet(mp4, timeline, lesson, file) {
  const spoken = timeline.lines.filter((t) => lesson.narration.find((n) => n.id === t.id)?.text);
  if (!spoken.length) return [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lesson-sheet-"));
  try {
    spoken.forEach((t, i) => {
      const at = (t.startMs + t.ms * 0.8) / 1000;
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", at.toFixed(2), "-i", mp4, "-frames:v", "1", "-vf", `scale=640:-2:${STILL_OUT}`, path.join(tmp, `${String(i).padStart(3, "0")}.jpg`)]);
    });
    const cols = 5;
    const rows = Math.ceil(spoken.length / cols);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", path.join(tmp, "%03d.jpg"), "-vf", `tile=${cols}x${rows}:padding=6:color=white`, "-frames:v", "1", "-q:v", "3", file]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return spoken.map((t, i) => ({ tile: i + 1, at: mmss(t.startMs), line: t.id }));
}

// `raw` is the take's capture; on a vertical lesson or an edited cut its clock
// is the take's, not the cut's. A vertical lesson has no dead-air check (the
// edit cuts the waits).
function runQa({ dir, mp4, raw, timeline, lesson, vertical = false, log = console.log }) {
  const qaDir = path.join(path.dirname(mp4), "qa");
  fs.mkdirSync(qaDir, { recursive: true });
  const checks = [];
  try {
    checks.push(...screenChecks(raw, vertical || timeline.edit ? " (take time)" : ""));
  } catch (e) {
    checks.push({ level: "FAIL", check: "screen", message: `the screen could not be read, so nothing was checked for names or errors: ${e.message}` });
  }
  for (const w of timeline.warnings || []) {
    checks.push({ level: w.kind === "agent" ? "FAIL" : "WARN", check: w.kind, message: `${w.message}${w.line ? ` (line "${w.line}")` : ""}` });
  }
  if (!vertical) checks.push(...deadAir(timeline));
  checks.push(...loudnessCheck(mp4));
  const sheetFile = path.join(qaDir, "sheet.jpg");
  const tiles = vertical ? [] : sheet(mp4, timeline, lesson, sheetFile);
  const report = {
    lesson: path.basename(dir),
    mp4,
    mp4Mtime: fs.statSync(mp4).mtimeMs,
    checkedAt: new Date().toISOString(),
    pass: !checks.some((c) => c.level === "FAIL"),
    checks,
    ...(tiles.length && { sheet: sheetFile, tiles }),
  };
  fs.writeFileSync(path.join(qaDir, "report.json"), JSON.stringify(report, null, 2));
  const fails = checks.filter((c) => c.level === "FAIL");
  const warns = checks.filter((c) => c.level === "WARN");
  log(`qa: ${fails.length} FAIL, ${warns.length} WARN -> ${path.join(qaDir, "report.json")}${tiles.length ? `, ${sheetFile}` : ""}`);
  for (const c of [...fails, ...warns]) log(`  ${c.level} ${c.check}: ${c.message}`);
  return report;
}

module.exports = { runQa, identity, ERROR_TEXT };

if (require.main === module) {
  const args = process.argv.slice(2);
  const vertical = args.includes("--vertical");
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) {
    console.error("usage: node qa.js <lesson folder> [--vertical]");
    process.exit(2);
  }
  const d = path.resolve(dir);
  const read = (f) => JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
  // timeline.json is the take's clock; an edited MP4 plays the cut in edit.json.
  const taken = read("timeline.json");
  const timeline = fs.existsSync(path.join(d, "edit.json")) ? editTimeline(taken, { dropped: [] }, read("edit.json"), null) : taken;
  const report = runQa({ dir: d, mp4: path.join(d, `${path.basename(d)}.mp4`), raw: path.join(d, "record.mkv"), timeline, lesson: read("lesson.json"), vertical });
  process.exit(report.pass ? 0 : 1);
}
