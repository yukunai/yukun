#!/usr/bin/env zsh
set -euo pipefail

APP_PATH="src-tauri/target/release/bundle/macos/yukun.app"
DMG_PATH="src-tauri/target/release/bundle/dmg/yukun_0.1.0_aarch64.dmg"
ENTITLEMENTS="src-tauri/Entitlements.plist"
NOTARY_PROFILE="${YUKUN_NOTARY_PROFILE:-${AGENTDECK_NOTARY_PROFILE:-yukunNotary}}"

find_identity() {
  security find-identity -v -p codesigning |
    awk -F'"' '/Developer ID Application/ {print $2; exit}'
}

SIGNING_IDENTITY="${YUKUN_SIGNING_IDENTITY:-${AGENTDECK_SIGNING_IDENTITY:-$(find_identity)}}"

if [[ -z "${SIGNING_IDENTITY}" ]]; then
  echo "No Developer ID Application signing identity found."
  echo "Install/import a Developer ID Application certificate, then run:"
  echo "  npm run release:check"
  exit 1
fi

echo "Using signing identity: ${SIGNING_IDENTITY}"
echo "Using notary profile: ${NOTARY_PROFILE}"

if ! xcrun notarytool history --keychain-profile "${NOTARY_PROFILE}" --limit 1 >/dev/null 2>&1; then
  echo "Notary keychain profile is not usable: ${NOTARY_PROFILE}"
  echo "Store credentials first:"
  echo "  npm run release:notary:store"
  exit 1
fi

npm run app:build

if [[ ! -d "${APP_PATH}" ]]; then
  echo "Missing app bundle: ${APP_PATH}"
  exit 1
fi

echo "Cleaning extended attributes that can break codesign..."
xattr -d com.apple.FinderInfo "${APP_PATH}" 2>/dev/null || true
xattr -d "com.apple.fileprovider.fpfs#P" "${APP_PATH}" 2>/dev/null || true
find "${APP_PATH}" -exec xattr -d com.apple.provenance {} \; 2>/dev/null || true
dot_clean -m "${APP_PATH}" 2>/dev/null || true

echo "Signing app executable with hardened runtime..."
codesign \
  --force \
  --timestamp \
  --options runtime \
  --entitlements "${ENTITLEMENTS}" \
  --sign "${SIGNING_IDENTITY}" \
  "${APP_PATH}/Contents/MacOS/yukun"

echo "Signing app bundle..."
codesign \
  --force \
  --timestamp \
  --options runtime \
  --entitlements "${ENTITLEMENTS}" \
  --sign "${SIGNING_IDENTITY}" \
  "${APP_PATH}"

echo "Verifying app signature..."
codesign --verify --deep --strict --verbose=2 "${APP_PATH}"
spctl --assess --type execute --verbose=4 "${APP_PATH}" || true

echo "Creating DMG..."
node scripts/create-macos-dmg.mjs

echo "Signing DMG..."
codesign --force --timestamp --sign "${SIGNING_IDENTITY}" "${DMG_PATH}"
codesign --verify --verbose=2 "${DMG_PATH}"

echo "Submitting DMG for notarization..."
xcrun notarytool submit "${DMG_PATH}" --keychain-profile "${NOTARY_PROFILE}" --wait

echo "Stapling notarization ticket..."
xcrun stapler staple "${DMG_PATH}"
xcrun stapler validate "${DMG_PATH}"

echo "Assessing notarized DMG..."
spctl --assess --type open --context context:primary-signature --verbose=4 "${DMG_PATH}" || true

echo
echo "Release DMG ready:"
echo "  ${DMG_PATH}"
