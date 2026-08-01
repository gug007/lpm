#!/bin/sh
# Remove the lpm host install from this machine.
#
# Undoes exactly what install.sh did — the units, the binaries, the PATH symlink
# and the environment file — and nothing else. Your projects, repos and anything
# else on the box are untouched.
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
UNITS="lpm.service lpm-wm.service lpm-xvfb.service"
# Matches install.sh: the units run under the *system* manager, whose %h is
# literally /root — not the home of whoever ran the installer.
SERVICE_HOME=/root
PURGE=0

usage() {
    cat <<EOF
Usage: sudo ./uninstall.sh [--purge]

  --purge   Also delete $SERVICE_HOME/.lpm (project config, session memory,
            this machine's pairing identity). Not reversible.
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

# The app is deliberately not the parent of the work it starts: services are tmux
# panes and scheduled job agents `setsid` away, both of which survive the unit
# stopping (KillMode=process, so a restart doesn't end them). That is right for a
# restart and wrong for a removal — it would leave dev servers and agents running
# on a machine with nothing left to manage them, and no UI to find them from.
#
# Scoped to the service account's own tmux server, which on a host that exists to
# run lpm is lpm's. A root tmux session started by hand for something else would
# go with it; that is the cost of not leaving orphans behind.
if command -v tmux >/dev/null 2>&1; then
    echo "==> Stopping services and agents"
    HOME="$SERVICE_HOME" tmux kill-server >/dev/null 2>&1 || true
fi

echo "==> Removing units and binaries"
for unit in $UNITS; do
    rm -f "$UNIT_DIR/$unit"
done
command -v systemctl >/dev/null 2>&1 && systemctl daemon-reload >/dev/null 2>&1 || true

# Only our own symlink: /usr/local/bin/lpm may be someone else's binary on a
# machine where the install never finished, and removing that is not ours to do.
if [ -L /usr/local/bin/lpm ] && [ "$(readlink /usr/local/bin/lpm)" = "$PREFIX/lpm" ]; then
    rm -f /usr/local/bin/lpm
fi
rm -rf "$PREFIX"
rm -f "$ENV_DIR/host.env"
rmdir "$ENV_DIR" 2>/dev/null || true

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
else
    echo
    echo "Kept $SERVICE_HOME/.lpm — project config, session memory and this machine's"
    echo "pairing identity. Delete it with: sudo rm -rf $SERVICE_HOME/.lpm"
fi

echo
echo "lpm has been removed from this machine."
