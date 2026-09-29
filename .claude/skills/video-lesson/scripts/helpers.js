#!/usr/bin/env node
// node helpers.js <name>: prints the path of a small native helper (the
// `<name>.swift` beside this file), compiling it into the user's cache the
// first time and again whenever its source changes.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CACHE = path.join(os.homedir(), "Library", "Caches", "lpm-video-lesson");

function helper(name) {
  const src = path.join(__dirname, `${name}.swift`);
  const bin = path.join(CACHE, `lesson-${name}`);
  if (fs.existsSync(bin) && fs.statSync(bin).mtimeMs >= fs.statSync(src).mtimeMs) return bin;
  fs.mkdirSync(CACHE, { recursive: true });
  const r = spawnSync("swiftc", ["-O", src, "-o", bin], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`could not build ${name} (swiftc): ${(r.stderr || "").slice(-400)}`);
  return bin;
}

module.exports = { helper, CACHE };

if (require.main === module) {
  try {
    console.log(helper(process.argv[2]));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
