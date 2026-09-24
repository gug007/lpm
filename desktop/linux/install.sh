#!/bin/sh
# Install lpm as a headless host on this machine.
#
# Run from an unpacked release tarball:
#     tar xzf lpm-host-linux-amd64.tar.gz && cd lpm-host && sudo ./install.sh
#
# Afterwards, `lpm pair` prints an invite to paste into Settings → Connections on
# the Mac that will drive this machine.
set -eu

# git is what the app shells out to for diffs and syncing. Services need nothing
# installed: they run in lpm's own session daemon, which is part of the
# lpm-desktop binary. iproute2 is softer still: it provides `ss`, which the app's
# port detection prefers before falling back to lsof.
DEPS="xvfb matchbox-window-manager x11-utils libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1 git iproute2"
PREFIX=/opt/lpm
UNIT_DIR=/etc/systemd/system
ENV_FILE=/etc/lpm/host.env
NEEDRESTART_CONF=/etc/needrestart/conf.d/lpm.conf
PROC=/proc
SKIP_DEPS=0
STEP=preflight
APT_LOG=

usage() {
    cat <<EOF
Usage: sudo ./install.sh [--no-deps]

  --no-deps   Don't touch apt; assume the runtime libraries are already present.
EOF
}

for arg in "$@"; do
    case "$arg" in
        --no-deps) SKIP_DEPS=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "unknown option: $arg" >&2; usage >&2; exit 2 ;;
    esac
done

# A failure names the step it happened in: an update that failed after the
# restart leaves a very different machine from one that stopped at preflight.
on_exit() {
    status=$?
    [ -z "$APT_LOG" ] || rm -f "$APT_LOG"
    [ "$status" = 0 ] || echo "install.sh failed during step '$STEP' (exit $status)" >&2
    exit "$status"
}
trap on_exit EXIT

[ "$(id -u)" = "0" ] || { echo "install.sh needs root (try: sudo ./install.sh)" >&2; exit 1; }

SRC=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
[ -f "$SRC/lpm-desktop" ] || { echo "lpm-desktop not found next to install.sh" >&2; exit 1; }

# What supervises lpm here. Units are the shape on a normal server; a container
# has no service manager to install them into, so there the same three processes
# run under hostctl.sh instead. Check the manager, not just the binary: a
# container can carry the systemd package with nothing running, where every unit
# command fails with "System has not been booted with systemd".
# /run/systemd/system is the test everything else uses.
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    SUPERVISOR=systemd
else
    SUPERVISOR=container
    echo "==> No service manager here (PID 1 is $(cat /proc/1/comm 2>/dev/null || echo unknown)) — installing lpm as a supervised process"
    # `ps` is how the supervisor recognises its own processes, and slim images
    # ship without it. Nothing else in this install needs it, so it is asked for
    # only where it might be missing.
    DEPS="$DEPS procps"
    # WebKit renders through shared memory, and Docker's default 64MB /dev/shm is
    # where that shows up as a webview that dies on the first real page rather
    # than as anything naming the limit. Not fatal — plenty of images raise it,
    # and the app may well fit — but it is the first thing to check afterwards.
    SHM_KB=$(df -Pk /dev/shm 2>/dev/null | awk 'NR==2{print $2}')
    case "$SHM_KB" in
        [0-9]*)
            if [ "$SHM_KB" -lt 262144 ]; then
                echo "    note: /dev/shm is $((SHM_KB / 1024))MB here. If the app starts and its window dies," >&2
                echo "    re-create this container with --shm-size=1g." >&2
            fi
            ;;
    esac
fi

# Runs BEFORE apt, deliberately: failing after it means a machine that spent
# minutes fetching a 300MB desktop runtime for an app that was never going to
# start on it, and an error that describes a symptom rather than the box.
#
# The app is an ordinary dynamically-linked binary, so the Ubuntu it was built on
# is the floor for the Ubuntu it runs on. Below that it installs perfectly and
# then dies on missing glibc symbols — which reads as a broken app rather than as
# the wrong machine. Keep in step with the build-linux runner in release.yml.
NEED_GLIBC=2.35
HAVE_GLIBC=$(ldd --version 2>/dev/null | head -1 | awk '{print $NF}')
case "$HAVE_GLIBC" in
    [0-9]*)
        if [ "$(printf '%s\n%s\n' "$NEED_GLIBC" "$HAVE_GLIBC" | sort -V | head -1)" != "$NEED_GLIBC" ]; then
            echo "This machine has glibc $HAVE_GLIBC; this build needs $NEED_GLIBC or newer (Ubuntu 22.04 and up)." >&2
            echo "On an older release the app installs and then fails to start with missing symbols." >&2
            exit 1
        fi
        ;;
