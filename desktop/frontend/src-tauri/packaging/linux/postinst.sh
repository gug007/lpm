#!/bin/sh
# Puts the bundled CLI on PATH as `lpm`. The package installs it as
# /usr/bin/lpm-cli (the sidecar's name); a link, not a second copy. An
# /usr/bin/lpm that is not this link belongs to something else and stays.
set -e

link=/usr/bin/lpm
if [ -L "$link" ] || [ -e "$link" ]; then
    [ "$(readlink "$link" 2>/dev/null)" = lpm-cli ] || exit 0
fi
ln -sfn lpm-cli "$link"
exit 0
