-- World Knowledge Slice 4A: isolated founder authoring read model and test-set controls.
-- All entry points fail closed unless the local database setting below is enabled
-- explicitly by supabase/seed.sql. No Production activation or backfill is included.

create table world_knowledge_private.founder_evaluation_spots_v1 (
  spot_id uuid primary key references public.spots(id) on delete restrict,
  evaluation_scope text not null default 'FOUNDER_EVALUATION_ONLY'
    check (evaluation_scope = 'FOUNDER_EVALUATION_ONLY'),
  lifecycle_status text not null default 'ACTIVE'
    check (lifecycle_status in ('ACTIVE','ARCHIVED')),
  cohort_key text not null default 'founder-world-cohort-draft',
  created_by_binding_id uuid not null references world_knowledge_private.actor_bindings(id) on delete restrict,
  creation_idempotency_key text not null check (length(creation_idempotency_key) between 1 and 180),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  archived_at timestamptz,
  check ((lifecycle_status='ARCHIVED') = (archived_at is not null)),
  unique(created_by_binding_id,creation_idempotency_key)
);

create table world_knowledge_private.authoring_applicability_events_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete restrict,
  registry_version text not null default 'backyrd.world-knowledge.registry@1.1'
    check (registry_version = 'backyrd.world-knowledge.registry@1.1'),
  attribute_key text not null,
  actor_binding_id uuid not null references world_knowledge_private.actor_bindings(id) on delete restrict,
  applicability text not null check (applicability in ('APPLICABLE','NOT_APPLICABLE')),
  idempotency_key text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  event_hash text not null unique check (event_hash ~ '^[0-9a-f]{64}$'),
  unique(actor_binding_id,idempotency_key),
  foreign key (registry_version,attribute_key)
    references world_knowledge_private.attribute_definitions(registry_version,attribute_key)
);

alter table world_knowledge_private.founder_evaluation_spots_v1 enable row level security;
alter table world_knowledge_private.authoring_applicability_events_v1 enable row level security;
revoke all on table world_knowledge_private.founder_evaluation_spots_v1 from public, anon, authenticated;
revoke all on table world_knowledge_private.authoring_applicability_events_v1 from public, anon, authenticated;
grant all on table world_knowledge_private.founder_evaluation_spots_v1 to service_role;
grant all on table world_knowledge_private.authoring_applicability_events_v1 to service_role;

create or replace function world_knowledge_private.founder_authoring_enabled_v1()
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce(pg_catalog.current_setting('app.world_knowledge_founder_authoring_enabled', true),'off')='on';
$$;

create or replace function world_knowledge_private.authoring_actor_v1(p_spot_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); actor_role text; entitlement text; allowed_keys jsonb;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then
    raise exception 'founder_authoring_environment_disabled' using errcode='42501';
  end if;
  if actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if public.is_admin_v1(actor_id) then
    actor_role:='ADMIN'; entitlement:='ADMIN';
  elsif p_spot_id is not null and exists(select 1 from public.spots s where s.id=p_spot_id and s.owner_id=actor_id) then
    actor_role:='VERIFIED_OWNER';
    entitlement:=case when exists(
      select 1 from public.backyrd_spot_owner_intelligence_entitlements_v1 e
      where e.spot_id=p_spot_id and e.owner_id=actor_id and e.tier='PREMIUM'
        and e.valid_from<=pg_catalog.clock_timestamp()
        and (e.valid_until is null or e.valid_until>pg_catalog.clock_timestamp())
    ) then 'OWNER_PRO' else 'OWNER_BASIC' end;
  else
    raise exception 'world_authoring_scope_denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(r.attribute_key order by r.attribute_key),'[]'::jsonb) into allowed_keys
  from world_knowledge_private.entitlement_attribute_rules r
  where r.policy_version='backyrd.world-knowledge.entitlement-policy@3b.1'
    and r.actor_scope=entitlement;
  return jsonb_build_object('role',actor_role,'entitlement',entitlement,'allowedAttributeKeys',allowed_keys);
end $$;

