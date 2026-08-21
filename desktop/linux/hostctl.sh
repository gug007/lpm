#!/bin/sh
# Run lpm on a machine with no service manager.
#
# The supported host is a systemd box, where the stack is three units —
# lpm-xvfb, lpm-wm, lpm — and this file is never installed. A container is the
# other common shape: a rented GPU box, a dev sandbox, anything whose PID 1 is a
# shell. There is nothing there to install a unit into, so this is the same
# stack expressed as one supervised process tree.
#
#     lpm-host start|stop|restart|status
#
# It brings up the virtual display, the window manager and the app, restarts the
# app if it dies, and on stop takes down exactly its own three processes.
# Services and scheduled job agents survive: lpm's session daemon forks into its
# own session and job agents `setsid` away, so neither is in this process group.
# That is the same lifetime split KillMode=process gives the unit.
#
# What it deliberately does NOT do is survive the container. Nothing here runs
# at boot, because a container has no boot — if it restarts, this has to run
# again, from the image's entrypoint if you want that to be automatic.
#
# Every knob below can be overridden from the environment or from
# /etc/lpm/host.env, which is read before anything starts.
set -u

# Read first, so that everything below can be set from it. A service manager
# hands a service almost no environment and a container entrypoint hands this
# script no more, so the file the installer wrote is where $SHELL and anything
# else this machine needs comes from. `set -a` because the app reads them as
# environment, and a plain `.` would leave them as this shell's variables.
#
# Before the settings below rather than inside `supervise`, and that ordering is
# load-bearing: `stop` has to work out the same pid file path that the running
# supervisor wrote, and it can only do that if both read the same file.
ENV_FILE=${LPM_ENV_FILE:-/etc/lpm/host.env}
if [ -r "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
fi

PREFIX=${LPM_PREFIX:-/opt/lpm}
# Matches the systemd unit's %h and uninstall.sh's SERVICE_HOME: for the *system*
# manager that specifier is literally /root, so a container install that used a
# different home would put ~/.lpm somewhere the other paths don't look.
SERVICE_HOME=${LPM_HOME:-/root}
DISPLAY_NUM=${LPM_DISPLAY:-99}
# How far above that to look when the configured display turns out to be taken.
# Seventeen X servers on one machine is not a busy host, it is a wrong
# LPM_DISPLAY, and saying so beats hunting up to :99999.
DISPLAY_SCAN=16
APP=${LPM_APP:-$PREFIX/lpm-desktop}
XVFB=${LPM_XVFB:-Xvfb}
WM=${LPM_WM:-matchbox-window-manager}
SCREEN=${LPM_SCREEN:-1400x900x24}
# The unit's RestartSec, and its Restart=on-failure: a clean exit is the app
# being told to quit, and restarting that would make the host unstoppable.
RESTART_SEC=${LPM_RESTART_SEC:-5}
STOP_WAIT=${LPM_STOP_WAIT:-20}
LOG_MAX=${LPM_LOG_MAX:-10485760}

SELF=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")

usage() {
    cat <<EOF
Usage: lpm-host start|stop|restart|status

  start     Bring up the display, the window manager and lpm, detached.
  stop      Stop those three. Services and agents keep running.
  restart   Both, in that order.
  status    Whether lpm is running here, and where its log is.
EOF
}

# First writable candidate wins. /run is a tmpfs that a container restart wipes,
# which is exactly right for a pid file — a stale one from a previous life of
# this container would otherwise name a pid that now belongs to somebody else.
pick_dir() {
    for d in "$@"; do
        mkdir -p "$d" 2>/dev/null || continue
        [ -w "$d" ] || continue
        printf '%s\n' "$d"
        return 0
    done
    return 1
}

RUN_DIR=$(pick_dir "${LPM_RUN_DIR:-/run/lpm}" "$SERVICE_HOME/.lpm" /tmp) || {
    echo "nowhere writable to keep lpm's pid file" >&2
    exit 1
}
PID_FILE=$RUN_DIR/host.pid
LOG_DIR=$(pick_dir "${LPM_LOG_DIR:-$SERVICE_HOME/.lpm/logs}" /tmp) || {
    echo "nowhere writable to keep lpm's log" >&2
    exit 1
}
LOG=$LOG_DIR/host.log

# /proc where there is one, ps where there isn't. Both answers are the process's
# argv, which is what the pid file is checked against.
proc_args() {
    if [ -r "/proc/$1/cmdline" ]; then
        tr '\0' ' ' < "/proc/$1/cmdline" 2>/dev/null
    else
        ps -o args= -p "$1" 2>/dev/null
    fi
}

alive() { kill -0 "$1" 2>/dev/null; }

# The pid file records the supervisor's own argv alongside its pid, and nothing
# is signalled unless the process still matches it. A pid file outlives the
# process it named, pids get reused, and `kill` on a number read from a file is
# how a cleanup script ends up stopping a stranger's database.
read_pid() {
    [ -r "$PID_FILE" ] || return 1
    PID=$(sed -n 1p "$PID_FILE" 2>/dev/null)
    SIG=$(sed -n 2p "$PID_FILE" 2>/dev/null)
    case "$PID" in
        '' | *[!0-9]*) return 1 ;;
    esac
    alive "$PID" || return 1
    [ -n "$SIG" ] || return 0
    case "$(proc_args "$PID")" in
        "$SIG"*) return 0 ;;
    esac
    return 1
}

