// lpm Link in the iOS Simulator, beside the lesson app: the simulated iPhone is
// started in Device Hub (Xcode 27's simulator app, which owns the device: quit
// it and the device shuts down) with a 9:41 status bar, the lesson build of
// lpm Link (linkbuild.js) installed fresh for every take and launched with the
// lesson's environment, and Device Hub's compact iPhone window placed where
// the capture expects it. The phone's screen is read through idb
// (simdrive.py); a tap presses the element at that point through Device Hub's
// accessibility bridge (axpress.swift), since idb's touches never reach a
// device Device Hub hosts. Nothing is ever clicked or typed on the Mac itself.
const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { CACHE, helper } = require("./helpers");
const { sleep } = require("./words");
const { ensureLinkBuild, BUNDLE_ID } = require("./linkbuild");

const XCODE = "/Applications/Xcode.app/Contents";
const DEVICE_HUB = path.join(XCODE, "Applications/DeviceHub.app");
// idb_companion looks for SimulatorKit where Xcode kept it before 27; a
// developer directory of links that adds it there serves it from its new home.
const SHIM = path.join(CACHE, "xcode-shim/Contents");
const IDB_PYTHON = path.join(CACHE, "idb-venv/bin/python");
const COMPANION_PORT = 10882;

const simctl = (args, opts = {}) => execFileSync("xcrun", ["simctl", ...args], { encoding: "utf8", stdio: "pipe", ...opts });

function findDevice(name) {
  const { devices } = JSON.parse(simctl(["list", "devices", "available", "-j"]));
  for (const runtime of Object.keys(devices).filter((r) => /iOS/.test(r)).sort().reverse()) {
    const d = devices[runtime].find((x) => x.name === name);
    if (d) return d;
  }
  throw new Error(`no simulator named "${name}" (xcrun simctl list devices)`);
}

function ensureShim() {
  const kit = path.join(SHIM, "Developer/Library/PrivateFrameworks/SimulatorKit.framework");
  if (fs.existsSync(kit)) return path.join(SHIM, "Developer");
  fs.rmSync(path.dirname(SHIM), { recursive: true, force: true });
  const link = (from, to) => fs.symlinkSync(from, to);
  const mirror = (from, to, skip) => {
    fs.mkdirSync(to, { recursive: true });
    for (const n of fs.existsSync(from) ? fs.readdirSync(from) : []) if (n !== skip) link(path.join(from, n), path.join(to, n));
  };
  mirror(XCODE, SHIM, "Developer");
  mirror(path.join(XCODE, "Developer"), path.join(SHIM, "Developer"), "Library");
  mirror(path.join(XCODE, "Developer/Library"), path.join(SHIM, "Developer/Library"), "PrivateFrameworks");
  mirror(path.join(XCODE, "Developer/Library/PrivateFrameworks"), path.join(SHIM, "Developer/Library/PrivateFrameworks"));
  link(path.join(XCODE, "SharedFrameworks/SimulatorKit.framework"), kit);
  return path.join(SHIM, "Developer");
}

const portOpen = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1", () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });

// One JSON line in, one out (simdrive.py).
class SimDriver {
  constructor() {
    this.proc = spawn(IDB_PYTHON, [path.join(__dirname, "simdrive.py"), `localhost:${COMPANION_PORT}`], { stdio: ["pipe", "pipe", "pipe"] });
    this.waiting = [];
    this.err = "";
    let buf = "";
    this.proc.stdout.on("data", (d) => {
      buf += d;
      for (let i; (i = buf.indexOf("\n")) >= 0; ) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        this.waiting.shift()?.resolve(JSON.parse(line));
      }
    });
    this.proc.stderr.on("data", (d) => (this.err = (this.err + d).slice(-2000)));
    this.proc.on("close", () => {
      for (const w of this.waiting.splice(0)) w.reject(new Error(`the simulator driver stopped: ${this.err.slice(-400)}`));
    });
    this.ready = this.next();
  }

  next() {
    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
  }

  async call(req) {
    await this.ready;
    const answer = this.next();
    this.proc.stdin.write(JSON.stringify(req) + "\n");
    const r = await answer;
    if (!r.ok) throw new Error(`simulator ${req.op}: ${r.error}`);
    return r;
  }

  close() {
    this.proc.stdin.end();
    setTimeout(() => this.proc.exitCode == null && this.proc.kill(), 1000);
  }
}