create or replace function public.world_founder_create_spot_v1(
  p_name text,
  p_owner_id uuid default null,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); binding_id uuid; spot_id uuid; existing_id uuid; receipt jsonb;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null or not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 160 or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_founder_spot_request' using errcode='22023'; end if;
  if p_owner_id is not null and not exists(select 1 from public.profiles p where p.id=p_owner_id) then raise exception 'owner_profile_not_found' using errcode='22023'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,'ADMIN');
  select f.spot_id into existing_id from world_knowledge_private.founder_evaluation_spots_v1 f
  join public.spots s on s.id=f.spot_id
  where f.created_by_binding_id=binding_id and f.creation_idempotency_key=p_idempotency_key and s.data_origin='TEST';
  if found then return jsonb_build_object('spotId',existing_id,'created',false,'scope','FOUNDER_EVALUATION_ONLY'); end if;
  insert into public.spots(name,status,owner_id,created_by,data_origin)
  values(trim(p_name),'archived',p_owner_id,actor_id,'TEST') returning id into spot_id;
  insert into world_knowledge_private.founder_evaluation_spots_v1(spot_id,created_by_binding_id,creation_idempotency_key) values(spot_id,binding_id,p_idempotency_key);
  insert into world_knowledge_private.shadow_spot_allowlist(spot_id,reason,valid_until)
  values(spot_id,'FOUNDER_EVALUATION_ONLY',pg_catalog.clock_timestamp()+interval '180 days');
  receipt:=world_knowledge_private.submit_authoritative_claim_v1('ADMIN',spot_id,'identity.name','KNOWN_VALUE',to_jsonb(trim(p_name)),pg_catalog.clock_timestamp(),null,null,'PUBLIC',null,p_idempotency_key||':identity.name');
  return jsonb_build_object('spotId',spot_id,'created',true,'scope','FOUNDER_EVALUATION_ONLY','identityClaim',receipt);
end $$;

