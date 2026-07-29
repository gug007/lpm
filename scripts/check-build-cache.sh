#!/usr/bin/env bash
# Keep the dev build cache from silently growing without bound.
#
# Object files are named with a content hash (`...-cgu.0.rcgu.o`), so every
# rebuild writes new filenames and orphans the previous ones. Cargo has no
# garbage collector for target/, so nothing ever reclaims them: measured at
# ~261 orphaned files per one-line Rust edit. Left alone this reached 81 GB /
# 530k files, at which point the OS spent ~150s per rebuild servicing directory
# I/O while rustc did 12s of actual work — a 66x slowdown that looks, in
# `cargo --timings`, like a compiler front-end problem.
#
# Rebuilding from empty costs ~45-60s, so the cure is far cheaper than the
# disease. Past either threshold we drop target/debug (dev artifacts only —
# release output and the staged CLI sidecar are left alone) and let the next
# build repopulate it.
#
# Skipped entirely while another cargo/rustc is running: several agents build in
# this worktree concurrently and pulling the directory out from under an
# in-flight build would fail it.
set -euo pipefail

MAX_GB="${LPM_CACHE_MAX_GB:-20}"
MAX_FILES="${LPM_CACHE_MAX_FILES:-200000}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$REPO_ROOT/desktop/frontend/src-tauri/target"
DEBUG_DIR="$TARGET/debug"

# Spotlight indexing every object file is what turns bloat into stalls. The
# marker lives inside target/, so it has to be re-created after each clean.
mark_noindex() {
  mkdir -p "$TARGET"
  [ -e "$TARGET/.metadata_never_index" ] || touch "$TARGET/.metadata_never_index"
}

mark_noindex
[ -d "$DEBUG_DIR" ] || exit 0

# Exact process names only: `pgrep -f` matches whole command lines, so any shell
# whose arguments happen to mention cargo would read as a live build and the
# guard would silently never fire. Erring toward skipping is safe — this runs on
# every dev start, so a missed cycle is picked up by the next one.
if pgrep -qx rustc || pgrep -qx cargo; then
  echo "check-build-cache: build in progress, skipping"
  exit 0
fi

SIZE_KB=$(du -sk "$DEBUG_DIR" | cut -f1)
SIZE_GB=$((SIZE_KB / 1024 / 1024))
FILES=$(find "$DEBUG_DIR/deps" -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "$SIZE_GB" -lt "$MAX_GB" ] && [ "$FILES" -lt "$MAX_FILES" ]; then
  echo "check-build-cache: ${SIZE_GB}GB / ${FILES} files (limits ${MAX_GB}GB / ${MAX_FILES}) — ok"
  exit 0
fi

echo "check-build-cache: ${SIZE_GB}GB / ${FILES} files exceeds ${MAX_GB}GB / ${MAX_FILES}"
echo "check-build-cache: clearing dev artifacts; the next build takes ~45s"

case "$DEBUG_DIR" in
  */src-tauri/target/debug) rm -rf "$DEBUG_DIR" ;;
  *) echo "check-build-cache: refusing to remove unexpected path '$DEBUG_DIR'" >&2; exit 1 ;;
esac

mark_noindex
echo "check-build-cache: done"
