#!/bin/sh
set -e

# Get the latest tag
LATEST=$(git tag -l 'v*' --sort=-v:refname | head -1)

if [ -z "$LATEST" ]; then
  NEXT="v0.1.0"
else
  # Parse major.minor.patch
  VERSION="${LATEST#v}"
  MAJOR=$(echo "$VERSION" | cut -d. -f1)
  MINOR=$(echo "$VERSION" | cut -d. -f2)
  PATCH=$(echo "$VERSION" | cut -d. -f3)
  NEXT="v${MAJOR}.$((MINOR + 1)).${PATCH}"
fi

echo "$LATEST -> $NEXT"
git tag "$NEXT"
git push --tags
echo "Released $NEXT"