esac

# The account the app runs as, and so where its ~/.lpm and control socket live.
# Sets SERVICE_USER, SERVICE_HOME and SERVICE_LPM_DIR (empty unless LPM_DIR moved
# the data). Not assumed to be root: the unit's %h is /root, but a drop-in can
# set User= and HOME=, and an installer that only looked in /root failed updates
# that had worked. Not $HOME either: under sudo that is the invoking user's.
resolve_service_account() {
    SERVICE_USER=
    SERVICE_HOME=
    SERVICE_LPM_DIR=
    if [ "$SUPERVISOR" = "systemd" ]; then
        running_account || configured_account
    else
        # hostctl.sh sources host.env over its caller's environment.
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

# The running app is the best witness. Its pid changes with every restart, so
# this is asked again each time rather than remembered.
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

# Nothing running: the unit's settings, in the order systemd applies them —
# Environment=, then the env file over it.
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

# The last KEY= line on stdin, unquoted: the last is the one that wins, in an
# Environment= list and in an env file alike.
last_value() {
    sed -n "s/^[[:space:]]*$1=//p" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

env_file_value() {
    [ -r "$ENV_FILE" ] || return 0
    last_value "$1" < "$ENV_FILE"
}

# As that account, not as root with its HOME, so nothing it touches in that
# ~/.lpm can end up owned by root.
as_service_account() {
    if [ "$SERVICE_USER" != root ] && command -v runuser >/dev/null 2>&1; then
        runuser -u "$SERVICE_USER" -- env HOME="$SERVICE_HOME" LPM_DIR="$SERVICE_LPM_DIR" "$@"
    else
        HOME="$SERVICE_HOME" LPM_DIR="$SERVICE_LPM_DIR" "$@"
    fi
}

resolve_service_account

STEP=deps
if [ "$SUPERVISOR" = "systemd" ]; then
    # needrestart, which apt runs after installs and unattended upgrades, restarts
    # lpm-xvfb when its libraries change, and PartOf= carries that up to the app,
    # ending every agent on the box. One assignment that adds a key, never the
    # whole hash: a syntax error in any conf.d file stops needrestart machine-wide.
    install -d "$(dirname "$NEEDRESTART_CONF")"
    cat > "$NEEDRESTART_CONF.new" <<'EOF'
# Written by lpm's installer; its uninstaller removes it.
$nrconf{override_rc}{qr(^lpm(-xvfb|-wm)?\.service$)} = 0;
EOF
    if command -v perl >/dev/null 2>&1 &&
        ! perl -e 'my %nrconf = (override_rc => {}); eval do { local $/; <STDIN> }; die $@ if $@' \
            < "$NEEDRESTART_CONF.new" >/dev/null 2>&1; then
        rm -f "$NEEDRESTART_CONF.new"
        echo "    note: could not exclude lpm from needrestart; an apt upgrade may restart it" >&2
    else
        chmod 644 "$NEEDRESTART_CONF.new"
        mv -f "$NEEDRESTART_CONF.new" "$NEEDRESTART_CONF"
    fi
fi

# The WebKitGTK the app links against has a floor too, and an older one — 22.04's
# release pocket has 2.36 — still counts as installed while the app, missing
# symbols, never starts. So it is handed to apt to bring up like a missing one.
NEED_WEBKIT=2.40

# Ubuntu 24.04 renamed several of these with a t64 suffix; apt resolves the old
# name, dpkg doesn't. With a minimum version, anything older counts as missing.
installed() {
    for name in "$1" "${1}t64"; do
        dpkg-query -W -f='${Status}' "$name" 2>/dev/null | grep -q 'install ok installed' || continue
        [ -n "${2:-}" ] || return 0
        dpkg --compare-versions "$(dpkg-query -W -f='${Version}' "$name" 2>/dev/null)" ge "$2" && return 0
    done
    return 1
}

# What apt still has to install, each name preceded by a space.
missing_deps() {
    for pkg in $DEPS; do
        case "$pkg" in
            libwebkit2gtk-*) floor=$NEED_WEBKIT ;;
            *) floor= ;;
        esac
        installed "$pkg" $floor || printf ' %s' "$pkg"
    done
}

