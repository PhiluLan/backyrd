\set ON_ERROR_STOP on

select count(*) = 1
  and bool_and(policyname = 'user_achievements_select_own_v2')
  and bool_and(cmd = 'SELECT')
  and bool_and(roles = array['authenticated']::name[])
  and bool_and(qual = '(( SELECT auth.uid() AS uid) = user_id)')
  as gate5_current_policy_is_exact
from pg_policies
where schemaname = 'public'
  and tablename = 'user_achievements'
  and cmd = 'SELECT'
\gset
\if :gate5_current_policy_is_exact
  \echo 'Gate 5 hardened achievement policy structure passed.'
\else
  \quit 1
\endif

begin;
drop policy user_achievements_select_own_v2 on public.user_achievements;
create policy "Allow all read during dev"
  on public.user_achievements for select using (true);
create policy "Users can read own user_achievements"
  on public.user_achievements for select using (auth.uid() = user_id);
grant select, insert, update, delete on table public.user_achievements to anon;
grant insert, update, delete on table public.user_achievements to authenticated;

\echo 'Gate 5 reconstructed prior application schema fingerprint follows:'
\ir application-schema-fingerprint.sql

rollback;

select count(*) = 1
  and bool_and(policyname = 'user_achievements_select_own_v2')
  and bool_and(roles = array['authenticated']::name[])
  as gate5_policy_rollback_preserved
from pg_policies
where schemaname = 'public'
  and tablename = 'user_achievements'
  and cmd = 'SELECT'
\gset
\if :gate5_policy_rollback_preserved
  \echo 'Gate 5 hardened achievement policy survived proof rollback.'
\else
  \quit 1
\endif

