-- Gold Spot Authoring Foundation v1
-- Additive authoring/provenance infrastructure. The frozen 60-dimension N4
-- registry and all Decision ranking semantics remain unchanged.

create table public.backyrd_spot_fact_catalog_v1 (
  field_key text primary key,
  section text not null,
  capability text not null check(capability in ('BASIC','DEEP')),
  value_kind text not null check(value_kind in ('TEXT','BOOLEAN','ENUM','MULTI_SELECT','RANGE','STRUCTURED_OBJECT')),
  allowed_values jsonb not null default '[]'::jsonb,
  engine_role text not null check(engine_role in ('RAW_FACT','SUITABILITY_FACT','N4_EVIDENCE','DISPLAY_ONLY')),
  owner_editable boolean not null default true,
  contract_version text not null default 'backyrd-spot-fact-contract-v1'
);

insert into public.backyrd_spot_fact_catalog_v1(field_key,section,capability,value_kind,allowed_values,engine_role,owner_editable) values
 ('identity.name','BASIC','BASIC','TEXT','[]','RAW_FACT',true),
 ('contact.website','BASIC','BASIC','TEXT','[]','RAW_FACT',true),
 ('contact.phone','BASIC','BASIC','TEXT','[]','RAW_FACT',true),
 ('contact.email','BASIC','BASIC','TEXT','[]','RAW_FACT',true),
 ('location.address','LOCATION','BASIC','STRUCTURED_OBJECT','[]','RAW_FACT',true),
 ('price.level','BASIC','BASIC','ENUM','[1,2,3,4,5]','RAW_FACT',true),
 ('description.owner','DESCRIPTION_MEDIA','BASIC','TEXT','[]','DISPLAY_ONLY',true),
 ('media.visual','DESCRIPTION_MEDIA','BASIC','STRUCTURED_OBJECT','[]','RAW_FACT',true),
 ('category.primary','CATEGORY','BASIC','TEXT','[]','RAW_FACT',true),
 ('place_type','CATEGORY','BASIC','TEXT','[]','N4_EVIDENCE',true),
 ('opening.regular','OPENING_HOURS','BASIC','STRUCTURED_OBJECT','[]','RAW_FACT',true),
 ('opening.status','OPENING_HOURS','BASIC','ENUM','["OPEN","TEMPORARILY_CLOSED","CLOSED","UNKNOWN"]','RAW_FACT',true),
 ('suitability.family_kids','SUITABILITY','BASIC','ENUM','["SUITABLE","NOT_SUITABLE","UNKNOWN"]','SUITABILITY_FACT',true),
 ('suitability.environment','SUITABILITY','BASIC','ENUM','["INDOOR","OUTDOOR","MIXED","UNKNOWN"]','SUITABILITY_FACT',true),
 ('accessibility.basic','SUITABILITY','BASIC','STRUCTURED_OBJECT','[]','SUITABILITY_FACT',true),
 ('reservation.recommended','SUITABILITY','BASIC','ENUM','["YES","NO","UNKNOWN"]','SUITABILITY_FACT',true),
 ('duration.approximate','SUITABILITY','BASIC','RANGE','[]','SUITABILITY_FACT',true),
 ('audience.basic','AUDIENCE_SOCIAL','BASIC','MULTI_SELECT','["SOLO","DATE","FRIENDS","FAMILY","GROUPS","WORK"]','SUITABILITY_FACT',true),
 ('suitability.age','SUITABILITY','DEEP','STRUCTURED_OBJECT','[]','SUITABILITY_FACT',true),
 ('suitability.family_characteristics','SUITABILITY','DEEP','MULTI_SELECT','[]','SUITABILITY_FACT',true),
 ('suitability.rain','SUITABILITY','DEEP','ENUM','["SUITABLE","LIMITED","NOT_SUITABLE","UNKNOWN"]','SUITABILITY_FACT',true),
 ('activity.types','ACTIVITY_DETAILS','DEEP','MULTI_SELECT','["MUSEUM","CULTURE","WORKSHOP","SPORTS","CLIMBING","BOULDERING","GAMING","QUIZ","KARAOKE","ANIMALS","WATERPARK","HISTORY","LIVE_MUSIC","CONCERT","WALK","PLAYGROUND","OTHER"]','SUITABILITY_FACT',true),
 ('accessibility.capabilities','SUITABILITY','DEEP','STRUCTURED_OBJECT','[]','SUITABILITY_FACT',true),
 ('suitability.conversation','SUITABILITY','DEEP','ENUM','["HIGH","MEDIUM","LOW","UNKNOWN"]','N4_EVIDENCE',true),
 ('character.noise','SUITABILITY','DEEP','ENUM','["QUIET","MODERATE","LOUD","VARIABLE","UNKNOWN"]','N4_EVIDENCE',true),
 ('social.suitability','AUDIENCE_SOCIAL','DEEP','STRUCTURED_OBJECT','[]','N4_EVIDENCE',true),
 ('occasion.suitability','AUDIENCE_SOCIAL','DEEP','MULTI_SELECT','[]','N4_EVIDENCE',true),
 ('time.dayparts','AUDIENCE_SOCIAL','DEEP','MULTI_SELECT','["MORNING","AFTERNOON","EVENING","NIGHT","WEEKDAY","WEEKEND"]','N4_EVIDENCE',true),
 ('reservation.character','ACTIVITY_DETAILS','DEEP','ENUM','["WALK_IN","RECOMMENDED","REQUIRED","BOOK_AHEAD","UNKNOWN"]','N4_EVIDENCE',true),
 ('duration.character','ACTIVITY_DETAILS','DEEP','ENUM','["SHORT","MEDIUM","LONG","FLEXIBLE","UNKNOWN"]','N4_EVIDENCE',true),
 ('signature.characteristics','ACTIVITY_DETAILS','DEEP','MULTI_SELECT','[]','DISPLAY_ONLY',true),
 ('atmosphere.descriptors','AUDIENCE_SOCIAL','DEEP','MULTI_SELECT','["COZY","RELAXED","ROMANTIC","LIVELY","QUIET","SOCIAL","INSPIRING","PLAYFUL","ELEGANT","DESIGN_LED","AUTHENTIC","HIDDEN_GEM"]','N4_EVIDENCE',true);