if [ "$SKIP_DEPS" = "0" ]; then
    command -v apt-get >/dev/null 2>&1 || {
        echo "This installer only knows apt. Install these yourself and re-run with --no-deps:" >&2
        echo "  $DEPS" >&2
        exit 1
    }
    # The app is a real desktop app drawing into a virtual display, so the GTK /
    # WebKit runtime is required even though nobody will ever look at it. The
    # window manager is required too: without one the window is created 10x10 and
    # never mapped, and the page never runs. Only what is missing or too old is
    # installed, and nothing else here is upgraded: an lpm update is not the
    # moment to move this machine's libraries.
    MISSING=$(missing_deps)
    if [ -z "$MISSING" ]; then
        echo "==> Runtime dependencies are already installed"
    else
        echo "==> Installing runtime dependencies:$MISSING"
        # apt's output is shown only when it fails. A machine with packages left
        # half-configured by an earlier interrupted run fails EVERY apt install
        # until they are finished, with a dpkg error that says nothing about lpm.
        # It isn't ours to repair unattended (finishing it can answer conffile
        # prompts on the user's behalf), but it is ours to name.
        APT_LOG=$(mktemp)
        if ! {
            apt-get update -qq &&
                NEEDRESTART_SUSPEND=1 DEBIAN_FRONTEND=noninteractive \
                    apt-get install -y -qq $MISSING
        } > "$APT_LOG" 2>&1; then
            cat "$APT_LOG" >&2
            echo "apt could not install the runtime dependencies." >&2
            echo "If the error above mentions dpkg, this machine has packages left half-configured" >&2
            echo "by an earlier interrupted install — every apt run fails until they are finished:" >&2
            echo "  sudo DEBIAN_FRONTEND=noninteractive dpkg --configure -a" >&2
            exit 1
        fi
        rm -f "$APT_LOG"
        APT_LOG=
    fi
fi

STEP=binaries
echo "==> Installing binaries into $PREFIX"
install -d "$PREFIX"
install -m755 "$SRC/lpm-desktop" "$PREFIX/lpm-desktop"
install -m755 "$SRC/lpm" "$PREFIX/lpm"
ln -sf "$PREFIX/lpm" /usr/local/bin/lpm

STEP=env
# Neither a service manager nor a container entrypoint runs a login shell, so
# $SHELL is simply absent in both. Terminals are spawned from it, so record the
# service account's real login shell now rather than letting the app guess at
# spawn time — the service account's, not `id -un`'s, which is root under sudo.
#
# Tolerant of its own failure: a stripped image can be missing getent, and an
# installer that aborts over the *default* it was about to compute would refuse a
# machine that works. Empty falls through to the case below.
LOGIN_SHELL=$(getent passwd "$SERVICE_USER" 2>/dev/null | cut -d: -f7 || true)
# A hardened image can give root `nologin`, which is a real passwd entry that
# exits immediately — pinning it here would make every terminal on this host a
# silent no-op rather than an error anyone could read.
case "${LOGIN_SHELL##*/}" in
    ''|nologin|false) LOGIN_SHELL=/bin/sh ;;
esac
echo "==> Recording SHELL=$LOGIN_SHELL in $ENV_FILE"
install -d "$(dirname "$ENV_FILE")"
# Merged, not rewritten. This file is the machine's, not the installer's: the
# units and hostctl.sh read it for everything a particular host needs set, and
# truncating it here undid all of that on every upgrade — including the
# LPM_DISPLAY the supervisor's own "display in use" error asks for, which then
# survived exactly until the next update. The SHELL line is the one the installer
# owns, so that one is replaced: re-running the installer is how a login shell
# that was detected wrong gets fixed.
ENV_NEW=$ENV_FILE.new
if [ -f "$ENV_FILE" ]; then
    grep -v '^[[:space:]]*SHELL=' "$ENV_FILE" > "$ENV_NEW" || :
else
    : > "$ENV_NEW"
fi
printf 'SHELL=%s\n' "$LOGIN_SHELL" >> "$ENV_NEW"
chmod 644 "$ENV_NEW"
mv -f "$ENV_NEW" "$ENV_FILE"

