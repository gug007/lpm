#!/bin/bash
set -euo pipefail

BUNDLE_ID="cx.lpm.mobile"
SCHEME="LpmMobile"
CONFIG="Debug"
DERIVED="build/DerivedData"

cd "$(dirname "$0")"

# Signing team, in order of preference: an explicit env var, an untracked local
# mobile/.team file, else the first "Apple Development" identity in the keychain.
# Kept out of project.yml so the committed spec stays team-agnostic.
TEAM="${DEVELOPMENT_TEAM:-$(cat .team 2>/dev/null || true)}"
if [ -z "$TEAM" ]; then
  TEAM=$(security find-identity -v -p codesigning \
    | sed -nE 's/.*"Apple Development: .*\(([A-Z0-9]{10})\)"/\1/p' | head -1)
fi
if [ -z "$TEAM" ]; then
  echo "No signing team found. Set one with DEVELOPMENT_TEAM=XXXXXXXXXX ./run.sh" >&2
  echo "or write it to mobile/.team (find it in Xcode → Signing & Capabilities → Team)." >&2
  exit 1
fi

# First connected physical device (its UDID), else a paired one devicectl can
# reach over the network, unless overridden. The `|| true` guards matter: grep
# exits 1 on no match, and under `set -euo pipefail` that would kill the script
# right here, before the friendly message below ever prints.
UDID_RE='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
DEVICES="$(xcrun devicectl list devices 2>/dev/null || true)"
DEVICE_ID="${DEVICE_ID:-$(printf '%s\n' "$DEVICES" \
  | grep -i connected | grep -oiE "$UDID_RE" | head -1 || true)}"
if [ -z "$DEVICE_ID" ]; then
  DEVICE_ID=$(printf '%s\n' "$DEVICES" \
    | grep -i 'available' | grep -oiE "$UDID_RE" | head -1 || true)
fi
if [ -z "$DEVICE_ID" ]; then
  echo "No iPhone found. Plug one in (or pair it over Wi-Fi), unlock it, and trust this Mac." >&2
  exit 1
fi

echo "▸ Regenerating project (picks up new sources)…"
xcodegen generate

echo "▸ Building $SCHEME for device $DEVICE_ID (team $TEAM)…"
xcodebuild \
  -project LpmMobile.xcodeproj \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -destination "id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" \
  build

APP_PATH="$DERIVED/Build/Products/$CONFIG-iphoneos/$SCHEME.app"

echo "▸ Installing to device…"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"

echo "▸ Launching…"
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID"
