#!/usr/bin/env bash
# `apt-get update` exits 0 when it can't reach the mirrors and keeps the runner
# image's package lists, which can name versions Ubuntu has since deleted, so the
# install then fails on a 404. Make that update fail, and retry until they're back.
set -uo pipefail

attempts=5
for ((attempt = 1; ; attempt++)); do
  if sudo apt-get update --error-on=any && sudo apt-get install -y "$@"; then
    exit 0
  fi
  if ((attempt == attempts)); then
    echo "::error::apt-get failed $attempts times, see the output above"
    exit 1
  fi
  echo "apt-get failed (attempt $attempt of $attempts), retrying in $((attempt * 30)) s"
  sleep $((attempt * 30))
done
