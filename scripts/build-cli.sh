#!/usr/bin/env bash
# Build the lpm CLI and stage it as the app's `externalBin` sidecar. The work is
# in build-cli.mjs, which also runs where npm scripts go through cmd.exe
# (Windows); this wrapper keeps `bash scripts/build-cli.sh [triple]` working.
set -euo pipefail

exec node "$(dirname "${BASH_SOURCE[0]}")/build-cli.mjs" "$@"
