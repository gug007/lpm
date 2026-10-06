#!/usr/bin/env node
// Runs check-build-cache.sh where there is a POSIX shell to run it. npm scripts
// go through cmd.exe on Windows, where `bash` is missing or WSL's, so the chore
// is skipped there rather than run against the wrong filesystem.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "win32") process.exit(0);

const script = join(dirname(fileURLToPath(import.meta.url)), "check-build-cache.sh");
const run = spawnSync("bash", [script], { stdio: "inherit" });
if (run.error) {
  console.error(`check-build-cache: ${run.error.message}`);
  process.exit(1);
}
process.exit(run.status ?? 1);
