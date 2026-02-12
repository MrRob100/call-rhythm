#!/bin/bash
# Watches for new commits on origin/main and pulls automatically.
# Run in background: ./watch.sh &

cd "$(dirname "$0")"

echo "[watch] Watching for changes..."
while true; do
  git fetch origin main --quiet 2>/dev/null
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)
  if [ "$LOCAL" != "$REMOTE" ]; then
    git pull --quiet
    echo "[watch] Updated to $(git rev-parse --short HEAD)"
  fi
  sleep 30
done
