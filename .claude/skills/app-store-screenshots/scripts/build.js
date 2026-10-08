// The screenshot build: a scratch copy of mobile/ with Demo Mode dressed as a
// real Mac (no banner, "MacBook Pro", "Connected · on your network"), a busier
// sample seed, and ShotDriver so LPM_SHOT_ROUTE opens any screen at launch.
// The repo itself is never touched.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { REPO, CACHE, SRC, APP } = require("./paths");

const DEMO_ROUTES = `            case .usage:
                UsageScreen()
            case .stats:
                StatsScreen()
            case .activity:
                ActivityScreen()
            case .changes(let name):
                if let p = model.projects.first(where: { $0.name == name }) {
                    GitReviewView(project: p)
                }
            case .automations:
                AutomationsView()
`;

// [file, anchor, replacement] — each anchor must appear exactly once.
const PATCHES = [
  ["DemoServer.swift", 'static let serverName = "Demo Mac"', 'static let serverName = "MacBook Pro"'],
  ["Views.swift", "DemoBanner { model.exitDemo() }", "EmptyView()"],
  ["ConnectionIssue.swift", 'text: "Demo · sample projects"', 'text: "Connected · on your network"'],
  ["Views.swift", "private enum NotificationRoute: Hashable {\n",
    "enum NotificationRoute: Hashable {\n    case usage, stats, activity\n    case changes(project: String)\n"],
  ["Views.swift", "            case .automations:\n                AutomationsView()\n", DEMO_ROUTES],
  ["Views.swift", "            model.bootstrap()\n", "            model.bootstrap()\n            ShotDriver.start(model) { path = $0 }\n"],
  ["DemoWorld.swift", "        seedHistory(nowMs: nowMs)\n    }\n", "        seedHistory(nowMs: nowMs)\n        shotSeed()\n    }\n"],
  ["DemoTerminals.swift", "        seedTerminalFixtures()\n", "        seedTerminalFixtures()\n        shotPrefill()\n"],
  ["DemoTerminals.swift", "    private func claudeWelcome(", "    func claudeWelcome("],
  ["DemoTerminals.swift", "    private func claudeScriptSteps()", "    func claudeScriptSteps()"],
];

function applyPatches(sources) {
  for (const [file, anchor, replacement] of PATCHES) {
    const p = path.join(sources, file);
    const text = fs.readFileSync(p, "utf8");
    const count = text.split(anchor).length - 1;
    if (count !== 1) {
      throw new Error(`patch anchor in ${file} matched ${count} times (want 1): ${JSON.stringify(anchor.slice(0, 80))}\n` +
        "The app changed: update PATCHES in scripts/build.js to the new code.");
    }
    fs.writeFileSync(p, text.replace(anchor, replacement));
  }
}

function build({ log = console.log } = {}) {
  fs.rmSync(SRC, { recursive: true, force: true });
  fs.mkdirSync(SRC, { recursive: true });
  execFileSync("rsync", ["-a", "--exclude", "build", "--exclude", ".build", "--exclude", "xcuserdata",
    path.join(REPO, "mobile") + "/", path.join(SRC, "mobile") + "/"]);
  fs.symlinkSync(path.join(REPO, "tailnet"), path.join(SRC, "tailnet"));

  const sources = path.join(SRC, "mobile/Sources/LpmMobile");
  applyPatches(sources);
  for (const f of fs.readdirSync(path.join(__dirname, "swift"))) {
    fs.copyFileSync(path.join(__dirname, "swift", f), path.join(sources, f));
  }
  execFileSync("xcodegen", ["generate", "--quiet"], { cwd: path.join(SRC, "mobile"), stdio: "inherit" });

  log("building lpm Link for the simulator (about a minute and a half)");
  const logFile = path.join(CACHE, "build.log");
  try {
    const out = execFileSync("xcodebuild", ["-project", "LpmMobile.xcodeproj", "-scheme", "LpmMobile",
      "-configuration", "Release", "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator",
      "-derivedDataPath", path.join(CACHE, "dd"), "CODE_SIGNING_ALLOWED=NO", "build"],
      { cwd: path.join(SRC, "mobile"), maxBuffer: 1 << 28 });
    fs.writeFileSync(logFile, out);
  } catch (e) {
    fs.writeFileSync(logFile, String(e.stdout || "") + String(e.stderr || ""));
    const errors = String(e.stdout || "").split("\n").filter((l) => l.includes("error:")).slice(0, 10).join("\n");
    throw new Error(`build failed (log: ${logFile})\n${errors}`);
  }
  if (!fs.existsSync(APP)) throw new Error(`build succeeded but ${APP} is missing`);
  log(`built ${APP}`);
}

module.exports = { build };
