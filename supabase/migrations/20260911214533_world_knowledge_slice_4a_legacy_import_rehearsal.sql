-- Slice 4A Production legacy import rehearsal. This migration only enables the
-- isolated Founder environment and remains fail-closed unless the local flag is on.
-- It contains no Production backfill and no Production connection path.

alter table world_knowledge_private.founder_evaluation_spots_v1
  add column catalog_origin text not null default 'MANUAL'
    check (catalog_origin in ('MANUAL','LEGACY_PRODUCTION_IMPORT')),
  add column cohort_selected boolean not null default true;

create table world_knowledge_private.legacy_import_batches_v1 (
  id uuid primary key default gen_random_uuid(),
  import_request_id text not null unique check(length(import_request_id) between 1 and 180),
  export_batch_id text not null,
  source_snapshot_at timestamptz not null,
  source_manifest_hash text not null check(source_manifest_hash ~ '^[0-9a-f]{64}$'),
  transform_manifest_hash text not null check(transform_manifest_hash ~ '^[0-9a-f]{64}$'),
  mapping_version text not null check(mapping_version='backyrd.world-knowledge.legacy-mapping@1.1'),
  mapping_hash text not null check(mapping_hash ~ '^[0-9a-f]{64}$'),
  registry_version text not null check(registry_version='backyrd.world-knowledge.registry@1.1'),
  registry_hash text not null check(registry_hash ~ '^[0-9a-f]{64}$'),
  requested_by_binding_id uuid not null references world_knowledge_private.actor_bindings(id) on delete restrict,
  target_environment text not null check(target_environment='LOCAL_FOUNDER_EVALUATION'),
  import_manifest_hash text not null unique check(import_manifest_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table world_knowledge_private.legacy_import_values_v1 (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references world_knowledge_private.legacy_import_batches_v1(id) on delete restrict,
  spot_id uuid not null references public.spots(id) on delete restrict,
  source_schema text not null,
  source_table text not null,
  source_field text not null,
  original_value_hash text not null check(original_value_hash ~ '^[0-9a-f]{64}$'),
  mapping_version text not null check(mapping_version='backyrd.world-knowledge.legacy-mapping@1.1'),
  mapping_rule text not null,
  mapping_status text not null check(mapping_status in ('DIRECT','NORMALIZED','AMBIGUOUS','SUBJECTIVE','MISSING_PROVENANCE','UNSUPPORTED','DEPRECATED','PROHIBITED','NO_TARGET_KEY')),
  target_attribute_key text,
  transformed_value jsonb,
  disposition text not null check(disposition in ('PREFILL_REQUIRES_CONFIRMATION','REVIEW_REQUIRED','EXCLUDED','IDENTITY_ONLY')),
  reason_code text not null,
  selected_for_confirmation boolean not null default false,
  confirmed_claim_id uuid references world_knowledge_private.claims(id) on delete restrict,
  result_hash text not null check(result_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(batch_id,spot_id,source_field,target_attribute_key)
);

create table world_knowledge_private.legacy_import_confirmations_v1 (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references world_knowledge_private.legacy_import_batches_v1(id) on delete restrict,
  spot_id uuid not null references public.spots(id) on delete restrict,
  actor_binding_id uuid not null references world_knowledge_private.actor_bindings(id) on delete restrict,
  idempotency_key text not null,
  selected_value_ids uuid[] not null,
  result_claim_ids uuid[] not null,
  confirmation_hash text not null unique check(confirmation_hash ~ '^[0-9a-f]{64}$'),
  confirmed_at timestamptz not null,
  unique(actor_binding_id,idempotency_key)
);

alter table world_knowledge_private.legacy_import_batches_v1 enable row level security;
alter table world_knowledge_private.legacy_import_values_v1 enable row level security;
alter table world_knowledge_private.legacy_import_confirmations_v1 enable row level security;
revoke all on world_knowledge_private.legacy_import_batches_v1,world_knowledge_private.legacy_import_values_v1,world_knowledge_private.legacy_import_confirmations_v1 from public,anon,authenticated;
grant all on world_knowledge_private.legacy_import_batches_v1,world_knowledge_private.legacy_import_values_v1,world_knowledge_private.legacy_import_confirmations_v1 to service_role;

create or replace function public.world_admin_import_legacy_batch_v1(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid:=auth.uid(); binding_id uuid; batch_id uuid; existing world_knowledge_private.legacy_import_batches_v1%rowtype;
  spot jsonb; item jsonb; spot_uuid uuid; imported integer:=0; staged integer:=0; import_hash text;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null or not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_payload->>'contractVersion'<>'backyrd.world-knowledge.legacy-local-import@4a.1'
    or p_payload->>'targetEnvironment'<>'LOCAL_FOUNDER_EVALUATION'
    or length(coalesce(p_payload->>'requestId','')) not between 1 and 180
    or coalesce(p_payload->>'transformManifestHash','') !~ '^[0-9a-f]{64}$'
    or coalesce(p_payload->>'sourceManifestHash','') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_payload->'spots')<>'array' then raise exception 'invalid_legacy_import_payload' using errcode='22023'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,'ADMIN');
  import_hash:=encode(extensions.digest(pg_catalog.convert_to((p_payload-'importManifestHash')::text,'UTF8'),'sha256'),'hex');
  if p_payload->>'importManifestHash'<>import_hash then raise exception 'legacy_import_manifest_hash_mismatch' using errcode='22023'; end if;
  select * into existing from world_knowledge_private.legacy_import_batches_v1 b where b.import_request_id=p_payload->>'requestId';
  if found then
    if existing.import_manifest_hash<>import_hash then raise exception 'legacy_import_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('batchId',existing.id,'created',false,'importManifestHash',existing.import_manifest_hash);
  end if;
  insert into world_knowledge_private.legacy_import_batches_v1(import_request_id,export_batch_id,source_snapshot_at,source_manifest_hash,transform_manifest_hash,mapping_version,mapping_hash,registry_version,registry_hash,requested_by_binding_id,target_environment,import_manifest_hash)
  values(p_payload->>'requestId',p_payload->>'exportBatchId',(p_payload->>'sourceSnapshotAt')::timestamptz,p_payload->>'sourceManifestHash',p_payload->>'transformManifestHash','backyrd.world-knowledge.legacy-mapping@1.1',p_payload->>'mappingHash','backyrd.world-knowledge.registry@1.1',p_payload->>'registryHash',binding_id,'LOCAL_FOUNDER_EVALUATION',import_hash) returning id into batch_id;
  for spot in select value from jsonb_array_elements(p_payload->'spots') loop
    spot_uuid:=(spot->>'spotId')::uuid;
    if spot->>'lifecycle'<>'ACTIVE_PUBLISHED' then continue; end if;
    if exists(select 1 from public.spots s where s.id=spot_uuid and coalesce(s.data_origin,'LEGACY')<>'TEST') then raise exception 'local_spot_identity_collision' using errcode='23505'; end if;
    insert into public.spots(id,name,lat,lng,status,created_by,data_origin)
    values(spot_uuid,coalesce(nullif(spot->>'displayName',''),'Legacy-Spot – Prüfung erforderlich'),0,0,'archived',actor_id,'TEST') on conflict(id) do nothing;
    insert into world_knowledge_private.founder_evaluation_spots_v1(spot_id,created_by_binding_id,creation_idempotency_key,catalog_origin,cohort_selected)
    values(spot_uuid,binding_id,'legacy-import:'||(p_payload->>'requestId')||':'||spot_uuid,'LEGACY_PRODUCTION_IMPORT',false) on conflict(spot_id) do nothing;
    insert into world_knowledge_private.shadow_spot_allowlist(spot_id,reason,valid_until)
    values(spot_uuid,'FOUNDER_EVALUATION_ONLY_LEGACY_IMPORT',pg_catalog.clock_timestamp()+interval '180 days') on conflict(spot_id) do update set reason=excluded.reason,valid_until=excluded.valid_until;
    imported:=imported+1;
    for item in select value from jsonb_array_elements(coalesce(spot->'values','[]'::jsonb)) loop
      if item->>'spotId'<>spot_uuid::text or coalesce(item->>'resultHash','') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_legacy_import_value' using errcode='22023'; end if;
      if item->>'targetKey' is not null and not exists(select 1 from world_knowledge_private.attribute_definitions d where d.registry_version='backyrd.world-knowledge.registry@1.1' and d.attribute_key=item->>'targetKey') then raise exception 'unknown_legacy_target_key' using errcode='22023'; end if;
      if item->>'disposition'='PREFILL_REQUIRES_CONFIRMATION' and (
        item->>'mappingStatus' not in ('MISSING_PROVENANCE','NORMALIZED') or item->>'targetKey' is null
        or item->>'sourceField' not in ('name','address','city','country','lat','lng','website','phone','hours_regular','category')
        or item->>'reasonCode' not in ('LEGACY_VALUE_REQUIRES_ADMIN_CONFIRMATION','ALLOWLISTED_CATEGORY_NORMALIZATION')
      ) then raise exception 'unsafe_legacy_prefill_mapping' using errcode='22023'; end if;
      if item->>'disposition' in ('REVIEW_REQUIRED','EXCLUDED','IDENTITY_ONLY') and item->>'disposition'<>'IDENTITY_ONLY' and item->>'transformedValue' is not null then raise exception 'excluded_legacy_value_must_not_transform' using errcode='22023'; end if;
      insert into world_knowledge_private.legacy_import_values_v1(batch_id,spot_id,source_schema,source_table,source_field,original_value_hash,mapping_version,mapping_rule,mapping_status,target_attribute_key,transformed_value,disposition,reason_code,selected_for_confirmation,result_hash)
      values(batch_id,spot_uuid,'public',case when item->>'sourceField'='hours_regular' then 'spot_hours' else 'spots' end,item->>'sourceField',item->>'originalValueHash','backyrd.world-knowledge.legacy-mapping@1.1',item->>'reasonCode',item->>'mappingStatus',item->>'targetKey',item->'transformedValue',item->>'disposition',item->>'reasonCode',item->>'disposition'='PREFILL_REQUIRES_CONFIRMATION',item->>'resultHash') on conflict do nothing;
      staged:=staged+1;
    end loop;
  end loop;
  return jsonb_build_object('batchId',batch_id,'created',true,'importedSpots',imported,'stagedValues',staged,'importManifestHash',import_hash,'claimsCreated',0,'productionWrites',0);
end $$;

create or replace function public.world_admin_confirm_legacy_values_v1(p_spot_id uuid,p_batch_id uuid,p_value_ids uuid[],p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); binding_id uuid; row_value world_knowledge_private.legacy_import_values_v1%rowtype; receipt jsonb; claim_ids uuid[]:='{}'; existing world_knowledge_private.legacy_import_confirmations_v1%rowtype; confirmed_at timestamptz:=pg_catalog.clock_timestamp(); confirmation_hash text;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null or not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
  if coalesce(array_length(p_value_ids,1),0)<1 or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_legacy_confirmation_request' using errcode='22023'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,'ADMIN');
  select * into existing from world_knowledge_private.legacy_import_confirmations_v1 c where c.actor_binding_id=binding_id and c.idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('confirmationId',existing.id,'created',false,'claimIds',to_jsonb(existing.result_claim_ids)); end if;
  for row_value in select * from world_knowledge_private.legacy_import_values_v1 v where v.id=any(p_value_ids) order by v.target_attribute_key,v.id loop
    if row_value.batch_id<>p_batch_id or row_value.spot_id<>p_spot_id or row_value.disposition<>'PREFILL_REQUIRES_CONFIRMATION' or row_value.target_attribute_key is null then raise exception 'legacy_value_not_confirmable' using errcode='42501'; end if;
    receipt:=world_knowledge_private.submit_authoritative_claim_v1('ADMIN',p_spot_id,row_value.target_attribute_key,'KNOWN_VALUE',row_value.transformed_value,confirmed_at,null,null,'PUBLIC',null,'legacy-confirm:'||p_batch_id||':'||row_value.id);
    claim_ids:=array_append(claim_ids,(receipt->>'claimId')::uuid);
    update world_knowledge_private.legacy_import_values_v1 set confirmed_claim_id=(receipt->>'claimId')::uuid where id=row_value.id and confirmed_claim_id is null;
  end loop;
  if array_length(claim_ids,1)<>array_length(p_value_ids,1) then raise exception 'legacy_confirmation_selection_mismatch' using errcode='22023'; end if;
  confirmation_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('batchId',p_batch_id,'spotId',p_spot_id,'actorBinding',binding_id,'selectedValueIds',to_jsonb(p_value_ids),'resultClaimIds',to_jsonb(claim_ids),'confirmedAt',confirmed_at,'idempotencyIdentity',p_idempotency_key)::text,'UTF8'),'sha256'),'hex');
  insert into world_knowledge_private.legacy_import_confirmations_v1(batch_id,spot_id,actor_binding_id,idempotency_key,selected_value_ids,result_claim_ids,confirmation_hash,confirmed_at)
  values(p_batch_id,p_spot_id,binding_id,p_idempotency_key,p_value_ids,claim_ids,confirmation_hash,confirmed_at) returning * into existing;
  return jsonb_build_object('confirmationId',existing.id,'created',true,'claimIds',to_jsonb(claim_ids),'verificationMethod','ADMIN_CONFIRMED');