create or replace function public.world_founder_list_spots_v1(
  p_search text default null,
  p_primary_category text default null,
  p_include_archived boolean default false
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); result jsonb;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(row_value order by row_value->>'name',row_value->>'spotId'),'[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'spotId',s.id,'name',coalesce(name_claim.value#>>'{}',s.name),'primaryCategory',category_claim.value#>>'{}',
      'lifecycleStatus',f.lifecycle_status,'scope',f.evaluation_scope,'ownerAssigned',s.owner_id is not null,
      'answerCount',(select count(distinct c.attribute_key) from world_knowledge_private.claims c where c.spot_id=s.id),
      'conflictCount',(select count(*) from world_knowledge_private.review_work_items w where w.spot_id=s.id and w.status in ('OPEN','IN_REVIEW') and w.work_class='AUTHORITY_CONFLICT'),
      'manifestHash',pointer.manifest_hash
    ) row_value
    from world_knowledge_private.founder_evaluation_spots_v1 f
    join public.spots s on s.id=f.spot_id
    left join lateral (select c.value from world_knowledge_private.claims c where c.spot_id=s.id and c.attribute_key='identity.name' order by c.last_changed_at desc,c.id desc limit 1) name_claim on true
    left join lateral (select c.value from world_knowledge_private.claims c where c.spot_id=s.id and c.attribute_key='classification.primary_category' order by c.last_changed_at desc,c.id desc limit 1) category_claim on true
    left join world_knowledge_private.current_projection_pointers pointer on pointer.spot_id=s.id
    where (public.is_admin_v1(actor_id) or s.owner_id=actor_id)
      and (p_include_archived or f.lifecycle_status='ACTIVE')
      and (p_search is null or coalesce(name_claim.value#>>'{}',s.name) ilike '%'||p_search||'%')
      and (p_primary_category is null or category_claim.value#>>'{}'=p_primary_category)
    limit 40
  ) rows;
  return jsonb_build_object('scope','FOUNDER_EVALUATION_ONLY','spots',result);
end $$;

create or replace function public.world_authoring_get_spot_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare access jsonb; result jsonb;
begin
  if not exists(select 1 from world_knowledge_private.founder_evaluation_spots_v1 f where f.spot_id=p_spot_id) then raise exception 'founder_spot_not_found' using errcode='22023'; end if;
  access:=world_knowledge_private.authoring_actor_v1(p_spot_id);
  select jsonb_build_object(
    'scope',f.evaluation_scope,'lifecycleStatus',f.lifecycle_status,'spotId',s.id,'fallbackName',s.name,
    'actor',access,
    'answers',coalesce((select jsonb_object_agg(attribute_key,answer) from (
      select distinct on (c.attribute_key) c.attribute_key,jsonb_build_object(
        'claimId',c.id,'claimHash',c.content_hash,'knowledgeState',c.knowledge_state,'value',c.value,
        'observedAt',c.observed_at,'validFrom',c.valid_from,'validUntil',c.valid_until,
        'visibility',c.visibility,'verificationMethod',v.verification_method,
        'confirmationDueAt',(select max(cr.confirmation_due_at) from world_knowledge_private.confirmation_records cr where cr.claim_id=c.id)
      ) answer
      from world_knowledge_private.claims c
      left join world_knowledge_private.verification_records v on v.claim_id=c.id and v.result='VERIFIED'
      where c.spot_id=p_spot_id
      order by c.attribute_key,c.last_changed_at desc,c.id desc
    ) latest),'{}'::jsonb),
    'applicability',coalesce((select jsonb_object_agg(attribute_key,applicability) from (select distinct on (a.attribute_key) a.attribute_key,a.applicability from world_knowledge_private.authoring_applicability_events_v1 a where a.spot_id=p_spot_id order by a.attribute_key,a.occurred_at desc,a.id desc) latest_applicability),'{}'::jsonb),
    'reviewItems',coalesce((select jsonb_agg(jsonb_build_object('class',w.work_class,'priority',w.priority,'attributeKey',w.attribute_key,'reasonCodes',to_jsonb(w.reason_codes)) order by w.created_at) from world_knowledge_private.review_work_items w where w.spot_id=p_spot_id and w.status in ('OPEN','IN_REVIEW')),'[]'::jsonb),
    'manifest',case when m.id is null then null else jsonb_build_object('manifestId',m.id,'manifestHash',m.manifest_hash,'resolutionHash',m.resolution_hash,'inputHash',m.input_hash,'worldSnapshot',m.world_snapshot,'decisionProjection',m.decision_projection) end
  ) into result
  from world_knowledge_private.founder_evaluation_spots_v1 f
  join public.spots s on s.id=f.spot_id
  left join world_knowledge_private.current_projection_pointers pointer on pointer.spot_id=s.id
  left join world_knowledge_private.resolution_manifests m on m.id=pointer.manifest_id
  where f.spot_id=p_spot_id;
  return result;
end $$;

create or replace function public.world_authoring_set_applicability_v1(
  p_spot_id uuid,
  p_attribute_key text,
  p_applicability text,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare access jsonb; actor_id uuid:=auth.uid(); actor_type text; binding_id uuid; allowed jsonb; existing world_knowledge_private.authoring_applicability_events_v1%rowtype; event_hash text;
begin
  access:=world_knowledge_private.authoring_actor_v1(p_spot_id);
  actor_type:=access->>'role'; allowed:=access->'allowedAttributeKeys';
  if p_applicability not in ('APPLICABLE','NOT_APPLICABLE') or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_applicability_event' using errcode='22023'; end if;
  if not allowed @> to_jsonb(array[p_attribute_key]) then raise exception 'attribute_entitlement_denied' using errcode='42501'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,actor_type);
  event_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('spotId',p_spot_id,'attributeKey',p_attribute_key,'actorBinding',binding_id,'applicability',p_applicability,'idempotencyIdentity',p_idempotency_key)::text,'UTF8'),'sha256'),'hex');
  select * into existing from world_knowledge_private.authoring_applicability_events_v1 a where a.actor_binding_id=binding_id and a.idempotency_key=p_idempotency_key;
  if found then
    if existing.event_hash<>event_hash then raise exception 'applicability_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('eventId',existing.id,'created',false,'applicability',existing.applicability);
  end if;
  insert into world_knowledge_private.authoring_applicability_events_v1(spot_id,attribute_key,actor_binding_id,applicability,idempotency_key,event_hash)
  values(p_spot_id,p_attribute_key,binding_id,p_applicability,p_idempotency_key,event_hash) returning * into existing;
  return jsonb_build_object('eventId',existing.id,'created',true,'applicability',existing.applicability);
end $$;

