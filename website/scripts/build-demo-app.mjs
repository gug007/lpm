import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The site's demos are the desktop app's own UI, built against the in-memory
// backend in desktop/frontend/src/demo, served from public/demo-app.
const websiteDir = dirname(dirname(fileURLToPath(import.meta.url)));
const frontendDir = join(websiteDir, "..", "desktop", "frontend");
const built = join(websiteDir, "public", "demo-app", "index.html");

if (process.argv.includes("--if-missing") && existsSync(built)) process.exit(0);

const npm = (args) =>
  execFileSync("npm", args, {
    cwd: frontendDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

// Vercel restores node_modules from the last deployment's build cache, so a
// dependency added since then is missing although the folder exists.
const installed = () => {
  try {
    execFileSync("npm", ["ls", "--depth=0", "--include=dev"], {
      cwd: frontendDir,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    return true;
  } catch {
    return false;
  }
};

// --include=dev: Vercel builds with NODE_ENV=production, which skips vite.
if (!existsSync(join(frontendDir, "node_modules")) || !installed()) npm(["ci", "--include=dev"]);
npm(["run", "build:demo"]);
