#!/usr/bin/env node
// node preflight.js [<lesson-dir>] [make.js flags]
// Checks this Mac for what a take needs before the take starts. It sets up
// what it can by itself (Claude Code's folder trust for the lesson workspace,
// the music bed, Playwright's Chromium, the macOS permission prompts) and
// lists the rest with the step that fixes it, exiting 1. `--mux-only` checks
// only what a re-cut needs; `--no-audio` skips the voice and the music.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { DEFAULT_BED } = require("./mix");
const { APP_BIN, FRONTEND } = require("./app");
const { listScreenDevice } = require("./capture");
const { parseCli } = require("./cli");
const { lintDir } = require("./lint");
const { helper } = require("./helpers");

const WORKSPACE = process.env.LPM_LESSON_WORKSPACE || "/Users/Shared/lpm-lessons";
const KEYCHAIN = ["-s", "lpm-video", "-a", "openai"];
const MUSIC = path.dirname(DEFAULT_BED);

let cli;
try {
  cli = parseCli(process.argv.slice(2), { script: "preflight.js", positional: "optional" });
} catch (e) {
  console.error(`preflight: ${e.message}`);
  process.exit(2);
}
const flag = (name) => !!cli.o[name.replace(/^--/, "")];
const opt = (name) => cli.o[name.replace(/^--/, "")];
const dir = cli.lesson ? path.resolve(cli.lesson) : null;
const lessonFile = dir && path.join(dir, "lesson.json");
const lesson = lessonFile && fs.existsSync(lessonFile) ? JSON.parse(fs.readFileSync(lessonFile, "utf8")) : {};
const muxOnly = flag("--mux-only");
const audio = !flag("--no-audio");
const source = flag("--demo") ? "demo" : flag("--app") ? "app" : lesson.source || "app";
const onApp = !muxOnly && source === "app";

const done = [];
const missing = [];
const notes = [];

const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: "utf8", ...opts });
const onPath = (bin) => run("/usr/bin/which", [bin]).status === 0;
const host = process.env.__CFBundleIdentifier || process.env.TERM_PROGRAM || "the terminal app";

function tools() {
  if (Number(process.versions.node.split(".")[0]) < 18) missing.push(`Node 18 or newer (this is ${process.version})`);
  for (const bin of ["ffmpeg", "ffprobe"]) if (!onPath(bin)) missing.push(`${bin}: brew install ffmpeg`);
  if (onPath("ffmpeg") && !run("ffmpeg", ["-hide_banner", "-encoders"]).stdout.includes("libx264")) {
    missing.push("ffmpeg without libx264: brew reinstall ffmpeg");
  }
}

