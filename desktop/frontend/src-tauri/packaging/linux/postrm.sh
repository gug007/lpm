#!/bin/sh
# Drops the `lpm` link postinst made, on removal only: dpkg passes remove or
# purge, rpm passes 0. An upgrade (dpkg "upgrade", rpm 1) keeps it.
set -e

case "$1" in
    remove | purge | 0)
        if [ "$(readlink /usr/bin/lpm 2>/dev/null)" = lpm-cli ]; then
            rm -f /usr/bin/lpm
        fi
        ;;
esac
exit 0
