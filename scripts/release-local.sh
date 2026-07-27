#!/usr/bin/env bash
# Cut a release from this Mac instead of GitHub Actions. Runs the same steps as
# .github/workflows/release.yml — tauri build (sign + notarize + staple + DMG),
# a second notarization pass over the DMG itself, then publish with `gh`.
#
# Publishing order matters: the release is created as a *draft*, both DMGs are
# uploaded, and only then is it published. A draft has no tag, so nothing is
# pushed until the assets are in place — by the time the tag appears and
# release.yml fires, its guard job sees both DMGs and skips the CI rebuild.
#
# One-time setup — ~/.lpm/release.env, holding the same App Store Connect API
# key that the repo secrets use for notarization:
#
#   APPLE_API_ISSUER=<issuer uuid>          # secrets.APPLE_API_ISSUER_ID
#   APPLE_API_KEY=<key id>                  # secrets.APPLE_API_KEY_ID
#   APPLE_API_KEY_PATH=$HOME/.lpm/private_keys/AuthKey_<key id>.p8
#
# The signing identity is picked up from the login keychain; override with
# APPLE_SIGNING_IDENTITY if there is more than one Developer ID on this Mac.
set -euo pipefail
shopt -s nullglob

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$REPO_ROOT/desktop/frontend"
OUT_DIR="$REPO_ROOT/dist/release"
ENV_FILE="${LPM_RELEASE_ENV:-$HOME/.lpm/release.env}"

TAG=""
ARCHES="both"
ALLOW_DIRTY=0
PUBLISH=1

while [ $# -gt 0 ]; do
  case "$1" in
    # release.sh forwards its own argv; ignore the parts meant for it.
    --local|patch|minor|major) ;;
    --arch) ARCHES="$2"; shift ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --no-publish) PUBLISH=0 ;;
    v[0-9]*) TAG="$1" ;;
    *) echo "error: unknown argument '$1'" >&2; exit 1 ;;
  esac
  shift
done

case "$ARCHES" in
  both) TARGETS="aarch64-apple-darwin:arm64 x86_64-apple-darwin:amd64" ;;
  arm64) TARGETS="aarch64-apple-darwin:arm64" ;;
  amd64) TARGETS="x86_64-apple-darwin:amd64" ;;
  *) echo "error: --arch must be one of: both, arm64, amd64 (got '$ARCHES')" >&2; exit 1 ;;
esac

[ -n "$TAG" ] || { echo "error: no version tag given (expected vX.Y.Z)" >&2; exit 1; }
VERSION="${TAG#v}"

