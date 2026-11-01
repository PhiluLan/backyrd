\set ON_ERROR_STOP on
begin;
-- Synthetic fixtures; no production users or interests.
insert into public.spots(id,status,data_origin,name,lat,lng) values
 ('88110000-0000-4000-8000-000000000001','approved','REAL','Public early',47.55,7.59),
 ('88110000-0000-4000-8000-000000000002','approved','REAL','Public established',47.55,7.59),
 ('88110000-0000-4000-8000-000000000003','pending','REAL','Pending',47.55,7.59),
 ('88110000-0000-4000-8000-000000000004','approved','FIXTURE','Non-product',47.55,7.59),
 ('88110000-0000-4000-8000-000000000005','approved','REAL','Quarantined',47.55,7.59);
insert into public.backyrd_spot_mood_profile_v1
 (spot_id,concept_key,concept_contributors,eligible_contributors,percentage,evidence_state,rank)
select s.id,c.concept_key,case when s.name='Public early' then 1 else 2 end,
 case when s.name='Public early' then 1 else 2 end,100,'EARLY',1
from public.spots s cross join lateral
 (select concept_key from public.backyrd_mood_concepts_v1 where active order by concept_key limit 1) c
where s.id::text like '88110000-%';
-- Spot insert registers its safety entity; use the canonical entity ID, never a duplicate.
insert into public.distribution_trust_states(content_item_id,engine_version,automatic_state,effective_state,evaluation_source)
select i.id,v.version,'quarantined','quarantined','automatic'
from public.safety_content_items i cross join public.distribution_trust_engine_versions v
where i.entity_type='spot' and i.entity_id='88110000-0000-4000-8000-000000000005' and v.status='active'
on conflict(content_item_id) do update set effective_state='quarantined',automatic_state='quarantined';

-- An untrusted temporary relation must not shadow an unqualified table reference.
create temporary table spots(id uuid,name text,city text);
create temporary table reviews(id uuid,spot_id uuid);
insert into pg_temp.spots values('88110000-0000-4000-8000-000000000099','SHADOW ATTACK','Fake');
do $$ begin
 if exists(select 1 from public.spots_with_review_count() where id='88110000-0000-4000-8000-000000000099') then
  raise exception 'temporary table shadowed canonical table';
 end if;
 if public.normalize_mood_text('  GEMÜTLICH  ') <> 'gemütlich' then raise exception 'normalizer regressed'; end if;
 if public.backyrd_normalize_owner_email_v1(' ADMIN@EXAMPLE.COM ') <> 'admin@example.com' then raise exception 'contact normalization regressed'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and p.proconfig is null
 and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')) then
  raise exception 'unpinned application function remains';
 end if;
end $$;
-- backyrd:authorization-positive
set local role anon;
do $$ declare r record; begin
 select * into strict r from public.backyrd_spot_mood_profile_public_v1 where spot_id='88110000-0000-4000-8000-000000000001';
 if r.evidence_state<>'EARLY' or r.concept_contributors is not null or r.eligible_contributors is not null or r.percentage is not null then
  raise exception 'one-person privacy boundary regressed'; end if;
 select * into strict r from public.backyrd_spot_mood_profile_public_v1 where spot_id='88110000-0000-4000-8000-000000000002';
 if r.evidence_state<>'ESTABLISHED' or r.eligible_contributors<>2 or r.percentage<>100 then
  raise exception 'two-person public threshold regressed'; end if;
-- backyrd:authorization-negative
 if exists(select 1 from public.backyrd_spot_mood_profile_public_v1 where spot_id in
 ('88110000-0000-4000-8000-000000000003','88110000-0000-4000-8000-000000000004','88110000-0000-4000-8000-000000000005')) then
  raise exception 'ineligible spot exposed'; end if;
 begin
  perform * from public.backyrd_spot_mood_profile_v1;
  raise exception 'anon raw count exposure';
 exception when insufficient_privilege then null; end;
 begin
  execute 'create table public.beta_untrusted_create(id int)';
  raise exception 'untrusted public schema create allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"88110000-0000-4000-8000-000000000090"}',true);
do $$ begin
 if (select count(*) from public.backyrd_spot_mood_profile_public_v1 where spot_id::text like '88110000-%')<>2 then
  raise exception 'authenticated public visibility regressed'; end if;
 if exists(select 1 from public.backyrd_spot_mood_profile_v1 where spot_id::text like '88110000-%') then
  raise exception 'ordinary account reads raw counts'; end if;
end $$;
reset role;
-- The worker is authorized; ordinary clients cannot invoke any internal batch endpoint.
do $$ declare f text; begin
 foreach f in array array[
  'public.backyrd_backfill_contextual_taste_v1(integer)',
  'public.backyrd_backfill_place_type_preferences_v1(integer)',
  'public.backyrd_backfill_taxonomy_embeddings_v1(integer,integer,boolean)',
  'public.backyrd_claim_spot_embedding_jobs_v13(integer)',
  'public.backyrd_embedding_queue_status_v13()',
  'public.backyrd_embedding_status_v13()',
  'public.backyrd_get_pending_spot_embedding_documents_v13(integer)',
  'public.backyrd_mark_spot_embedding_job_done_v13(uuid,text)',
  'public.backyrd_refresh_all_spot_ml_documents_v13(integer)',
  'public.upsert_cluster_and_map_token(integer,text,numeric,text)'] loop
  if has_function_privilege('anon',f,'execute') or has_function_privilege('authenticated',f,'execute') then
   raise exception 'client worker access remains: %',f; end if;
  if not has_function_privilege('service_role',f,'execute') then raise exception 'worker lost access: %',f; end if;
 end loop;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.backyrd_claim_spot_embedding_jobs_v13(1);
  raise exception 'anon claimed work';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin
  perform * from public.backyrd_backfill_contextual_taste_v1(1);
  raise exception 'ordinary user triggered cross-user backfill';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select * from public.backyrd_embedding_queue_status_v13();
select * from public.backyrd_embedding_status_v13();
reset role;
select 'beta security boundaries: PASS';
rollback;
