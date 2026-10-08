#!/bin/bash
# Xcode build phase: compiles lpm Link's built-in Tailscale node (../tailnet/ios)
# into liblpmtailnet.a for the SDK and architectures being built. Needs Go
# (`brew install go`); the first build also downloads the Go modules. Skipped
# when nothing it depends on changed since the last build.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/go/bin:/usr/local/bin:$PATH"
if ! command -v go >/dev/null; then
  echo "error: lpm Link's built-in Tailscale needs Go to build. Install it with: brew install go"
  exit 1
fi

SRC="$SRCROOT/../tailnet"
OUT="$DERIVED_FILE_DIR/tailnet"
LIB="$OUT/liblpmtailnet.a"
MIN="$IPHONEOS_DEPLOYMENT_TARGET"
case "$PLATFORM_NAME" in
  iphoneos) SUFFIX="" ;;
  iphonesimulator) SUFFIX="-simulator" ;;
  *) echo "error: built-in Tailscale has no build for $PLATFORM_NAME"; exit 1 ;;
esac

STAMP=$(
  {
    cd "$SRC"
    find . \( -name '*.go' -o -name go.mod -o -name go.sum \) -type f | LC_ALL=C sort | xargs shasum -a 256
    echo "$PLATFORM_NAME $ARCHS $MIN $(go version)"
  } | shasum -a 256 | cut -d' ' -f1
)
if [ -f "$LIB" ] && [ "$(cat "$OUT/stamp" 2>/dev/null)" = "$STAMP" ]; then
  exit 0
fi

CC="$(xcrun --sdk "$PLATFORM_NAME" -f clang)"
SDK="$(xcrun --sdk "$PLATFORM_NAME" --show-sdk-path)"
SLICES=()
for ARCH in $ARCHS; do
  case "$ARCH" in
    arm64) GOARCH=arm64 ;;
    x86_64) GOARCH=amd64 ;;
    *) echo "error: built-in Tailscale has no build for $ARCH"; exit 1 ;;
  esac
  FLAGS="-isysroot $SDK -target $ARCH-apple-ios$MIN$SUFFIX"
  (
    cd "$SRC"
    env -u CFLAGS -u LDFLAGS GOOS=ios GOARCH=$GOARCH CGO_ENABLED=1 CC="$CC" \
      CGO_CFLAGS="$FLAGS -O2" CGO_LDFLAGS="$FLAGS" \
      go build -buildmode=c-archive -trimpath -ldflags="-s -w" \
      -o "$OUT/$ARCH/liblpmtailnet.a" ./ios
  )
  SLICES+=("$OUT/$ARCH/liblpmtailnet.a")
done
lipo -create "${SLICES[@]}" -output "$LIB"
echo "$STAMP" > "$OUT/stamp"
