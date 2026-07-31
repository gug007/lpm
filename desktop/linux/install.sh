#!/bin/sh
# Install lpm as a headless host on this machine.
#
# Run from an unpacked release tarball:
#     tar xzf lpm-host-linux-amd64.tar.gz && cd lpm-host && sudo ./install.sh
#
# Afterwards, `lpm pair` prints an invite to paste into Settings → Connections on
# the Mac that will drive this machine.
set -eu

# tmux and git are not optional extras: every service on a host runs as a tmux
# pane, and the app refuses to render at all without tmux on PATH — leaving them
# out made a host that installed cleanly and then started nothing. iproute2 is
# softer: it provides `ss`, which the app's port detection prefers before falling
# back to lsof.
DEPS="xvfb matchbox-window-manager x11-utils libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1 tmux git iproute2"
PREFIX=/opt/lpm
UNIT_DIR=/etc/systemd/system
ENV_FILE=/etc/lpm/host.env
SKIP_DEPS=0

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

[ "$(id -u)" = "0" ] || { echo "install.sh needs root (try: sudo ./install.sh)" >&2; exit 1; }

SRC=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
[ -f "$SRC/lpm-desktop" ] || { echo "lpm-desktop not found next to install.sh" >&2; exit 1; }

# Both checks below run BEFORE apt. Either one failing later means a machine that
# spent minutes fetching a 300MB desktop runtime for an app that was never going
# to start on it, and an error that describes a symptom rather than the box.

# The unit files are the whole supervision model here, so a machine with no
# service manager to install them into cannot be set up this way. Check the
# manager, not just the binary: a container can carry the systemd package with
# nothing running, where every unit command fails with "System has not been
# booted with systemd". /run/systemd/system is the test everything else uses.
if ! command -v systemctl >/dev/null 2>&1 || [ ! -d /run/systemd/system ]; then
    echo "This machine isn't running systemd — a container, most likely (PID 1 is $(cat /proc/1/comm 2>/dev/null || echo unknown))." >&2
    echo "The host install supervises lpm with systemd units, so there is nothing here to install them into." >&2
    echo "Use a VM or a machine booted with systemd." >&2
    exit 1
fi

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

if [ "$SKIP_DEPS" = "0" ]; then
    command -v apt-get >/dev/null 2>&1 || {
        echo "This installer only knows apt. Install these yourself and re-run with --no-deps:" >&2
        echo "  $DEPS" >&2
        exit 1
    }
    echo "==> Installing runtime dependencies"
    # The app is a real desktop app drawing into a virtual display, so the GTK /
    # WebKit runtime is required even though nobody will ever look at it. The
    # window manager is required too: without one the window is created 10x10 and
    # never mapped, and the page never runs.
    apt-get update -qq
    # A machine with packages left half-configured by some earlier interrupted
    # run fails EVERY apt install until they are finished, with a dpkg error that
    # says nothing about lpm — so the installer looks like the broken thing. It
    # isn't ours to repair unattended (finishing it can answer conffile prompts on
    # the user's behalf), but it is ours to name.
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $DEPS >/dev/null || {
        echo "apt could not install the runtime dependencies." >&2
        echo "If the error above mentions dpkg, this machine has packages left half-configured" >&2
        echo "by an earlier interrupted install — every apt run fails until they are finished:" >&2
        echo "  sudo DEBIAN_FRONTEND=noninteractive dpkg --configure -a" >&2
        exit 1
    }
fi

# tmux is the one dependency whose absence is fatal rather than degrading: the app
# will not render a project at all without it. Check it even when the apt step was
# skipped, here, where a person can act on it — the alternative is a host that
# installs, starts, answers, pairs, and then does nothing.
command -v tmux >/dev/null 2>&1 || {
    echo "tmux is required and isn't installed (services on a host are tmux panes)." >&2
    echo "Install it and re-run:  sudo apt-get install -y tmux git" >&2
    exit 1
}

