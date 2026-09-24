#!/bin/sh
# Test for host-cleanup.sh — which processes lpm.service's ExecStopPost sweep
# picks out of the unit's cgroup.
#
#     sh desktop/linux/tests/cleanup-test.sh
#
# Only the selection is exercised, against a fake proc tree: the sweep itself
# signals whatever it selects, and the pids here are made up, so running it
# would aim real signals at whichever real processes happen to own them.
set -u

CLEANUP=${CLEANUP:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/host-cleanup.sh}
[ -f "$CLEANUP" ] || { echo "no host-cleanup.sh at $CLEANUP" >&2; exit 1; }
ROOT=$(mktemp -d)
PROC=$ROOT/proc

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }

# fake_proc PID COMM PPID STATE ARGV...
fake_proc() {
    pid=$1 comm=$2 ppid=$3 state=$4
    shift 4
    mkdir -p "$PROC/$pid"
    printf '%s\n' "$comm" > "$PROC/$pid/comm"
    printf 'Name:\t%s\nState:\t%s (x)\nPPid:\t%s\n' "$comm" "$state" "$ppid" > "$PROC/$pid/status"
    : > "$PROC/$pid/cmdline"
    for a in "$@"; do printf '%s\0' "$a" >> "$PROC/$pid/cmdline"; done
}

LPM_CLEANUP_TEST=1
. "$CLEANUP"

selected() { printf '%s\n' "$@" | orphaned_forwards "$PROC" | tr '\n' ' ' | sed 's/ $//'; }
picks() { # description, want, pids...
    desc=$1 want=$2
    shift 2
    got=$(selected "$@")
    [ "$got" = "$want" ] && ok "$desc" || no "$desc (want '$want', got '$got')"
}

# The session daemon and a shell it runs in a service pane: both alive.
fake_proc 500 lpm-desktop 1 S /opt/lpm/lpm-desktop --session-daemon
fake_proc 501 bash 500 S -bash
fake_proc 700 lpm-desktop 1 Z

fake_proc 100 ssh 1 S ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:5000:127.0.0.1:5000 host
fake_proc 101 ssh 500 S ssh -N -L 127.0.0.1:5432:127.0.0.1:5432 db
fake_proc 102 ssh 501 S ssh -t build-box
fake_proc 103 ssh 1 S "ssh: /tmp/lpm-ssh-host [mux]" "" "" ""
fake_proc 104 ssh 600 S ssh -N -R /tmp/remote.sock:/tmp/local.sock host
fake_proc 105 ssh 700 S ssh -N -L 127.0.0.1:1:127.0.0.1:8766 root@h
fake_proc 106 ssh 1 S ssh -fN -L 9000:127.0.0.1:9000 host
fake_proc 107 ssh-agent 1 S ssh-agent -N
fake_proc 108 ssh 1 S ssh host
fake_proc $$ ssh 1 S ssh -N host

echo "== what the sweep takes =="
picks "an app forward orphaned to init" 100 100
picks "a forward whose parent is gone" 104 104
picks "a forward whose parent is a zombie" 105 105

echo "== what it leaves =="
picks "a forward a live daemon still owns (an SSH project's service)" "" 101
picks "an ssh typed into a service pane" "" 102
picks "a ControlPersist master" "" 103
picks "a -N merged into other flags is not the app's" "" 106
picks "another program whose name starts with ssh" "" 107
picks "an orphaned ssh that is not a forward" "" 108
picks "the sweep itself" "" $$
picks "a pid that has already exited" "" 999
picks "a pid outside the list, however orphaned" ""

echo "== a whole cgroup =="
picks "only the orphans, in order" "100 104 105" 500 501 100 101 102 103 104 105 106 107 108 999 $$

rm -rf "$ROOT"
echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
