#!/bin/sh
# scan.sh <slug> [out-dir]: one frame per second of a finished lesson, as a
# contact sheet at 360 px wide, to look for system popups and framing problems.
set -eu
[ $# -ge 1 ] || { echo "usage: scan.sh <slug> [out-dir]" >&2; exit 1; }
ROOT="${LPM_TIKTOK_DIR:-${LPM_LESSONS_DIR:-$HOME/Movies/lpm-lessons}/tiktok}"
V="$ROOT/$1/$1.mp4"
OUT="${2:-/tmp}/$1-scan.jpg"
ffmpeg -v error -y -i "$V" -vf "fps=1,scale=360:640,tile=8x4" -frames:v 1 "$OUT"
echo "$OUT"
