#!/bin/sh
# Install lpm as a headless host on this machine.
#
# Run from an unpacked release tarball:
#     tar xzf lpm-host-linux-amd64.tar.gz && cd lpm-host && sudo ./install.sh
#
# Afterwards, `lpm pair` prints an invite to paste into Settings → Connections on
# the Mac that will drive this machine.
set -eu

DEPS="xvfb matchbox-window-manager x11-utils libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1"
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
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $DEPS >/dev/null
fi

echo "==> Installing binaries into $PREFIX"
install -d "$PREFIX"
install -m755 "$SRC/lpm-desktop" "$PREFIX/lpm-desktop"
install -m755 "$SRC/lpm" "$PREFIX/lpm"
ln -sf "$PREFIX/lpm" /usr/local/bin/lpm

# systemd hands a service almost no environment: no login shell has run, so $SHELL
# is simply absent. Terminals are spawned from it, so record the account's real
# login shell now rather than letting the app guess at spawn time.
LOGIN_SHELL=$(getent passwd "$(id -un)" | cut -d: -f7)
[ -n "$LOGIN_SHELL" ] || LOGIN_SHELL=/bin/sh
echo "==> Recording SHELL=$LOGIN_SHELL in $ENV_FILE"
install -d "$(dirname "$ENV_FILE")"
printf 'SHELL=%s\n' "$LOGIN_SHELL" > "$ENV_FILE"

echo "==> Installing systemd units"
install -m644 "$SRC/lpm-xvfb.service" "$SRC/lpm-wm.service" "$SRC/lpm.service" "$UNIT_DIR/"
systemctl daemon-reload
# lpm.service pulls in the display and window manager through Requires=, so this
# one enable brings up the whole stack, at boot too.
systemctl enable --now lpm.service

echo "==> Waiting for the peer server"
# The port can take ~30s to bind on a small box; a slow start is not a failure.
i=0
while [ "$i" -lt 60 ]; do
    if ss -lnt 2>/dev/null | grep -q ':8766 '; then
        echo
        echo "lpm is running as a host on this machine."
        echo
        echo "Next: run 'lpm pair' here, then paste the invite into"
        echo "Settings → Connections on the Mac that will drive it."
        exit 0
    fi
    i=$((i + 1))
    sleep 1
done

echo "lpm started but its peer server never came up. Check:" >&2
echo "  systemctl status lpm-xvfb lpm-wm lpm" >&2
echo "  journalctl -u lpm -n 50" >&2
exit 1
