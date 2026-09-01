-- Gate 5 proved that the inherited development policy below exposed every
-- user's achievement assignments to every authenticated account. Achievement
-- definitions stay public Product metadata; assignments are private user data.

drop policy if exists "Allow all read during dev"
  on public.user_achievements;
drop policy if exists "Users can read own user_achievements"
  on public.user_achievements;
drop policy if exists user_achievements_select_own_v2
  on public.user_achievements;

create policy user_achievements_select_own_v2
  on public.user_achievements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_achievements from anon, authenticated;
grant select on table public.user_achievements to authenticated;
grant all on table public.user_achievements to service_role;

comment on policy user_achievements_select_own_v2
  on public.user_achievements is
  'Gate 5: achievement assignments are visible only to the canonical owning user.';