create table public.backyrd_spot_sources_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  source_type text not null check(source_type in ('OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT','STRUCTURED_PROVIDER','OWNER_CLAIM','ADMIN_VERIFIED','RESEARCH','COMMUNITY','LEGACY','IMPORT')),
  source_url text,
  source_reference text,
  title text,
  provider_identity text,
  retrieved_at timestamptz,
  observed_at timestamptz not null default now(),
  last_checked_at timestamptz,
  legal_use_status text not null default 'NOT_REQUIRED' check(legal_use_status in ('NOT_REQUIRED','PERMITTED','REVIEW_REQUIRED','PROHIBITED')),
  created_by_type text not null check(created_by_type in ('FOUNDER','ADMIN','OWNER','RESEARCH_AGENT','SYSTEM','LEGACY_IMPORT')),
  created_by_id uuid,
  created_at timestamptz not null default now(),
  contract_version text not null default 'backyrd-spot-source-contract-v1',
  check(source_url is null or (length(source_url)<=2000 and source_url ~ '^https?://')),
  check(source_reference is not null or source_url is not null)
);
create index backyrd_spot_sources_v1_spot_idx on public.backyrd_spot_sources_v1(spot_id,created_at desc);

create table public.backyrd_spot_fact_proposals_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  field_key text not null references public.backyrd_spot_fact_catalog_v1(field_key),
  proposed_value jsonb not null,
  source_id uuid not null references public.backyrd_spot_sources_v1(id) on delete restrict,
  status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','REJECTED','CONFLICT','STALE','UNSUPPORTED')),
  proposed_by_type text not null check(proposed_by_type in ('FOUNDER','ADMIN','OWNER','RESEARCH_AGENT','SYSTEM')),
  proposed_by_id uuid,
  confidence_rationale text,
  evidence_excerpt text,
  idempotency_key text not null,
  proposal_hash text not null check(proposal_hash ~ '^[0-9a-f]{64}$'),
  supersedes_proposal_id uuid references public.backyrd_spot_fact_proposals_v1(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  resolution_note text,
  contract_version text not null default 'backyrd-spot-fact-proposal-v1',
  unique(spot_id,idempotency_key),
  check(length(idempotency_key) between 1 and 200),
  check(evidence_excerpt is null or length(evidence_excerpt)<=2000)
);
create index backyrd_spot_fact_proposals_v1_review_idx on public.backyrd_spot_fact_proposals_v1(spot_id,status,created_at desc);

create table public.backyrd_spot_accepted_facts_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  field_key text not null references public.backyrd_spot_fact_catalog_v1(field_key),
  value jsonb not null,
  source_id uuid not null references public.backyrd_spot_sources_v1(id) on delete restrict,
  proposal_id uuid references public.backyrd_spot_fact_proposals_v1(id) on delete restrict,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','UNKNOWN','STALE','SUPERSEDED')),
  confidence_policy_result numeric not null check(confidence_policy_result between 0 and 1),
  accepted_by uuid,
  accepted_at timestamptz not null default now(),
  observed_at timestamptz,
  last_checked_at timestamptz,
  valid_until timestamptz,
  contract_version text not null default 'backyrd-spot-accepted-fact-v1',
  unique(spot_id,field_key,source_id),
  check(valid_until is null or valid_until>accepted_at)
);
create index backyrd_spot_accepted_facts_v1_active_idx on public.backyrd_spot_accepted_facts_v1(spot_id,field_key,status);

