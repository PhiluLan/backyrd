#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
lab_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-wave2.XXXXXX")"
project_id="backyrd-wave2-comparison"
started=false

cleanup() {
  if test "$started" = true; then supabase stop --project-id "$project_id" --no-backup >/dev/null 2>&1 || true; fi
  case "$lab_root" in
    "${TMPDIR:-/tmp}"/backyrd-wave2.*|/tmp/backyrd-wave2.*) rm -rf "$lab_root" ;;
    *) printf 'Refusing unexpected cleanup path: %s\n' "$lab_root" >&2 ;;
  esac
}
trap cleanup EXIT

modes="${WAVE2_MODES:-FAST_SIMULATION FULL_FIDELITY}"
seeds="${WAVE2_SEEDS:-backyrd-d1-basel-v1-2026 backyrd-d1-basel-v1-2026-2 backyrd-d1-basel-v1-2026-3}"
engines="${WAVE2_ENGINES:-wave1 wave2}"
if [[ " $modes " == *" FULL_FIDELITY "* ]]; then
  test -n "${DECISION_LAB_OPENAI_API_KEY:-}" || { printf 'DECISION_LAB_OPENAI_API_KEY is required for FULL_FIDELITY.\n' >&2; exit 1; }
fi
# `supabase status -o env` is infrastructure-owned input. Preserve the
# explicitly supplied Lab credential across that import so a local Supabase
# environment cannot shadow the benchmark treatment.
decision_lab_openai_api_key="${DECISION_LAB_OPENAI_API_KEY:-}"
node "$repo_root/decision-lab/src/d3.1-readiness.mjs" >/dev/null
mkdir -p "$lab_root/supabase" "$lab_root/generated" "$lab_root/output" "$lab_root/config" "$lab_root/full-fidelity" "$repo_root/decision-lab/baselines"
cp "$repo_root/supabase/config.toml" "$lab_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$lab_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$lab_root/supabase/canonical"
sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" "$lab_root/supabase/config.toml"
sed -i.bak -e 's/port = 54321/port = 58621/' -e 's/port = 54322/port = 58622/' -e 's/shadow_port = 54320/shadow_port = 58620/' -e 's/port = 54329/port = 58629/' -e 's/port = 54323/port = 58623/' -e 's/port = 54324/port = 58624/' -e 's/port = 54327/port = 58627/' "$lab_root/supabase/config.toml"
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
export DECISION_LAB_WORKDIR="$lab_root" DECISION_LAB_SOURCE_MAIN_SHA="b6ce04f7ded6b2f543842a8f5eccc01c2ea0723b"
export DECISION_LAB_EMBEDDING_CACHE_PATH="$lab_root/full-fidelity/query-cache.json"
export DECISION_LAB_MIGRATION_HASH
DECISION_LAB_MIGRATION_HASH="$(find "$repo_root/supabase/migrations" -type f -name '*.sql' -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"

base_config="$repo_root/decision-lab/config/world-v1.json"
first_run=true
for mode in $modes; do
  mode_dir="$(printf '%s' "$mode" | tr '[:upper:]' '[:lower:]')"
  for seed in $seeds; do
    config="$lab_root/config/${mode_dir}-${seed}.json"
    jq --arg seed "$seed" --arg scenario "golden-scenarios-v1.1" --arg evaluation "decision-evaluator-v1.1" --arg mode "$mode" '.seed=$seed | .scenarioSetVersion=$scenario | .evaluationVersion=$evaluation | .embeddingMode=$mode' "$base_config" > "$config"
    node "$repo_root/decision-lab/src/cli.mjs" seed --config "$config" --output "$lab_root/generated/$mode_dir" > "$lab_root/${mode_dir}-${seed}-seed.json"
    seed_sql="$(jq -r .sqlPath "$lab_root/${mode_dir}-${seed}-seed.json")"
    world_root="$(jq -r .output "$lab_root/${mode_dir}-${seed}-seed.json")"
    full_sql=""
    if test "$mode" = FULL_FIDELITY; then
      node "$repo_root/decision-lab/src/wave2-full-fidelity-embeddings.mjs" estimate --world "$world_root/world.json" --query-token-allowance 4200
      full_sql="$lab_root/full-fidelity/${seed}.sql"
      node "$repo_root/decision-lab/src/wave2-full-fidelity-embeddings.mjs" generate --world "$world_root/world.json" --query-token-allowance 4200 --max-usd 1 --output-sql "$full_sql" --output-manifest "$lab_root/full-fidelity/${seed}.json" >/dev/null
    fi
    for engine in $engines; do
      if test "$first_run" = false; then supabase db reset --workdir "$lab_root" --local --no-seed >/dev/null; fi
      first_run=false
      PGOPTIONS='-c client_min_messages=error' psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$seed_sql" >/dev/null
      if test -n "$full_sql"; then PGOPTIONS='-c client_min_messages=error' psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$full_sql" >/dev/null; fi
      node "$repo_root/decision-lab/src/d3.1-treatment-users-sql.mjs" "$world_root/world.json" > "$lab_root/treatment-users.sql"
      PGOPTIONS='-c client_min_messages=error' psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$lab_root/treatment-users.sql" >/dev/null
      mkdir -p "$lab_root/output/$mode_dir/$engine"
      node "$repo_root/decision-lab/src/wave2-world-cli.mjs" --engine "$engine" --config "$config" --output "$lab_root/output/$mode_dir/$engine/${seed}.json"
    done
  done
done

supabase stop --project-id "$project_id" --no-backup >/dev/null 2>&1
started=false
if test "$modes" = "FAST_SIMULATION FULL_FIDELITY" && test "$seeds" = "backyrd-d1-basel-v1-2026 backyrd-d1-basel-v1-2026-2 backyrd-d1-basel-v1-2026-3" && test "$engines" = "wave1 wave2"; then
  node "$repo_root/decision-lab/src/wave2-aggregate.mjs" --input "$lab_root/output" --full-fidelity "$lab_root/full-fidelity" --query-cache "$DECISION_LAB_EMBEDDING_CACHE_PATH" --output "$repo_root/decision-lab/baselines/wave2-retrieval-spot-intelligence-v1.json"
else
  printf 'Wave 2 diagnostic subset completed; no promotable baseline was written.\n'
fi
printf 'Wave 2 comparison completed; disposable environment destroyed.\n'
