#!/bin/sh
set -e

# Usage: create-dmg.sh <path-to-app> <output-dmg-path>
APP_PATH="$1"
OUTPUT_DMG="$2"
VOLUME_NAME="lpm"

if [ -z "$APP_PATH" ] || [ -z "$OUTPUT_DMG" ]; then
  echo "Usage: $0 <path-to-app> <output-dmg-path>"
  exit 1
fi

DMG_DIR="$(mktemp -d -t lpm-dmg-src)"
trap 'rm -rf "$DMG_DIR"' EXIT

cp -R "$APP_PATH" "$DMG_DIR/"
ln -s /Applications "$DMG_DIR/Applications"

rm -f "$OUTPUT_DMG"
hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$DMG_DIR" \
  -format UDZO \
  -imagekey zlib-level=9 \
  "$OUTPUT_DMG"

echo "Created $OUTPUT_DMG"