// Every render draws its canvas, cards and captions in headless Chromium.
function chromium() {
  let browser;
  try {
    browser = require("./browser");
  } catch (e) {
    missing.push(e.message);
    return;
  }
  if (browser.CHROME && fs.existsSync(browser.CHROME)) return;
  const cli = path.join(browser.CORE, "cli.js");
  console.log("preflight: downloading Playwright's Chromium");
  if (run(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" }).status === 0) {
    done.push(`installed Playwright's Chromium (${browser.chromium.executablePath()})`);
  } else {
    missing.push(`Playwright's Chromium: node "${cli}" install chromium`);
  }
}

async function music() {
  if (!audio || flag("--no-music") || lesson.music === false) return;
  const file = opt("--music") || lesson.music || process.env.LPM_LESSON_MUSIC || DEFAULT_BED;
  if (fs.existsSync(file)) return;
  if (file !== DEFAULT_BED) {
    missing.push(`the music bed ${file} (or --no-music)`);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(MUSIC, "tracks.json"), "utf8"));
  const track = manifest.tracks[path.basename(DEFAULT_BED)];
  try {
    const res = await fetch(track.url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(`${DEFAULT_BED}.part`, Buffer.from(await res.arrayBuffer()));
    fs.renameSync(`${DEFAULT_BED}.part`, DEFAULT_BED);
    done.push(`downloaded the music bed, "${track.title}" by ${track.artist} (Mixkit)`);
  } catch (e) {
    missing.push(`the music bed: download ${track.url} to ${DEFAULT_BED} (${e.message})`);
  }
}

function voice() {
  if (!audio || muxOnly || process.env.OPENAI_API_KEY) return;
  if (run("security", ["find-generic-password", ...KEYCHAIN]).status !== 0) {
    missing.push(`the OpenAI key for the voice: security add-generic-password ${KEYCHAIN.join(" ")} -U -w (it asks for the key)`);
  }
}

function agents() {
  if (!onPath("claude")) missing.push("Claude Code: install it, then run `claude` once and sign in");
  else if (!fs.existsSync(path.join(os.homedir(), ".claude.json"))) missing.push("Claude Code's sign-in: run `claude` once");
  const text = dir
    ? ["beats.js", "compare.json", "lesson.json"].map((f) => path.join(dir, f)).filter(fs.existsSync).map((f) => fs.readFileSync(f, "utf8")).join("\n")
    : "";
  if (/codex/i.test(text) && !onPath("codex")) missing.push("Codex: npm install -g @openai/codex, then run `codex` once and sign in");
  if (/"cli": "cursor"/.test(text) && !onPath("agent")) missing.push("Cursor CLI: curl https://cursor.com/install -fsS | bash, then run `agent login`");
}

// Claude asks once per folder before it runs there, and looks for that trust
// up through the parents but never past a git root: the workspace's entry
// covers every plain folder a lesson seeds; a git folder is trusted when the
// kit's shell wrapper launches an agent in it.
function trust() {
  const file = path.join(os.homedir(), ".claude.json");
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (data.projects?.[WORKSPACE]?.hasTrustDialogAccepted) return;
  data.projects = data.projects || {};
  data.projects[WORKSPACE] = { allowedTools: [], ...data.projects[WORKSPACE], hasTrustDialogAccepted: true };
  fs.writeFileSync(`${file}.lesson`, JSON.stringify(data, null, 2));
  fs.renameSync(`${file}.lesson`, file);
  done.push(`trusted ${WORKSPACE} in Claude Code`);
}

function app() {
  const pkg = JSON.parse(fs.readFileSync(path.join(FRONTEND, "package.json"), "utf8"));
  const absent = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
    (name) => !fs.existsSync(path.join(FRONTEND, "node_modules", name, "package.json")),
  );
  if (absent.length) missing.push(`the frontend's packages (${absent.slice(0, 3).join(", ")}${absent.length > 3 ? "…" : ""} missing): npm install in ${FRONTEND}`);
  if (!fs.existsSync(APP_BIN)) {
    missing.push(`the debug app ${APP_BIN}: run \`npm run tauri dev\` in ${FRONTEND} once, then quit it (or set LPM_APP)`);
  } else if (!process.env.LPM_APP) {
    const newer = newestRustSource(fs.statSync(APP_BIN).mtimeMs);
    if (newer) notes.push(`the debug app is older than ${newer}: the take records the build from before that edit unless \`tauri dev\` rebuilds it first (a compile error keeps the old one)`);
  }
  if (run("xcode-select", ["-p"]).status !== 0) missing.push("Xcode Command Line Tools (git, python3, swift): xcode-select --install");
  if (!onPath("cliclick")) missing.push("cliclick, for the real pointer and typing: brew install cliclick");
  if (!onPath("ffmpeg")) return;
  try {
    listScreenDevice();
  } catch (e) {
    missing.push(`screen capture: ${e.message}`);
  }
}

// The terminal (or whichever app runs this) needs Screen Recording for the
// capture and Accessibility for the pointer and keys; asking for them shows
// macOS's prompt and adds the app to the list in System Settings.
const PERMISSIONS = `import CoreGraphics
import ApplicationServices
let screen = CGPreflightScreenCaptureAccess()
let ax = AXIsProcessTrusted()
if !screen { _ = CGRequestScreenCaptureAccess() }
if !ax { _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) }
let session = CGSessionCopyCurrentDictionary() as? [String: Any]
let locked = (session?["CGSSessionScreenIsLocked"] as? Bool) ?? false
print(screen, ax, locked)`;

