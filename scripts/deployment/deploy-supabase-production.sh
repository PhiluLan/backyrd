#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

plan_path="${1:-supabase-production-plan.json}"
test -f "$plan_path" || { echo "production plan missing: $plan_path" >&2; exit 1; }
test "${GITHUB_REF:-}" = "refs/heads/main" || { echo "canonical main ref required" >&2; exit 1; }
test "${GITHUB_SHA:-}" = "$(git rev-parse HEAD)" || { echo "canonical main SHA mismatch" >&2; exit 1; }
test "$(jq -r '.canonicalMainSha' "$plan_path")" = "$GITHUB_SHA" || { echo "plan SHA mismatch" >&2; exit 1; }
test "$(jq -r '.projectRef' "$plan_path")" = "hjgcrrzfjchzqoegcywn" || { echo "Production project mismatch" >&2; exit 1; }
test "$(supabase --version)" = "$(jq -r '.supabaseCliVersion' "$plan_path")" || { echo "Supabase CLI identity mismatch" >&2; exit 1; }

mkdir -p .deployment-audit
cp "$plan_path" .deployment-audit/plan.json
if test "$(jq -r '.runtimeDeploymentRequired' "$plan_path")" != "true"; then
  jq '{
    result:"NO_RUNTIME_DEPLOY",
    reason:"BOUND_RUNTIME_SCOPE_UNCHANGED",
    canonicalMainSha,
    planHash,
    supabaseCliVersion,
    functions:[.functions[]|{slug,sourceSetHash,configHash,verifyJwt}],
    migrations
  }' "$plan_path" > .deployment-audit/result.json
  exit 0
fi
test -n "${SUPABASE_ACCESS_TOKEN:-}" || { echo "SUPABASE_ACCESS_TOKEN required" >&2; exit 1; }

supabase functions list --project-ref hjgcrrzfjchzqoegcywn --output json > .deployment-audit/functions-before.json

mapfile -t planned_migrations < <(jq -r '.migrations[].path' "$plan_path")
if test "${#planned_migrations[@]}" -gt 0; then
  supabase db push --dry-run 2>&1 | tee .deployment-audit/migration-dry-run.txt
  for migration in "${planned_migrations[@]}"; do
    grep -F "$(basename "$migration")" .deployment-audit/migration-dry-run.txt >/dev/null || { echo "planned migration absent from dry run: $migration" >&2; exit 1; }
  done
  mapfile -t dry_run_migrations < <(grep -Eo '[0-9]{14}_[a-z0-9_]+\.sql' .deployment-audit/migration-dry-run.txt | sort -u)
  test "${#dry_run_migrations[@]}" -eq "${#planned_migrations[@]}" || { echo "remote pending migration scope differs from canonical plan" >&2; exit 1; }
  supabase db push --yes 2>&1 | tee .deployment-audit/migration-apply.txt
fi

mapfile -t functions < <(jq -r '.functions[] | select(.deploy) | .slug' "$plan_path")
for slug in "${functions[@]}"; do
  verify_jwt="$(jq -r --arg slug "$slug" '.functions[] | select(.slug==$slug) | .verifyJwt' "$plan_path")"
  args=(functions deploy "$slug" --project-ref hjgcrrzfjchzqoegcywn --use-api)
  if test "$verify_jwt" = "false"; then args+=(--no-verify-jwt); fi
  supabase "${args[@]}"
done

supabase functions list --project-ref hjgcrrzfjchzqoegcywn --output json > .deployment-audit/functions-after.json
node scripts/deployment/verify-supabase-production-audit.mjs \
  --plan .deployment-audit/plan.json \
  --before .deployment-audit/functions-before.json \
  --after .deployment-audit/functions-after.json \
  --output .deployment-audit/result.json
