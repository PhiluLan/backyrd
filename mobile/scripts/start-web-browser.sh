#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${1:-4173}"

cd "$APP_DIR"

echo "[1/2] Baue Web-Bundle ..."
npx expo export --platform web

echo "[2/2] Starte lokalen Web-Server auf Port $PORT ..."
node "$SCRIPT_DIR/serve-web.mjs" "$PORT"