pgid_of() { ps -o pgid= -p "$1" 2>/dev/null | tr -d ' '; }

# A path is matched whole, never by its last component: $APP is an absolute path,
# and matching lpm-desktop by name alone would reach every other copy on the
# machine — including, when this file's tests run on a developer's Mac, the lpm
# they are running them from. Only a bare program name (Xvfb) is matched by name,
# because a name is all argv[0] carries when PATH is what resolved it.
same_prog() {
    [ "$1" = "$2" ] && return 0
    case "$2" in */*) return 1 ;; esac
    [ "${1##*/}" = "$2" ]
}

# Every pid running this program, optionally narrowed to one whose argv also
# carries a given word. For an X server that word is the display it serves, and
# it is the only thing that makes signalling one of them safe: an Xvfb on :98 is
# somebody else's and stays up.
#
# A program is recognised at argv[0], or at argv[1] where argv[0] is the
# interpreter of a #! script. Those two positions and no others — a program
# merely named on somebody else's command line (`grep lpm-desktop`) is not that
# program, and everything this returns is about to be signalled.
prog_pids() {
    want=$1
    arg=${2:-}
    ps -eo pid=,args= 2>/dev/null | while read -r p a b rest; do
        [ "$p" = "$$" ] && continue
        match=
        if same_prog "$a" "$want"; then
            match=1
        else
            case "${a##*/}" in
                *sh) same_prog "$b" "$want" && match=1 ;;
            esac
        fi
        [ -n "$match" ] || continue
        if [ -n "$arg" ]; then
            case " $b $rest " in
                *" $arg "*) ;;
                *) continue ;;
            esac
        fi
        printf '%s ' "$p"
    done
}

# TERM, then KILL after a grace period. Returns as soon as the process is gone.
stop_pid() {
    p=$1
    grace=$2
    [ -n "$p" ] || return 0
    alive "$p" || return 0
    kill -TERM "$p" 2>/dev/null
    i=0
    while [ "$i" -lt $((grace * 10)) ]; do
        alive "$p" || break
        sleep 0.1
        i=$((i + 1))
    done
    alive "$p" && kill -KILL "$p" 2>/dev/null
    # Reap it. These are the supervisor's own children, and a crash loop that
    # never collects them leaves two zombies per restart on a process that is
    # expected to run for months. Returns at once — it is already dead.
    wait "$p" 2>/dev/null
    return 0
}

display_up() {
    d=${1:-$DISPLAY_NUM}
    if command -v xdpyinfo >/dev/null 2>&1; then
        xdpyinfo -display ":$d" >/dev/null 2>&1
    else
        [ -S "/tmp/.X11-unix/X$d" ]
    fi
}

# The first display above the configured one that nothing answers on.
free_display() {
    n=$((DISPLAY_NUM + 1))
    last=$((DISPLAY_NUM + DISPLAY_SCAN))
    while [ "$n" -le "$last" ]; do
        display_up "$n" || { printf '%s\n' "$n"; return 0; }
        n=$((n + 1))
    done
    return 1
}

