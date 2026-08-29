#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260829204500_spot_intelligence_machine_acceptance_v1.sql"
delta="$repo_root/supabase/canonical/public-acl-spot-intelligence-machine-acceptance-v1.delta"
definer_delta="$repo_root/supabase/security/security-definer-spot-intelligence-machine-acceptance-v1.delta.json"
fail(){ printf 'Spot Intelligence Machine Acceptance ACL validation failed: %s\n' "$*" >&2;exit 1;}
test -f "$migration" || fail 'migration missing'
test -f "$delta" || fail 'reviewed delta missing'
test -f "$definer_delta" || fail 'reviewed SECURITY DEFINER delta missing'
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
test "$(grep -Fc "coalesce(auth.role(),'')<>'service_role'" "$migration")" -ge 4 || fail 'service-only runtime guards missing'
jq -e '
  .version == 1 and (.functions|length) == 10
  and ([.functions[].signature]|length == (unique|length))
  and ([.functions[]|select(.classification == "SERVICE_INTERNAL" and (.anon or .authenticated or .serviceRole))]|length == 0)
  and ([.functions[]|select(.classification == "WORKER" and (.anon or .authenticated or (.serviceRole|not)))]|length == 0)
  and ([.functions[]|select(.classification == "ADMIN" and (.anon or (.authenticated|not) or .serviceRole))]|length == 0)
' "$definer_delta" >/dev/null || fail 'SECURITY DEFINER classification delta invalid'
printf 'Spot Intelligence Machine Acceptance ACL delta is exactly six service-only grants.\n'
