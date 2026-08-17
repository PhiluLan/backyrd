#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
lab_root="$(mktemp -d "${TMPDIR:-/tmp}/backyrd-wave3c.XXXXXX")"
project_id="backyrd-wave3c-personalized-decision"
started=false

cleanup() {
  if test "$started" = true; then supabase stop --project-id "$project_id" --no-backup >/dev/null 2>&1 || true; fi
  case "$lab_root" in
    "${TMPDIR:-/tmp}"/backyrd-wave3c.*|/tmp/backyrd-wave3c.*) rm -rf "$lab_root" ;;
    *) printf 'Refusing unexpected cleanup path: %s\n' "$lab_root" >&2 ;;
  esac
}
trap cleanup EXIT

node "$repo_root/decision-lab/src/wave3c-freeze.mjs" validate >/dev/null
mkdir -p "$lab_root/supabase" "$lab_root/generated" "$lab_root/output" "$lab_root/config" "$repo_root/decision-lab/baselines"
cp "$repo_root/supabase/config.toml" "$lab_root/supabase/config.toml"
cp -R "$repo_root/supabase/migrations" "$lab_root/supabase/migrations"
cp -R "$repo_root/supabase/canonical" "$lab_root/supabase/canonical"
sed -i.bak "s/^project_id = .*/project_id = \"$project_id\"/" "$lab_root/supabase/config.toml"
sed -i.bak -e 's/port = 54321/port = 59621/' -e 's/port = 54322/port = 59622/' -e 's/shadow_port = 54320/shadow_port = 59620/' -e 's/port = 54329/port = 59629/' -e 's/port = 54323/port = 59623/' -e 's/port = 54324/port = 59624/' -e 's/port = 54327/port = 59627/' "$lab_root/supabase/config.toml"
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
export DECISION_LAB_ALLOW_LOCAL=1 DECISION_LAB_DB_URL="$DB_URL" DECISION_LAB_SUPABASE_URL="$API_URL" DECISION_LAB_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" DECISION_LAB_JWT_SECRET="$JWT_SECRET"
export DECISION_LAB_WORKDIR="$lab_root" DECISION_LAB_SOURCE_MAIN_SHA="$(git -C "$repo_root" rev-parse HEAD)"
export DECISION_LAB_MIGRATION_HASH
DECISION_LAB_MIGRATION_HASH="$(find "$repo_root/supabase/migrations" -type f -name '*.sql' -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"

base_config="$repo_root/decision-lab/config/world-v1.json"
first_run=true
for seed in backyrd-d1-basel-v1-2026 backyrd-d1-basel-v1-2026-2 backyrd-d1-basel-v1-2026-3; do
  config="$lab_root/config/$seed.json"
  jq --arg seed "$seed" '.seed=$seed | .scenarioSetVersion="golden-scenarios-v1.1" | .evaluationVersion="decision-evaluator-v1.1" | .embeddingMode="FAST_SIMULATION"' "$base_config" > "$config"
  node "$repo_root/decision-lab/src/cli.mjs" seed --config "$config" --output "$lab_root/generated" > "$lab_root/$seed-seed.json"
  seed_sql="$(jq -r .sqlPath "$lab_root/$seed-seed.json")"
  world_root="$(jq -r .output "$lab_root/$seed-seed.json")"
  database_log="$lab_root/$seed-database.log"
  if test "$first_run" = false; then supabase db reset --workdir "$lab_root" --local --no-seed > "$database_log" 2>&1; fi
  first_run=false
  PGOPTIONS='-c client_min_messages=error' psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$seed_sql" >> "$database_log" 2>&1
  node "$repo_root/decision-lab/src/d3.1-treatment-users-sql.mjs" "$world_root/world.json" > "$lab_root/treatment-users.sql"
  PGOPTIONS='-c client_min_messages=error' psql "$DB_URL" -X --set ON_ERROR_STOP=1 --file "$lab_root/treatment-users.sql" >> "$database_log" 2>&1
  node "$repo_root/decision-lab/src/wave3c-world-cli.mjs" --config "$config" --output "$lab_root/output/$seed.json"
done

supabase stop --project-id "$project_id" --no-backup >/dev/null 2>&1
started=false
node "$repo_root/decision-lab/src/wave3c-aggregate.mjs" --input "$lab_root/output" --output "$repo_root/decision-lab/baselines/wave3c-personalized-decision-v1.json"
printf 'Wave 3C official run completed; disposable environment destroyed.\n'