end $$;

create or replace function public.world_founder_set_cohort_membership_v1(p_spot_id uuid,p_selected boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); selected_count integer;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null or not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
  perform 1 from world_knowledge_private.founder_evaluation_spots_v1 f where f.spot_id=p_spot_id for update;
  if not found then raise exception 'founder_spot_not_found' using errcode='22023'; end if;
  select count(*) into selected_count from world_knowledge_private.founder_evaluation_spots_v1 f where f.cohort_selected and f.lifecycle_status='ACTIVE';
  if p_selected and selected_count>=40 and not exists(select 1 from world_knowledge_private.founder_evaluation_spots_v1 f where f.spot_id=p_spot_id and f.cohort_selected) then raise exception 'founder_cohort_limit_exceeded' using errcode='22023'; end if;
  update world_knowledge_private.founder_evaluation_spots_v1 set cohort_selected=p_selected where spot_id=p_spot_id;
  return jsonb_build_object('spotId',p_spot_id,'selected',p_selected,'identityUnchanged',true);
end $$;

create or replace function public.world_admin_get_legacy_import_summary_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); values_json jsonb; summary jsonb;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null or not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'batchId',v.batch_id,'sourceField',v.source_field,'targetKey',v.target_attribute_key,'mappingStatus',v.mapping_status,'disposition',v.disposition,'reasonCode',v.reason_code,'value',v.transformed_value,'selected',v.selected_for_confirmation,'confirmed',v.confirmed_claim_id is not null,'originalValueHash',v.original_value_hash,'mappingRule',v.mapping_rule,'resultHash',v.result_hash) order by v.source_field,v.target_attribute_key),'[]'::jsonb),
    jsonb_build_object(
      'prefilled',count(*) filter(where v.disposition='PREFILL_REQUIRES_CONFIRMATION'),
      'normalized',count(*) filter(where v.mapping_status='NORMALIZED'),
      'reviewRequired',count(*) filter(where v.disposition='REVIEW_REQUIRED'),
      'excluded',count(*) filter(where v.disposition='EXCLUDED'),
      'confirmed',count(*) filter(where v.confirmed_claim_id is not null)
    ) into values_json,summary
  from world_knowledge_private.legacy_import_values_v1 v where v.spot_id=p_spot_id;
  return jsonb_build_object('spotId',p_spot_id,'values',values_json,'summary',summary);