# An lpm running here that this supervisor does not own. A supervisor killed
# outright — OOM, `kill -9`, a container losing its PID 1 — leaves the app, the
# window manager and the display running with nothing left on the machine naming
# them, and so does a stack somebody brought up by hand. Every later start then
# found the display taken and gave up, which made the host impossible to update
# from the Mac: the installer's `restart` stops what the pid file names, and the
# pid file named nothing.
#
# Stopped rather than worked around: a second app against the same ~/.lpm is a
# worse failure than the one being fixed. Only reached once read_pid has said
# nothing of ours is alive, and only the app's own path and this host's display
# number are matched — an X server on another display is not ours to end. The
# window manager would exit with the display anyway; it goes explicitly so that
# it doesn't depend on that.
reclaim_orphans() {
    orphans=$(prog_pids "$APP")
    [ -n "$orphans" ] || return 1
    for p in $orphans; do stop_pid "$p" 10; done
    for p in $(prog_pids "$WM"); do stop_pid "$p" 5; done
    for p in $(prog_pids "$XVFB" ":$DISPLAY_NUM"); do stop_pid "$p" 5; done
    return 0
}

# ---------------------------------------------------------------- supervise --
#
# The long-running half. Runs in the foreground of a detached process that
# `start` spawns; everything it writes is already going to the log.

XVFB_PID=
WM_PID=
APP_PID=
DISPLAY_NOTED=

# The app's own `ssh -N` forwards are spawned with null stdio, so nothing ever
# ends them on a broken pipe and there is no SIGTERM handler in the app to reap
# them. Under systemd a cgroup sweep does this; here the process group is the
# same boundary and needs no cgroup v2 — the session daemon and the job agents
# left this group when they forked away and setsid'd, so they are not touched.
sweep_forwards() {
    mine=$(pgid_of $$)
    [ -n "$mine" ] || return 0
    # Only when this process leads its own group, which is what setsid gave it.
    # Fall back to nohup — an image with no util-linux — and the group is the
    # shell that ran the install, i.e. very often an SSH session whose own `ssh`
    # would be in it. Sweeping there would cut the connection doing the work.
    [ "$mine" = "$$" ] || return 0
    ps -eo pid=,pgid=,comm= 2>/dev/null | while read -r p g c; do
        [ "$g" = "$mine" ] || continue
        [ "$p" = "$$" ] && continue
        [ "$c" = ssh ] || continue
        kill -TERM "$p" 2>/dev/null
    done
    return 0
}

# The app first: it draws into the display, so taking the display first turns an
# orderly shutdown into a crash the app might well log as one.
teardown() {
    stop_pid "${APP_PID:-}" 10
    stop_pid "${WM_PID:-}" 5
    stop_pid "${XVFB_PID:-}" 5
    APP_PID=
    WM_PID=
    XVFB_PID=
}

on_term() {
    echo "[hostctl] stopping"
    teardown
    sweep_forwards
    rm -f "$PID_FILE"
    exit 0
}

start_display() {
    if display_up; then
        # Not ours: reclaim_orphans took down anything of lpm's before this ran.
        # An image that runs its own X server on :99 is a real shape — a
        # browser-automation base, a sandbox sharing /tmp/.X11-unix — and
        # refusing to start there left a host nobody could update from the Mac,
        # with the only advice ("set LPM_DISPLAY") not something the Mac can act
        # on. So move: which display this host draws into is an implementation
        # detail of this host, and nothing outside it depends on the number.
        moved=$(free_display) || {
            echo "[hostctl] :$DISPLAY_NUM and the $DISPLAY_SCAN displays above it are all in use — set LPM_DISPLAY to a free number" >&2
            return 1
        }
        echo "[hostctl] display :$DISPLAY_NUM belongs to something else — using :$moved"
        DISPLAY_NUM=$moved
        export DISPLAY=":$DISPLAY_NUM"
    fi
    # An X server killed outright leaves its lock file behind, and the next start
    # then refuses the display nothing is actually using. Only removed once the
    # check above has established that no server is answering on it.
    rm -f "/tmp/.X$DISPLAY_NUM-lock" 2>/dev/null
    "$XVFB" ":$DISPLAY_NUM" -screen 0 "$SCREEN" -nolisten tcp &
    XVFB_PID=$!
    i=0
    while [ "$i" -lt 50 ]; do
        display_up && return 0
        alive "$XVFB_PID" || {
            echo "[hostctl] the virtual display exited immediately — is $XVFB installed?" >&2
            return 1
        }
        sleep 0.2
        i=$((i + 1))
    done
    echo "[hostctl] the virtual display never came up" >&2
    return 1
}

