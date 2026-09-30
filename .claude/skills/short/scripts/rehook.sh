#!/bin/sh
# rehook.sh <slug>: re-speaks a lesson's hook line after editing its text and
# re-cuts the last take with the new hook length (the hook's beat is hidden,
# so no retake; make.js re-times the opening itself).
set -eu
[ $# -eq 1 ] || { echo "usage: rehook.sh <slug>" >&2; exit 1; }
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SKILL"
node scripts/make.js "$1" --mux-only --speak | grep -E "audio hook|opening re-timed|muxed|cover|qa:"