create or replace function public.world_founder_set_spot_lifecycle_v1(
  p_spot_id uuid,
  p_lifecycle_status text,
  p_confirmation text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); changed integer;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null or not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_lifecycle_status not in ('ACTIVE','ARCHIVED') or p_confirmation<>'FOUNDER TESTSET ÄNDERN' then raise exception 'founder_lifecycle_confirmation_required' using errcode='22023'; end if;
  update world_knowledge_private.founder_evaluation_spots_v1
  set lifecycle_status=p_lifecycle_status,archived_at=case when p_lifecycle_status='ARCHIVED' then pg_catalog.clock_timestamp() else null end
  where spot_id=p_spot_id and lifecycle_status<>p_lifecycle_status;
  get diagnostics changed=row_count;
  return jsonb_build_object('spotId',p_spot_id,'lifecycleStatus',p_lifecycle_status,'changed',changed=1,'historyPreserved',true);
end $$;

create or replace function public.world_founder_reset_testset_v1(p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); affected integer;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null or not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_confirmation<>'LOKALES FOUNDER-TESTSET ZURÜCKSETZEN' then raise exception 'founder_reset_confirmation_required' using errcode='22023'; end if;
  update world_knowledge_private.founder_evaluation_spots_v1 set lifecycle_status='ARCHIVED',archived_at=pg_catalog.clock_timestamp() where lifecycle_status='ACTIVE';
  get diagnostics affected=row_count;
  return jsonb_build_object('archivedSpots',affected,'claimsDeleted',0,'historyPreserved',true,'scope','FOUNDER_EVALUATION_ONLY');
end $$;

create or replace function public.world_founder_export_cohort_v1(p_cohort_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; body jsonb; body_hash text;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if length(trim(coalesce(p_cohort_id,''))) not between 1 and 128 then raise exception 'invalid_cohort_id' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('spotId',m.spot_id,'manifestHash',m.manifest_hash,'resolutionHash',m.resolution_hash,'inputHash',m.input_hash,'snapshotHash',encode(extensions.digest(pg_catalog.convert_to(m.world_snapshot::text,'UTF8'),'sha256'),'hex')) order by m.spot_id),'[]'::jsonb) into rows
  from world_knowledge_private.founder_evaluation_spots_v1 f
  join world_knowledge_private.current_projection_pointers p on p.spot_id=f.spot_id
  join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id
  where f.lifecycle_status='ACTIVE';
  body:=jsonb_build_object('contractVersion','backyrd.world-knowledge.founder-cohort-shadow@1.0','scope','FOUNDER_EVALUATION_ONLY','cohortId',p_cohort_id,'registryVersion','backyrd.world-knowledge.registry@1.1','policyVersion','backyrd.world-knowledge.source-policy@3b.1','spots',rows,'exclusions',jsonb_build_array('ADMIN_NOTES','OWNER_TIER','PAYMENT','PRIVATE_ACTOR_IDS','PRIVATE_SOURCE_REFERENCES','RAW_AI_OUTPUTS','SUBSCRIPTION'));
  body_hash:=encode(extensions.digest(pg_catalog.convert_to(body::text,'UTF8'),'sha256'),'hex');
  return body||jsonb_build_object('cohortHash',body_hash);
end $$;

revoke execute on function world_knowledge_private.founder_authoring_enabled_v1(),world_knowledge_private.authoring_actor_v1(uuid) from public,anon,authenticated,service_role;
revoke execute on function public.world_founder_create_spot_v1(text,uuid,text),public.world_founder_list_spots_v1(text,text,boolean),public.world_authoring_get_spot_v1(uuid),public.world_authoring_set_applicability_v1(uuid,text,text,text),public.world_founder_set_spot_lifecycle_v1(uuid,text,text),public.world_founder_reset_testset_v1(text),public.world_founder_export_cohort_v1(text) from public,anon,authenticated;
grant execute on function public.world_founder_create_spot_v1(text,uuid,text),public.world_founder_list_spots_v1(text,text,boolean),public.world_authoring_get_spot_v1(uuid),public.world_authoring_set_applicability_v1(uuid,text,text,text),public.world_founder_set_spot_lifecycle_v1(uuid,text,text),public.world_founder_reset_testset_v1(text) to authenticated;
grant execute on function public.world_founder_export_cohort_v1(text) to service_role;

comment on table world_knowledge_private.founder_evaluation_spots_v1 is 'Isolated local/non-Production founder cohort membership. Mutable lifecycle metadata is not World truth; Claims remain append-only.';
comment on function public.world_founder_create_spot_v1(text,uuid,text) is 'Local-only founder evaluation entry point. Fails closed unless the database-local environment flag is enabled.';
