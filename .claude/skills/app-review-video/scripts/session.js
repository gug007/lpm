// The review Mac: an isolated debug build of the lpm desktop app on its own
// data directory, seeded with demo projects, placed to the left of the iPhone
// Mirroring window. Computer use can see and click it because the build has
// its own name and bundle identifier ("lpm Review", cx.lpm.appreview).
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { execFileSync, spawn, spawnSync } = require("child_process");
const { hostEnv } = require("../../lesson/scripts/app");
const { killStaleServices } = require("../../lesson/scripts/state");

const REPO = path.resolve(__dirname, "../../../..");
const TAURI = path.join(REPO, "desktop/frontend/src-tauri");
const FRONTEND = path.join(REPO, "desktop/frontend");
const HOME = os.homedir();
const LPM_DIR = process.env.LPM_REVIEW_DIR || path.join(HOME, ".lpm-review");
const WORKSPACE = "/Users/Shared/lpm-review";
const CACHE = path.join(HOME, "Library", "Caches", "lpm-app-review");
const TARGET = process.env.LPM_REVIEW_TARGET || path.join(HOME, ".lpm-repro", "target");
const BUNDLE = path.join(CACHE, "lpm Review.app");
const BUNDLE_ID = "cx.lpm.appreview";
const APP_BIN = path.join(BUNDLE, "Contents", "MacOS", "lpm-desktop");
const MOVIES = path.join(HOME, "Movies", "lpm-app-review");
const DEV_URL = "http://127.0.0.1:9245/";
const SOCK = path.join(LPM_DIR, "lesson.sock");
const STATE = path.join(LPM_DIR, "session.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function helper(name) {
  const src = path.join(__dirname, `${name}.swift`);
  const bin = path.join(CACHE, `review-${name}`);
  if (fs.existsSync(bin) && fs.statSync(bin).mtimeMs >= fs.statSync(src).mtimeMs) return bin;
  fs.mkdirSync(CACHE, { recursive: true });
  const r = spawnSync("swiftc", ["-O", src, "-o", bin], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`could not build ${name}: ${(r.stderr || "").slice(-400)}`);
  return bin;
}

const readState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {});
const writeState = (patch) => fs.writeFileSync(STATE, JSON.stringify({ ...readState(), ...patch }, null, 2));

