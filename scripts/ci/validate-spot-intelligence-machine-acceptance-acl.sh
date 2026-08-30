#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260829204500_spot_intelligence_machine_acceptance_v1.sql"
delta="$repo_root/supabase/canonical/public-acl-spot-intelligence-machine-acceptance-v1.delta"
definer_delta="$repo_root/supabase/security/security-definer-spot-intelligence-machine-acceptance-v1.delta.json"
claim_migration="$repo_root/supabase/migrations/20260829221500_scope_research_claim_to_population_run_v1.sql"
claim_delta="$repo_root/supabase/canonical/public-acl-spot-research-run-scoped-claim-v1.delta"
legacy_claim_migration="$repo_root/supabase/migrations/20260829223000_isolate_population_jobs_from_legacy_research_v1.sql"
revalidation_migration="$repo_root/supabase/migrations/20260830202410_revalidate_intelligence_operational_facts_v1.sql"
revalidation_delta="$repo_root/supabase/canonical/public-acl-intelligence-operational-revalidation-v1.delta"
revalidation_definer_delta="$repo_root/supabase/security/security-definer-intelligence-operational-revalidation-v1.delta.json"
hours_scope_migration="$repo_root/supabase/migrations/20260830204938_harden_operational_hours_service_scope_v1.sql"
fail(){ printf 'Spot Intelligence Machine Acceptance ACL validation failed: %s\n' "$*" >&2;exit 1;}
test -f "$migration" || fail 'migration missing'
test -f "$delta" || fail 'reviewed delta missing'
test -f "$definer_delta" || fail 'reviewed SECURITY DEFINER delta missing'
test -f "$claim_migration" || fail 'run-scoped claim migration missing'
test -f "$claim_delta" || fail 'run-scoped claim reviewed delta missing'
test -f "$legacy_claim_migration" || fail 'legacy claim isolation migration missing'
test -f "$revalidation_migration" || fail 'operational revalidation migration missing'
test -f "$revalidation_delta" || fail 'operational revalidation reviewed ACL delta missing'
test -f "$revalidation_definer_delta" || fail 'operational revalidation reviewed SECURITY DEFINER delta missing'
test -f "$hours_scope_migration" || fail 'operational hours service-scope hardening migration missing'
test "$(wc -l < "$delta" | tr -d ' ')" = 6 || fail 'delta must contain exactly six effective grants'
test "$(grep -c '|service_role|' "$delta")" = 6 || fail 'non-service role in delta'
if grep -Eq '\|(anon|authenticated)\|' "$delta";then fail 'client role in delta';fi
grep -Fq "grant execute on function public.backyrd_enqueue_spot_intelligence_population_job_v1(uuid,uuid) to service_role;" "$migration" || fail 'population enqueue grant drift'
grep -Fq "grant execute on function public.backyrd_machine_accept_v1(uuid,text,text) to service_role;" "$migration" || fail 'machine acceptance grant drift'
grep -Fq "grant select,insert,update on public.backyrd_spot_intelligence_population_v1 to service_role;" "$migration" || fail 'population ledger grant drift'
grep -Fq "grant select on public.backyrd_spot_machine_acceptance_policy_v1 to service_role;" "$migration" || fail 'policy grant drift'
client_grants="$(grep -Ei '^grant .* to (anon|authenticated|public)([,;]|$)' "$migration" || true)"
expected_admin_grant='grant execute on function public.backyrd_admin_spot_engine_operations_v1(text,uuid,text,integer,integer) to authenticated;'
if test -n "$client_grants" && test "$client_grants" != "$expected_admin_grant";then fail 'unexpected client grant';fi
if grep -Eqi '^grant (all|delete|truncate|references|trigger)' "$migration";then fail 'overbroad service grant';fi
if rg -q 'p_(actor|user)(_id)?[[:space:]]' "$migration";then fail 'caller-controlled actor parameter';fi
test "$(cat "$claim_delta")" = 'FUNCTION|backyrd_claim_spot_research_job_v2(text,integer,uuid)|service_role|EXECUTE' || fail 'run-scoped claim delta differs from exact reviewed grant'
test "$(grep -c '^grant execute on function ' "$claim_migration")" = 1 || fail 'run-scoped claim has unexpected grant count'
grep -Fq 'grant execute on function public.backyrd_claim_spot_research_job_v2(text,integer,uuid) to service_role;' "$claim_migration" || fail 'run-scoped service grant drift'
grep -Fq 'revoke all on function public.backyrd_claim_spot_research_job_v2(text,integer,uuid) from public,anon,authenticated,service_role;' "$claim_migration" || fail 'run-scoped pre-grant revoke boundary missing'
if grep -Eqi '^grant .* to (anon|authenticated|public)([,;]|$)' "$claim_migration";then fail 'run-scoped claim granted to client role';fi
if grep -Eqi '^grant .* on (table|sequence) ' "$claim_migration";then fail 'run-scoped claim migration grants table or sequence access';fi
if rg -q 'p_(actor|user)(_id)?[[:space:]]' "$claim_migration";then fail 'run-scoped claim accepts caller-controlled actor';fi
grep -Fq "if coalesce(auth.role(),'')<>'service_role'" "$claim_migration" || fail 'run-scoped runtime service guard missing'
test "$(grep -Fc 'population_run_id is null' "$legacy_claim_migration")" -ge 3 || fail 'legacy claim does not isolate Population recovery and selection'
grep -Fq 'revoke all on function public.backyrd_claim_spot_research_job_v1(text,integer) from public,anon,authenticated,service_role;' "$legacy_claim_migration" || fail 'legacy claim pre-grant revoke boundary missing'
grep -Fq 'grant execute on function public.backyrd_claim_spot_research_job_v1(text,integer) to service_role;' "$legacy_claim_migration" || fail 'legacy claim service grant drift'
if grep -Eqi '^grant .* to (anon|authenticated|public)([,;]|$)' "$legacy_claim_migration";then fail 'legacy claim granted to client role';fi
test "$(cat "$revalidation_delta")" = 'FUNCTION|backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer)|service_role|EXECUTE' || fail 'operational revalidation delta differs from exact reviewed grant'
test "$(grep -c '^grant execute on function ' "$revalidation_migration")" = 1 || fail 'operational revalidation has unexpected grant count'
grep -Fq 'revoke all on function public.backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer)' "$revalidation_migration" || fail 'operational revalidation gateway pre-grant revoke missing'
grep -Fq 'grant execute on function public.backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer)' "$revalidation_migration" || fail 'operational revalidation service grant drift'
if grep -Eqi '^grant .* to (anon|authenticated|public)([,;]|$)' "$revalidation_migration";then fail 'operational revalidation granted to client role';fi
if grep -Eqi '^grant .* on (table|sequence) ' "$revalidation_migration";then fail 'operational revalidation grants table or sequence access';fi
if rg -q 'p_(actor|user)(_id)?[[:space:]]' "$revalidation_migration";then fail 'operational revalidation accepts caller-controlled actor';fi
test "$(grep -Fc "coalesce(auth.role(),'')<>'service_role'" "$revalidation_migration")" -ge 2 || fail 'operational revalidation runtime service guards missing'
test "$(grep -c '^grant execute on function ' "$hours_scope_migration")" = 1 || fail 'hours service-scope hardening has unexpected grant count'
grep -Fq 'revoke all on function public.backyrd_research_regular_hours_spot_scope_v1(text,text)' "$hours_scope_migration" || fail 'hours service-scope helper revoke missing'
grep -Fq 'revoke all on function public.backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer)' "$hours_scope_migration" || fail 'hours service-scope gateway pre-grant revoke missing'
grep -Fq 'grant execute on function public.backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer)' "$hours_scope_migration" || fail 'hours service-scope service grant drift'
grep -Fq "coalesce(auth.role(),'')<>'service_role'" "$hours_scope_migration" || fail 'hours service-scope runtime service guard missing'
grep -Fq "'reason','SERVICE_SCHEDULE_NOT_VENUE_HOURS'" "$hours_scope_migration" || fail 'hours service-scope fail-closed audit reason missing'
if grep -Eqi '^grant .* to (anon|authenticated|public)([,;]|$)' "$hours_scope_migration";then fail 'hours service-scope hardening granted to client role';fi
if grep -Eqi '^grant .* on (table|sequence) ' "$hours_scope_migration";then fail 'hours service-scope hardening grants table or sequence access';fi
if rg -q 'p_(actor|user)(_id)?[[:space:]]' "$hours_scope_migration";then fail 'hours service-scope hardening accepts caller-controlled actor';fi
test "$(grep -Fc "coalesce(auth.role(),'')<>'service_role'" "$migration")" -ge 4 || fail 'service-only runtime guards missing'
jq -e '
  .version == 1 and (.functions|length) == 11
  and ([.functions[].signature]|length == (unique|length))
  and ([.functions[]|select(.classification == "SERVICE_INTERNAL" and (.anon or .authenticated or .serviceRole))]|length == 0)
  and ([.functions[]|select(.classification == "WORKER" and (.anon or .authenticated or (.serviceRole|not)))]|length == 0)
  and ([.functions[]|select(.classification == "ADMIN" and (.anon or (.authenticated|not) or .serviceRole))]|length == 0)
' "$definer_delta" >/dev/null || fail 'SECURITY DEFINER classification delta invalid'
jq -e '
  .version == 1 and (.functions|length) == 2
  and ([.functions[].signature]|length == (unique|length))
  and ([.functions[]|select(.classification == "SERVICE_INTERNAL" and (.anon or .authenticated or .serviceRole))]|length == 0)
  and ([.functions[]|select(.classification == "WORKER" and (.anon or .authenticated or (.serviceRole|not)))]|length == 0)
' "$revalidation_definer_delta" >/dev/null || fail 'operational revalidation SECURITY DEFINER classification delta invalid'
printf 'Spot Intelligence Machine Acceptance ACL and operational revalidation deltas are exact and service-only.\n'