die() { echo "error: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

# --- preflight -------------------------------------------------------------
# Everything that can fail on setup is checked before the first (slow) build,
# so a missing credential doesn't surface eight minutes in.

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found — see the header of this script for the one-time setup"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

: "${APPLE_API_ISSUER:?missing APPLE_API_ISSUER in $ENV_FILE}"
: "${APPLE_API_KEY:?missing APPLE_API_KEY in $ENV_FILE}"
: "${APPLE_API_KEY_PATH:?missing APPLE_API_KEY_PATH in $ENV_FILE}"
APPLE_API_KEY_PATH="${APPLE_API_KEY_PATH/#\~/$HOME}"
[ -f "$APPLE_API_KEY_PATH" ] || die "notarization key not found at $APPLE_API_KEY_PATH"

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  # Select by SHA-1, not by name. CI imports one cert into a throwaway keychain,
  # but a dev login keychain often holds several identically named Developer ID
  # certs, and `codesign -s <name>` then fails outright as "ambiguous".
  ids="$(security find-identity -v -p codesigning | grep 'Developer ID Application' || true)"
  n="$(printf '%s' "$ids" | grep -c . || true)"
  [ "$n" -gt 0 ] || die "no 'Developer ID Application' identity in the login keychain"
  APPLE_SIGNING_IDENTITY="$(printf '%s\n' "$ids" | head -1 | awk '{print $2}')"
  [ "$n" -eq 1 ] || echo "note: $n Developer ID identities in the keychain, using $APPLE_SIGNING_IDENTITY (set APPLE_SIGNING_IDENTITY to pick another)"
fi
export APPLE_SIGNING_IDENTITY APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH

# Prove codesign can actually reach the private key before spending minutes on a
# build. The login keychain guards it with an ACL, so a locked keychain or a
# shell with no way to prompt (ssh, a detached process) fails as
# errSecInternalComponent — which otherwise only surfaces at bundling time.
probe="$(mktemp)"
if ! codesign -s "$APPLE_SIGNING_IDENTITY" -f "$probe" >/dev/null 2>&1; then
  rm -f "$probe"
  die "codesign cannot use $APPLE_SIGNING_IDENTITY — unlock the login keychain and run this from a terminal window (a detached or ssh shell cannot prompt for key access)"
fi
rm -f "$probe"

if [ "$ALLOW_DIRTY" -eq 0 ] && [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
  die "working tree is dirty — a local release ships exactly what is on disk. Commit, stash, or pass --allow-dirty"
fi

if [ "$PUBLISH" -eq 1 ]; then
  gh auth status >/dev/null 2>&1 || die "gh is not authenticated — run 'gh auth login'"
  ! gh release view "$TAG" >/dev/null 2>&1 || die "release $TAG already exists on GitHub"
fi

for entry in $TARGETS; do
  rustup target add "${entry%%:*}" >/dev/null 2>&1 || true
done

SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
echo "releasing $TAG from ${SHA:0:8} as $APPLE_SIGNING_IDENTITY"
mkdir -p "$OUT_DIR"

# --- build -----------------------------------------------------------------
# LPM_VERSION is what the app reports (option_env! at compile time) and --config
# keeps CFBundleShortVersionString in sync; LPM_CLI_TARGET pins the bundled CLI
# to the triple being built so the x86_64 pass cross-builds it too.

for entry in $TARGETS; do
  target="${entry%%:*}"
  arch="${entry##*:}"

  step "building $target"
  ( cd "$FRONTEND" && LPM_VERSION="$VERSION" LPM_CLI_TARGET="$target" \
      npx tauri build --target "$target" --config "{\"version\":\"$VERSION\"}" )

  # Match on the version: unlike a fresh CI runner, a dev target dir keeps the
  # DMGs of every release built here, so a bare *.dmg glob picks up stale ones.
  dmgs=("$FRONTEND"/src-tauri/target/"$target"/release/bundle/dmg/*_"$VERSION"_*.dmg)
  [ "${#dmgs[@]}" -eq 1 ] || die "expected one $VERSION DMG for $target, found ${#dmgs[@]}"
  dmg="${dmgs[0]}"

  # tauri notarizes and staples the .app but leaves the DMG itself unsigned by
  # the notary service, which trips Gatekeeper on a manual browser download.
  step "notarizing DMG for $arch"
  xcrun notarytool submit "$dmg" \
    --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" \
    --wait --timeout 30m
  xcrun stapler staple "$dmg"

  # updates.rs only matches assets ending in macos-arm64.dmg / macos-amd64.dmg.
  cp "$dmg" "$OUT_DIR/lpm-desktop-macos-$arch.dmg"
done

ASSETS=()
for entry in $TARGETS; do
  ASSETS+=("$OUT_DIR/lpm-desktop-macos-${entry##*:}.dmg")
done

if [ "$PUBLISH" -eq 0 ]; then
  step "built, not published"
  printf '  %s\n' "${ASSETS[@]}"
  exit 0
fi

# --- publish ---------------------------------------------------------------
step "publishing $TAG"
git -C "$REPO_ROOT" tag "$TAG" 2>/dev/null || true
gh release create "$TAG" --draft --target "$SHA" --title "$TAG" --generate-notes "${ASSETS[@]}"
gh release edit "$TAG" --draft=false
git -C "$REPO_ROOT" fetch --tags --quiet

echo
gh release view "$TAG" --json url --jq .url
