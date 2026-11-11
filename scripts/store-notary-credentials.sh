#!/usr/bin/env zsh
set -euo pipefail

PROFILE="${YUKUN_NOTARY_PROFILE:-${AGENTDECK_NOTARY_PROFILE:-yukunNotary}}"

echo "Storing Apple notarization credentials in the macOS Keychain profile: ${PROFILE}"
echo "Use an Apple ID app-specific password, or follow notarytool's prompts."
echo

xcrun notarytool store-credentials "${PROFILE}"

echo
echo "Stored notary credentials profile: ${PROFILE}"