// The debug build, compiled with its own identity into a target directory of
// its own so the user's `tauri dev` binary is never flipped, then wrapped in an
// app bundle (the identity macOS and computer use go by).
function buildApp(log) {
  if (!fs.existsSync(path.join(TAURI, "binaries", "lpm-tailnet-aarch64-apple-darwin"))) {
    log("building the tailnet sidecar");
    execFileSync("node", [path.join(REPO, "scripts/build-tailnet.mjs")], { stdio: "inherit" });
  }
  log(`building the review app (target ${TARGET})`);
  execFileSync("cargo", ["build"], {
    cwd: TAURI,
    stdio: "inherit",
    env: {
      ...process.env,
      CARGO_TARGET_DIR: TARGET,
      TAURI_CONFIG: JSON.stringify({ productName: "lpm Review", identifier: BUNDLE_ID, mainBinaryName: "lpm-desktop" }),
    },
  });
  const macos = path.join(BUNDLE, "Contents", "MacOS");
  fs.mkdirSync(macos, { recursive: true });
  for (const bin of ["lpm-desktop", "lpm-cli", "lpm-tailnet"]) {
    const from = path.join(TARGET, "debug", bin);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(macos, bin));
  }
  fs.writeFileSync(
    path.join(BUNDLE, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleName</key><string>lpm Review</string>
  <key>CFBundleDisplayName</key><string>lpm Review</string>
  <key>CFBundleExecutable</key><string>lpm-desktop</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.0.1</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
</dict>
</plist>
`,
  );
}

function git(root, ...args) {
  execFileSync("git", ["-c", "user.name=lpm", "-c", "user.email=dev@example.com", ...args], { cwd: root, stdio: "ignore" });
}

// Quiet once listening, like a real dev server: periodic output would read as
// activity and keep idle stretches in the cut.
const server = (label, port) =>
  `const http = require("node:http");\nconst port = Number(process.env.PORT) || ${port};\n` +
  `http.createServer((_, res) => res.end("${label}")).listen(port, () => console.log("${label} listening on http://localhost:" + port));\n`;

// Demo projects with real, dependency-free dev servers, so starting one from
// the phone visibly runs it on the Mac.
const PROJECTS = [
  {
    name: "storefront",
    scripts: { api: "PORT=4000 node src/api.js", dev: "PORT=5173 node src/web.js" },
    files: { "src/api.js": server("storefront api", 4000), "src/web.js": server("storefront web", 5173) },
    services: [
      { name: "api", cmd: "npm run api", port: 4000 },
      { name: "web", cmd: "npm run dev", port: 5173 },
    ],
  },
  {
    name: "payments-api",
    scripts: { dev: "PORT=8000 node src/server.js" },
    files: { "src/server.js": server("payments api", 8000) },
    services: [{ name: "api", cmd: "npm run dev", port: 8000 }],
  },
  {
    name: "docs-site",
    scripts: { dev: "PORT=4321 node src/server.js" },
    files: { "src/server.js": server("docs site", 4321) },
    services: [{ name: "docs", cmd: "npm run dev", port: 4321 }],
  },
];

function seed() {
  if (path.resolve(LPM_DIR) === path.join(HOME, ".lpm")) throw new Error("refusing to use ~/.lpm as the review data directory");
  killStaleServices(LPM_DIR, () => {});
  fs.rmSync(LPM_DIR, { recursive: true, force: true });
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
  fs.mkdirSync(path.join(LPM_DIR, "projects"), { recursive: true });
  for (const p of PROJECTS) {
    const root = path.join(WORKSPACE, p.name);
    for (const [file, text] of Object.entries(p.files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), text);
    }
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: p.name, version: "1.0.0", private: true, scripts: p.scripts }, null, 2) + "\n");
    fs.writeFileSync(path.join(root, "README.md"), `# ${p.name}\n`);
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "Initial commit");
    const yml = p.services.map((s) => `  ${s.name}:\n    cmd: ${s.cmd}\n    port: ${s.port}`).join("\n");
    fs.writeFileSync(path.join(LPM_DIR, "projects", `${p.name}.yml`), `name: ${p.name}\nroot: ${root}\n\nservices:\n${yml}\n`);
  }
  fs.writeFileSync(path.join(LPM_DIR, "settings.json"), JSON.stringify({ projectOrder: PROJECTS.map((p) => p.name), defaultProjectDirectory: WORKSPACE }, null, 2));
  // Debug builds listen on the configured port + 2: 8792, clear of the user's own instances.
  fs.writeFileSync(path.join(LPM_DIR, "remote.json"), JSON.stringify({ enabled: true, port: 8790 }, null, 2));
  // The user's shell setup without its prompt, which carries the account and machine name.
  const zsh = path.join(LPM_DIR, "zsh");
  fs.mkdirSync(zsh, { recursive: true });
  for (const file of [".zshenv", ".zprofile", ".zlogin"]) fs.writeFileSync(path.join(zsh, file), `[[ -f "$HOME/${file}" ]] && source "$HOME/${file}"\n`);
  fs.writeFileSync(path.join(zsh, ".zshrc"), `[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc"\nPROMPT='%1~ %# '\nRPROMPT=''\n`);
}

