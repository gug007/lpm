#!/bin/sh
# take.sh <lesson-dir> [make.js flags]: lesson's take runner (preflight,
# clipboard, caffeinate) with this skill's make.js.
HERE="$(cd "$(dirname "$0")" && pwd)"
export LESSON_MAKER="$(dirname "$HERE")"
exec "$HERE/../../lesson/scripts/take.sh" "$@"