# Not optional and not obvious: with a bare X server and no window manager the
# app's window is created 10x10 and never mapped, so its page never runs. The app
# looks perfectly healthy from the outside — this only shows up in a screenshot.
start_wm() {
    "$WM" -use_titlebar no &
    WM_PID=$!
    sleep 0.5
    alive "$WM_PID" || {
        echo "[hostctl] the window manager exited immediately — is $WM installed?" >&2
        return 1
    }
    return 0
}

supervise() {
    trap on_term TERM INT HUP

    printf '%s\n%s\n' "$$" "$(proc_args $$)" > "$PID_FILE"

    # After the pid file, deliberately: this can take the app's full stop grace,
    # and `start` is watching for that file to decide whether anything is
    # happening at all.
    if reclaim_orphans; then
        echo "[hostctl] stopped an lpm that was running here unsupervised"
    fi

    # host.env was read at the top of this script, so everything it set is
    # already exported and already visible to the settings above.
    export HOME="$SERVICE_HOME"
    export DISPLAY=":$DISPLAY_NUM"
    # Defaults, not overrides: an operator who set any of these in host.env meant
    # it. Every one of them is about a machine with no GPU and no session bus,
    # which is every container this runs in.
    #
    # The DMABUF renderer and compositing path assume a real driver; under
    # llvmpipe they range from wasteful to a blank window that logs nothing. The
    # accessibility bridge is worse — with no session bus it blocks on a D-Bus
    # connection that will never be answered, before the page ever runs.
    : "${WEBKIT_DISABLE_DMABUF_RENDERER:=1}"
    : "${WEBKIT_DISABLE_COMPOSITING_MODE:=1}"
    : "${LIBGL_ALWAYS_SOFTWARE:=1}"
    : "${GDK_BACKEND:=x11}"
    : "${NO_AT_BRIDGE:=1}"
    : "${GTK_A11Y:=none}"
    export WEBKIT_DISABLE_DMABUF_RENDERER WEBKIT_DISABLE_COMPOSITING_MODE
    export LIBGL_ALWAYS_SOFTWARE GDK_BACKEND NO_AT_BRIDGE GTK_A11Y

    # The unit's WorkingDirectory=%h. An image whose root account has no home
    # directory is a real thing, and the app keeps everything it owns under it.
    mkdir -p "$HOME" 2>/dev/null || true
    cd "$HOME" 2>/dev/null || cd / || return 1

    while :; do
        if ! start_display || ! start_wm; then
            teardown
            rm -f "$PID_FILE"
            return 1
        fi
        # Recorded here rather than with the pid above, because it is not always
        # the display that was configured. Appended, never rewritten: nothing
        # added to this file can then leave it momentarily not naming its pid.
        [ -n "$DISPLAY_NOTED" ] || {
            printf 'display=:%s\n' "$DISPLAY_NUM" >> "$PID_FILE"
            DISPLAY_NOTED=1
        }
        echo "[hostctl] starting $APP on :$DISPLAY_NUM"
        # Backgrounded and waited on rather than run in the foreground: a POSIX
        # shell runs a trap only once the current foreground command finishes, so
        # a foreground app would swallow every stop signal until it exited on its
        # own. `wait` is the one place signals are delivered promptly.
        "$APP" &
        APP_PID=$!
        wait "$APP_PID"
        rc=$?
        APP_PID=
        teardown
        if [ "$rc" -eq 0 ]; then
            echo "[hostctl] lpm exited cleanly; not restarting"
            rm -f "$PID_FILE"
            return 0
        fi
        echo "[hostctl] lpm exited with status $rc; restarting in ${RESTART_SEC}s"
        sleep "$RESTART_SEC"
    done
}

# --------------------------------------------------------------- start/stop --

rotate_log() {
    [ -f "$LOG" ] || return 0
    size=$(wc -c < "$LOG" 2>/dev/null | tr -d ' ')
    case "$size" in
        '' | *[!0-9]*) return 0 ;;
    esac
    # A container that runs for months with a crash-looping app would otherwise
    # fill its disk with the same message.
    [ "$size" -gt "$LOG_MAX" ] && mv -f "$LOG" "$LOG.1"
    return 0
}

