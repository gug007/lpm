#!/bin/sh
# rehook.sh <slug>: re-speaks a lesson's hook line after editing its text, then
# re-cuts the last take with the new hook length (the hook's beat is hidden, so
# no retake).
set -eu
[ $# -eq 1 ] || { echo "usage: rehook.sh <slug>" >&2; exit 1; }
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${LPM_TIKTOK_DIR:-${LPM_LESSONS_DIR:-$HOME/Movies/lpm-lessons}/tiktok}"
DIR="$ROOT/$1"
cd "$SKILL"
node scripts/make.js "$1" --mux-only > /dev/null
MS=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DIR/audio/hook.wav" | awk '{printf "%d", $1*1000}')
python3 - "$DIR/timeline.json" "$MS" <<'PY'
import json, sys
p, ms = sys.argv[1], int(sys.argv[2])
t = json.load(open(p))
t["lines"][0]["ms"] = ms
json.dump(t, open(p, "w"), indent=2)
print(f"hook now {ms} ms")
PY
node scripts/make.js "$1" --mux-only | grep -E "audio hook|muxed|cover"