create table public.backyrd_spot_gold_authoring_audit_v1 (
  id bigint generated always as identity primary key,
  spot_id uuid not null references public.spots(id) on delete cascade,
  actor_id uuid,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create table public.backyrd_gold_authoring_settings_v1 (
  singleton boolean primary key default true check(singleton),
  owner_public_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.backyrd_gold_authoring_settings_v1(singleton,owner_public_enabled) values(true,false);

create table public.backyrd_gold_authoring_owner_allowlist_v1 (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  reason text not null,
  created_at timestamptz not null default now()
);

create or replace function public.backyrd_gold_actor_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_admin_role text;v_owner uuid;v_tier text:='FREE';
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select role into v_admin_role from public.admin_users where user_id=v_actor;
  if v_admin_role is null and public.admin_is_admin_v1() then v_admin_role:='admin'; end if;
  select owner_id into v_owner from public.spots where id=p_spot_id;
  if not found then raise exception 'spot_not_found' using errcode='22023'; end if;
  if v_admin_role is not null then
    return jsonb_build_object('actorId',v_actor,'role',case when v_admin_role='super_admin' then 'FOUNDER' else 'ADMIN' end,'capability','DEEP','ownerTier','ADMIN');
  end if;
  if v_owner is distinct from v_actor then raise exception 'spot_access_denied' using errcode='42501'; end if;
  if not coalesce((select owner_public_enabled from public.backyrd_gold_authoring_settings_v1 where singleton),false)
    and not exists(select 1 from public.backyrd_gold_authoring_owner_allowlist_v1 where user_id=v_actor and enabled) then
    raise exception 'owner_gold_authoring_not_enabled' using errcode='42501';
  end if;
  select tier into v_tier from public.backyrd_spot_owner_intelligence_entitlements_v1
   where spot_id=p_spot_id and owner_id=v_actor and valid_from<=now() and (valid_until is null or valid_until>now()) order by valid_from desc limit 1;
  return jsonb_build_object('actorId',v_actor,'role','OWNER','capability',case when coalesce(v_tier,'FREE')='PREMIUM' then 'DEEP' else 'BASIC' end,'ownerTier',case when coalesce(v_tier,'FREE')='PREMIUM' then 'PRO' else 'BASIC' end);
end $$;

create or replace function public.backyrd_gold_validate_fact_value_v1(p_field_key text,p_value jsonb)
returns boolean language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v public.backyrd_spot_fact_catalog_v1%rowtype;v_item jsonb;
begin
  select * into v from public.backyrd_spot_fact_catalog_v1 where field_key=p_field_key;
  if not found or p_value is null or p_value='null'::jsonb then return false; end if;
  if v.value_kind='TEXT' then return jsonb_typeof(p_value)='string' and length(p_value#>>'{}')<=4000; end if;
  if v.value_kind='BOOLEAN' then return jsonb_typeof(p_value)='boolean'; end if;
  if v.value_kind='ENUM' then return exists(select 1 from jsonb_array_elements(v.allowed_values) x where x=p_value); end if;
  if v.value_kind='MULTI_SELECT' then
    if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>40 then return false; end if;
    if jsonb_array_length(v.allowed_values)=0 then return true; end if;
    for v_item in select value from jsonb_array_elements(p_value) loop
      if not exists(select 1 from jsonb_array_elements(v.allowed_values) x where x=v_item) then return false; end if;
    end loop; return true;
  end if;
  if v.value_kind in ('RANGE','STRUCTURED_OBJECT') then return jsonb_typeof(p_value)='object' and length(p_value::text)<=8000; end if;
  return false;
end $$;

create or replace function public.backyrd_gold_create_source_v1(
 p_spot_id uuid,p_source_type text,p_source_url text default null,p_source_reference text default null,
 p_title text default null,p_provider_identity text default null,p_observed_at timestamptz default now(),
 p_last_checked_at timestamptz default null,p_legal_use_status text default 'NOT_REQUIRED'
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor jsonb;v_id uuid;v_role text;
begin
 v_actor:=public.backyrd_gold_actor_v1(p_spot_id);v_role:=v_actor->>'role';
 if p_source_type not in ('OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT','STRUCTURED_PROVIDER','OWNER_CLAIM','ADMIN_VERIFIED','RESEARCH','COMMUNITY','LEGACY','IMPORT') then raise exception 'invalid_source_type' using errcode='22023'; end if;
 if v_role='OWNER' and p_source_type not in ('OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT','OWNER_CLAIM') then raise exception 'owner_source_type_denied' using errcode='42501'; end if;
 if p_source_reference is null and p_source_url is null then raise exception 'source_identity_required' using errcode='22023'; end if;
 insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_url,source_reference,title,provider_identity,observed_at,last_checked_at,legal_use_status,created_by_type,created_by_id)
 values(p_spot_id,p_source_type,nullif(btrim(p_source_url),''),nullif(btrim(p_source_reference),''),nullif(btrim(p_title),''),nullif(btrim(p_provider_identity),''),least(coalesce(p_observed_at,now()),now()),p_last_checked_at,p_legal_use_status,v_role,(v_actor->>'actorId')::uuid) returning id into v_id;
 return v_id;
end $$;

create or replace function public.backyrd_gold_submit_proposal_v1(
 p_spot_id uuid,p_field_key text,p_value jsonb,p_source_id uuid,p_idempotency_key text,
 p_confidence_rationale text default null,p_evidence_excerpt text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_actor jsonb;v_catalog public.backyrd_spot_fact_catalog_v1%rowtype;v_source public.backyrd_spot_sources_v1%rowtype;v_hash text;v_status text:='PENDING';v_row public.backyrd_spot_fact_proposals_v1%rowtype;
begin
 v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
 select * into v_catalog from public.backyrd_spot_fact_catalog_v1 where field_key=p_field_key;
 if not found or not v_catalog.owner_editable then raise exception 'field_not_authorable' using errcode='22023'; end if;
 if v_actor->>'role'='OWNER' and v_catalog.capability='DEEP' and v_actor->>'capability'<>'DEEP' then raise exception 'owner_pro_required' using errcode='42501'; end if;
 select * into v_source from public.backyrd_spot_sources_v1 where id=p_source_id and spot_id=p_spot_id;
 if not found then raise exception 'source_spot_mismatch' using errcode='42501'; end if;
 if v_actor->>'role'='OWNER' and v_source.created_by_id is distinct from (v_actor->>'actorId')::uuid then raise exception 'source_ownership_required' using errcode='42501'; end if;
 if not public.backyrd_gold_validate_fact_value_v1(p_field_key,p_value) then raise exception 'invalid_typed_fact_value' using errcode='22023'; end if;
 if length(coalesce(p_idempotency_key,'')) not between 1 and 200 then raise exception 'idempotency_key_required' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_spot_id,p_field_key,p_value::text,p_source_id),'UTF8'),'sha256'),'hex');
 select * into v_row from public.backyrd_spot_fact_proposals_v1 where spot_id=p_spot_id and idempotency_key=p_idempotency_key;
 if found then
   if v_row.proposal_hash<>v_hash then raise exception 'proposal_idempotency_conflict' using errcode='23505'; end if;
   return jsonb_build_object('proposalId',v_row.id,'status',v_row.status,'inserted',false);
 end if;
 if exists(select 1 from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.field_key=p_field_key and f.status='ACTIVE' and f.value<>p_value) then v_status:='CONFLICT'; end if;
 insert into public.backyrd_spot_fact_proposals_v1(spot_id,field_key,proposed_value,source_id,status,proposed_by_type,proposed_by_id,confidence_rationale,evidence_excerpt,idempotency_key,proposal_hash)
 values(p_spot_id,p_field_key,p_value,p_source_id,v_status,v_actor->>'role',(v_actor->>'actorId')::uuid,nullif(btrim(p_confidence_rationale),''),nullif(btrim(p_evidence_excerpt),''),p_idempotency_key,v_hash) returning * into v_row;
 insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata) values(p_spot_id,(v_actor->>'actorId')::uuid,'PROPOSAL_SUBMITTED','PROPOSAL',v_row.id,jsonb_build_object('fieldKey',p_field_key,'sourceType',v_source.source_type));
 return jsonb_build_object('proposalId',v_row.id,'status',v_row.status,'inserted',true);
