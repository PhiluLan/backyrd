-- Explicitly authorized hard delete of four unwanted Production Spot identities.
-- The target ids, identities, dependency counts, and User Intelligence firewall
-- are guarded so this migration fails closed if Production changed after audit.
create temporary table backyrd_final_spot_delete_v1(
  spot_id uuid primary key,
  expected_name text not null,
  expected_status public.spot_status not null,
  expected_analytics integer not null
) on commit drop;

insert into backyrd_final_spot_delete_v1 values
  ('332d06e4-1cd5-4d4d-b241-fc916f22ee4b','Gartenbad & Sportbad St. Jakob','pending',3),
  ('c65c4ff6-ab2f-47ee-bd72-66bcaed202f5','Gartenbad & Sportbad St. Jakob','pending',6),
  ('0c1c741b-9b2c-4bea-aa31-faf184a4659a','Ufer 7','archived',10),
  ('ff2de5d2-ec82-4569-82e6-fd14f51af39a','Ufer7','pending',9);

do $$
begin
  if (select count(*) from backyrd_final_spot_delete_v1) <> 4 then
    raise exception 'final_spot_delete_set_size_mismatch';
  end if;

  if exists(
    select 1
    from backyrd_final_spot_delete_v1 target
    left join public.spots spot on spot.id=target.spot_id
    where spot.id is null
       or spot.name<>target.expected_name
       or spot.status<>target.expected_status
       or spot.data_origin<>'LEGACY'
  ) then
    raise exception 'final_spot_delete_identity_mismatch';
  end if;

  if exists(
    select 1
    from backyrd_final_spot_delete_v1 target
    where (select count(*) from public.analytics_events event where event.spot_id=target.spot_id)
          <> target.expected_analytics
  ) then
    raise exception 'final_spot_delete_analytics_count_mismatch';
  end if;

  -- No target may carry canonical N2, temporal evidence, User Evidence, or
  -- durable Taste lineage. This remains a hard firewall despite deletion
  -- authorization for ordinary Spot-bound Product history.
  if exists(select 1 from public.backyrd_memory_bridge_product_actions_v1 row join backyrd_final_spot_delete_v1 target on target.spot_id=row.spot_id)
     or exists(select 1 from public.backyrd_memory_event_evidence_envelopes_v1 row join backyrd_final_spot_delete_v1 target on target.spot_id=row.spot_id)
     or exists(select 1 from public.backyrd_memory_events_v1 row join backyrd_final_spot_delete_v1 target on target.spot_id=row.spot_id)
     or exists(select 1 from public.backyrd_self_declared_taste_v1 row join backyrd_final_spot_delete_v1 target on target.spot_id=row.spot_id)
     or exists(select 1 from public.backyrd_taste_evidence_v1 row join backyrd_final_spot_delete_v1 target on target.spot_id=row.spot_id)
     or exists(select 1 from public.backyrd_user_evidence_chains_v1 row join backyrd_final_spot_delete_v1 target on target.spot_id=row.spot_id)
     or exists(select 1 from public.user_taste_events_v2 row join backyrd_final_spot_delete_v1 target on target.spot_id=row.spot_id)
  then
    raise exception 'final_spot_delete_user_intelligence_guard';
  end if;

  if (select count(*) from public.user_favorite_spot_seeds
      where spot_id='0c1c741b-9b2c-4bea-aa31-faf184a4659a') <> 3
     or exists(
       select 1 from public.user_favorite_spot_seeds seed
       join backyrd_final_spot_delete_v1 target on target.spot_id=seed.spot_id
       where seed.spot_id<>'0c1c741b-9b2c-4bea-aa31-faf184a4659a'
     )
  then
    raise exception 'final_spot_delete_onboarding_seed_guard';
  end if;
end;
$$;

do $$
declare
  affected integer;
begin
  -- Preserve the three human onboarding selections as literal historical
  -- seeds while removing their deleted canonical Spot reference.
  update public.user_favorite_spot_seeds
  set spot_id=null,
      raw_spot_name=coalesce(raw_spot_name,'Ufer 7'),
      updated_at=now()
  where spot_id='0c1c741b-9b2c-4bea-aa31-faf184a4659a';
  get diagnostics affected = row_count;
  if affected<>3 then raise exception 'final_spot_delete_seed_detach_mismatch'; end if;

  delete from public.analytics_events row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>28 then raise exception 'final_spot_delete_analytics_delete_mismatch'; end if;

  delete from public.safety_content_items row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>5 then raise exception 'final_spot_delete_safety_delete_mismatch'; end if;

  delete from public.decision_actions row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'final_spot_delete_decision_action_mismatch'; end if;

  delete from public.decision_impressions row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'final_spot_delete_decision_impression_mismatch'; end if;

  delete from public.backyrd_embedding_jobs_v1 row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>3 then raise exception 'final_spot_delete_embedding_job_mismatch'; end if;

  delete from public.backyrd_spot_embeddings_v1 row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>3 then raise exception 'final_spot_delete_embedding_mismatch'; end if;

  delete from public.backyrd_spot_gold_authoring_audit_v1 row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'final_spot_delete_gold_audit_mismatch'; end if;

  delete from public.backyrd_spot_ml_documents_v1 row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>3 then raise exception 'final_spot_delete_ml_document_mismatch'; end if;

  delete from public.spot_google_enrichment_events row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'final_spot_delete_google_event_mismatch'; end if;

  delete from public.spot_hours row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>24 then raise exception 'final_spot_delete_hours_mismatch'; end if;

  delete from public.spot_photos row using backyrd_final_spot_delete_v1 target where row.spot_id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'final_spot_delete_photo_mismatch'; end if;

  delete from public.spots spot using backyrd_final_spot_delete_v1 target where spot.id=target.spot_id;
  get diagnostics affected = row_count;
  if affected<>4 then raise exception 'final_spot_delete_parent_mismatch'; end if;
end;
$$;

-- The normal Admin list is SECURITY DEFINER and includes actionable pending
-- Product Spots. Give authenticated internal Admins the matching direct-read
-- authority without changing public/Product visibility or exposing fixtures.
drop policy if exists spots_select_internal_admin_product_all_status_v1 on public.spots;
create policy spots_select_internal_admin_product_all_status_v1
on public.spots for select to authenticated
using (
  data_origin not in ('TEST','FIXTURE')
  and public.is_admin_v1(auth.uid())
);

comment on policy spots_select_internal_admin_product_all_status_v1 on public.spots is
  'Admin detail parity with admin_spots_intelligence_v1 for non-fixture Product Spots across workflow statuses.';
