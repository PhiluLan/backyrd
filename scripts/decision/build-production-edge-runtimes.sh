#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

npx --yes esbuild@0.25.9 \
  "$repo_root/supabase/functions/decision-engine-worker/index.ts" \
  --bundle --platform=neutral --format=esm --target=es2022 \
  '--external:npm:*' \
  '--external:node:*' \
  --outfile="$repo_root/supabase/functions/decision-engine-worker/index.deploy.ts"

npx --yes esbuild@0.25.9 \
  "$repo_root/supabase/functions/decision-north-star-internal/index.ts" \
  --bundle --platform=neutral --format=esm --target=es2022 \
  '--external:npm:*' \
  '--external:node:*' \
  --outfile="$repo_root/supabase/functions/decision-north-star-internal/index.deploy.ts"

npx --yes esbuild@0.25.9 \
  "$repo_root/supabase/functions/decision-v13/live-index.ts" \
  --bundle --platform=neutral --format=esm --target=es2022 \
  '--external:npm:*' \
  '--external:node:*' \
  --outfile="$repo_root/supabase/functions/decision-v13/index.deploy.ts"
