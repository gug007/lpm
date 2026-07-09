#!/bin/bash
set -euo pipefail

SCHEME="LpmMobile"
ARCHIVE="build/LpmMobile.xcarchive"
EXPORT_DIR="build/export"

cd "$(dirname "$0")"

# Same team resolution as run.sh, but uploads need a distribution identity,
# so prefer "Apple Distribution" when falling back to the keychain.
TEAM="${DEVELOPMENT_TEAM:-$(cat .team 2>/dev/null || true)}"
if [ -z "$TEAM" ]; then
  TEAM=$(security find-identity -v -p codesigning \
    | sed -nE 's/.*"Apple (Distribution|Development): .*\(([A-Z0-9]{10})\)"/\2/p' | head -1)
fi
if [ -z "$TEAM" ]; then
  echo "No signing team found. Set one with DEVELOPMENT_TEAM=XXXXXXXXXX ./deploy.sh" >&2
  echo "or write it to mobile/.team." >&2
  exit 1
fi

# App Store Connect rejects re-used build numbers; project.yml pins "1",
# so stamp each upload with a unique timestamp unless overridden.
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"

# Upload auth: App Store Connect API key via env, else the Apple ID
# logged into Xcode (Settings → Accounts) with -allowProvisioningUpdates.
AUTH_ARGS=()
if [ -n "${ASC_KEY_ID:-}" ]; then
  AUTH_ARGS=(
    -authenticationKeyID "$ASC_KEY_ID"
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
    -authenticationKeyPath "$ASC_KEY_PATH"
  )
fi

echo "▸ Regenerating project…"
xcodegen generate

echo "▸ Archiving $SCHEME (build $BUILD_NUMBER, team $TEAM)…"
xcodebuild \
  -project LpmMobile.xcodeproj \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  archive

cat > build/ExportOptions.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM</string>
</dict>
</plist>
EOF

echo "▸ Uploading to App Store Connect…"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist build/ExportOptions.plist \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates \
  ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"}

echo "▸ Done. Build $BUILD_NUMBER will appear in TestFlight after processing (~5–15 min)."
