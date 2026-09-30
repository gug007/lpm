// The app's data directory for a take: wiped to a fresh install before each
// one (only a directory this skill created is ever wiped), seeded by the
// lesson, and the session daemon a take leaves behind stopped.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_WORKSPACE = "/Users/Shared/lpm-lessons";
const DEFAULT_LPM_DIR = path.join(os.homedir(), ".lpm-lessons");
const MARKER = ".lesson-data-dir";

function killTree(pid) {
  const kids = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" }).stdout || "";
  for (const kid of kids.split(/\s+/).filter(Boolean)) killTree(Number(kid));
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // already gone
  }
}

// `LPM_DIR=<dir>` as a whole word in a process's environment listing.
const hasLpmDir = (env, dir) => new RegExp(`(^|\\s)LPM_DIR=${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(env);

// Services and agents a take started outlive the app: they belong to lpm's
// session daemon, a separate process. The daemon is matched on the LPM_DIR in
// its own environment, so the one behind the user's real projects is never
// touched.
function killStaleServices(lpmDir, log = () => {}) {
  const ps = spawnSync("ps", ["-Ao", "pid=,command="], { encoding: "utf8" }).stdout || "";
  for (const line of ps.split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m || !m[2].includes("--session-daemon")) continue;
    const env = spawnSync("ps", ["eww", "-o", "command=", "-p", m[1]], { encoding: "utf8" }).stdout || "";
    if (!hasLpmDir(env, lpmDir)) continue;
    log(`stopping the lesson app's services and agents (daemon ${m[1]})`);
    killTree(Number(m[1]));
  }
}

// Refuses anything that could be a real directory: the user's ~/.lpm, its
// parents, anything outside home, the shared folder and temp, and any
// existing, non-empty directory this skill did not create.
function checkDataDir(lpmDir) {
  const dir = path.resolve(lpmDir);
  const home = os.homedir();
  const real = path.join(home, ".lpm");
  const inside = (parent) => dir === parent || dir.startsWith(parent + path.sep);
  if (inside(real)) throw new Error(`refusing to record on the real ${real}; pass --lpm-dir`);
  if (real.startsWith(dir + path.sep)) throw new Error(`refusing to wipe ${dir}: it holds the real ${real}`);
  const allowed = [home, "/Users/Shared", os.tmpdir(), "/private/tmp", "/tmp"].map((p) => path.resolve(p));
  if (!allowed.some((p) => dir.startsWith(p + path.sep))) throw new Error(`refusing to use ${dir} as the app's data directory; pick one under your home folder`);
  if (!fs.existsSync(dir) || dir === DEFAULT_LPM_DIR || fs.existsSync(path.join(dir, MARKER))) return dir;
  if (fs.readdirSync(dir).length) throw new Error(`${dir} is not a lesson data directory (no ${MARKER}); pick an empty or new one`);
  return dir;
}

// A pristine data directory for every take, so the app opens the way it does
// right after install; the lesson may seed settings and a workspace of demo
// project folders through `setup` in its beats.
function prepareState({ lpmDir, lesson, keepState, log = () => {} }) {
  const dir = checkDataDir(lpmDir);
  if (!keepState) {
    killStaleServices(dir, log);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MARKER), "wiped and re-seeded before every lesson take\n");
  const settingsFile = path.join(dir, "settings.json");
  const settings = (patch) => {
    const cur = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, "utf8")) : {};
    fs.writeFileSync(settingsFile, JSON.stringify({ ...cur, ...patch }, null, 2));
  };
  if (!keepState) {
    settings(lesson.settings || {});
    // The sidebar meters: Codex reads its own session files, Claude only the
    // app's last reading — copied in (the real directory is only read) so the
    // meters look like a configured app. `"limits": false` leaves them out.
    const reading = path.join(os.homedir(), ".lpm", "agent-limits.json");
    if (lesson.limits !== false && fs.existsSync(reading)) {
      fs.copyFileSync(reading, path.join(dir, "agent-limits.json"));
      settings({ claudeLimitsEnabled: true });
    }
  }
  const workspace = process.env.LPM_LESSON_WORKSPACE || DEFAULT_WORKSPACE;
  if (!keepState && (workspace === DEFAULT_WORKSPACE || workspace.startsWith(dir + path.sep))) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
  fs.mkdirSync(workspace, { recursive: true });
  return { lpmDir: dir, workspace, settings };
}

module.exports = { prepareState, killStaleServices, checkDataDir, hasLpmDir, DEFAULT_WORKSPACE, DEFAULT_LPM_DIR };
