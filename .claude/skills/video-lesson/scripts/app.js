// Launches the lpm desktop app (a debug build) on its own data directory and
// talks to its lesson control socket: run JavaScript in the main webview, place
// the window, read its screen rectangle.
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { sleep } = require("./words");

const REPO = path.resolve(__dirname, "../../../..");
const APP_BIN =
  process.env.LPM_APP || path.join(REPO, "desktop/frontend/src-tauri/target/debug/lpm-desktop");
const DEV_URL = "http://127.0.0.1:9245/";
const FRONTEND = path.join(REPO, "desktop/frontend");

async function devServerUp() {
  try {
    const r = await fetch(DEV_URL, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

// The debug binary loads its UI from Vite; start it when nothing answers.
async function ensureDevServer(log) {
  if (await devServerUp()) return null;
  log("starting the frontend dev server");
  const vite = spawn("npm", ["run", "dev"], { cwd: FRONTEND, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (await devServerUp()) return vite;
  }
  throw new Error(`the frontend dev server never answered at ${DEV_URL}`);
}

class Control {
  constructor(sock) {
    this.sock = sock;
    this.next = 1;
    this.pending = new Map();
    this.buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (d) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        const p = this.pending.get(msg.id);
        if (!p) continue;
        this.pending.delete(msg.id);
        msg.ok ? p.resolve(msg.value) : p.reject(new Error(String(msg.value)));
      }
    });
    sock.on("close", () => {
      for (const p of this.pending.values()) p.reject(new Error("lesson control socket closed"));
      this.pending.clear();
    });
  }

  call(op, params = {}, timeout = 15000) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`lesson control: ${op} timed out`));
      }, timeout);
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(t), resolve(v)),
        reject: (e) => (clearTimeout(t), reject(e)),
      });
      this.sock.write(JSON.stringify({ id, op, ...params }) + "\n");
    });
  }

  // `fn` runs in the page with `args` (JSON) and its return value comes back.
  async evaluate(fn, ...args) {
    const js = typeof fn === "function" ? `return (${fn.toString()})(...${JSON.stringify(args)});` : fn;
    const v = await this.call("eval", { js });
    return v == null ? null : JSON.parse(v);
  }
}

function connect(sockPath) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection(sockPath);
    s.once("connect", () => resolve(new Control(s)));
    s.once("error", reject);
  });
}

// A take started from inside a Claude Code session would otherwise hand the
// agent it records that session's markers, and Claude then runs as a child
// session with transcript saving off.
// A take started from a terminal inside lpm also carries that pane's LPM_*
// identity; a terminal the lesson app opens without its own (the Claude sign-in
// one) would report usage and status to the user's real lpm through it.
function hostEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID|CLAUDE_EFFORT|LPM_)/.test(k)),
  );
}

// An app left behind by an interrupted take (or a manual launch on the lesson
// directory) would contend with the new one for the data dir and its sockets.
async function quitStale(sockPath, log) {
  if (!fs.existsSync(sockPath)) return;
  try {
    const old = await connect(sockPath);
    await old.call("ping", {}, 1500);
    log("a previous lesson app is still running; asking it to quit");
    await old.call("quit", {}, 3000).catch(() => {});
    old.sock.destroy();
    await sleep(800);
  } catch {
    // nothing listening
  }
}

// `env` is applied after the scrub, so a lesson can still hand the app a
// Claude variable of its own (lesson.json "env").
async function launchApp({ lpmDir, env = {}, log = () => {} }) {
  if (!fs.existsSync(APP_BIN)) {
    throw new Error(`no debug app at ${APP_BIN}; build it with \`npm run tauri dev\` in desktop/frontend (or set LPM_APP)`);
  }
  const vite = await ensureDevServer(log);
  const sockPath = path.join(lpmDir, "lesson.sock");
  await quitStale(sockPath, log);
  fs.rmSync(sockPath, { force: true });
  const logFile = fs.openSync(path.join(lpmDir, "app.log"), "a");
  const proc = spawn(APP_BIN, [], {
    env: { ...hostEnv(), ...env, LPM_DIR: lpmDir, LPM_LESSON_SOCKET: sockPath, HOME: os.homedir() },
    stdio: ["ignore", logFile, logFile],
  });
  let control = null;
  for (let i = 0; i < 100 && !control; i++) {
    await sleep(200);
    if (proc.exitCode != null) throw new Error(`the app exited early (code ${proc.exitCode}); see ${lpmDir}/app.log`);
    if (!fs.existsSync(sockPath)) continue;
    try {
      control = await connect(sockPath);
      await control.call("ping", {}, 3000);
    } catch {
      control = null;
    }
  }
  if (!control) throw new Error("the app never opened its lesson control socket (is this a debug build?)");
  // The webview answers `eval` only once the page has loaded, and the UI is
  // usable once the sidebar has rendered its Add project button.
  for (let i = 0; i < 150; i++) {
    try {
      if ((await control.evaluate(() => !!document.querySelector('button[title="Add project"]'))) === true) break;
    } catch {
      // not loaded yet
    }
    await sleep(200);
  }
  return {
    control,
    proc,
    async close() {
      try {
        await control.call("quit", {}, 3000);
      } catch {
        // already gone
      }
      await sleep(300);
      if (proc.exitCode == null) proc.kill("SIGKILL");
      if (vite) {
        try {
          process.kill(-vite.pid, "SIGTERM");
        } catch {
          // already gone
        }
      }
    },
  };
}

module.exports = { launchApp, quitStale, APP_BIN };
