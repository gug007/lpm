#!/bin/sh
# Remove the lpm host install from this machine.
#
# Undoes exactly what install.sh did — the units (or, on a machine with no
# service manager, the supervisor), the binaries, the PATH symlinks and the
# environment file — and nothing else. Your projects, repos and anything else on
# the box are untouched.
#
#     sudo ./uninstall.sh            # remove the install, keep ~/.lpm
#     sudo ./uninstall.sh --purge    # also delete the service account's ~/.lpm
#
# `~/.lpm` is data, not installation: project configuration, session memory, and
# this machine's pairing identity live there. Keeping it by default means a
# reinstall picks up where this left off, and means an accidental removal costs
# minutes rather than everything. --purge is the deliberate other choice.
#
# Also runnable straight off a pipe, which is how the Mac's "Remove lpm from this
# host" runs it — the machine you most want to be able to clean up is the one
# running a build too old to have this file:
#
#     ssh host 'sudo -n -H sh -s -- --purge' < uninstall.sh
set -eu

PREFIX=/opt/lpm
UNIT_DIR=/etc/systemd/system
ENV_DIR=/etc/lpm
ENV_FILE=$ENV_DIR/host.env
NEEDRESTART_CONF=/etc/needrestart/conf.d/lpm.conf
UNITS="lpm.service lpm-wm.service lpm-xvfb.service"
PROC=/proc
PURGE=0

usage() {
    cat <<EOF
Usage: sudo ./uninstall.sh [--purge]

  --purge   Also delete the service account's ~/.lpm (project config, session
            memory, this machine's pairing identity). Not reversible.
EOF
}

for arg in "$@"; do
    case "$arg" in
        --purge) PURGE=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "unknown option: $arg" >&2; usage >&2; exit 2 ;;
    esac
done

[ "$(id -u)" = "0" ] || { echo "uninstall.sh needs root (try: sudo ./uninstall.sh)" >&2; exit 1; }

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    SUPERVISOR=systemd
else
    SUPERVISOR=container
fi

# The account the app runs as — root, unless a drop-in gave the unit User= and
# HOME= — and so whose sessions, skills and ~/.lpm are lpm's to remove. The same
# resolution as install.sh's, repeated because this also runs straight off a
# pipe; tests/install-test.sh holds both copies to the same answers. Sets
# SERVICE_USER, SERVICE_HOME and SERVICE_LPM_DIR.
resolve_service_account() {
    SERVICE_USER=
    SERVICE_HOME=
    SERVICE_LPM_DIR=
    if [ "$SUPERVISOR" = "systemd" ]; then
        running_account || configured_account
    else
        SERVICE_HOME=$(env_file_value LPM_HOME)
        SERVICE_LPM_DIR=$(env_file_value LPM_DIR)
    fi
    case "${SERVICE_USER:-0}" in
        0 | root) SERVICE_USER=root ;;
        *)
            name=$(getent passwd "$SERVICE_USER" 2>/dev/null | cut -d: -f1)
            [ -z "$name" ] || SERVICE_USER=$name
            [ -n "$SERVICE_HOME" ] || SERVICE_HOME=$(getent passwd "$SERVICE_USER" 2>/dev/null | cut -d: -f6)
            ;;
    esac
    [ -n "$SERVICE_HOME" ] || SERVICE_HOME=/root
    case "$SERVICE_LPM_DIR" in
        "~/"*) SERVICE_LPM_DIR=$SERVICE_HOME/${SERVICE_LPM_DIR#"~/"} ;;
    esac
}

running_account() {
    pid=$(systemctl show -p MainPID --value lpm.service 2>/dev/null) || return 1
    case "$pid" in
        '' | 0 | *[!0-9]*) return 1 ;;
    esac
    environ=$( { tr '\0' '\n' < "$PROC/$pid/environ"; } 2>/dev/null) || return 1
    SERVICE_HOME=$(printf '%s\n' "$environ" | last_value HOME)
    [ -n "$SERVICE_HOME" ] || return 1
    SERVICE_LPM_DIR=$(printf '%s\n' "$environ" | last_value LPM_DIR)
    SERVICE_USER=$(sed -n 's/^Uid:[[:space:]]*\([0-9]*\).*/\1/p' "$PROC/$pid/status" 2>/dev/null) || return 1
}

configured_account() {
    SERVICE_USER=$(systemctl show -p User --value lpm.service 2>/dev/null) || SERVICE_USER=
    unit_env=$(systemctl show -p Environment --value lpm.service 2>/dev/null | tr ' ' '\n')
    SERVICE_HOME=$(printf '%s\n' "$unit_env" | last_value HOME)
    SERVICE_LPM_DIR=$(printf '%s\n' "$unit_env" | last_value LPM_DIR)
    value=$(env_file_value HOME)
    [ -z "$value" ] || SERVICE_HOME=$value
    value=$(env_file_value LPM_DIR)
    [ -z "$value" ] || SERVICE_LPM_DIR=$value
}

