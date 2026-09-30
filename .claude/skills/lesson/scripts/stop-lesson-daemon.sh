#!/bin/sh
# Stops the lesson app's session daemon (and the agents it still runs); take.sh
# does this after every take. Only a daemon whose own environment has exactly
# LPM_DIR=<the lesson data dir> is matched, never the one behind ~/.lpm.
exec node -e 'require(process.argv[1]).killStaleServices(require("path").resolve(process.argv[2]), console.log)' \
  "$(cd "$(dirname "$0")" && pwd)/state.js" "${LPM_LESSON_DIR:-$HOME/.lpm-lessons}"
