# After a killed turn

A turn killed at 60 minutes leaves things behind. While no take runs (`pgrep -fl 'lesson/scripts/take.sh|node scripts/make.js '` prints nothing), clean them up and name each one in the report:

- `~/Library/Caches/lpm-video-lesson/agent-settings.backup.json` → `node SKILLS/lesson/scripts/guard.js restore <it>`.
- Each `TIKTOK/<slug>/_claude-settings.backup.json` (also `_cursor-`, `_muse-`) → `node SKILLS/short-race/scripts/cli-default.js restore <it> <claude|cursor|muse>`.
- `clipboard.backup.plist` in the same cache folder → leave it for the next take.sh and tell the user it's there.
- A port 9245 listener is ours when its process group (`ps -o pgid= -p <listener pid>`) equals the pid in `~/.lpm-lessons/vite.pid`, or its command has `vite.lesson.config.mjs` → `kill -TERM -<pid from vite.pid>`, then delete `vite.pid`.
- Then `sh SKILLS/lesson/scripts/stop-lesson-daemon.sh`.

A phase of `recording` means the turn was killed during the take. Check the slug's MP4 and `result.json`, report them, and offer the recording as the backup next time. A YouTube Draft row from a killed turn isn't live: finish or delete it.
