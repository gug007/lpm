#!/usr/bin/env node
// Build the lpm CLI (cli/) and stage it where Tauri's `externalBin` expects it:
// src-tauri/binaries/lpm-cli-<target-triple>, plus `.exe` for a Windows target.
// The bundle then ships it beside the app's own executable and signs it with
// the rest (Contents/MacOS/lpm-cli, lpm-cli.exe, /usr/bin/lpm-cli).
//
// Named `lpm-cli`, not `lpm`, so it can't be confused with the app's executable
// (`lpm-desktop`); what reaches PATH as `lpm` points at it.
//
// Target triple (first match wins): the first argument, $LPM_CLI_TARGET (set
// per-arch by CI so cross-builds land right), the host triple.
//
// LPM_CLI_VERSION, else the app's LPM_VERSION, is baked into `lpm --version`.
// Neither set (or empty) leaves it unset so the crate version is used.
//
// Node rather than bash: npm runs scripts through cmd.exe on Windows, where
// `bash` is missing or WSL's.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = join(repoRoot, "cli");
const binDir = join(repoRoot, "desktop", "frontend", "src-tauri", "binaries");

function fail(message) {
  console.error(`build-cli: ${message}`);
  process.exit(1);
}

function hostTriple() {
  const out = spawnSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" });
  const triple = out.status === 0 ? out.stdout.trim() : "";
  if (!triple) fail("could not read the host triple from `rustc --print host-tuple`");
  return triple;
}

const target = process.argv[2] || process.env.LPM_CLI_TARGET || hostTriple();
const exeSuffix = target.includes("windows") ? ".exe" : "";

const env = { ...process.env };
const version = env.LPM_CLI_VERSION || env.LPM_VERSION || "";
if (version) env.LPM_CLI_VERSION = version;
else delete env.LPM_CLI_VERSION;

// The app is linked against a static C runtime (tauri-cli's STATIC_VCRUNTIME);
// the CLI has to be too, or `lpm` fails on a machine without the VC++
// redistributable. RUSTFLAGS, when set, outranks this and is left alone.
if (target.endsWith("-windows-msvc") && !env.RUSTFLAGS && !env.CARGO_ENCODED_RUSTFLAGS) {
  const key = `CARGO_TARGET_${target.toUpperCase().replace(/[-.]/g, "_")}_RUSTFLAGS`;
  if (!env[key]) env[key] = "-C target-feature=+crt-static";
}

console.log(`build-cli: target=${target} version=${env.LPM_CLI_VERSION || "<crate default>"}`);

spawnSync("rustup", ["target", "add", target], { stdio: "ignore" });

const build = spawnSync(
  "cargo",
  ["build", "--release", "--target", target, "--message-format=json-render-diagnostics"],
  {
    cwd: cliDir,
    env,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["inherit", "pipe", "inherit"],
  },
);
if (build.error) fail(`could not run cargo: ${build.error.message}`);
if (build.status !== 0) process.exit(build.status ?? 1);

let source = null;
for (const line of build.stdout.split("\n")) {
  if (!line.startsWith("{")) continue;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    continue;
  }
  if (
    msg.reason === "compiler-artifact" &&
    msg.target?.name === "lpm" &&
    msg.target.kind?.includes("bin") &&
    msg.executable
  ) {
    source = msg.executable;
  }
}
if (!source) fail("cargo reported no `lpm` executable");

const dest = join(binDir, `lpm-cli-${target}${exeSuffix}`);
mkdirSync(binDir, { recursive: true });
// A fresh inode: macOS caches code signatures per vnode, so rewriting a binary
// that has already run in place can get the next exec SIGKILLed.
rmSync(dest, { force: true });
copyFileSync(source, dest);
if (process.platform !== "win32") chmodSync(dest, 0o755);

console.log(`build-cli: staged ${dest}`);
