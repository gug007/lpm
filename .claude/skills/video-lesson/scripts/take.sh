#!/bin/sh
# take.sh <lesson-dir> [make.js flags]: records a lesson with this skill's
# make.js (LESSON_MAKER names another skill folder). preflight.js checks the
# Mac first. The take runs on an empty local clipboard: a clipboard handed over
# from another device makes macOS show a "Pasting from <owner>'s iPhone" panel
# over the window whenever something reads it; the text comes back afterwards
# unless something new was copied meanwhile. caffeinate keeps the display awake
# through long agent waits (closing the lid still ends the take).
set -u
[ $# -ge 1 ] || { echo "usage: take.sh <lesson-dir> [make.js flags]" >&2; exit 1; }
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
MAKER="${LESSON_MAKER:-$(dirname "$SCRIPTS")}"
DIR="$(cd "$1" && pwd)" || exit 1
shift
CLIP="$DIR/_clipboard.backup.txt"

node "$SCRIPTS/preflight.js" "$DIR" "$@" || exit 1

[ -f "$CLIP" ] || pbpaste > "$CLIP"
printf '' | pbcopy
restore_clipboard() {
  [ -z "$(pbpaste)" ] && pbcopy < "$CLIP"
  rm -f "$CLIP"
}
trap restore_clipboard EXIT
trap 'exit 130' INT TERM

cd "$MAKER" && caffeinate -dims node scripts/make.js "$(basename "$DIR")" "$@"
