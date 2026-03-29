#!/bin/sh
set -e

REPO="gug007/lpm"
INSTALL_DIR="${LPM_INSTALL_DIR:-/usr/local/bin}"

# Prefer /opt/homebrew/bin on Apple Silicon Macs
if [ "$INSTALL_DIR" = "/usr/local/bin" ] && [ -d "/opt/homebrew/bin" ]; then
  INSTALL_DIR="/opt/homebrew/bin"
elif [ "$INSTALL_DIR" = "/usr/local/bin" ] && [ ! -d "$INSTALL_DIR" ]; then
  mkdir -p "$INSTALL_DIR" 2>/dev/null || sudo mkdir -p "$INSTALL_DIR"
fi

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  arm64)   ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

# Get latest release tag
LATEST="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
if [ -z "$LATEST" ]; then
  echo "Failed to fetch latest release" >&2
  exit 1
fi

TARBALL="lpm_${OS}_${ARCH}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${LATEST}/${TARBALL}"

echo "Installing lpm ${LATEST} (${OS}/${ARCH})..."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$URL" -o "${TMP}/${TARBALL}"
tar -xzf "${TMP}/${TARBALL}" -C "$TMP"

if [ -w "$INSTALL_DIR" ]; then
  mv "${TMP}/lpm" "${INSTALL_DIR}/lpm"
else
  echo "Need sudo to install to ${INSTALL_DIR}"
  sudo mv "${TMP}/lpm" "${INSTALL_DIR}/lpm"
fi

chmod +x "${INSTALL_DIR}/lpm"

echo "lpm installed to ${INSTALL_DIR}/lpm"

if ! command -v tmux >/dev/null 2>&1; then
  echo ""
  echo "Note: lpm requires tmux. Install it with:"
  echo "  brew install tmux    # macOS"
  echo "  apt install tmux     # Debian/Ubuntu"
fi
