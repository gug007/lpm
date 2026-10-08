// The lesson build of lpm Link for the iOS Simulator: a scratch copy of
// mobile/ (the repo itself is never touched) where the "On this Wi-Fi" list
// shows only the Mac named in LPM_LESSON_ONLY_MAC, so the other lpm Macs on
// the network (the user's own, named after them) never reach the recording;
// and where a Mac found on Bonjour whose .local address doesn't resolve
// within 1.5 s (the simulator often gets NoSuchRecord for it) is reached at
// LPM_LESSON_MAC_ADDRESS ("host:port") instead.
// Built again only when the app's sources or the patch change.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { CACHE } = require("./helpers");

const REPO = path.resolve(__dirname, "../../../..");
const HOME = path.join(CACHE, "link");
const SRC = path.join(HOME, "src");
const APP = path.join(HOME, "dd/Build/Products/Release-iphonesimulator/LpmMobile.app");
const BUNDLE_ID = "cx.lpm.mobile";

// [file, anchor, replacement]: each anchor must appear exactly once.
const PATCHES = [
  [
    "MacDiscovery.swift",
    "            if name.isEmpty { name = serviceName }\n",
    "            if name.isEmpty { name = serviceName }\n" +
      '            if let only = ProcessInfo.processInfo.environment["LPM_LESSON_ONLY_MAC"], name != only { continue }\n',
  ],
  [
    "MacDiscovery.swift",
    "    func resolve(_ mac: DiscoveredMac, timeout: TimeInterval = 5) async -> (host: String, port: UInt16)? {\n",
    "    func resolve(_ mac: DiscoveredMac, timeout: TimeInterval = 5) async -> (host: String, port: UInt16)? {\n" +
      '        if let fixed = ProcessInfo.processInfo.environment["LPM_LESSON_MAC_ADDRESS"], let colon = fixed.lastIndex(of: ":"),\n' +
      "           let port = UInt16(fixed[fixed.index(after: colon)...]) {\n" +
      "            if let hp = await connectAndRead(mac.endpoint, forceIPv4: true, timeout: 1.5) { return hp }\n" +
      "            return (String(fixed[..<colon]), port)\n" +
      "        }\n",
  ],
];

function sourcesStamp() {
  const hash = crypto.createHash("sha256").update(JSON.stringify(PATCHES));
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      if (["build", ".build", "xcuserdata", "LpmMobile.xcodeproj"].includes(name)) continue;
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else hash.update(`${path.relative(REPO, p)}:${st.size}:${st.mtimeMs}`);
    }
  };
  walk(path.join(REPO, "mobile"));
  walk(path.join(REPO, "tailnet"));
  return hash.digest("hex");
}

function applyPatches(sources) {
  for (const [file, anchor, replacement] of PATCHES) {
    const p = path.join(sources, file);
    const text = fs.readFileSync(p, "utf8");
    const count = text.split(anchor).length - 1;
    if (count !== 1) {
      throw new Error(`lpm Link patch anchor in ${file} matched ${count} times (want 1); update PATCHES in scripts/linkbuild.js to the new code`);
    }
    fs.writeFileSync(p, text.replace(anchor, replacement));
  }
}

function ensureLinkBuild({ log = console.log } = {}) {
  const stampFile = path.join(HOME, "stamp");
  const stamp = sourcesStamp();
  if (fs.existsSync(APP) && fs.existsSync(stampFile) && fs.readFileSync(stampFile, "utf8") === stamp) return APP;
  fs.rmSync(SRC, { recursive: true, force: true });
  fs.mkdirSync(SRC, { recursive: true });
  execFileSync("rsync", ["-a", "--exclude", "build", "--exclude", ".build", "--exclude", "xcuserdata",
    path.join(REPO, "mobile") + "/", path.join(SRC, "mobile") + "/"]);
  fs.symlinkSync(path.join(REPO, "tailnet"), path.join(SRC, "tailnet"));
  applyPatches(path.join(SRC, "mobile/Sources/LpmMobile"));
  execFileSync("xcodegen", ["generate", "--quiet"], { cwd: path.join(SRC, "mobile"), stdio: "inherit" });
  log("building lpm Link for the simulator (a few minutes the first time)");
  const logFile = path.join(HOME, "build.log");
  try {
    const out = execFileSync("xcodebuild", ["-project", "LpmMobile.xcodeproj", "-scheme", "LpmMobile",
      "-configuration", "Release", "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator",
      "-derivedDataPath", path.join(HOME, "dd"), "CODE_SIGNING_ALLOWED=NO", "build"],
      { cwd: path.join(SRC, "mobile"), maxBuffer: 1 << 28 });
    fs.writeFileSync(logFile, out);
  } catch (e) {
    fs.writeFileSync(logFile, String(e.stdout || "") + String(e.stderr || ""));
    const errors = String(e.stdout || "").split("\n").filter((l) => l.includes("error:")).slice(0, 10).join("\n");
    throw new Error(`lpm Link build failed (log: ${logFile})\n${errors}`);
  }
  if (!fs.existsSync(APP)) throw new Error(`the build succeeded but ${APP} is missing`);
  fs.writeFileSync(stampFile, stamp);
  log(`built ${APP}`);
  return APP;
}

module.exports = { ensureLinkBuild, APP, BUNDLE_ID };

if (require.main === module) {
  try {
    console.log(ensureLinkBuild());
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
