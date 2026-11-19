#!/bin/bash
set -euo pipefail

# Sends the build deploy.sh last uploaded to App Review, with no browser.
#   ./release.sh whats-new.txt     notes are at most 4000 characters
# APP_VERSION picks another version. Screenshots and review notes carry over,
# and it goes live once approved.
# SUBMIT=false stops once the version has its notes, and SUBMIT=only then
# submits it as it stands, with no notes file. Sending the notes also removes a
# review attachment, so one added by hand has to go in between those two.

BUNDLE_ID="cx.lpm.mobile"
KEY="${ASC_KEY_JSON:-$HOME/.lpm/keys/app-store-connect.json}"
NOTES="${1:-}"
NOTES_LIMIT=4000
SUBMIT="${SUBMIT:-true}"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

case "$SUBMIT" in
  only)
    STEPS=(skip_metadata:true submit_for_review:true)
    ;;
  true | false)
    [ -f "$NOTES" ] || { echo "Usage: ./release.sh whats-new.txt" >&2; exit 1; }
    NOTES_LENGTH=$(LC_ALL=en_US.UTF-8 wc -m < "$NOTES" | tr -d ' ')
    if [ "$NOTES_LENGTH" -gt "$NOTES_LIMIT" ]; then
      echo "What's New is $NOTES_LENGTH characters; the App Store takes $NOTES_LIMIT." >&2
      exit 1
    fi
    mkdir -p "$WORK/metadata/en-US"
    cp "$NOTES" "$WORK/metadata/en-US/release_notes.txt"
    STEPS=(automatic_release:true submit_for_review:"$SUBMIT")
    ;;
  *)
    echo "SUBMIT is true, false or only, not '$SUBMIT'." >&2
    exit 1
    ;;
esac

# Uploading a build works with any key; a version can only be edited and
# submitted with one that has the App Manager role.
[ -f "$KEY" ] || { echo "No App Store Connect key at $KEY (set ASC_KEY_JSON)." >&2; exit 1; }
command -v fastlane >/dev/null || { echo "fastlane isn't installed (brew install fastlane)." >&2; exit 1; }

cd "$(dirname "$0")"

APP_VERSION="${APP_VERSION:-$(sed -nE 's/^[[:space:]]*MARKETING_VERSION:[[:space:]]*"([0-9.]+)".*/\1/p' project.yml | head -1)}"
if [ -z "$APP_VERSION" ]; then
  echo "Couldn't read MARKETING_VERSION from project.yml." >&2
  exit 1
fi

# fastlane makes both folders even when it has nothing to put in them; the
# paths keep them out of the repo.
echo "▸ Sending $APP_VERSION to App Store Connect…"
FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_HIDE_CHANGELOG=1 FASTLANE_OPT_OUT_USAGE=1 \
FASTLANE_HIDE_GITHUB_ISSUES=1 CI=1 fastlane run upload_to_app_store \
  api_key_path:"$KEY" \
  app_identifier:"$BUNDLE_ID" \
  app_version:"$APP_VERSION" \
  metadata_path:"$WORK/metadata" \
  screenshots_path:"$WORK/screenshots" \
  skip_binary_upload:true \
  skip_screenshots:true \
  run_precheck_before_submit:false \
  force:true \
  "${STEPS[@]}"

if [ "$SUBMIT" = false ]; then
  echo "▸ Done. $APP_VERSION has its What's New; SUBMIT=only ./release.sh submits it."
else
  echo "▸ Done. $APP_VERSION is waiting for App Review."
fi
