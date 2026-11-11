#!/bin/zsh
set -e

cd "$(dirname "$0")"

npm run setup:sessions
npm run tauri dev
