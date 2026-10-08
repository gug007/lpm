// Turns the raw captures into the App Store images with compose.swift, then a
// contact sheet per device for a quick look.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { CACHE } = require("./paths");

const BIN = path.join(CACHE, "compose");
const SOURCE = path.join(__dirname, "compose.swift");

function compiler() {
  const stale = !fs.existsSync(BIN) || fs.statSync(BIN).mtimeMs < fs.statSync(SOURCE).mtimeMs;
  if (stale) execFileSync("swiftc", ["-O", SOURCE, "-o", BIN], { stdio: ["ignore", "ignore", "inherit"] });
  return BIN;
}

function compose(device, dev, shots, rawDir, outDir, { log = console.log } = {}) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const spec = {
    device,
    width: dev.size[0],
    height: dev.size[1],
    shots: shots.map((s, i) => ({
      raw: path.join(rawDir, `${s.name}.png`),
      out: path.join(outDir, `${String(i + 1).padStart(2, "0")}-${s.name}.png`),
      title: s.title,
      subtitle: s.subtitle,
    })),
  };
  for (const s of spec.shots) {
    if (!fs.existsSync(s.raw)) throw new Error(`missing capture ${s.raw}: run capture first`);
  }
  const specFile = path.join(CACHE, `spec-${device}.json`);
  fs.writeFileSync(specFile, JSON.stringify(spec, null, 1));
  execFileSync(compiler(), [specFile], { stdio: "pipe" });
  for (const s of spec.shots) log(s.out);
  return spec.shots.map((s) => s.out);
}

function sheet(files, out) {
  if (files.length < 2) return null;
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", ...files.flatMap((f) => ["-i", f]), "-filter_complex",
      files.map((_, i) => `[${i}]scale=400:-2[s${i}]`).join(";") + ";" +
      files.map((_, i) => `[s${i}]`).join("") + `hstack=inputs=${files.length}`, out]);
    return out;
  } catch {
    return null;
  }
}

module.exports = { compose, sheet };
