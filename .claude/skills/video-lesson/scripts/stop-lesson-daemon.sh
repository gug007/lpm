#!/bin/sh
# Stops the lesson app's session daemon (and the agents it still runs) after a
# take; the daemon behind the user's real ~/.lpm is never matched.
LPM_DIR_MATCH="LPM_DIR=${LPM_LESSON_DIR:-$HOME/.lpm-lessons}"
kill_tree() {
  for kid in $(pgrep -P "$1"); do kill_tree "$kid"; done
  kill -9 "$1" 2>/dev/null
}
ps -Ao pid=,command= | grep -- '--session-daemon' | grep -v grep | while read -r pid rest; do
  if ps eww -o command= -p "$pid" | grep -q "$LPM_DIR_MATCH"; then
    echo "stopping lesson daemon $pid"
    kill_tree "$pid"
  fi
done