last_value() {
    sed -n "s/^[[:space:]]*$1=//p" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

env_file_value() {
    [ -r "$ENV_FILE" ] || return 0
    last_value "$1" < "$ENV_FILE"
}

as_service_account() {
    if [ "$SERVICE_USER" != root ] && command -v runuser >/dev/null 2>&1; then
        runuser -u "$SERVICE_USER" -- env HOME="$SERVICE_HOME" LPM_DIR="$SERVICE_LPM_DIR" "$@"
    else
        HOME="$SERVICE_HOME" LPM_DIR="$SERVICE_LPM_DIR" "$@"
    fi
}

# Before anything is stopped: once the app is down there is no running process
# left to ask, and the env file is about to go too.
resolve_service_account
DATA_DIR=${SERVICE_LPM_DIR:-$SERVICE_HOME/.lpm}

# Every step below tolerates its half being absent. This runs on machines in
# every state — a clean install, a half-finished one, one already uninstalled —
# and a removal that fails partway because something was already gone is a
# machine nobody can clean up.

if command -v systemctl >/dev/null 2>&1; then
    echo "==> Stopping lpm"
    for unit in $UNITS; do
        systemctl stop "$unit" >/dev/null 2>&1 || true
        systemctl disable "$unit" >/dev/null 2>&1 || true
    done
fi

# A container install has no units: the display, the window manager and the app
# run under a supervisor instead. Its own stop is the precise way to end them, so
# try that first.
if [ -x "$PREFIX/hostctl.sh" ]; then
    echo "==> Stopping lpm"
    LPM_HOME="$SERVICE_HOME" "$PREFIX/hostctl.sh" stop >/dev/null 2>&1 || true
elif command -v ps >/dev/null 2>&1; then
    # The supervisor without the script that knows how to stop it — someone
    # deleted /opt/lpm by hand and is now running this to finish the job. Left
    # alone it holds a webview and an X server open forever, with nothing on the
    # machine left to find it by. The command line has to still be the
    # supervisor: a pid file outlives its process and pids are reused.
    for pid_file in /run/lpm/host.pid "$SERVICE_HOME/.lpm/host.pid"; do
        [ -r "$pid_file" ] || continue
        pid=$(sed -n 1p "$pid_file" 2>/dev/null)
        case "$pid" in
            '' | *[!0-9]*) continue ;;
        esac
        case "$(ps -o args= -p "$pid" 2>/dev/null)" in
            *hostctl*supervise*) kill -TERM "$pid" 2>/dev/null || true ;;
        esac
        rm -f "$pid_file"
    done
fi

# The app is deliberately not the parent of the work it starts: services live in
# lpm's session daemon and scheduled job agents `setsid` away, both of which
# survive the unit stopping (KillMode=process, so a restart doesn't end them).
# That is right for a restart and wrong for a removal — it would leave dev
# servers and agents running on a machine with nothing left to manage them, and
# no UI to find them from.
#
# The binary about to be removed is what ends its own work: --stop-sessions
# reaches the daemon, tears every session down, waits for the processes, and
# retires it. Scoped to the service account, so a session belonging to someone
# else on this machine is not lpm's to end.
if [ -x "$PREFIX/lpm-desktop" ]; then
    echo "==> Stopping services and agents"
    as_service_account "$PREFIX/lpm-desktop" --stop-sessions >/dev/null 2>&1 || true
fi

echo "==> Removing units and binaries"
for unit in $UNITS; do
    rm -f "$UNIT_DIR/$unit"
done
command -v systemctl >/dev/null 2>&1 && systemctl daemon-reload >/dev/null 2>&1 || true

# Only our own symlinks: /usr/local/bin/lpm may be someone else's binary on a
# machine where the install never finished, and removing that is not ours to do.
# lpm-host is the container install's half of the same pair.
for link in lpm:lpm lpm-host:hostctl.sh; do
    name=${link%%:*}
    target=$PREFIX/${link#*:}
    if [ -L "/usr/local/bin/$name" ] && [ "$(readlink "/usr/local/bin/$name")" = "$target" ]; then
        rm -f "/usr/local/bin/$name"
    fi
done
rm -rf "$PREFIX"
rm -f "$ENV_FILE"
rmdir "$ENV_DIR" 2>/dev/null || true
# The installer's needrestart exclusion. Its directories go only where the
# installer created them: on a machine with needrestart they are needrestart's.
rm -f "$NEEDRESTART_CONF" "$NEEDRESTART_CONF.new"
if [ ! -e /etc/needrestart/needrestart.conf ]; then
    rmdir "$(dirname "$NEEDRESTART_CONF")" /etc/needrestart 2>/dev/null || true
fi

# The agent skills the app writes into the service account's skill directories on
# every start. Named directories, removed one by one: these directories are shared
# with every other skill on the machine, and none of those are ours to delete.
# The Mac's own uninstall takes the same set the same way.
echo "==> Removing agent skills"
for skills_dir in "$SERVICE_HOME/.claude/skills" "$SERVICE_HOME/.agents/skills"; do
    for skill in lpm lpm-cli lpm-config lpm-memory; do
        rm -rf "$skills_dir/$skill"
    done
done

if [ "$PURGE" = "1" ]; then
    echo "==> Deleting $SERVICE_HOME/.lpm"
    rm -rf "$SERVICE_HOME/.lpm"
    # A moved data directory is named, never deleted: LPM_DIR can point anywhere,
    # and this can't tell a directory of lpm's from one it merely shares.
    if [ -n "$SERVICE_LPM_DIR" ]; then
        echo "    note: left LPM_DIR=$SERVICE_LPM_DIR in place; delete it yourself if it only holds lpm's data" >&2
    fi
else
    echo
    echo "Kept $DATA_DIR — project config, session memory and this machine's"
    echo "pairing identity. Delete it with: sudo rm -rf $DATA_DIR"
fi

echo
echo "lpm has been removed from this machine."
