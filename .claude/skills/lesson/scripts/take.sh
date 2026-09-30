#!/bin/sh
# take.sh <lesson-dir> [make.js flags]: records a lesson with this skill's
# make.js (LESSON_MAKER names another skill folder). preflight.js checks the
# Mac first. Around a recording (not a --mux-only re-cut):
# - the user's agent defaults (model, effort, status line) are saved and put
#   back afterwards (guard.js); a backup a killed take left is restored first;
# - the take runs on an empty clipboard (a clipboard handed over from another
#   device makes macOS show a "Pasting from <owner>'s iPhone" panel over the
#   window) and the whole clipboard, images included, comes back afterwards;
# - however it ends, the lesson app, its services and agents, and the dev
#   server it started are stopped (--keep-state keeps the services);
# - caffeinate keeps the display awake through long agent waits.
set -u
[ $# -ge 1 ] || { echo "usage: take.sh <lesson-dir> [make.js flags]" >&2; exit 1; }
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
MAKER="${LESSON_MAKER:-$(dirname "$SCRIPTS")}"
DIR="$(cd "$1" && pwd)" || exit 1
shift

RECORDING=1
KEEP=0
for a in "$@"; do
  case "$a" in
    --mux-only) RECORDING=0 ;;
    --keep-state) KEEP=1 ;;
  esac
done

node "$SCRIPTS/preflight.js" "$DIR" "$@" || exit 1

if [ "$RECORDING" = 1 ]; then
  LPMDIR="$(node "$SCRIPTS/cli.js" lpm-dir "$DIR" "$@")" || exit 1
  STATE="$HOME/Library/Caches/lpm-video-lesson"
  mkdir -p "$STATE"
  GUARD="$STATE/agent-settings.backup.json"
  CLIP="$STATE/clipboard.backup.plist"
  CLIPTOOL="$(node "$SCRIPTS/helpers.js" clipboard)" || exit 1
  if [ -f "$GUARD" ]; then
    echo "take.sh: an earlier take ended before it could put your agent settings back; restoring them now"
    node "$SCRIPTS/guard.js" restore "$GUARD" || exit 1
  fi
  if [ -f "$CLIP" ]; then
    if [ "$("$CLIPTOOL" count)" = 0 ]; then
      echo "take.sh: restoring the clipboard an earlier take saved"
      "$CLIPTOOL" restore "$CLIP" >/dev/null && rm -f "$CLIP"
    else
      KEPT="$STATE/clipboard.earlier-$(date +%Y%m%d-%H%M%S).plist"
      mv "$CLIP" "$KEPT"
      echo "take.sh: an earlier take left a clipboard backup; you have copied something since, so it was kept aside in $KEPT"
    fi
  fi
  node "$SCRIPTS/guard.js" save "$GUARD" || exit 1
  "$CLIPTOOL" save "$CLIP" >/dev/null && "$CLIPTOOL" clear
fi

cleanup() {
  [ "$RECORDING" = 1 ] || return 0
  node -e 'require(process.argv[1]).quitStale(process.argv[2], () => {})' "$SCRIPTS/app.js" "$LPMDIR/lesson.sock" 2>/dev/null
  if [ -f "$LPMDIR/.lesson-data-dir" ]; then
    [ "$KEEP" = 1 ] || LPM_LESSON_DIR="$LPMDIR" sh "$SCRIPTS/stop-lesson-daemon.sh"
    if [ -f "$LPMDIR/vite.pid" ]; then
      pid="$(cat "$LPMDIR/vite.pid")"
      ps -p "$pid" -o command= 2>/dev/null | grep -q vite && kill -TERM -- "-$pid" 2>/dev/null
      rm -f "$LPMDIR/vite.pid"
    fi
  fi
  node "$SCRIPTS/guard.js" restore "$GUARD"
  [ -f "$CLIP" ] && "$CLIPTOOL" restore "$CLIP" >/dev/null && rm -f "$CLIP"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

cd "$MAKER" && caffeinate -dims node scripts/make.js "$DIR" "$@"
