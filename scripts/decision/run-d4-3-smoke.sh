#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
stage="${1:-SMOKE}"
case "$stage" in SMOKE|PILOT) ;; *) printf 'Only SMOKE or PILOT is allowed by this staged runner\n' >&2; exit 2 ;; esac
stage_lower="$(printf '%s' "$stage" | tr '[:upper:]' '[:lower:]')"
lab_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-d43.XXXXXX")"
project_id="backyrd-d43-ai-reranker"
started=false
cleanup() {
  if test "$started" = true; then supabase stop --project-id "$project_id" --no-backup >/dev/null 2>&1 || true; fi
  case "$lab_root" in "${TMPDIR:-/tmp}"/backyrd-d43.*|/tmp/backyrd-d43.*) rm -rf "$lab_root" ;; *) printf 'Refusing unexpected cleanup path\n' >&2 ;; esac
}
trap cleanup EXIT

test -n "${DECISION_LAB_OPENAI_API_KEY:-}" || { printf 'DECISION_LAB_OPENAI_API_KEY missing\n' >&2; exit 2; }
test -n "${DECISION_LAB_AI_BUDGET_USD:-}" || { printf 'DECISION_LAB_AI_BUDGET_USD missing\n' >&2; exit 2; }
mkdir -p "$lab_root/supabase" "$lab_root/generated" "$lab_root/config" "$repo_root/decision-lab/baselines"
cp "$repo_root/supabase/config.toml" "$lab_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$lab_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$lab_root/supabase/canonical"
sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" "$lab_root/supabase/config.toml"
sed -i.bak -e 's/port = 54321/port = 59821/' -e 's/port = 54322/port = 59822/' -e 's/shadow_port = 54320/shadow_port = 59820/' -e 's/port = 54329/port = 59829/' -e 's/port = 54323/port = 59823/' -e 's/port = 54324/port = 59824/' -e 's/port = 54327/port = 59827/' "$lab_root/supabase/config.toml"
sed -i.bak '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' "$lab_root/supabase/config.toml"
rm -f "$lab_root/supabase/config.toml.bak"
if rg -q '^[[:space:]]*[^#].*(hjgcrrzfjchzqoegcywn|supabase\.co)' "$lab_root/supabase/config.toml"; then printf 'Production-like identifier detected\n' >&2; exit 1; fi
supabase start --workdir "$lab_root" --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta --agent=no >/dev/null
started=true
supabase status --workdir "$lab_root" -o env --agent=no > "$lab_root/status.env"
set -a
# shellcheck disable=SC1090
source "$lab_root/status.env"
set +a
export DECISION_LAB_ALLOW_LOCAL=1 DECISION_LAB_DB_URL="$DB_URL" DECISION_LAB_SUPABASE_URL="$API_URL" DECISION_LAB_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" DECISION_LAB_JWT_SECRET="$JWT_SECRET"
export DECISION_LAB_SOURCE_MAIN_SHA="$(git -C "$repo_root" rev-parse HEAD)"
export DECISION_LAB_MIGRATION_HASH
DECISION_LAB_MIGRATION_HASH="$(find "$repo_root/supabase/migrations" -type f -name '*.sql' -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"
seed="backyrd-d1-basel-v1-2026"
config="$lab_root/config/$seed.json"
jq --arg seed "$seed" '.seed=$seed | .scenarioSetVersion="golden-scenarios-v1.1" | .evaluationVersion="decision-evaluator-v1.1" | .embeddingMode="FAST_SIMULATION"' "$repo_root/decision-lab/config/world-v1.json" > "$config"
node "$repo_root/decision-lab/src/cli.mjs" seed --config "$config" --output "$lab_root/generated" > "$lab_root/seed.json"
seed_sql="$(jq -r .sqlPath "$lab_root/seed.json")"
world_root="$(jq -r .output "$lab_root/seed.json")"
PGOPTIONS='-c client_min_messages=error' psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$seed_sql" >/dev/null
node "$repo_root/decision-lab/src/d3.1-treatment-users-sql.mjs" "$world_root/world.json" > "$lab_root/treatment-users.sql"
PGOPTIONS='-c client_min_messages=error' psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$lab_root/treatment-users.sql" >/dev/null
node "$repo_root/decision-lab/src/d43-stage-world-cli.mjs" --stage "$stage" --config "$config" --output "$repo_root/decision-lab/baselines/d4.3-ai-reranker-$stage_lower-v1.json" --prior-spent-usd "${DECISION_LAB_AI_PRIOR_SPENT_USD:-0}"
supabase stop --project-id "$project_id" --no-backup >/dev/null 2>&1
started=false
printf 'D4.3 %s completed; disposable environment destroyed.\n' "$stage_lower"
