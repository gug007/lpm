#!/bin/bash
set -euo pipefail

# Builds the signed bundle and sends it to Google Play for review.
#   ./deploy.sh [release-notes.txt]     notes are at most 500 characters
# TRACK picks the track (production), VERSION_CODE and VERSION_NAME pin the version.

PACKAGE="cx.lpm.mobile"
GRADLE_FILE="app/build.gradle.kts"
BUNDLE="app/build/outputs/bundle/release/app-release.aab"
TRACK="${TRACK:-production}"
JSON_KEY="${PLAY_JSON_KEY:-$HOME/.lpm/keys/lpm-play-publisher.json}"
NOTES="${1:-}"
NOTES_LIMIT=500

if [ -n "$NOTES" ]; then
  NOTES="$(cd "$(dirname "$NOTES")" && pwd)/$(basename "$NOTES")"
  [ -f "$NOTES" ] || { echo "No release notes at $NOTES." >&2; exit 1; }
  NOTES_LENGTH=$(LC_ALL=en_US.UTF-8 wc -m < "$NOTES" | tr -d ' ')
  if [ "$NOTES_LENGTH" -gt "$NOTES_LIMIT" ]; then
    echo "Release notes are $NOTES_LENGTH characters; Google Play takes $NOTES_LIMIT." >&2
    exit 1
  fi
fi

cd "$(dirname "$0")"

[ -f "$JSON_KEY" ] || { echo "No Google Play key at $JSON_KEY (set PLAY_JSON_KEY)." >&2; exit 1; }
command -v fastlane >/dev/null || { echo "fastlane isn't installed (brew install fastlane)." >&2; exit 1; }

if [ -z "${JAVA_HOME:-}" ] && ! /usr/libexec/java_home >/dev/null 2>&1; then
  for jdk in "$HOME"/.gradle/jdks/*/jdk-*/Contents/Home /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home; do
    if [ -d "$jdk" ]; then export JAVA_HOME="$jdk"; break; fi
  done
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

CURRENT_CODE=$(sed -nE 's/^[[:space:]]*versionCode = ([0-9]+).*/\1/p' "$GRADLE_FILE" | head -1)
CURRENT_NAME=$(sed -nE 's/^[[:space:]]*versionName = "([^"]+)".*/\1/p' "$GRADLE_FILE" | head -1)
IOS_NAME=$(sed -nE 's/^[[:space:]]*MARKETING_VERSION:[[:space:]]*"([0-9.]+)".*/\1/p' ../ios/project.yml | head -1)
if [ -z "$CURRENT_CODE" ] || [ -z "$CURRENT_NAME" ]; then
  echo "Couldn't read versionCode and versionName from $GRADLE_FILE." >&2
  exit 1
fi

# Google Play refuses a version code it has seen, so every upload takes the next
# one; the name follows the iOS app's.
NEW_CODE="${VERSION_CODE:-$((CURRENT_CODE + 1))}"
NEW_NAME="${VERSION_NAME:-${IOS_NAME:-$CURRENT_NAME}}"

set_version() {
  sed -i '' -E \
    -e "s/(versionCode = )[0-9]+/\1$1/" \
    -e "s/(versionName = )\"[^\"]*\"/\1\"$2\"/" \
    "$GRADLE_FILE"
}

if [ "$NEW_CODE" != "$CURRENT_CODE" ] || [ "$NEW_NAME" != "$CURRENT_NAME" ]; then
  set_version "$NEW_CODE" "$NEW_NAME"
  echo "▸ Version $CURRENT_NAME ($CURRENT_CODE) → $NEW_NAME ($NEW_CODE)"
  # A deploy that doesn't finish uploads nothing, so it shouldn't use up a version code.
  restore_version() {
    [ $? -eq 0 ] && return
    set_version "$CURRENT_CODE" "$CURRENT_NAME"
    echo "▸ Deploy failed; version back to $CURRENT_NAME ($CURRENT_CODE)" >&2
  }
  trap restore_version EXIT
else
  echo "▸ Version $NEW_NAME ($NEW_CODE) (unchanged)"
fi

# Two Gradle runs: lint crashes on a missing generated file when the checks and
# the release build share one.
echo "▸ Checking…"
./gradlew check -PwarningsAsErrors=true

echo "▸ Building the bundle…"
./gradlew :app:bundleRelease -PwarningsAsErrors=true

METADATA=$(mktemp -d)
SKIP_NOTES=true
if [ -n "$NOTES" ]; then
  mkdir -p "$METADATA/en-US/changelogs"
  cp "$NOTES" "$METADATA/en-US/changelogs/$NEW_CODE.txt"
  SKIP_NOTES=false
fi

echo "▸ Uploading $NEW_NAME ($NEW_CODE) to the $TRACK track…"
FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_HIDE_CHANGELOG=1 FASTLANE_OPT_OUT_USAGE=1 \
FASTLANE_HIDE_GITHUB_ISSUES=1 CI=1 fastlane run upload_to_play_store \
  package_name:"$PACKAGE" \
  json_key:"$JSON_KEY" \
  aab:"$BUNDLE" \
  track:"$TRACK" \
  metadata_path:"$METADATA" \
  skip_upload_changelogs:"$SKIP_NOTES" \
  skip_upload_metadata:true \
  skip_upload_images:true \
  skip_upload_screenshots:true \
  skip_upload_apk:true

rm -rf "$METADATA"
echo "▸ Done. $NEW_NAME ($NEW_CODE) is with Google Play for review on the $TRACK track."
