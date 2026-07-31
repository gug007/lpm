#!/bin/sh
# Runs as lpm.service's ExecStopPost.
#
# lpm.service uses KillMode=process so that the tmux server carrying this
# machine's services — and the scheduled job agents, which `setsid` precisely so
# they outlive the app — are not taken down every time the app restarts. The cost
# of that setting is that it exempts *everything*: the app has no SIGTERM handler,
# so its own `ssh -N` forwards, spawned with null stdio and therefore never ended
# by a broken pipe, would survive as orphans at one per forward per restart.
#
# So sweep those by name out of the unit's own cgroup, which is precise enough to
# leave tmux and the job agents exactly where KillMode put them. A process that
# has already exited, or a kernel without cgroup v2 here, is not an error: this
# runs on the stop path and must never be the reason a stop fails.
set -u

cgline=$(grep -m1 '^0::' /proc/self/cgroup 2>/dev/null) || exit 0
cgroup=/sys/fs/cgroup$(printf '%s' "$cgline" | cut -d: -f3)
[ -r "$cgroup/cgroup.procs" ] || exit 0

self=$$
while read -r pid; do
    [ "$pid" = "$self" ] && continue
    [ "$(cat "/proc/$pid/comm" 2>/dev/null)" = ssh ] && kill "$pid" 2>/dev/null
done < "$cgroup/cgroup.procs"

exit 0