echo "==> Installing binaries into $PREFIX"
install -d "$PREFIX"
install -m755 "$SRC/lpm-desktop" "$PREFIX/lpm-desktop"
install -m755 "$SRC/lpm" "$PREFIX/lpm"
install -m755 "$SRC/host-cleanup.sh" "$PREFIX/host-cleanup.sh"
ln -sf "$PREFIX/lpm" /usr/local/bin/lpm

# systemd hands a service almost no environment: no login shell has run, so $SHELL
# is simply absent. Terminals are spawned from it, so record the account's real
# login shell now rather than letting the app guess at spawn time.
LOGIN_SHELL=$(getent passwd "$(id -un)" | cut -d: -f7)
# A hardened image can give root `nologin`, which is a real passwd entry that
# exits immediately — pinning it here would make every terminal on this host a
# silent no-op rather than an error anyone could read.
case "${LOGIN_SHELL##*/}" in
    ''|nologin|false) LOGIN_SHELL=/bin/sh ;;
esac
echo "==> Recording SHELL=$LOGIN_SHELL in $ENV_FILE"
install -d "$(dirname "$ENV_FILE")"
printf 'SHELL=%s\n' "$LOGIN_SHELL" > "$ENV_FILE"

echo "==> Installing systemd units"
install -m644 "$SRC/lpm-xvfb.service" "$SRC/lpm-wm.service" "$SRC/lpm.service" "$UNIT_DIR/"
systemctl daemon-reload
# lpm.service pulls in the display and window manager through Requires=, so this
# one enable brings up the whole stack, at boot too.
systemctl enable lpm.service >/dev/null 2>&1

# `enable --now` would NOT be enough: it starts a stopped service but leaves a
# running one alone, so re-running this to upgrade would put a new binary on disk
# while the old process kept serving. Restart unconditionally — we just replaced
# the executable, and the point of running the installer is to run what it
# installed.
if systemctl is-active --quiet lpm.service; then
    echo "==> Restarting lpm (this ends any agents running on this machine)"
else
    echo "==> Starting lpm"
fi
systemctl restart lpm.service

echo "==> Waiting for lpm to come up"
# Wait for the APP, not for the peer port. Hosting is off until someone runs
# `lpm pair`, so a healthy fresh install has nothing listening on 8766 yet — the
# old port poll spent 60s on a working machine and then called it a failure, and
# the Mac's "add a Linux host" flow turns that exit code into an error before it
# ever gets as far as asking for an invite. Answering on the control socket is
# the thing that actually means "the app started and its page is running".
#
# The unit's HOME is %h, which systemd resolves to /root for the *system* manager
# — literally, not by looking the account up — so hard-code the same thing rather
# than asking passwd and risking an answer the unit doesn't share. Not $HOME:
# under `sudo ./install.sh` that is still the invoking user's home.
SERVICE_HOME=/root

# A small box can take ~30s to get through Xvfb, the window manager and the
# webview; a slow start is not a failure.
i=0
while [ "$i" -lt 90 ]; do
    if HOME="$SERVICE_HOME" "$PREFIX/lpm" connections >/dev/null 2>&1; then
        echo
        echo "lpm is running on this machine."
        # `sudo -H`, not a bare `lpm pair`: the app's socket lives in root's home
        # and this installer was very likely run from a `ubuntu@`-style login, so
        # the unescalated command reports that the app isn't running.
        if HOME="$SERVICE_HOME" "$PREFIX/lpm" connections --json 2>/dev/null | grep -q '"running":true'; then
            echo "It is already hosting; run 'sudo -H lpm pair' for an invite to add another Mac."
        else
            echo
            echo "Next: run 'sudo -H lpm pair' here, then paste the invite into"
            echo "Settings → Connections on the Mac that will drive it."
        fi
        exit 0
    fi
    i=$((i + 1))
    sleep 1
done

echo "lpm was installed but never started. Check:" >&2
echo "  systemctl status lpm-xvfb lpm-wm lpm" >&2
echo "  journalctl -u lpm -n 50" >&2
exit 1
