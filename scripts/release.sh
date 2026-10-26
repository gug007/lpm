#!/bin/sh
# release.sh [patch|minor|major] [stable|beta]
#   Tag the next version and push it; CI builds and publishes the release.
#   Claude writes its notes from the commits since the last tag.
#   A beta release goes out as a GitHub pre-release, which only the app's Beta
#   update channel installs.
# release.sh promote [vX.Y.Z]
#   Make a beta release (the newest one by default) stable, so everyone gets
#   the build Beta has been running.
set -e

promote() {
  TAG="${1:-$(gh release list --exclude-drafts --limit 50 --json tagName,isPrerelease \
    --jq '[.[] | select(.isPrerelease)][0].tagName')}"
  if [ -z "$TAG" ]; then
    echo "error: there is no beta release to promote" >&2
    exit 1
  fi
  if [ "$(gh release view "$TAG" --json isPrerelease --jq .isPrerelease)" != "true" ]; then
    echo "error: $TAG is not a beta release" >&2
    exit 1
  fi
  # Marking an older build latest would move every Stable app back to it.
  STABLE=$(gh release view --json tagName --jq .tagName 2>/dev/null || true)
  if [ -n "$STABLE" ] && [ "$(printf '%s\n%s\n' "$STABLE" "$TAG" | sort -V | tail -1)" != "$TAG" ]; then
    echo "error: $TAG is older than the current stable release $STABLE" >&2
    exit 1
  fi
  gh release edit "$TAG" --prerelease=false --latest
  echo "Promoted $TAG to stable"
}

if [ "$1" = "promote" ]; then
  promote "$2"
  exit 0
fi

BUMP="${1:-patch}"
CHANNEL="${2:-stable}"

case "$BUMP" in
  patch|minor|major) ;;
  *)
    echo "error: bump must be one of: patch, minor, major (got '$BUMP')" >&2
    exit 1
    ;;
esac

case "$CHANNEL" in
  stable|beta) ;;
  *)
    echo "error: channel must be one of: stable, beta (got '$CHANNEL')" >&2
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

echo "$LATEST -> $NEXT ($BUMP, $CHANNEL)"
NOTES=$("$(dirname "$0")/release-notes.sh" "$LATEST" "$NEXT") ||
  echo "warning: Claude couldn't write the release notes; add them later with gh release edit $NEXT --notes" >&2
echo "Notes: ${NOTES:-(none)}"
# The release workflow reads the channel off the tag message's first line and
# publishes the rest as the release notes, which the website's changelog shows.
git tag -a "$NEXT" -m "$CHANNEL" -m "$NOTES"
git push origin "$NEXT"
echo "Released $NEXT"