async function devServerUp() {
  try {
    return (await fetch(DEV_URL, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

// The debug binary loads its UI from Vite. One started here has HMR and file
// watching off, so another agent's edit can't reload the app mid-recording.
async function ensureDevServer(log) {
  if (await devServerUp()) return log("using the frontend dev server already on :9245");
  log("starting the frontend dev server");
  const config = path.join(REPO, ".claude/skills/lesson/scripts/vite.lesson.config.mjs");
  const vite = spawn("npx", ["vite", "--config", config], { cwd: FRONTEND, stdio: "ignore", detached: true });
  vite.unref();
  fs.writeFileSync(path.join(LPM_DIR, "vite.pid"), String(vite.pid));
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (await devServerUp()) return;
  }
  throw new Error(`the frontend dev server never answered at ${DEV_URL}`);
}

// One request on the app's lesson control socket.
function call(op, params = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(SOCK);
    let buf = "";
    const t = setTimeout(() => (sock.destroy(), reject(new Error(`control ${op} timed out`))), timeout);
    sock.setEncoding("utf8");
    sock.on("connect", () => sock.write(JSON.stringify({ id: 1, op, ...params }) + "\n"));
    sock.on("data", (d) => {
      buf += d;
      const i = buf.indexOf("\n");
      if (i < 0) return;
      clearTimeout(t);
      sock.destroy();
      const msg = JSON.parse(buf.slice(0, i));
      msg.ok ? resolve(msg.value) : reject(new Error(String(msg.value)));
    });
    sock.on("error", (e) => (clearTimeout(t), reject(e)));
  });
}

async function evaluate(js, timeout) {
  const v = await call("eval", { js }, timeout);
  return v == null ? null : JSON.parse(v);
}

function windows() {
  const lines = execFileSync(helper("winrects"), { encoding: "utf8" }).trim().split("\n").map((l) => JSON.parse(l));
  return { screen: lines[0].screen, list: lines.slice(1) };
}

function phoneWindow() {
  const w = windows().list.filter((w) => w.owner === "iPhone Mirroring" && w.layer === 0).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (!w) throw new Error("no iPhone Mirroring window on screen: open iPhone Mirroring and connect the iPhone first");
  return w;
}

function appWindow(pid) {
  return windows().list.filter((w) => w.pid === pid && w.layer === 0).sort((a, b) => b.w * b.h - a.w * a.h)[0];
}

// The Mac window goes to the left of the phone, as tall as the phone, so the
// two read as one side-by-side picture.
async function arrange({ width = 1100, gap = 24 } = {}) {
  const phone = phoneWindow();
  const w = Math.min(width, phone.x - gap - 8);
  const x = phone.x - gap - w;
  await call("window", { x, y: phone.y, w, h: phone.h, focus: true });
  await sleep(400);
  const { pid } = readState();
  const app = appWindow(pid);
  if (!app) throw new Error("the review app has no window on screen");
  writeState({ phone, app });
  return { phone, app };
}

async function launch({ name = "MacBook Pro", build = false, log = console.log } = {}) {
  if (build || !fs.existsSync(APP_BIN)) buildApp(log);
  await teardown({ log: () => {}, keepData: true });
  seed();
  await ensureDevServer(log);
  const logFile = fs.openSync(path.join(LPM_DIR, "app.log"), "a");
  const proc = spawn(APP_BIN, [], {
    env: {
      ...hostEnv(),
      LPM_DIR,
      LPM_LESSON_SOCKET: SOCK,
      LPM_LESSON_MACHINE_NAME: name,
      ZDOTDIR: path.join(LPM_DIR, "zsh"),
      HOME,
    },
    stdio: ["ignore", logFile, logFile],
    detached: true,
  });
  proc.unref();
  const d = new Date();
  const two = (n) => String(n).padStart(2, "0");
  const out = path.join(MOVIES, `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`);
  fs.mkdirSync(out, { recursive: true });
  writeState({ pid: proc.pid, out, name, startedAt: Date.now() });
  for (let i = 0; i < 300; i++) {
    await sleep(300);
    if (proc.exitCode != null) throw new Error(`the review app exited early; see ${LPM_DIR}/app.log`);
    try {
      if ((await evaluate(`return !!document.querySelector('button[title="Add project"]')`, 3000)) === true) break;
    } catch {
      // not up yet
    }
    if (i === 299) throw new Error("the review app never finished loading its UI");
  }
  const placed = await arrange();
  log(`review app up (pid ${proc.pid}), Mac name "${name}", output ${out}`);
  return placed;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Quit gracefully (the phone hears "lpm was closed"), stop its session daemon
// and the dev server started for it; `keepData` leaves the folders in place.
async function teardown({ log = console.log, keepData = false } = {}) {
  const { pid, recorder } = readState();
  if (recorder && alive(recorder)) process.kill(recorder, "SIGINT");
  try {
    await call("quit", {}, 3000);
  } catch {
    // not running
  }
  for (let i = 0; i < 25 && pid && alive(pid); i++) await sleep(200);
  if (pid && alive(pid)) process.kill(pid, "SIGKILL");
  killStaleServices(LPM_DIR, log);
  const vitePid = path.join(LPM_DIR, "vite.pid");
  if (fs.existsSync(vitePid)) {
    try {
      process.kill(-Number(fs.readFileSync(vitePid, "utf8")), "SIGTERM");
    } catch {
      // already gone
    }
    fs.rmSync(vitePid, { force: true });
  }
  if (!keepData) {
    fs.rmSync(LPM_DIR, { recursive: true, force: true });
    fs.rmSync(WORKSPACE, { recursive: true, force: true });
    log("review app closed, data and demo projects removed");
  }
}

module.exports = { launch, arrange, teardown, evaluate, call, helper, readState, writeState, windows, phoneWindow, alive, LPM_DIR, MOVIES, BUNDLE_ID, REPO };