do_start() {
    if read_pid; then
        echo "lpm is already running here (pid $PID)."
        return 0
    fi
    rm -f "$PID_FILE"
    [ -x "$APP" ] || {
        echo "$APP is not there — was the install interrupted?" >&2
        return 1
    }
    rotate_log
    # setsid where it exists, so the supervisor survives the shell that started it
    # — an install over SSH is exactly a shell that is about to go away. Without
    # it, nohup still detaches from the terminal, which covers the container
    # images that ship no util-linux. The supervisor writes its own pid file
    # either way, so nothing here depends on which of the two ran.
    if command -v setsid >/dev/null 2>&1; then
        setsid "$SELF" supervise >>"$LOG" 2>&1 </dev/null &
    else
        nohup "$SELF" supervise >>"$LOG" 2>&1 </dev/null &
    fi
    i=0
    while [ "$i" -lt 100 ]; do
        if read_pid; then
            # The pid file is written before the display comes up, so that a
            # stop can still reach a supervisor stuck starting. That makes its
            # appearance too weak to report success on: a display already in use
            # ends the supervisor a moment later, and the installer would go on
            # to wait 90 seconds for an app that was never going to run. Give it
            # long enough to fail, and read the log if it did.
            sleep 0.5
            if read_pid; then
                echo "lpm is starting here (pid $PID). Log: $LOG"
                return 0
            fi
            break
        fi
        sleep 0.1
        i=$((i + 1))
    done
    echo "lpm did not start. The last lines of $LOG:" >&2
    tail -n 20 "$LOG" >&2 2>/dev/null
    return 1
}

do_stop() {
    if ! read_pid; then
        rm -f "$PID_FILE"
        # Which is not the same as nothing running: a supervisor killed outright
        # leaves its stack up with nothing naming it, and answering "not running"
        # to a machine where lpm is plainly running is exactly how a host ends up
        # impossible to update — the installer runs this before every start.
        if reclaim_orphans; then
            echo "lpm was running here unsupervised; stopped it."
            return 0
        fi
        echo "lpm is not running here."
        return 0
    fi
    pid=$PID
    kill -TERM "$pid" 2>/dev/null
    i=0
    while [ "$i" -lt $((STOP_WAIT * 10)) ]; do
        alive "$pid" || break
        sleep 0.1
        i=$((i + 1))
    done
    if alive "$pid"; then
        # The supervisor's own handler is the precise way to do this, so this
        # only runs when it never got there. Its group holds the display, the
        # window manager and the app; the session daemon and the job agents left
        # it when they forked away. Only if it leads that group, though — started
        # without setsid it shares the group of whoever ran the install, and
        # killing that group ends the shell asking for the stop, along with the
        # SSH session it very likely arrived on.
        g=$(pgid_of "$pid")
        if [ -n "$g" ] && [ "$g" = "$pid" ]; then
            kill -KILL "-$g" 2>/dev/null
        else
            kill -KILL "$pid" 2>/dev/null
        fi
    fi
    rm -f "$PID_FILE"
    echo "lpm stopped here. Services and agents on this machine keep running."
    return 0
}

do_status() {
    if read_pid; then
        # What the supervisor settled on, which is not always what is configured:
        # a display that was taken at start time moves the whole stack, and a
        # status line naming the other one sends people to look at the wrong X
        # server.
        d=$(sed -n 's/^display=//p' "$PID_FILE" 2>/dev/null | sed -n 1p)
        [ -n "$d" ] || d=":$DISPLAY_NUM"
        echo "lpm is running here (pid $PID, display $d)."
        echo "Log: $LOG"
        return 0
    fi
    echo "lpm is not running here."
    echo "Log: $LOG"
    return 3
}

case "${1:-}" in
    start) do_start ;;
    stop) do_stop ;;
    restart)
        do_stop || true
        do_start
        ;;
    status) do_status ;;
    supervise) supervise ;;
    -h | --help | help) usage ;;
    '')
        usage >&2
        exit 2
        ;;
    *)
        echo "unknown command: $1" >&2
        usage >&2
        exit 2
        ;;
esac
