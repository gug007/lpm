// Whether the last dry run can stand in for a take: what a recording depends
// on, as a few hashes. A dry run on the real clips is the recording a take
// would make, so a clean one is used as it is (make.js).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const shared = require("./shared");
const { REPO, APP_BIN } = shared("app");

// lesson.json keys only the render reads: changing one leaves a recording as
// good as a new one.
const RENDER_ONLY = ["title", "post", "music", "cta", "headline", "headlineMs", "slam", "zooms", "keys", "hide", "open", "speedUpWaits", "stickerTop", "slamTop", "windowShiftY"];

const sha = (...parts) => {
  const h = crypto.createHash("sha1");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex").slice(0, 16);
};
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f) : "missing");

// beats.js and every local file it requires.
function scriptFiles(dir) {
  const found = new Set();
  const visit = (file) => {
    if (found.has(file) || !fs.existsSync(file)) return;
    found.add(file);
    if (!file.endsWith(".js")) return;
    const src = fs.readFileSync(file, "utf8");
    for (const [, , ref] of src.matchAll(/\brequire\((["'`])([./][^"'`]*)\1\)/g)) {
      const base = path.resolve(path.dirname(file), ref);
      const hit = [base, `${base}.js`, `${base}.json`, path.join(base, "index.js")].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      if (hit && !hit.includes(`${path.sep}node_modules${path.sep}`)) visit(hit);
    }
  };
  visit(path.join(dir, "beats.js"));
  return [...found].sort();
}

// The other files of the lesson folder beats.js names: a seed it reads at run
// time, or something a beat writes.
function namedFiles(dir) {
  const src = String(read(path.join(dir, "beats.js")));
  const scripts = new Set(scriptFiles(dir));
  return fs
    .readdirSync(dir)
    .filter((name) => name !== "lesson.json" && src.includes(name))
    .map((name) => path.join(dir, name))
    .filter((file) => fs.statSync(file).isFile() && !scripts.has(file))
    .sort();
}

const shaOf = (files) => sha(...files.flatMap((f) => [f, read(f)]));

// Taken again once the beats have run: a file they write is then as the
// recording left it, or no dry run of such a lesson could ever be the take.
const namedKey = (dir) => ({ "the files beats.js names": shaOf(namedFiles(dir)) });

// The app a take shows: the frontend's tree, the edits on top of it and the
// debug binary. Another agent's edit between the dry run and the take counts.
function appState() {
  const git = (...a) => {
    try {
      return execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return "";
    }
  };
  const untracked = git("ls-files", "--others", "--exclude-standard", "--", "desktop/frontend")
    .split("\n")
    .filter(Boolean)
    .map((f) => `${f} ${fs.existsSync(path.join(REPO, f)) ? fs.statSync(path.join(REPO, f)).mtimeMs : 0}`);
  const built = fs.existsSync(APP_BIN) ? fs.statSync(APP_BIN).mtimeMs : 0;
  return sha(git("rev-parse", "HEAD:desktop/frontend"), git("diff", "HEAD", "--", "desktop/frontend"), untracked.join("\n"), String(built));
}

// `lines` are the narration as voice.js prepared it; `mode` the flags a
// recording depends on. `app` can be given (tests).
function recordingKey(dir, lesson, lines, mode = {}, app = appState()) {
  const settings = Object.fromEntries(Object.entries(lesson).filter(([k]) => !RENDER_ONLY.includes(k) && k !== "narration"));
  return {
    "lesson.json": sha(JSON.stringify(settings), JSON.stringify(lines.map((l) => [l.id, l.text || null, l.silent ? l.ms : null]))),
    "beats.js": shaOf(scriptFiles(dir)),
    ...namedKey(dir),
    "the voice clips": sha(...lines.flatMap((l) => [l.id, String(l.ms), JSON.stringify(l.words || null), l.wav ? read(l.wav) : ""])),
    "the app": app,
    "the flags": sha(JSON.stringify(mode)),
  };
}

// What changed between two keys, by name.
const changes = (a, b) => Object.keys(b).filter((k) => a?.[k] !== b[k]);

module.exports = { recordingKey, namedKey, changes, scriptFiles };
