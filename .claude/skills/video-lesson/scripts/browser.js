// The headless Chromium the demo stage, the card renderer and the frame
// compositor share: Playwright's bundled browser, reached through the CLI
// install so the skill carries no node_modules of its own.
const os = require("os");
const path = require("path");

const PW =
  process.env.PLAYWRIGHT_CORE ||
  path.join(
    os.homedir(),
    ".nvm/versions/node/v24.14.1/lib/node_modules/@playwright/cli/node_modules/playwright-core",
  );
const CHROME =
  process.env.CHROME ||
  path.join(
    os.homedir(),
    "Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );
const { chromium } = require(PW);

module.exports = { chromium, CHROME };
