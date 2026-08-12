#!/usr/bin/env bash
set -euo pipefail
base="${CI_BASE_SHA:-origin/main}"
changed="$(git diff --name-only "$base"...HEAD)"
if printf '%s\n' "$changed" | grep -E '^(supabase/functions/decision-v13/|supabase/migrations/.*decision.*(v11|v12|v13)|mobile/.*decision|web/.*decision)' >/dev/null; then
  echo "D2 scope guard: protected Decision Engine/Product path changed"
  printf '%s\n' "$changed" | grep -E '^(supabase/functions/decision-v13/|supabase/migrations/.*decision.*(v11|v12|v13)|mobile/.*decision|web/.*decision)'
  exit 1
fi
echo "D2 scope guard: additive Lab/evaluation scope confirmed"