function deviceHubPid() {
  try {
    const out = execFileSync("pgrep", ["-f", `${DEVICE_HUB}/Contents/MacOS/DeviceHub`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return Number(out.split("\n")[0]) || null;
  } catch {
    return null;
  }
}

// Device Hub's compact window at this size shows the iPhone's screen about
// 330 points wide, sharp enough for the drawn phone in the video.
const HUB_SIZE = { w: 395, h: 860 };

// The frame of Device Hub's window (global points), moved to `to` first (and
// sized, when `to` has w and h).
function hubWindow(pid, to) {
  const args = [String(pid), ...(to ? [to.x, to.y, ...(to.w ? [to.w, to.h] : [])].map((v) => String(Math.round(v))) : [])];
  const [x, y, w, h] = execFileSync(helper("winplace"), args, { encoding: "utf8" }).trim().split(" ").map(Number);
  return { x, y, w, h };
}

const axpress = (pid, ...args) => execFileSync(helper("axpress"), [String(pid), ...args.map(String)], { stdio: "pipe" });

// Starts `device` in Device Hub, installs lpm Link fresh and launches it with
// `env` (each key reaches the app's environment); the window shows the device
// alone (its compact window) and is moved to `at`.
async function preparePhone({ device = "iPhone 17", env = {}, at, log = () => {} }) {
  const app = ensureLinkBuild({ log });
  const d = findDevice(device);
  let pid = deviceHubPid();
  if (!pid) {
    execFileSync("open", ["-g", DEVICE_HUB]);
    for (let i = 0; i < 40 && !(pid = deviceHubPid()); i++) await sleep(250);
    await sleep(2000);
  }
  if (!pid) throw new Error("Device Hub did not start");
  // Device Hub offers Start for a device it doesn't host yet, booted or not.
  try {
    axpress(pid, "Start");
    log(`starting the ${device} simulator in Device Hub`);
  } catch {
    // already running there
  }
  for (let i = 0; i < 120 && findDevice(device).state !== "Booted"; i++) await sleep(500);
  if (findDevice(device).state !== "Booted") throw new Error(`the ${device} simulator did not start: select it in Device Hub and click Start`);
  simctl(["bootstatus", d.udid, "-b"]);
  simctl(["status_bar", d.udid, "override", "--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active", "--wifiBars", "3",
    "--cellularMode", "active", "--cellularBars", "4", "--operatorName", "", "--batteryState", "discharging", "--batteryLevel", "100"]);
  simctl(["ui", d.udid, "appearance", "light"]);
  let win = hubWindow(pid, at);
  // Device Hub opens on its full window (the device list beside the screen);
  // its compact window is the device alone.
  if (win.h < win.w * 1.6) {
    try {
      axpress(pid, "Switch to compact window");
    } catch {
      // checked below
    }
    for (let i = 0; i < 20 && (win = hubWindow(pid, at)).h < win.w * 1.6; i++) await sleep(250);
  }
  if (win.h >= win.w * 1.6 && (win.w !== HUB_SIZE.w || win.h !== HUB_SIZE.h)) win = hubWindow(pid, { x: win.x, y: win.y, ...HUB_SIZE });
  if (win.h < win.w * 1.6) {
    throw new Error(`Device Hub's window is ${win.w}x${win.h}: select the ${device} and use the ⤡ button in Device Hub's toolbar (Switch to compact window), then try again`);
  }

  const developerDir = ensureShim();
  if (!(await portOpen(COMPANION_PORT))) {
    const companion = spawn("idb_companion", ["--udid", d.udid, "--grpc-port", String(COMPANION_PORT)], {
      env: { ...process.env, DEVELOPER_DIR: developerDir },
      stdio: ["ignore", fs.openSync(path.join(CACHE, "idb-companion.log"), "w"), "ignore"],
      detached: true,
    });
    companion.unref();
    for (let i = 0; i < 40 && !(await portOpen(COMPANION_PORT)); i++) await sleep(250);
  }
  const driver = new SimDriver();
  await driver.ready;

  try {
    simctl(["terminate", d.udid, BUNDLE_ID]);
  } catch {
    // not running
  }
  try {
    simctl(["uninstall", d.udid, BUNDLE_ID]);
  } catch {
    // not installed
  }
  simctl(["install", d.udid, app]);
  // From the home screen, so iOS shows no "◀ <app>" breadcrumb in the status bar.
  try {
    axpress(pid, "Home");
  } catch {
    // no Home button in this Device Hub
  }
  await sleep(800);
  const childEnv = Object.fromEntries(Object.entries(env).map(([k, v]) => [`SIMCTL_CHILD_${k}`, String(v)]));
  simctl(["launch", "--terminate-running-process", d.udid, BUNDLE_ID], { env: { ...process.env, ...childEnv } });
  log(`lpm Link launched on the ${device} simulator (Device Hub window ${win.w}x${win.h} at ${win.x},${win.y})`);

  // The phone's screen on the Mac's display (global points), once the capture
  // has found it; a tap at device point (x, y) presses what is there.
  let screen = null;
  return {
    udid: d.udid,
    pid,
    driver,
    window: (to) => hubWindow(pid, to),
    setScreen: (rect) => (screen = rect),
    press: (x, y, deviceSize, label) => {
      if (!screen) throw new Error("the phone's screen has not been found yet");
      const at = [(screen.x + (x * screen.w) / deviceSize.w).toFixed(1), (screen.y + (y * screen.h) / deviceSize.h).toFixed(1)];
      axpress(pid, "--at", ...at, ...(label ? [label] : []));
    },
    close: async () => {
      driver.close();
      try {
        simctl(["terminate", d.udid, BUNDLE_ID]);
      } catch {
        // already gone
      }
      try {
        simctl(["status_bar", d.udid, "clear"]);
      } catch {
        // simulator gone
      }
    },
  };
}

module.exports = { preparePhone, findDevice, SimDriver, hubWindow, deviceHubPid, IDB_PYTHON, DEVICE_HUB };
