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

# Bump the marketing version's minor component (1.3 -> 1.4) so each upload is a
# fresh version train, unless one is pinned via MARKETING_VERSION. project.yml is
# the source of truth (xcodegen bakes it into the project below) and holds it in
# two targets — app + notification-service extension — which must stay in sync, so
# rewrite both. Persisting to the file is what makes the bump monotonic across
# deploys; commit the change afterward.
CURRENT_VERSION=$(sed -nE 's/^[[:space:]]*MARKETING_VERSION:[[:space:]]*"([0-9.]+)".*/\1/p' project.yml | head -1)
if [ -z "$CURRENT_VERSION" ]; then
  echo "Couldn't read MARKETING_VERSION from project.yml." >&2
  exit 1
fi
if [ -n "${MARKETING_VERSION:-}" ]; then
  NEW_VERSION="$MARKETING_VERSION"
else
  MAJOR="${CURRENT_VERSION%%.*}"
  MINOR="${CURRENT_VERSION#*.}"
  MINOR="${MINOR%%.*}"
  NEW_VERSION="$MAJOR.$((MINOR + 1))"
fi
if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
  sed -i '' -E "s/(MARKETING_VERSION:[[:space:]]*)\"[0-9.]+\"/\1\"$NEW_VERSION\"/" project.yml
  echo "▸ Version $CURRENT_VERSION → $NEW_VERSION"
else
  echo "▸ Version $NEW_VERSION (unchanged)"
fi

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

echo "▸ Archiving $SCHEME (v$NEW_VERSION build $BUILD_NUMBER, team $TEAM)…"
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

echo "▸ Done. v$NEW_VERSION build $BUILD_NUMBER will appear in TestFlight after processing (~5–15 min)."
