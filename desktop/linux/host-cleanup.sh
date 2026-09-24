#!/bin/sh
# Runs as lpm.service's ExecStopPost.
#
# lpm.service uses KillMode=process so that the session daemon carrying this
# machine's services — and the scheduled job agents, which `setsid` precisely so
# they outlive the app — are not taken down every time the app restarts. The cost
# of that setting is that it exempts *everything*: the app has no SIGTERM handler,
# so its own `ssh -N` forwards, spawned with null stdio and therefore never ended
# by a broken pipe, would survive as orphans at one per forward per restart.
#
# So sweep those out of the unit's own cgroup, which is precise enough to leave
# the daemon and the job agents exactly where KillMode put them. A process that
# has already exited, or a kernel without cgroup v2 here, is not an error: this
# runs on the stop path and must never be the reason a stop fails.
set -u

# The app's orphaned forwards among the pids on stdin, read from the proc tree
# at $1. Every ssh in this cgroup is not one of them: an SSH project's service
# pane runs its ssh under the daemon's live shell. A forward carries -N as an
# argument of its own, and once the app is gone nothing is its parent any more.
orphaned_forwards() {
    proc=$1
    while read -r pid; do
        [ "$pid" = "$$" ] && continue
        [ "$(cat "$proc/$pid/comm" 2>/dev/null)" = ssh ] || continue
        tr '\0' '\n' 2>/dev/null < "$proc/$pid/cmdline" | grep -qx -- -N || continue
        ppid=$(sed -n 's/^PPid:[[:space:]]*//p' "$proc/$pid/status" 2>/dev/null)
        case "$ppid" in
            '' | *[!0-9]*) continue ;;
        esac
        if [ "$ppid" != 1 ]; then
            state=$(sed -n 's/^State:[[:space:]]*\(.\).*/\1/p' "$proc/$ppid/status" 2>/dev/null)
            case "$state" in
                '' | Z | X) ;;
                *) continue ;;
            esac
        fi
        printf '%s\n' "$pid"
    done
}

sweep() {
    cgline=$(grep -m1 '^0::' /proc/self/cgroup 2>/dev/null) || return 0
    cgroup=/sys/fs/cgroup$(printf '%s' "$cgline" | cut -d: -f3)
    [ -r "$cgroup/cgroup.procs" ] || return 0
    for pid in $(orphaned_forwards /proc < "$cgroup/cgroup.procs"); do
        kill "$pid" 2>/dev/null
    done
    return 0
}

# tests/cleanup-test.sh sources this for the selection alone.
[ "${LPM_CLEANUP_TEST:-}" = 1 ] && return 0
sweep
exit 0
