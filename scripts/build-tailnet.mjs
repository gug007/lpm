#!/usr/bin/env node
// Build the built-in Tailscale node (tailnet/cmd/lpm-tailnet, Go) and stage it
// where Tauri's `externalBin` expects it: src-tauri/binaries/lpm-tailnet-<triple>,
// plus `.exe` for a Windows target. The bundle ships it beside the app's own
// executable, the same way as the CLI (see build-cli.mjs).
//
// Target triple (first match wins): the first argument, $LPM_CLI_TARGET (set
// per-arch by CI), the host triple. Pure Go (CGO_ENABLED=0), so any target
// cross-builds from any host. Needs Go: https://go.dev/dl or `brew install go`.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleDir = join(repoRoot, "tailnet");
const binDir = join(repoRoot, "desktop", "frontend", "src-tauri", "binaries");

function fail(message) {
  console.error(`build-tailnet: ${message}`);
  process.exit(1);
}

function hostTriple() {
  const out = spawnSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" });
  const triple = out.status === 0 ? out.stdout.trim() : "";
  if (!triple) fail("could not read the host triple from `rustc --print host-tuple`");
  return triple;
}

function goTarget(triple) {
  const os = triple.includes("apple-darwin")
    ? "darwin"
    : triple.includes("windows")
      ? "windows"
      : triple.includes("linux")
        ? "linux"
        : null;
  const arch = triple.startsWith("x86_64")
    ? "amd64"
    : triple.startsWith("aarch64")
      ? "arm64"
      : null;
  if (!os || !arch) fail(`no Go target for ${triple}`);
  return { os, arch };
}

const target = process.argv[2] || process.env.LPM_CLI_TARGET || hostTriple();
const { os, arch } = goTarget(target);
const exeSuffix = os === "windows" ? ".exe" : "";
const dest = join(binDir, `lpm-tailnet-${target}${exeSuffix}`);

if (spawnSync("go", ["version"], { stdio: "ignore" }).status !== 0) {
  fail("Go is required to build lpm's built-in Tailscale — install it from https://go.dev/dl (macOS: brew install go)");
}

console.log(`build-tailnet: target=${target} (${os}/${arch})`);

mkdirSync(binDir, { recursive: true });
// A fresh inode: macOS caches code signatures per vnode, so rewriting a binary
// that has already run in place can get the next exec SIGKILLed.
rmSync(dest, { force: true });
const build = spawnSync(
  "go",
  ["build", "-trimpath", "-ldflags=-s -w", "-o", dest, "./cmd/lpm-tailnet"],
  {
    cwd: moduleDir,
    env: { ...process.env, GOOS: os, GOARCH: arch, CGO_ENABLED: "0" },
    stdio: "inherit",
  },
);
if (build.error) fail(`could not run go: ${build.error.message}`);
if (build.status !== 0) process.exit(build.status ?? 1);
if (process.platform !== "win32") chmodSync(dest, 0o755);

console.log(`build-tailnet: staged ${dest}`);
