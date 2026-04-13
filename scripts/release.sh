#!/bin/sh
set -e

BUMP="${1:-patch}"

case "$BUMP" in
  patch|minor|major) ;;
  *)
    echo "error: bump must be one of: patch, minor, major (got '$BUMP')" >&2
    exit 1
    ;;
esac

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
git tag "$NEXT"
git push origin "$NEXT"
echo "Released $NEXT"
