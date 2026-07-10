#!/usr/bin/env bash
# Build the lpm CLI (cli/) and stage it where Tauri's `externalBin` expects it,
# so the binary ships inside the .app (Contents/MacOS/lpm-cli) and gets signed
# with the rest of the bundle.
#
# The bundled binary is named `lpm-cli` — NOT `lpm` — so it can't be confused
# with the app's own executable (`lpm-desktop`) in Contents/MacOS. The PATH
# symlink the installer creates is what's named `lpm`.
#
# Target triple resolution (first match wins):
#   1. first argument            ($1)
#   2. $LPM_CLI_TARGET            (set per-arch by CI so cross-builds land right)
#   3. the host triple           (local dev / plain `tauri build`)
#
# Version: LPM_CLI_VERSION is baked into `--version`. It defaults to the app's
# LPM_VERSION (the CI release version); when neither is set the crate version is
# used. Only exported when non-empty so `option_env!` stays None locally.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_DIR="$REPO_ROOT/cli"
BIN_DIR="$REPO_ROOT/desktop/frontend/src-tauri/binaries"

TARGET="${1:-${LPM_CLI_TARGET:-$(rustc --print host-tuple)}}"

VER="${LPM_CLI_VERSION:-${LPM_VERSION:-}}"
if [ -n "$VER" ]; then
  export LPM_CLI_VERSION="$VER"
fi

echo "build-cli: target=$TARGET version=${LPM_CLI_VERSION:-<crate default>}"

rustup target add "$TARGET" >/dev/null 2>&1 || true

mkdir -p "$BIN_DIR"
( cd "$CLI_DIR" && cargo build --release --target "$TARGET" )

SRC="$CLI_DIR/target/$TARGET/release/lpm"
DEST="$BIN_DIR/lpm-cli-$TARGET"
cp "$SRC" "$DEST"
chmod +x "$DEST"

echo "build-cli: staged $DEST"
