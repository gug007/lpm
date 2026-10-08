const os = require("os");
const path = require("path");
const fs = require("fs");

const REPO = path.resolve(__dirname, "../../../..");
const CACHE = path.join(os.homedir(), "Library/Caches/lpm-app-store-shots");
const SRC = path.join(CACHE, "src");
const APP = path.join(CACHE, "dd/Build/Products/Release-iphonesimulator/LpmMobile.app");
const BUNDLE_ID = "cx.lpm.mobile";
const CONFIG = path.resolve(__dirname, "../shots.json");

fs.mkdirSync(CACHE, { recursive: true });

function config() {
  const c = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  c.outDir = c.outDir.replace(/^~/, os.homedir());
  return c;
}

function appVersion() {
  const yml = fs.readFileSync(path.join(REPO, "mobile/project.yml"), "utf8");
  const m = yml.match(/MARKETING_VERSION:\s*"([^"]+)"/);
  if (!m) throw new Error("MARKETING_VERSION not found in mobile/project.yml");
  return m[1];
}

module.exports = { REPO, CACHE, SRC, APP, BUNDLE_ID, CONFIG, config, appVersion };
