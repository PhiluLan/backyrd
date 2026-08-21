-- RLS policies must be able to evaluate consent without exposing the generic
-- service-only helper, which accepts an arbitrary user id. This wrapper is
-- deliberately bound to auth.uid() and therefore cannot probe another user.
create or replace function public.backyrd_current_user_has_personalization_consent_v1()
returns boolean
language sql
stable
security definer
set search_path=public,pg_catalog
as $$
  select public.user_has_active_consent_v1(
    auth.uid(),
    'personalized_recommendations'
  );
$$;

revoke all on function public.backyrd_current_user_has_personalization_consent_v1()
  from public,anon;
grant execute on function public.backyrd_current_user_has_personalization_consent_v1()
  to authenticated;

drop policy if exists user_intelligence_snapshot_v2_read_own
  on public.backyrd_user_intelligence_snapshots_v2;
create policy user_intelligence_snapshot_v2_read_own
  on public.backyrd_user_intelligence_snapshots_v2
  for select to authenticated
  using (
    auth.uid()=user_id
    and public.backyrd_current_user_has_personalization_consent_v1()
  );

drop policy if exists user_intelligence_latest_v1_read_own
  on public.backyrd_user_intelligence_latest_v1;
create policy user_intelligence_latest_v1_read_own
  on public.backyrd_user_intelligence_latest_v1
  for select to authenticated
  using (
    auth.uid()=user_id
    and public.backyrd_current_user_has_personalization_consent_v1()
  );

drop policy if exists user_intelligence_nodes_read_own_v2
  on public.backyrd_user_intelligence_nodes_v2;
create policy user_intelligence_nodes_read_own_v2
  on public.backyrd_user_intelligence_nodes_v2
  for select to authenticated
  using (
    auth.uid()=user_id
    and public.backyrd_current_user_has_personalization_consent_v1()
  );

drop policy if exists user_intelligence_cards_read_own_v1
  on public.backyrd_user_card_snapshots_v1;
create policy user_intelligence_cards_read_own_v1
  on public.backyrd_user_card_snapshots_v1
  for select to authenticated
  using (
    auth.uid()=user_id
    and public.backyrd_current_user_has_personalization_consent_v1()
  );