function permissions() {
  const settings = (pane) => `open "x-apple.systempreferences:com.apple.preference.security?${pane}"`;
  const r = onPath("swift") ? run("swift", ["-e", PERMISSIONS], { timeout: 60000 }) : null;
  const [screen, ax, locked] = (r?.stdout || "").trim().split(" ");
  if (locked === "true") missing.push("the screen is locked: a locked screen records as black; unlock it and keep it awake");
  if (screen === "false") missing.push(`Screen Recording for ${host}: turn it on in ${settings("Privacy_ScreenCapture")}, then restart ${host}`);
  if (ax === "false") missing.push(`Accessibility for ${host}: turn it on in ${settings("Privacy_Accessibility")}`);
  if (!screen) notes.push(`could not read Screen Recording for ${host}; if the capture comes out black, turn it on in ${settings("Privacy_ScreenCapture")}`);
  const events = run("osascript", ["-e", 'tell application "System Events" to get name'], { timeout: 60000 });
  if (events.status !== 0) {
    missing.push(`Automation for ${host} to control System Events (the keys): turn it on in ${settings("Privacy_Automation")}`);
  }
}

// A re-cut needs no beats; a take needs a script that lints clean.
function beats() {
  if (!dir) return;
  if (!fs.existsSync(lessonFile)) {
    missing.push(`${lessonFile}`);
    return;
  }
  if (muxOnly) return;
  const kind = path.basename(path.dirname(dir)) === "tiktok" || path.basename(process.env.LESSON_MAKER || "") === "short" ? "vertical" : "landscape";
  const { errors, warnings } = lintDir(dir, { kind });
  for (const e of errors) missing.push(`${path.basename(dir)}: ${e}`);
  for (const w of warnings) notes.push(`${path.basename(dir)}: ${w}`);
}

// Newest .rs or Cargo.toml under src-tauri newer than `than`, relative path.
function newestRustSource(than) {
  const root = path.join(FRONTEND, "src-tauri");
  let best = null;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "target" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.rs$|^Cargo\.toml$/.test(e.name)) {
        const m = fs.statSync(p).mtimeMs;
        if (m > than && (!best || m > best.m)) best = { p, m };
      }
    }
  };
  walk(root);
  return best && path.relative(path.dirname(FRONTEND), best.p);
}

// The screen reader for the checks after a take, the clipboard keeper, the
// capture of the lesson app alone, and the check under each real click.
function helpers() {
  if (run("xcode-select", ["-p"]).status !== 0) return;
  for (const name of ["ocr", "clipboard", "appcap", "winat"]) {
    try {
      helper(name);
    } catch (e) {
      missing.push(e.message);
    }
  }
}

// lpm Link beside the app (lesson.json "phone"): the simulator, Device Hub
// to show it, idb to tap it and xcodegen for the lesson build of the app.
function phone() {
  if (!lesson.phone) return;
  const { IDB_PYTHON, DEVICE_HUB } = require("./phone");
  if (!fs.existsSync(DEVICE_HUB)) missing.push(`Device Hub (Xcode 27's simulator app) at ${DEVICE_HUB}`);
  if (!onPath("xcodegen")) missing.push("xcodegen, for the lesson build of lpm Link: brew install xcodegen");
  if (!onPath("idb_companion")) missing.push("idb_companion, to tap the simulated iPhone: brew install facebook/fb/idb-companion");
  if (!fs.existsSync(IDB_PYTHON)) {
    const venv = path.dirname(path.dirname(IDB_PYTHON));
    missing.push(`the idb client: python3 -m venv ${venv} && ${venv}/bin/pip install fb-idb`);
  }
  for (const name of ["winplace", "axpress"]) {
    try {
      helper(name);
    } catch (e) {
      missing.push(e.message);
    }
  }
}

// lesson.json "power": true for a take that shows Keep this Mac awake: on
// battery the app answers "this Mac can sleep until it's plugged in".
function power() {
  if (!lesson.power || process.platform !== "darwin") return;
  const r = spawnSync("pmset", ["-g", "ps"], { encoding: "utf8" });
  if (!/AC Power/.test(r.stdout || "")) missing.push("the Mac on AC power: this lesson shows Keep this Mac awake, which reads \"On battery\" otherwise");
}

async function main() {
  tools();
  power();
  chromium();
  await music();
  voice();
  beats();
  helpers();
  if (onApp) {
    agents();
    trust();
    app();
    phone();
    if (!missing.some((m) => m.startsWith("Xcode"))) permissions();
  }
  for (const d of done) console.log(`preflight: ${d}`);
  for (const n of notes) console.log(`preflight: note: ${n}`);
  if (missing.length) {
    console.log("preflight: missing, fix these and run it again:");
    for (const m of missing) console.log(`  - ${m}`);
    process.exit(1);
  }
  console.log("preflight: ok");
}

main().catch((e) => {
  console.error(`preflight: ${e.stack || e}`);
  process.exit(1);
});