end $$;

create or replace function public.backyrd_gold_rebuild_spot_v1(p_spot_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_intelligence jsonb;v_conf numeric;v_complete numeric;v_watermark timestamptz;v_hash text;
begin
 if coalesce(auth.role(),'')<>'service_role' and not public.admin_is_admin_v1() then raise exception 'gold_rebuild_service_or_admin_required' using errcode='42501'; end if;
 if exists(select 1 from public.spots where id=p_spot_id and data_origin in ('FIXTURE','TEST')) then raise exception 'fixture_cannot_be_gold' using errcode='22023'; end if;

 update public.backyrd_spot_intelligence_evidence_v1 set status='SUPERSEDED',valid_until=coalesce(valid_until,greatest(clock_timestamp(),valid_from+interval '1 microsecond'))
 where spot_id=p_spot_id and source_family='backyrd_derived' and source_reference like 'gold-authoring:%' and status='ACTIVE';

 insert into public.backyrd_spot_suitability_facts_v1(spot_id,dimension_key,value,confidence,source_origin,source_table,source_record,source_updated_at,mapping_version)
 select f.spot_id,m.dimension_key,m.value,f.confidence_policy_result,
   case when s.source_type in ('LEGACY','IMPORT') then s.source_type else 'REAL' end,
   'backyrd_spot_accepted_facts_v1',f.id::text,coalesce(f.last_checked_at,f.accepted_at),'backyrd-gold-authoring-mapping-v1'
 from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_sources_v1 s on s.id=f.source_id
 cross join lateral (values
  (case f.field_key when 'suitability.family_kids' then 'family_kids' when 'suitability.age' then 'age_suitability' when 'suitability.environment' then 'environment' when 'suitability.rain' then 'rain_suitability' when 'activity.types' then 'activity_type' when 'suitability.conversation' then 'conversation_suitability' when 'social.suitability' then 'social_context_suitability' end,
   case f.field_key
    when 'suitability.family_kids' then jsonb_build_object('state',f.value#>>'{}','suitable',case f.value#>>'{}' when 'SUITABLE' then true when 'NOT_SUITABLE' then false else null end)
    when 'suitability.conversation' then jsonb_build_object('level',f.value#>>'{}')
    else f.value end)
 ) m(dimension_key,value)
 where f.spot_id=p_spot_id and f.status in ('ACTIVE','UNKNOWN') and m.dimension_key is not null
 on conflict(spot_id,dimension_key,source_table,source_record,mapping_version) do update set value=excluded.value,confidence=excluded.confidence,source_updated_at=excluded.source_updated_at;

 insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,status,data_origin)
 select f.spot_id,m.dimension_key,'FACT',m.value,'backyrd_derived','gold-authoring:'||f.id||':'||m.dimension_key,
  f.confidence_policy_result,coalesce(f.observed_at,f.accepted_at),f.accepted_at,
  jsonb_build_object('acceptedFactId',f.id,'proposalId',f.proposal_id,'sourceId',f.source_id,'mappingVersion','backyrd-gold-authoring-mapping-v1'),'ACTIVE',case when s.source_type='IMPORT' then 'IMPORT' else 'REAL' end
 from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_sources_v1 s on s.id=f.source_id
 cross join lateral (values
  (case when f.field_key='place_type' then 'place_type' when f.field_key in ('accessibility.basic','accessibility.capabilities') then 'accessibility' when f.field_key='suitability.environment' then 'environment' when f.field_key in ('reservation.recommended','reservation.character') then 'reservation_character' when f.field_key in ('duration.approximate','duration.character') then 'duration_character' end,f.value)
 ) m(dimension_key,value)
 join public.backyrd_spot_intelligence_dimensions_v1 d on d.dimension_key=m.dimension_key and d.value_kind='FACT'
 where f.spot_id=p_spot_id and f.status='ACTIVE' and m.dimension_key is not null
 on conflict(spot_id,source_family,source_reference,dimension_key,context_signature) do update set value=excluded.value,signal_confidence=excluded.signal_confidence,observed_at=excluded.observed_at,valid_from=excluded.valid_from,provenance=excluded.provenance,status='ACTIVE',valid_until=null,data_origin=excluded.data_origin;

 insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,status,data_origin)
 select f.spot_id,m.concept,'INTERPRETATION',to_jsonb(m.direction),'backyrd_derived','gold-authoring:'||f.id||':'||m.concept,
   f.confidence_policy_result,coalesce(f.observed_at,f.accepted_at),f.accepted_at,
   jsonb_build_object('acceptedFactId',f.id,'proposalId',f.proposal_id,'sourceId',f.source_id,'mappingVersion','backyrd-gold-authoring-mapping-v1'),'ACTIVE',case when s.source_type='IMPORT' then 'IMPORT' else 'REAL' end
 from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_sources_v1 s on s.id=f.source_id
 cross join lateral (values
  (case when f.field_key='suitability.family_kids' and f.value#>>'{}'='SUITABLE' then 'occasion.kids_friendly' end,1::numeric),
  (case when f.field_key='suitability.family_kids' and f.value#>>'{}'='SUITABLE' then 'social_style.family_friendly' end,1::numeric),
  (case when f.field_key='suitability.environment' and f.value#>>'{}' in ('INDOOR','MIXED') then 'environment.indoor' end,1::numeric),
  (case when f.field_key='suitability.environment' and f.value#>>'{}' in ('OUTDOOR','MIXED') then 'environment.outdoor' end,1::numeric),
  (case when f.field_key='suitability.conversation' and f.value#>>'{}' in ('HIGH','LOW') then 'social_style.conversation_friendly' end,case when f.value#>>'{}'='HIGH' then 1 else -1 end::numeric),
  (case when f.field_key='character.noise' and f.value#>>'{}'='QUIET' then 'vibe.quiet' end,1::numeric),
  (case when f.field_key='character.noise' and f.value#>>'{}'='LOUD' then 'vibe.lively' end,1::numeric)
 ) m(concept,direction)
 join public.backyrd_spot_intelligence_dimensions_v1 d on d.dimension_key=m.concept and d.value_kind='INTERPRETATION'
 where f.spot_id=p_spot_id and f.status='ACTIVE' and m.concept is not null
 on conflict(spot_id,source_family,source_reference,dimension_key,context_signature) do update set value=excluded.value,signal_confidence=excluded.signal_confidence,observed_at=excluded.observed_at,valid_from=excluded.valid_from,provenance=excluded.provenance,status='ACTIVE',valid_until=null,data_origin=excluded.data_origin;

 with active as (
  select * from public.backyrd_spot_intelligence_evidence_v1 where spot_id=p_spot_id and status='ACTIVE' and data_origin not in ('FIXTURE','TEST') and valid_from<=now() and (valid_until is null or valid_until>now())
 ), facts as (select coalesce(jsonb_object_agg(dimension_key,value order by dimension_key),'{}') value from active where value_kind='FACT'),
 suitability as (select coalesce(jsonb_object_agg(dimension_key,value order by dimension_key),'{}') value from public.backyrd_spot_suitability_facts_v1 where spot_id=p_spot_id),
 concepts as (select coalesce(jsonb_object_agg(dimension_key,jsonb_build_object('presence',(value#>>'{}')::numeric,'confidence',signal_confidence,'evidenceId',id,'sourceReference',source_reference) order by dimension_key),'{}') value from active where value_kind='INTERPRETATION'),
 stats as (select coalesce(avg(signal_confidence),0) conf,count(distinct dimension_key) cnt,max(observed_at) watermark from active)
 select jsonb_build_object('placeType',(select value#>>'{}' from active where dimension_key='place_type' limit 1),'facts',(select value from facts)||jsonb_build_object('suitability',(select value from suitability)),'concepts',(select value from concepts),'provenanceMode','EVIDENCE_BOUND'),least(1,(select conf from stats)),least(1,(select cnt::numeric/10 from stats)),(select watermark from stats)
 into v_intelligence,v_conf,v_complete,v_watermark;
 v_hash:=encode(extensions.digest(convert_to(v_intelligence::text,'UTF8'),'sha256'),'hex');
 insert into public.backyrd_spot_intelligence_snapshots_v1(spot_id,context_key,intelligence,confidence,completeness,evidence_watermark,fingerprint,calculated_at,schema_version,confidence_contract_version)
 values(p_spot_id,'global',v_intelligence,v_conf,v_complete,v_watermark,v_hash,now(),'backyrd-spot-intelligence-schema-v1','backyrd-spot-confidence-contract-v1')
 on conflict(spot_id,context_key) do update set intelligence=excluded.intelligence,confidence=excluded.confidence,completeness=excluded.completeness,evidence_watermark=excluded.evidence_watermark,fingerprint=excluded.fingerprint,calculated_at=excluded.calculated_at;
 return jsonb_build_object('spotId',p_spot_id,'snapshotHash',v_hash,'confidence',v_conf,'completeness',v_complete);
end $$;

create or replace function public.backyrd_gold_review_proposal_v1(p_proposal_id uuid,p_action text,p_resolution_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_p public.backyrd_spot_fact_proposals_v1%rowtype;v_actor jsonb;v_conf numeric;v_result jsonb;v_day jsonb;v_interval jsonb;v_idx integer:=0;
begin
 select * into v_p from public.backyrd_spot_fact_proposals_v1 where id=p_proposal_id for update;
 if not found then raise exception 'proposal_not_found' using errcode='22023'; end if;
 v_actor:=public.backyrd_gold_actor_v1(v_p.spot_id);
 if v_actor->>'role' not in ('FOUNDER','ADMIN') then raise exception 'admin_review_required' using errcode='42501'; end if;
 if v_p.status not in ('PENDING','CONFLICT','STALE') then raise exception 'proposal_not_reviewable' using errcode='22023'; end if;
 if p_action not in ('ACCEPT','REJECT','MARK_UNKNOWN','MARK_STALE') then raise exception 'invalid_review_action' using errcode='22023'; end if;
 if p_action in ('REJECT','MARK_STALE') then
  update public.backyrd_spot_fact_proposals_v1 set status=case when p_action='REJECT' then 'REJECTED' else 'STALE' end,reviewed_at=now(),reviewed_by=(v_actor->>'actorId')::uuid,resolution_note=p_resolution_note where id=v_p.id;
 else
  v_conf:=case (select source_type from public.backyrd_spot_sources_v1 where id=v_p.source_id) when 'ADMIN_VERIFIED' then .95 when 'OFFICIAL_WEBSITE' then .90 when 'OFFICIAL_DOCUMENT' then .95 when 'STRUCTURED_PROVIDER' then .85 when 'OWNER_CLAIM' then .65 when 'LEGACY' then .60 when 'IMPORT' then .75 else .50 end;
  update public.backyrd_spot_accepted_facts_v1 set status='SUPERSEDED' where spot_id=v_p.spot_id and field_key=v_p.field_key and status in ('ACTIVE','UNKNOWN');
  insert into public.backyrd_spot_accepted_facts_v1(spot_id,field_key,value,source_id,proposal_id,status,confidence_policy_result,accepted_by,observed_at,last_checked_at)
  values(v_p.spot_id,v_p.field_key,case when p_action='MARK_UNKNOWN' then '"UNKNOWN"'::jsonb else v_p.proposed_value end,v_p.source_id,v_p.id,case when p_action='MARK_UNKNOWN' then 'UNKNOWN' else 'ACTIVE' end,v_conf,(v_actor->>'actorId')::uuid,(select observed_at from public.backyrd_spot_sources_v1 where id=v_p.source_id),(select last_checked_at from public.backyrd_spot_sources_v1 where id=v_p.source_id));
  update public.backyrd_spot_fact_proposals_v1 set status='ACCEPTED',reviewed_at=now(),reviewed_by=(v_actor->>'actorId')::uuid,resolution_note=p_resolution_note where id=v_p.id;
  if v_p.field_key='opening.regular' and p_action='ACCEPT' then
   if jsonb_typeof(v_p.proposed_value->'days')<>'array' then raise exception 'opening_days_array_required' using errcode='22023'; end if;
   delete from public.spot_hours where spot_id=v_p.spot_id;
   for v_day in select value from jsonb_array_elements(v_p.proposed_value->'days') loop
    if v_day->>'day' not in ('Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag') or jsonb_typeof(v_day->'intervals')<>'array' then raise exception 'invalid_opening_day' using errcode='22023'; end if;
    for v_interval in select value from jsonb_array_elements(v_day->'intervals') loop
     if coalesce(v_interval->>'open','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(v_interval->>'close','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_opening_interval' using errcode='22023'; end if;
     insert into public.spot_hours(spot_id,idx,day_of_week,open_time,close_time) values(v_p.spot_id,v_idx,v_day->>'day',(v_interval->>'open')::time,(v_interval->>'close')::time);v_idx:=v_idx+1;
    end loop;
   end loop;
  end if;
  v_result:=public.backyrd_gold_rebuild_spot_v1(v_p.spot_id);
 end if;
 insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata) values(v_p.spot_id,(v_actor->>'actorId')::uuid,p_action,'PROPOSAL',v_p.id,jsonb_build_object('fieldKey',v_p.field_key,'rebuild',v_result));
 return jsonb_build_object('proposalId',v_p.id,'action',p_action,'rebuild',v_result);
end $$;

create or replace function public.backyrd_gold_readiness_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;
begin
 perform public.backyrd_gold_actor_v1(p_spot_id);
 with s as (select * from public.spots where id=p_spot_id), d as (select * from public.spot_descriptions where spot_id=p_spot_id),
 checks as (
  select * from (values
   ('IDENTITY','MISSING',exists(select 1 from s where nullif(btrim(name),'') is null or nullif(btrim(city),'') is null or address is null)),
   ('DESCRIPTION','MISSING',not exists(select 1 from d where length(coalesce(nullif(btrim(admin_description),''),nullif(btrim(owner_description),''),nullif(btrim(enriched_description),''),''))>=80)),
   ('VISUAL','MISSING',exists(select 1 from s where header_photo_path is null and not google_photo_enabled)),
   ('BASIC_FACTS','MISSING',exists(select 1 from s where website is null and phone is null)),
   ('OPENING_HOURS','MISSING',not exists(select 1 from public.spot_hours where spot_id=p_spot_id)),
   ('FAMILY_KIDS','UNKNOWN',not exists(select 1 from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key='suitability.family_kids' and status in ('ACTIVE','UNKNOWN'))),
   ('ENVIRONMENT','UNKNOWN',not exists(select 1 from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key='suitability.environment' and status in ('ACTIVE','UNKNOWN'))),
   ('AGE','UNKNOWN',not exists(select 1 from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key='suitability.age' and status in ('ACTIVE','UNKNOWN'))),
   ('N4','MISSING',not exists(select 1 from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=p_spot_id and context_key='global')),
   ('PROPOSALS','CONFLICT',exists(select 1 from public.backyrd_spot_fact_proposals_v1 where spot_id=p_spot_id and status='CONFLICT')),
   ('SOURCES','STALE',exists(select 1 from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and status='STALE'))
  ) x(item,state,is_gap)
 ), stats as (select count(*) total,count(*) filter(where not is_gap) done from checks)
 select jsonb_build_object('status',case when not exists(select 1 from checks where is_gap and item<>'AGE') then 'GOLD_READY' else 'PARTIAL' end,'coverage',round(100*(select done from stats)::numeric/(select total from stats)),'gaps',coalesce((select jsonb_agg(jsonb_build_object('item',item,'state',state) order by item) from checks where is_gap),'[]'),'n4',(select jsonb_build_object('snapshotHash',fingerprint,'confidence',confidence,'conceptCount',(select count(*) from jsonb_object_keys(coalesce(intelligence->'concepts','{}'::jsonb)))) from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=p_spot_id and context_key='global')) into v_result;
 return v_result;
end $$;

create or replace function public.backyrd_gold_profile_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_actor jsonb;
begin
 v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
 return jsonb_build_object(
  'actor',v_actor,
  'catalog',(select coalesce(jsonb_agg(to_jsonb(c) order by c.section,c.field_key),'[]') from public.backyrd_spot_fact_catalog_v1 c),
  'sources',(select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]') from public.backyrd_spot_sources_v1 s where s.spot_id=p_spot_id),
  'proposals',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]') from public.backyrd_spot_fact_proposals_v1 p where p.spot_id=p_spot_id and ((v_actor->>'role') in ('FOUNDER','ADMIN') or p.proposed_by_id=(v_actor->>'actorId')::uuid)),
  'acceptedFacts',(select coalesce(jsonb_agg(to_jsonb(f) order by f.field_key,f.accepted_at desc),'[]') from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.status in ('ACTIVE','UNKNOWN','STALE')),
  'readiness',public.backyrd_gold_readiness_v1(p_spot_id),
  'canonicalN4',(select jsonb_build_object('snapshotHash',fingerprint,'confidence',confidence,'completeness',completeness,'intelligence',intelligence,'calculatedAt',calculated_at) from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=p_spot_id and context_key='global'),
  'legacy',jsonb_build_object('spotIntelligence',exists(select 1 from public.spot_intelligence_v1 where spot_id=p_spot_id),'label','LEGACY / NOT CANONICAL')
 );
end $$;

-- Research agents can only submit source-bound proposals through a service role.
create or replace function public.backyrd_gold_submit_research_proposal_v1(p_spot_id uuid,p_field_key text,p_value jsonb,p_source_url text,p_title text,p_observed_at timestamptz,p_evidence_excerpt text,p_confidence_rationale text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_source uuid;v_hash text;v_id uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 if not public.backyrd_gold_validate_fact_value_v1(p_field_key,p_value) then raise exception 'invalid_typed_fact_value' using errcode='22023'; end if;
 insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_url,title,observed_at,last_checked_at,legal_use_status,created_by_type)
 values(p_spot_id,'RESEARCH',p_source_url,p_title,least(p_observed_at,now()),now(),'REVIEW_REQUIRED','RESEARCH_AGENT') returning id into v_source;
 v_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_spot_id,p_field_key,p_value::text,v_source),'UTF8'),'sha256'),'hex');
 insert into public.backyrd_spot_fact_proposals_v1(spot_id,field_key,proposed_value,source_id,proposed_by_type,confidence_rationale,evidence_excerpt,idempotency_key,proposal_hash)
 values(p_spot_id,p_field_key,p_value,v_source,'RESEARCH_AGENT',p_confidence_rationale,left(p_evidence_excerpt,2000),p_idempotency_key,v_hash)
 on conflict(spot_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_id;
 return jsonb_build_object('proposalId',v_id,'status','PENDING','canonicalWrite',false);
end $$;

-- Preserve legitimately sourced legacy Gold suitability as explicitly LEGACY.
insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_reference,title,observed_at,last_checked_at,created_by_type)
select distinct f.spot_id,'LEGACY',f.source_table||':'||f.source_record,'Verified legacy Admin suitability',coalesce(f.source_updated_at,f.created_at),f.source_updated_at,'LEGACY_IMPORT'
from public.backyrd_spot_suitability_facts_v1 f
where f.source_origin='LEGACY' and not exists(select 1 from public.backyrd_spot_sources_v1 s where s.spot_id=f.spot_id and s.source_type='LEGACY' and s.source_reference=f.source_table||':'||f.source_record);

insert into public.backyrd_spot_accepted_facts_v1(spot_id,field_key,value,source_id,status,confidence_policy_result,observed_at,last_checked_at,contract_version)
select f.spot_id,case f.dimension_key when 'family_kids' then 'suitability.family_kids' when 'age_suitability' then 'suitability.age' when 'environment' then 'suitability.environment' when 'rain_suitability' then 'suitability.rain' when 'activity_type' then 'activity.types' when 'conversation_suitability' then 'suitability.conversation' when 'social_context_suitability' then 'social.suitability' end,
 case f.dimension_key when 'family_kids' then to_jsonb(case when coalesce((f.value->>'suitable')::boolean,false) then 'SUITABLE' else 'NOT_SUITABLE' end) when 'conversation_suitability' then to_jsonb(f.value->>'level') else f.value end,
 s.id,'ACTIVE',f.confidence,f.source_updated_at,f.source_updated_at,'backyrd-spot-accepted-fact-legacy-adapter-v1'
from public.backyrd_spot_suitability_facts_v1 f join public.backyrd_spot_sources_v1 s on s.spot_id=f.spot_id and s.source_type='LEGACY' and s.source_reference=f.source_table||':'||f.source_record
where f.source_origin='LEGACY'
on conflict(spot_id,field_key,source_id) do nothing;

alter table public.backyrd_spot_fact_catalog_v1 enable row level security;
alter table public.backyrd_spot_sources_v1 enable row level security;
alter table public.backyrd_spot_fact_proposals_v1 enable row level security;
alter table public.backyrd_spot_accepted_facts_v1 enable row level security;
alter table public.backyrd_spot_gold_authoring_audit_v1 enable row level security;
alter table public.backyrd_gold_authoring_settings_v1 enable row level security;
alter table public.backyrd_gold_authoring_owner_allowlist_v1 enable row level security;
create policy backyrd_gold_catalog_read_v1 on public.backyrd_spot_fact_catalog_v1 for select to authenticated using(true);
create policy backyrd_gold_sources_no_direct_v1 on public.backyrd_spot_sources_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_gold_proposals_no_direct_v1 on public.backyrd_spot_fact_proposals_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_gold_facts_no_direct_v1 on public.backyrd_spot_accepted_facts_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_gold_audit_no_direct_v1 on public.backyrd_spot_gold_authoring_audit_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_gold_settings_no_direct_v1 on public.backyrd_gold_authoring_settings_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_gold_allowlist_no_direct_v1 on public.backyrd_gold_authoring_owner_allowlist_v1 for all to anon,authenticated using(false) with check(false);

revoke all on public.backyrd_spot_fact_catalog_v1,public.backyrd_spot_sources_v1,public.backyrd_spot_fact_proposals_v1,public.backyrd_spot_accepted_facts_v1,public.backyrd_spot_gold_authoring_audit_v1 from anon,authenticated;
revoke all on public.backyrd_gold_authoring_settings_v1,public.backyrd_gold_authoring_owner_allowlist_v1 from anon,authenticated;
grant select on public.backyrd_spot_fact_catalog_v1 to authenticated;
grant all on public.backyrd_spot_fact_catalog_v1,public.backyrd_spot_sources_v1,public.backyrd_spot_fact_proposals_v1,public.backyrd_spot_accepted_facts_v1,public.backyrd_spot_gold_authoring_audit_v1 to service_role;
grant all on public.backyrd_gold_authoring_settings_v1,public.backyrd_gold_authoring_owner_allowlist_v1 to service_role;
revoke all on function public.backyrd_gold_actor_v1(uuid),public.backyrd_gold_validate_fact_value_v1(text,jsonb),public.backyrd_gold_rebuild_spot_v1(uuid),public.backyrd_gold_submit_research_proposal_v1(uuid,text,jsonb,text,text,timestamptz,text,text,text) from public,anon,authenticated;
revoke all on function public.backyrd_gold_create_source_v1(uuid,text,text,text,text,text,timestamptz,timestamptz,text),public.backyrd_gold_submit_proposal_v1(uuid,text,jsonb,uuid,text,text,text),public.backyrd_gold_review_proposal_v1(uuid,text,text),public.backyrd_gold_readiness_v1(uuid),public.backyrd_gold_profile_v1(uuid) from public,anon;
grant execute on function public.backyrd_gold_create_source_v1(uuid,text,text,text,text,text,timestamptz,timestamptz,text),public.backyrd_gold_submit_proposal_v1(uuid,text,jsonb,uuid,text,text,text),public.backyrd_gold_readiness_v1(uuid),public.backyrd_gold_profile_v1(uuid) to authenticated,service_role;
grant execute on function public.backyrd_gold_review_proposal_v1(uuid,text,text),public.backyrd_gold_rebuild_spot_v1(uuid) to authenticated,service_role;
grant execute on function public.backyrd_gold_submit_research_proposal_v1(uuid,text,jsonb,text,text,timestamptz,text,text,text) to service_role;

comment on table public.backyrd_spot_accepted_facts_v1 is 'Canonical accepted Product facts. Derived N4 remains read-only and rebuildable.';
comment on table public.backyrd_spot_owner_intelligence_entitlements_v1 is 'FREE/PREMIUM resolves Owner BASIC/PRO authoring only. It is prohibited from organic ranking inputs.';

-- The pre-existing free-text Owner intelligence editor is a legacy Deep path.
-- Keep it operational for Pro owners, but prevent Basic clients from bypassing
-- the typed capability boundary. These legacy fields remain non-canonical.
create or replace function public.update_owner_spot_intelligence_moderated_v1(
 p_spot_id uuid,p_best_for text[] default '{}',p_occasion_tags text[] default '{}',p_atmosphere_tags text[] default '{}',
 p_avoid_if_tags text[] default '{}',p_good_for_time text[] default '{}',p_noise_level text default null,
 p_crowd_type text[] default '{}',p_dress_code text default null,p_reservation_recommended boolean default null,
 p_average_duration_minutes integer default null,p_signature_items text[] default '{}',p_special_notes text default null,
 p_change_source text default 'unknown'
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_old jsonb;v_new jsonb;v_detail jsonb;v_flags text[];v_status text;v_event_id uuid;
begin
 perform public.backyrd_owner_assert_spot_v1(p_spot_id);
 if (coalesce((select owner_public_enabled from public.backyrd_gold_authoring_settings_v1 where singleton),false) or exists(select 1 from public.backyrd_gold_authoring_owner_allowlist_v1 where user_id=auth.uid() and enabled))
 and not exists(select 1 from public.backyrd_spot_owner_intelligence_entitlements_v1 e where e.spot_id=p_spot_id and e.owner_id=auth.uid() and e.tier='PREMIUM' and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now())) then
  raise exception 'owner_pro_required_for_legacy_deep_intelligence' using errcode='42501';
 end if;
 select to_jsonb(si)-'spot_id' into v_old from public.spot_intelligence_v1 si where si.spot_id=p_spot_id;
 v_detail:=public.update_owner_spot_intelligence_v1(p_spot_id,p_best_for,p_occasion_tags,p_atmosphere_tags,p_avoid_if_tags,p_good_for_time,p_noise_level,p_crowd_type,p_dress_code,p_reservation_recommended,p_average_duration_minutes,p_signature_items,p_special_notes);
 select to_jsonb(si)-'spot_id' into v_new from public.spot_intelligence_v1 si where si.spot_id=p_spot_id;
 v_flags:=public.backyrd_owner_text_risk_flags_v1(array[array_to_string(coalesce(p_best_for,'{}'),' '),array_to_string(coalesce(p_occasion_tags,'{}'),' '),array_to_string(coalesce(p_atmosphere_tags,'{}'),' '),array_to_string(coalesce(p_avoid_if_tags,'{}'),' '),array_to_string(coalesce(p_good_for_time,'{}'),' '),p_noise_level,array_to_string(coalesce(p_crowd_type,'{}'),' '),p_dress_code,array_to_string(coalesce(p_signature_items,'{}'),' '),p_special_notes]);
 v_status:=case when cardinality(v_flags)>0 then 'flagged' else 'pending' end;
 insert into public.spot_owner_change_events(spot_id,changed_by,change_area,change_source,old_data,new_data,moderation_status,risk_flags)
 values(p_spot_id,auth.uid(),'intelligence',coalesce(nullif(trim(p_change_source),''),'unknown'),coalesce(v_old,'{}'),coalesce(v_new,'{}'),v_status,v_flags) returning id into v_event_id;
 return jsonb_build_object('ok',true,'event_id',v_event_id,'moderation_status',v_status,'risk_flags',v_flags,'detail',v_detail,'legacy',true,'canonical',false);
end $$;
