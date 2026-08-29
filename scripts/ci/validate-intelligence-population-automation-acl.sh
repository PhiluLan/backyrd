#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260830010000_automate_intelligence_population_v1.sql"
delta="$repo_root/supabase/security/security-definer-intelligence-population-automation-v1.delta.json"
fail(){ printf 'Intelligence Population automation ACL validation failed: %s\n' "$*" >&2;exit 1; }
test -f "$migration" || fail 'migration missing'
test -f "$delta" || fail 'SECURITY DEFINER delta missing'
grep -Fq "revoke all on function public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid)," "$migration" || fail 'tick control client revoke drift'
grep -Fq "public.backyrd_configure_intelligence_population_worker_v1(text) from public,anon,authenticated;" "$migration" || fail 'cron configure client revoke drift'
grep -Fq "grant execute on function public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid)," "$migration" || fail 'tick control service grant drift'
grep -Fq "public.backyrd_configure_intelligence_population_worker_v1(text) to service_role;" "$migration" || fail 'cron configure service grant drift'
grep -Fq "'*/2 * * * *'" "$migration" || fail 'bounded cron schedule drift'
grep -Fq "body:='{\"action\":\"POPULATION_TICK\"}'::jsonb" "$migration" || fail 'cron action drift'
jq -e '
  .version==1 and (.functions|length)==2 and
  all(.functions[];
    .classification=="WORKER" and .anon==false and .authenticated==false and .serviceRole==true and
    (.signature|test("^(backyrd_intelligence_population_tick_control_v1\\(uuid,text,uuid\\)|backyrd_configure_intelligence_population_worker_v1\\(text\\))$"))
  )
' "$delta" >/dev/null || fail 'SECURITY DEFINER delta invalid'
printf 'Intelligence Population automation ACL contract passed.\n'