end $$;

create or replace function public.world_founder_list_spots_v1(p_search text default null,p_primary_category text default null,p_include_archived boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); result jsonb;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(row_value order by row_value->>'name',row_value->>'spotId'),'[]'::jsonb) into result from (
    select jsonb_build_object('spotId',s.id,'name',coalesce(name_claim.value#>>'{}',s.name),'primaryCategory',category_claim.value#>>'{}','lifecycleStatus',f.lifecycle_status,'scope',f.evaluation_scope,'ownerAssigned',s.owner_id is not null,'answerCount',(select count(distinct c.attribute_key) from world_knowledge_private.claims c where c.spot_id=s.id),'conflictCount',(select count(*) from world_knowledge_private.review_work_items w where w.spot_id=s.id and w.status in ('OPEN','IN_REVIEW') and w.work_class='AUTHORITY_CONFLICT'),'manifestHash',pointer.manifest_hash,'catalogOrigin',f.catalog_origin,'cohortSelected',f.cohort_selected,'unconfirmedLegacyCount',(select count(*) from world_knowledge_private.legacy_import_values_v1 v where v.spot_id=s.id and v.disposition='PREFILL_REQUIRES_CONFIRMATION' and v.confirmed_claim_id is null),'ambiguousLegacyCount',(select count(*) from world_knowledge_private.legacy_import_values_v1 v where v.spot_id=s.id and v.disposition='REVIEW_REQUIRED')) row_value
    from world_knowledge_private.founder_evaluation_spots_v1 f join public.spots s on s.id=f.spot_id
    left join lateral(select c.value from world_knowledge_private.claims c where c.spot_id=s.id and c.attribute_key='identity.name' order by c.last_changed_at desc,c.id desc limit 1) name_claim on true
    left join lateral(select c.value from world_knowledge_private.claims c where c.spot_id=s.id and c.attribute_key='classification.primary_category' order by c.last_changed_at desc,c.id desc limit 1) category_claim on true
    left join world_knowledge_private.current_projection_pointers pointer on pointer.spot_id=s.id
    where (public.is_admin_v1(actor_id) or s.owner_id=actor_id) and (p_include_archived or f.lifecycle_status='ACTIVE') and (p_search is null or coalesce(name_claim.value#>>'{}',s.name) ilike '%'||p_search||'%') and (p_primary_category is null or category_claim.value#>>'{}'=p_primary_category)
  ) rows;
  return jsonb_build_object('scope','FOUNDER_EVALUATION_ONLY','spots',result);
end $$;

create or replace function public.world_founder_export_cohort_v1(p_cohort_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; body jsonb; body_hash text; cohort_count integer;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if length(trim(coalesce(p_cohort_id,''))) not between 1 and 128 then raise exception 'invalid_cohort_id' using errcode='22023'; end if;
  select count(*) into cohort_count from world_knowledge_private.founder_evaluation_spots_v1 f where f.lifecycle_status='ACTIVE' and f.cohort_selected;
  if cohort_count not between 1 and 40 then raise exception 'founder_cohort_size_invalid' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('spotId',m.spot_id,'manifestHash',m.manifest_hash,'resolutionHash',m.resolution_hash,'inputHash',m.input_hash,'snapshotHash',encode(extensions.digest(pg_catalog.convert_to(m.world_snapshot::text,'UTF8'),'sha256'),'hex')) order by m.spot_id),'[]'::jsonb) into rows
  from world_knowledge_private.founder_evaluation_spots_v1 f join world_knowledge_private.current_projection_pointers p on p.spot_id=f.spot_id join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id where f.lifecycle_status='ACTIVE' and f.cohort_selected;
  body:=jsonb_build_object('contractVersion','backyrd.world-knowledge.founder-cohort-shadow@1.0','scope','FOUNDER_EVALUATION_ONLY','cohortId',p_cohort_id,'registryVersion','backyrd.world-knowledge.registry@1.1','policyVersion','backyrd.world-knowledge.source-policy@3b.1','spots',rows,'exclusions',jsonb_build_array('ADMIN_NOTES','OWNER_TIER','PAYMENT','PRIVATE_ACTOR_IDS','PRIVATE_SOURCE_REFERENCES','RAW_AI_OUTPUTS','SUBSCRIPTION'));
  body_hash:=encode(extensions.digest(pg_catalog.convert_to(body::text,'UTF8'),'sha256'),'hex'); return body||jsonb_build_object('cohortHash',body_hash);
end $$;

revoke execute on function public.world_admin_import_legacy_batch_v1(jsonb),public.world_admin_confirm_legacy_values_v1(uuid,uuid,uuid[],text),public.world_founder_set_cohort_membership_v1(uuid,boolean),public.world_admin_get_legacy_import_summary_v1(uuid) from public,anon;
grant execute on function public.world_admin_import_legacy_batch_v1(jsonb),public.world_admin_confirm_legacy_values_v1(uuid,uuid,uuid[],text),public.world_founder_set_cohort_membership_v1(uuid,boolean),public.world_admin_get_legacy_import_summary_v1(uuid) to authenticated;

comment on table world_knowledge_private.legacy_import_values_v1 is 'Private local review staging. Presence is provenance/prefill only and never World verification.';
comment on function public.world_admin_import_legacy_batch_v1(jsonb) is 'Local-only, Admin-authorized import of validated legacy proposals. Creates no Claims.';
