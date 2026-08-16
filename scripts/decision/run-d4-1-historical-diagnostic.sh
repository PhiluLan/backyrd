#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
lab_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-d4-1.XXXXXX")"
project_id="backyrd-d4-1-retrieval-contract"
started=false

cleanup() {
  if test "$started" = true; then supabase stop --project-id "$project_id" --no-backup >/dev/null 2>&1 || true; fi
  case "$lab_root" in
    "${TMPDIR:-/tmp}"/backyrd-d4-1.*|/tmp/backyrd-d4-1.*) rm -rf "$lab_root" ;;
    *) printf 'Refusing unexpected cleanup path: %s\n' "$lab_root" >&2 ;;
  esac
}
trap cleanup EXIT

test -n "${DECISION_LAB_OPENAI_API_KEY:-}" || { printf 'DECISION_LAB_OPENAI_API_KEY is required.\n' >&2; exit 1; }
decision_lab_openai_api_key="$DECISION_LAB_OPENAI_API_KEY"
threshold_freeze_commit="$(git -C "$repo_root" rev-parse HEAD)"
node "$repo_root/decision-lab/src/retrieval-quality-freeze.mjs" >/dev/null
mkdir -p "$lab_root/supabase" "$lab_root/generated" "$lab_root/output" "$lab_root/config" "$lab_root/full-fidelity" "$repo_root/decision-lab/baselines"
cp "$repo_root/supabase/config.toml" "$lab_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$lab_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$lab_root/supabase/canonical"
sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" "$lab_root/supabase/config.toml"
sed -i.bak -e 's/port = 54321/port = 58821/' -e 's/port = 54322/port = 58822/' -e 's/shadow_port = 54320/shadow_port = 58820/' -e 's/port = 54329/port = 58829/' -e 's/port = 54323/port = 58823/' -e 's/port = 54324/port = 58824/' -e 's/port = 54327/port = 58827/' "$lab_root/supabase/config.toml"
sed -i.bak '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' "$lab_root/supabase/config.toml"
rm -f "$lab_root/supabase/config.toml.bak"
if rg -q '^[[:space:]]*[^#].*(hjgcrrzfjchzqoegcywn|supabase\.co)' "$lab_root/supabase/config.toml"; then printf 'Production-like identifier detected.\n' >&2; exit 1; fi

supabase start --workdir "$lab_root" --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta --agent=no >/dev/null
started=true
supabase status --workdir "$lab_root" -o env --agent=no > "$lab_root/status.env"
set -a
# shellcheck disable=SC1090
source "$lab_root/status.env"
set +a
export DECISION_LAB_OPENAI_API_KEY="$decision_lab_openai_api_key"
export DECISION_LAB_ALLOW_LOCAL=1 DECISION_LAB_DB_URL="$DB_URL" DECISION_LAB_SUPABASE_URL="$API_URL" DECISION_LAB_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" DECISION_LAB_JWT_SECRET="$JWT_SECRET"
export DECISION_LAB_WORKDIR="$lab_root" DECISION_LAB_SOURCE_MAIN_SHA="$threshold_freeze_commit"
export DECISION_LAB_EMBEDDING_CACHE_PATH="$lab_root/full-fidelity/query-cache.json"
export DECISION_LAB_MIGRATION_HASH
DECISION_LAB_MIGRATION_HASH="$(find "$repo_root/supabase/migrations" -type f -name '*.sql' -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"

base_config="$repo_root/decision-lab/config/world-v1.json"
first_run=true
for seed in backyrd-d1-basel-v1-2026 backyrd-d1-basel-v1-2026-2 backyrd-d1-basel-v1-2026-3; do
  config="$lab_root/config/$seed.json"
  jq --arg seed "$seed" '.seed=$seed | .scenarioSetVersion="golden-scenarios-v1.1" | .evaluationVersion="decision-evaluator-v1.1" | .embeddingMode="FULL_FIDELITY"' "$base_config" > "$config"
  node "$repo_root/decision-lab/src/cli.mjs" seed --config "$config" --output "$lab_root/generated" > "$lab_root/$seed-seed.json"
  seed_sql="$(jq -r .sqlPath "$lab_root/$seed-seed.json")"
  world_root="$(jq -r .output "$lab_root/$seed-seed.json")"
  full_sql="$lab_root/full-fidelity/$seed.sql"
  node "$repo_root/decision-lab/src/wave2-full-fidelity-embeddings.mjs" estimate --world "$world_root/world.json" --query-token-allowance 24000
  node "$repo_root/decision-lab/src/wave2-full-fidelity-embeddings.mjs" generate --world "$world_root/world.json" --query-token-allowance 24000 --max-usd 1 --output-sql "$full_sql" --output-manifest "$lab_root/full-fidelity/$seed.json" >/dev/null
  for engine in v13 wave1 wave2 wave2.1; do
    arm_log="$lab_root/$seed-$engine-database.log"
    if test "$first_run" = false; then
      supabase db reset --workdir "$lab_root" --local --no-seed >"$arm_log" 2>&1 || { tail -n 80 "$arm_log" >&2; exit 1; }
    fi
    first_run=false
    PGOPTIONS='-c client_min_messages=error' psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$seed_sql" >>"$arm_log" 2>&1 || { tail -n 80 "$arm_log" >&2; exit 1; }
    PGOPTIONS='-c client_min_messages=error' psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$full_sql" >>"$arm_log" 2>&1 || { tail -n 80 "$arm_log" >&2; exit 1; }
    node "$repo_root/decision-lab/src/d3.1-treatment-users-sql.mjs" "$world_root/world.json" > "$lab_root/treatment-users.sql"
    PGOPTIONS='-c client_min_messages=error' psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$lab_root/treatment-users.sql" >>"$arm_log" 2>&1 || { tail -n 80 "$arm_log" >&2; exit 1; }
    mkdir -p "$lab_root/output/$engine"
    node "$repo_root/decision-lab/src/d4.1-world-cli.mjs" --engine "$engine" --config "$config" --output "$lab_root/output/$engine/$seed.json"
  done
done

supabase stop --project-id "$project_id" --no-backup >/dev/null 2>&1
started=false
D4_1_THRESHOLD_FREEZE_COMMIT="$threshold_freeze_commit" node "$repo_root/decision-lab/src/d4.1-historical-aggregate.mjs" --input "$lab_root/output" --full-fidelity "$lab_root/full-fidelity" --output "$repo_root/decision-lab/baselines/d4.1-retrieval-quality-contract-v1.json"
printf 'D4.1 historical diagnostic completed; disposable environment destroyed.\n'
