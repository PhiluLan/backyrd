#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
lab_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-d3-baseline.XXXXXX")"
project_id="backyrd-d3-baseline-${$}"
started=false

cleanup() {
  if test "$started" = true; then supabase stop --workdir "$lab_root" --no-backup >/dev/null 2>&1 || true; fi
  case "$lab_root" in
    "${TMPDIR:-/tmp}"/backyrd-d3-baseline.*|/tmp/backyrd-d3-baseline.*) rm -rf "$lab_root" ;;
    *) printf 'Refusing unexpected cleanup path: %s\n' "$lab_root" >&2 ;;
  esac
}
trap cleanup EXIT

node "$repo_root/decision-lab/src/d3-preflight.mjs" >/dev/null
mkdir -p "$lab_root/supabase" "$lab_root/output" "$lab_root/config" "$repo_root/decision-lab/.generated/d3"
cp "$repo_root/supabase/config.toml" "$lab_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$lab_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$lab_root/supabase/canonical"
sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" "$lab_root/supabase/config.toml"
sed -i.bak -e 's/port = 54321/port = 58221/' -e 's/port = 54322/port = 58222/' -e 's/shadow_port = 54320/shadow_port = 58220/' -e 's/port = 54329/port = 58229/' -e 's/port = 54323/port = 58223/' -e 's/port = 54324/port = 58224/' -e 's/port = 54327/port = 58227/' "$lab_root/supabase/config.toml"
sed -i.bak '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' "$lab_root/supabase/config.toml"
rm -f "$lab_root/supabase/config.toml.bak"
test ! -e "$lab_root/supabase/.temp/project-ref"
if rg -q '^[[:space:]]*[^#].*(hjgcrrzfjchzqoegcywn|supabase\.co)' "$lab_root/supabase/config.toml"; then printf 'Production-like identifier detected.\n' >&2; exit 1; fi

supabase start --workdir "$lab_root" --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta --agent=no >/dev/null
started=true
supabase status --workdir "$lab_root" -o env --agent=no > "$lab_root/status.env"
set -a
# shellcheck disable=SC1090
source "$lab_root/status.env"
set +a

export DECISION_LAB_ALLOW_LOCAL=1
export DECISION_LAB_DB_URL="$DB_URL"
export DECISION_LAB_SUPABASE_URL="$API_URL"
export DECISION_LAB_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export DECISION_LAB_JWT_SECRET="$JWT_SECRET"
export DECISION_LAB_EMBEDDING_MODE="FAST_SIMULATION"
export DECISION_LAB_WORKDIR="$lab_root"
export DECISION_LAB_MIGRATION_HASH
DECISION_LAB_MIGRATION_HASH="$(find "$repo_root/supabase/migrations" -type f -name '*.sql' -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"

base_config="$repo_root/decision-lab/config/world-v1.json"
seed_index=0
for seed in backyrd-d1-basel-v1-2026 backyrd-d1-basel-v1-2026-2 backyrd-d1-basel-v1-2026-3; do
  if test "$seed_index" -gt 0; then
    supabase db reset --workdir "$lab_root" --local --no-seed >/dev/null
  fi
  config="$lab_root/config/${seed}.json"
  jq --arg seed "$seed" --arg scenario "golden-scenarios-v1.1" --arg evaluation "decision-evaluator-v1.1" --arg mode "FAST_SIMULATION" '.seed=$seed | .scenarioSetVersion=$scenario | .evaluationVersion=$evaluation | .embeddingMode=$mode' "$base_config" > "$config"
  node "$repo_root/decision-lab/src/cli.mjs" seed --config "$config" --output "$lab_root/generated" > "$lab_root/${seed}-seed.json"
  seed_sql="$(jq -r .sqlPath "$lab_root/${seed}-seed.json")"
  psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$seed_sql" >/dev/null
  node "$repo_root/decision-lab/src/d3-world-cli.mjs" --config "$config" --output "$lab_root/output/${seed}.json"
  seed_index=$((seed_index + 1))
done

cp "$lab_root/output/"*.json "$repo_root/decision-lab/.generated/d3/"
printf 'D3 multi-seed baseline completed in disposable environment. Artifacts: %s\n' "$repo_root/decision-lab/.generated/d3"
