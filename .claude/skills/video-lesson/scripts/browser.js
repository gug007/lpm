// The headless Chromium the demo stage, the card renderer and the frame
// compositor share: Playwright's bundled browser, reached through a global
// install (`npm install -g @playwright/cli`) so the skill carries no
// node_modules of its own. PLAYWRIGHT_CORE and CHROME override the lookup.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CORE_PATHS = [
  "playwright-core",
  "@playwright/cli/node_modules/playwright-core",
  "playwright/node_modules/playwright-core",
  "@playwright/test/node_modules/playwright-core",
];

function coreIn(root) {
  const dir = CORE_PATHS.map((rel) => path.join(root, rel)).find((d) => fs.existsSync(path.join(d, "package.json")));
  return dir || null;
}

// This node's own global root first; `npm root -g` only when npm's prefix
// points elsewhere.
function findCore() {
  if (process.env.PLAYWRIGHT_CORE) return process.env.PLAYWRIGHT_CORE;
  const own = coreIn(path.join(path.dirname(process.execPath), "..", "lib", "node_modules"));
  if (own) return own;
  try {
    return coreIn(execFileSync("npm", ["root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch {
    return null;
  }
}

// The revision this playwright-core was built for, else the newest one below
// it (an older browser under a newer driver is the pairing that works), else
// the closest newer one.
function findChrome(chromium) {
  if (process.env.CHROME) return process.env.CHROME;
  const own = chromium.executablePath();
  if (fs.existsSync(own)) return own;
  const m = /^(.*)[\\/]chromium-(\d+)[\\/](.*)$/.exec(own);
  if (!m) return null;
  const [, cache, want, inner] = m;
  const revs = fs.existsSync(cache)
    ? fs.readdirSync(cache).map((n) => Number(/^chromium-(\d+)$/.exec(n)?.[1])).filter(Boolean)
    : [];
  const older = revs.filter((r) => r <= Number(want)).sort((a, b) => b - a);
  const newer = revs.filter((r) => r > Number(want)).sort((a, b) => a - b);
  for (const rev of [...older, ...newer]) {
    const exe = path.join(cache, `chromium-${rev}`, inner);
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

const CORE = findCore();
if (!CORE) throw new Error("no playwright-core found: npm install -g @playwright/cli (or set PLAYWRIGHT_CORE)");
const { chromium } = require(CORE);
const CHROME = findChrome(chromium);

module.exports = { chromium, CHROME, CORE };
