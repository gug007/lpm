// Simulators for the capture: found (or created) by name, set to US English so
// the clock reads 9:41, a full non-charging battery, the screenshot build
// installed. Each shot is a fresh launch with LPM_SHOT_ROUTE, then simctl's
// native-resolution screenshot.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { CACHE, APP, BUNDLE_ID } = require("./paths");

const STATE = path.join(CACHE, "booted.json");

const simctl = (args, opts = {}) => execFileSync("xcrun", ["simctl", ...args], { encoding: "utf8", ...opts });
const sleep = (s) => execFileSync("sleep", [String(s)]);

function findDevice(name) {
  const { devices } = JSON.parse(simctl(["list", "devices", "available", "-j"]));
  const runtimes = Object.keys(devices).filter((r) => /iOS/.test(r)).sort().reverse();
  for (const r of runtimes) {
    const d = devices[r].find((x) => x.name === name);
    if (d) return d;
  }
  return null;
}

function createDevice(name) {
  const { devicetypes } = JSON.parse(simctl(["list", "devicetypes", "-j"]));
  const type = devicetypes.find((t) => t.name === name);
  if (!type) throw new Error(`no simulator device type named "${name}" (xcrun simctl list devicetypes)`);
  const { runtimes } = JSON.parse(simctl(["list", "runtimes", "-j"]));
  const runtime = runtimes.filter((r) => r.isAvailable && r.platform === "iOS").pop();
  if (!runtime) throw new Error("no iOS simulator runtime installed");
  simctl(["create", name, type.identifier, runtime.identifier]);
  return findDevice(name);
}

function readBooted() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return []; }
}

function boot(udid) {
  try { simctl(["boot", udid], { stdio: "pipe" }); } catch (e) {
    if (!/current state: Booted/.test(String(e.stderr))) throw e;
  }
  simctl(["bootstatus", udid, "-b"], { stdio: "pipe" });
}

function prepare(name, { log = console.log } = {}) {
  if (!fs.existsSync(APP)) throw new Error("no screenshot build yet: run `build` first");
  const device = findDevice(name) || createDevice(name);
  const udid = device.udid;
  if (device.state !== "Booted") {
    const booted = readBooted();
    if (!booted.includes(udid)) fs.writeFileSync(STATE, JSON.stringify([...booted, udid]));
  }
  boot(udid);
  let locale = "";
  try { locale = simctl(["spawn", udid, "defaults", "read", "-g", "AppleLocale"], { stdio: "pipe" }).trim(); } catch {}
  if (locale !== "en_US") {
    log(`${name}: switching to US English (reboots the simulator)`);
    simctl(["spawn", udid, "defaults", "write", "-g", "AppleLocale", "en_US"]);
    simctl(["spawn", udid, "defaults", "write", "-g", "AppleLanguages", "-array", "en-US"]);
    simctl(["spawn", udid, "defaults", "write", "-g", "AppleICUForce24HourTime", "-bool", "false"]);
    simctl(["shutdown", udid]);
    boot(udid);
  }
  simctl(["status_bar", udid, "override", "--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active",
    "--wifiBars", "3", "--cellularMode", "active", "--cellularBars", "4", "--operatorName", "",
    "--batteryState", "discharging", "--batteryLevel", "100"]);
  simctl(["ui", udid, "appearance", "light"]);
  try { simctl(["terminate", udid, BUNDLE_ID], { stdio: "pipe" }); } catch {}
  simctl(["install", udid, APP]);
  log(`${name} ready (${udid})`);
  return udid;
}

function capture(udid, route, out, wait) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  simctl(["launch", "--terminate-running-process", udid, BUNDLE_ID], {
    env: { ...process.env, SIMCTL_CHILD_LPM_SHOT_ROUTE: route }, stdio: "pipe",
  });
  sleep(wait);
  simctl(["io", udid, "screenshot", out], { stdio: "pipe" });
}

function cleanup(names, { log = console.log } = {}) {
  const booted = readBooted();
  for (const name of names) {
    const d = findDevice(name);
    if (!d || d.state !== "Booted") continue;
    try { simctl(["status_bar", d.udid, "clear"], { stdio: "pipe" }); } catch {}
    try { simctl(["terminate", d.udid, BUNDLE_ID], { stdio: "pipe" }); } catch {}
    if (booted.includes(d.udid)) {
      simctl(["shutdown", d.udid]);
      log(`shut down ${d.name}`);
    }
  }
  fs.rmSync(STATE, { force: true });
}

module.exports = { prepare, capture, cleanup, findDevice };