STEP=units
if [ "$SUPERVISOR" = "systemd" ]; then
    echo "==> Installing systemd units"
    # The sweep the units call on the way down. Only meaningful here: it works
    # off this cgroup, and the supervisor a container gets instead does the same
    # job from its own process group.
    install -m755 "$SRC/host-cleanup.sh" "$PREFIX/host-cleanup.sh"
    install -m644 "$SRC/lpm-xvfb.service" "$SRC/lpm-wm.service" "$SRC/lpm.service" "$UNIT_DIR/"
    systemctl daemon-reload
    # lpm.service pulls in the display and window manager through Requires=, so
    # this one enable brings up the whole stack, at boot too.
    systemctl --quiet enable lpm.service || { echo "could not enable lpm.service" >&2; exit 1; }

    STEP=restart
    # `enable --now` would NOT be enough: it starts a stopped service but leaves
    # a running one alone, so re-running this to upgrade would put a new binary
    # on disk while the old process kept serving. Restart unconditionally — we
    # just replaced the executable, and the point of running the installer is to
    # run what it installed.
    if systemctl is-active --quiet lpm.service; then
        echo "==> Restarting lpm (running agents stop; Claude Code and Codex tabs resume their conversations from the Mac)"
    else
        echo "==> Starting lpm"
    fi
    systemctl restart lpm.service
else
    echo "==> Installing the supervisor"
    install -m755 "$SRC/hostctl.sh" "$PREFIX/hostctl.sh"
    ln -sf "$PREFIX/hostctl.sh" /usr/local/bin/lpm-host

    STEP=restart
    # Restart, not start, and for the same reason the unit is restarted above:
    # the executable under the running supervisor is the one we just replaced.
    echo "==> Starting lpm"
    LPM_HOME="$SERVICE_HOME" "$PREFIX/hostctl.sh" restart || {
        echo "lpm could not be started on this machine." >&2
        exit 1
    }
fi

STEP=wait
echo "==> Waiting for lpm to come up"
# Wait for the APP, not for the peer port. Hosting is off until someone runs
# `lpm pair`, so a healthy fresh install has nothing listening on 8766 yet — the
# old port poll spent 60s on a working machine and then called it a failure, and
# the Mac's "add a Linux host" flow turns that exit code into an error before it
# ever gets as far as asking for an invite. Answering on the control socket is
# the thing that actually means "the app started and its page is running".

# `lpm pair` has to run as the service account: its socket is in a directory
# only that account can traverse, and from any other login the CLI reports a
# running app as not running. SUDO_USER says who is actually logged in — and a
# container's root login, often without sudo, must not be told to use it.
pair_command() {
    if [ "$SERVICE_USER" = "${SUDO_USER:-root}" ]; then
        echo "lpm pair"
    elif [ "$SERVICE_USER" = root ]; then
        echo "sudo -H lpm pair"
    else
        echo "sudo -H -u $SERVICE_USER lpm pair"
    fi
}

# A small box can take ~30s to get through Xvfb, the window manager and the
# webview; a slow start is not a failure.
i=0
while [ "$i" -lt 90 ]; do
    resolve_service_account
    if as_service_account "$PREFIX/lpm" connections >/dev/null 2>&1; then
        PAIR_CMD=$(pair_command)
        echo
        echo "lpm is running on this machine."
        if as_service_account "$PREFIX/lpm" connections --json 2>/dev/null | grep -q '"running":true'; then
            echo "It is already hosting; run '$PAIR_CMD' for an invite to add another Mac."
        else
            echo
            echo "Next: run '$PAIR_CMD' here, then paste the invite into"
            echo "Settings → Connections on the Mac that will drive it."
        fi
        if [ "$SUPERVISOR" != "systemd" ]; then
            echo
            # Nothing on this machine will do this for us: there is no service
            # manager, and a container has no boot for one to hook into. Say so
            # here rather than letting it be discovered as a host that silently
            # stopped existing after a restart.
            echo "This machine has no service manager, so lpm won't come back by itself"
            echo "if the container restarts. Start it again with:  lpm-host start"
            echo "To make that automatic, run it from the image's entrypoint."
        fi
        exit 0
    fi
    i=$((i + 1))
    sleep 1
done

echo "lpm was installed but never answered as $SERVICE_USER in ${SERVICE_LPM_DIR:-$SERVICE_HOME/.lpm}. Check:" >&2
if [ "$SUPERVISOR" = "systemd" ]; then
    echo "  systemctl status lpm-xvfb lpm-wm lpm" >&2
    echo "  journalctl -u lpm -n 50" >&2
    journal=$(journalctl -u lpm -n 15 --no-pager -o cat 2>/dev/null) || journal=
    if [ -n "$journal" ]; then
        echo "Its last log lines:" >&2
        printf '%s\n' "$journal" | sed 's/^/  /' >&2
    fi
else
    echo "  lpm-host status" >&2
    echo "  tail -n 50 $SERVICE_HOME/.lpm/logs/host.log" >&2
fi
exit 1
