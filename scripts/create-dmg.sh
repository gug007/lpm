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

TEMP_DMG="$(mktemp -t lpm-dmg).dmg"
DMG_DIR="$(mktemp -d -t lpm-dmg-src)"

# Prevent Spotlight from indexing temp directories (causes "Resource busy")
mdutil -i off "$DMG_DIR" 2>/dev/null || true
touch "$DMG_DIR/.metadata_never_index"

# Prepare DMG contents
cp -R "$APP_PATH" "$DMG_DIR/"
ln -s /Applications "$DMG_DIR/Applications"

# Wait for any FS events to settle
sleep 1

# Create a read-write DMG first so we can style it (retry on "Resource busy")
for i in 1 2 3; do
  hdiutil create -volname "$VOLUME_NAME" -srcfolder "$DMG_DIR" \
    -ov -format UDRW "$TEMP_DMG" && break
  echo "hdiutil create attempt $i failed, retrying in 3s..."
  sleep 3
done

# Mount the DMG
MOUNT_DIR=$(hdiutil attach -readwrite -noverify "$TEMP_DMG" | grep "/Volumes/" | sed 's/.*\/Volumes/\/Volumes/')

# Style the DMG window with AppleScript
osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "$VOLUME_NAME"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set bounds of container window to {100, 100, 640, 400}
    set theViewOptions to icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 80
    set position of item "lpm.app" of container window to {150, 140}
    set position of item "Applications" of container window to {390, 140}
    close
    open
    update without registering applications
  end tell
end tell
APPLESCRIPT

# Wait for Finder to apply changes
sleep 2

# Remove any .DS_Store leftovers from temp, keep the one in the volume
sync

# Unmount (retry if busy)
for i in 1 2 3; do
  hdiutil detach "$MOUNT_DIR" && break
  echo "hdiutil detach attempt $i failed, retrying in 3s..."
  sleep 3
done

# Convert to compressed read-only DMG
hdiutil convert "$TEMP_DMG" -format UDZO -o "$OUTPUT_DMG"

# Cleanup
rm -f "$TEMP_DMG"
rm -rf "$DMG_DIR"

echo "Created $OUTPUT_DMG"
