#!/bin/sh
# Bump to the next version tag and release it.
#
#   scripts/release.sh [patch|minor|major]            tag + push; GitHub Actions builds
#   scripts/release.sh [patch|minor|major] --local    build, notarize and publish from this Mac
#
# --local forwards --arch, --allow-dirty and --no-publish to release-local.sh.
set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

BUMP=patch
LOCAL=0
LOCAL_ARGS=""

while [ $# -gt 0 ]; do
  case "$1" in
    patch|minor|major) BUMP="$1" ;;
    --local) LOCAL=1 ;;
    --allow-dirty|--no-publish) LOCAL_ARGS="$LOCAL_ARGS $1" ;;
    --arch) LOCAL_ARGS="$LOCAL_ARGS $1 $2"; shift ;;
    *)
      echo "error: unknown argument '$1' (expected patch, minor, major, or a --flag)" >&2
      exit 1
      ;;
  esac
  shift
done

LATEST=$(git tag -l 'v*' --sort=-v:refname | head -1)

if [ -z "$LATEST" ]; then
  MAJOR=0
  MINOR=0
  PATCH=0
else
  VERSION="${LATEST#v}"
  MAJOR="${VERSION%%.*}"
  REST="${VERSION#*.}"
  MINOR="${REST%%.*}"
  PATCH="${REST#*.}"
fi

case "$BUMP" in
  major) NEXT="v$((MAJOR + 1)).0.0" ;;
  minor) NEXT="v${MAJOR}.$((MINOR + 1)).0" ;;
  patch) NEXT="v${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
esac

echo "$LATEST -> $NEXT ($BUMP)"

if [ "$LOCAL" -eq 1 ]; then
  # release-local.sh creates the tag itself: it publishes a draft release with
  # the DMGs attached first, so the tag only appears once the assets are there.
  exec "$SCRIPT_DIR/release-local.sh" "$NEXT" $LOCAL_ARGS
fi

git tag "$NEXT"
git push origin "$NEXT"
echo "Released $NEXT"
