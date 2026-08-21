-- backyrd-canonical-semantics-v1: additive producer/consumer alignment.
-- Frozen Taste/N4 registries are asserted, never rewritten.

do $$ begin
  if (select count(*) from public.backyrd_taste_concepts_v1) <> 45 then raise exception 'frozen_taste_registry_must_remain_45'; end if;
  if (select count(*) from public.backyrd_spot_intelligence_dimensions_v1) <> 60 then raise exception 'frozen_n4_registry_must_remain_60'; end if;
end $$;

create table public.backyrd_canonical_semantic_contracts_v1(
  contract_version text primary key,
  status text not null check(status in ('ACTIVE','RETIRED')),
  taste_registry_count integer not null,
  n4_registry_count integer not null,
  historical_policy text not null,
  created_at timestamptz not null default now()
);
insert into public.backyrd_canonical_semantic_contracts_v1 values
 ('backyrd-canonical-semantics-v1','ACTIVE',45,60,'NO_SILENT_HISTORICAL_REINTERPRETATION',now());

create table public.backyrd_category_place_type_v1(
  category_name text primary key,
  place_type text not null check(place_type in ('cafe','bar','restaurant','nightlife','culture','outing','activity','experience','hotel','other')),
  contract_version text not null default 'backyrd-canonical-semantics-v1'
);
insert into public.backyrd_category_place_type_v1(category_name,place_type) values
 ('Aktivität','activity'),('Aussichtspunkt','outing'),('Bar','bar'),('Besonderes Erlebnis','experience'),('Café','cafe'),('Event','experience'),('Kino','culture'),('Museum','culture'),('Nachtleben','nightlife'),('Restaurant','restaurant'),('Spaziergang','outing'),('Unterkunft / Hotel','hotel'),('Weinbar','bar'),('Wellness & Spa','experience');

alter table public.reviews add column if not exists semantic_contract_version text;
alter table public.reviews alter column semantic_contract_version set default 'backyrd-canonical-semantics-v1';
alter table public.backyrd_spot_accepted_facts_v1 add column if not exists semantic_contract_version text;
alter table public.backyrd_spot_accepted_facts_v1 alter column semantic_contract_version set default 'backyrd-canonical-semantics-v1';

create or replace function public.backyrd_assign_review_provenance_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.data_origin:='REAL';
    if new.product_evidence_origin='smart_review_v1' or new.review_origin='SMART_REVIEW' then
      new.review_origin:='SMART_REVIEW';new.product_evidence_origin:='smart_review_v1';
    else
      new.review_origin:='STANDARD_REVIEW';new.product_evidence_origin:=null;
    end if;
    new.semantic_contract_version:='backyrd-canonical-semantics-v1';
  elsif new.data_origin='REAL' and (new.product_evidence_origin='smart_review_v1' or new.review_origin='SMART_REVIEW') then
    new.review_origin:='SMART_REVIEW';new.product_evidence_origin:='smart_review_v1';new.semantic_contract_version:='backyrd-canonical-semantics-v1';
  end if;
  if (new.review_origin='SMART_REVIEW') is distinct from coalesce(new.product_evidence_origin='smart_review_v1',false) then raise exception 'smart_review_origin_contract_mismatch' using errcode='22023'; end if;
  return new;
end $$;

create table public.backyrd_self_declared_taste_v1(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_key text not null references public.backyrd_taste_concepts_v1(concept_key),
  source_kind text not null check(source_kind in ('PROFILE','DECISION_ONBOARDING')),
  spot_id uuid references public.spots(id) on delete set null,
  source_n4_snapshot_identity text,
  state text not null default 'ACTIVE' check(state in ('ACTIVE','REMOVED')),
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  corrected_at timestamptz,
  semantic_contract_version text not null default 'backyrd-canonical-semantics-v1',
  unique(user_id,concept_key,source_kind,spot_id),
  check(source_kind='PROFILE' or (spot_id is not null and source_n4_snapshot_identity is not null))
);
create index backyrd_self_declared_taste_user_active_v1 on public.backyrd_self_declared_taste_v1(user_id,state,created_at);
alter table public.backyrd_self_declared_taste_v1 enable row level security;
create policy backyrd_self_declared_taste_read_own_v1 on public.backyrd_self_declared_taste_v1 for select to authenticated using(user_id=auth.uid());
create policy backyrd_self_declared_taste_no_direct_write_v1 on public.backyrd_self_declared_taste_v1 for all to authenticated using(false) with check(false);

create or replace function public.backyrd_set_self_declared_taste_v1(p_concept_key text,p_active boolean,p_source_kind text default 'PROFILE')
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid:=auth.uid();v_id uuid;v_revision integer;v_now timestamptz:=now();
begin
 if v_user is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_source_kind<>'PROFILE' then raise exception 'source_kind_not_client_writable' using errcode='42501'; end if;
 if not exists(select 1 from public.backyrd_taste_concepts_v1 where concept_key=p_concept_key) then raise exception 'canonical_concept_invalid' using errcode='22023'; end if;
 select id into v_id from public.backyrd_self_declared_taste_v1 where user_id=v_user and concept_key=p_concept_key and source_kind='PROFILE' and spot_id is null for update;
 if v_id is null then
  insert into public.backyrd_self_declared_taste_v1(user_id,concept_key,source_kind,state,corrected_at) values(v_user,p_concept_key,'PROFILE',case when p_active then 'ACTIVE' else 'REMOVED' end,case when p_active then null else v_now end) returning id,revision into v_id,v_revision;
 else
  update public.backyrd_self_declared_taste_v1 set state=case when p_active then 'ACTIVE' else 'REMOVED' end,corrected_at=case when p_active then null else v_now end,revision=revision+1,semantic_contract_version='backyrd-canonical-semantics-v1' where id=v_id returning revision into v_revision;
 end if;
 perform public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',v_user,'idempotencyKey','self-declared:'||v_id||':'||v_revision,'eventType','memory_correction','occurredAt',v_now,'observedAt',v_now,'ingestedAt',v_now,'sessionId','self-declared','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','SELF_DECLARED','sourceVersion','backyrd-canonical-semantics-v1','sourceEventId',v_id||':'||v_revision),'consentPurpose','personalized_recommendations','consentState','granted','contractVersion','backyrd-memory-event-contract-v1'));
 return jsonb_build_object('id',v_id,'state',case when p_active then 'ACTIVE' else 'REMOVED' end,'evidenceAuthority','SELF_DECLARED','semanticContractVersion','backyrd-canonical-semantics-v1');
end $$;

create or replace function public.complete_decision_onboarding_v2(p_city text,p_spot_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid:=auth.uid();v_ids uuid[];v_count integer;v_spot uuid;v_snapshot text;v_inserted integer:=0;v_now timestamptz:=now();r record;
begin
 if v_user is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into v_ids from unnest(coalesce(p_spot_ids,'{}'::uuid[])) id where id is not null;
 v_count:=coalesce(cardinality(v_ids),0);if v_count<3 or v_count>8 then raise exception 'onboarding_spot_count_invalid';end if;
 if (select count(*) from public.spots where id=any(v_ids) and status='approved' and data_origin not in ('FIXTURE','TEST'))<>v_count then raise exception 'onboarding_spot_invalid';end if;
 insert into public.profiles(id,city,home_city,created_at,updated_at) values(v_user,p_city,p_city,now(),now()) on conflict(id) do update set city=coalesce(public.profiles.city,excluded.city),home_city=coalesce(public.profiles.home_city,excluded.home_city),updated_at=now();
 perform public.save_favorite_spot_seeds_v1(p_city:=p_city,p_spot_ids:=v_ids,p_raw_names:='{}'::text[]);
 foreach v_spot in array v_ids loop
  select snapshot_identity into v_snapshot from public.backyrd_read_n4_for_user_intelligence_v1(array[v_spot]) where spot_id=v_spot and available;
  if v_snapshot is null then continue;end if;
  for r in select c->>'concept' concept from public.backyrd_read_n4_for_user_intelligence_v1(array[v_spot]) n cross join lateral jsonb_array_elements(n.concepts)c where n.spot_id=v_spot and (c->>'confidence')::numeric>=.35 loop
   insert into public.backyrd_self_declared_taste_v1(user_id,concept_key,source_kind,spot_id,source_n4_snapshot_identity,state)
   values(v_user,r.concept,'DECISION_ONBOARDING',v_spot,v_snapshot,'ACTIVE') on conflict(user_id,concept_key,source_kind,spot_id) do update set state='ACTIVE',source_n4_snapshot_identity=excluded.source_n4_snapshot_identity,corrected_at=null;
   v_inserted:=v_inserted+1;
  end loop;
 end loop;
 update public.profiles set decision_onboarding_completed_at=now(),onboarding_version='canonical-semantics-v1',updated_at=now() where id=v_user;
 perform public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',v_user,'idempotencyKey','decision-onboarding-v2:'||v_user||':'||md5(array_to_string(v_ids,',')),'eventType','memory_correction','occurredAt',v_now,'observedAt',v_now,'ingestedAt',v_now,'sessionId','decision-onboarding-v2','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','SELF_DECLARED','sourceVersion','backyrd-canonical-semantics-v1','sourceEventId','decision-onboarding-v2:'||v_user||':'||md5(array_to_string(v_ids,','))),'consentPurpose','personalized_recommendations','consentState','granted','contractVersion','backyrd-memory-event-contract-v1'));
 return jsonb_build_object('ok',true,'selectedCount',v_count,'declaredEvidenceCount',v_inserted,'semanticContractVersion','backyrd-canonical-semantics-v1');
end $$;

-- Canonical reads explicitly reject legacy/display intelligence. Historical
-- rows remain stored and auditable but cannot become canonical User evidence.
create or replace function public.backyrd_read_n4_for_user_intelligence_v1(p_spot_ids uuid[])
returns table(spot_id uuid,available boolean,concepts jsonb,place_type text,snapshot_identity text,freshness timestamptz)
language sql stable security definer set search_path=public,pg_catalog as $$
 with requested as(
  select distinct x spot_id from unnest(coalesce(p_spot_ids,'{}'::uuid[]))x join public.spots s on s.id=x where s.data_origin in ('REAL','IMPORT')
 ), concepts as(
  select e.spot_id,jsonb_agg(jsonb_build_object('concept',e.dimension_key,'presence',(e.value#>>'{}')::numeric,'confidence',e.signal_confidence,'provenance',jsonb_build_object('evidenceId',e.id,'sourceFamily',e.source_family,'sourceReference',e.source_reference,'dataOrigin',e.data_origin)) order by e.dimension_key,e.id) concepts
  from public.backyrd_spot_intelligence_evidence_v1 e join requested r on r.spot_id=e.spot_id
  where e.status='ACTIVE' and e.data_origin in ('REAL','IMPORT') and e.source_family not in ('legacy','spot_intelligence_v1','spot_mood_concepts','spot_moods','mood_concepts') and e.value_kind='INTERPRETATION' and (e.value#>>'{}')::numeric>0 and e.signal_confidence>=.35 and e.valid_from<=now() and(e.valid_until is null or e.valid_until>now()) group by e.spot_id
 ),snapshots as(
  select s.spot_id,s.fingerprint,s.evidence_watermark,nullif(coalesce(s.intelligence->>'placeType',s.intelligence->>'place_type'),'')place_type from public.backyrd_spot_intelligence_snapshots_v1 s join requested r on r.spot_id=s.spot_id where s.context_key='global'
 )select r.spot_id,coalesce(jsonb_array_length(c.concepts),0)>0,coalesce(c.concepts,'[]'::jsonb),s.place_type,s.fingerprint,s.evidence_watermark from requested r left join concepts c on c.spot_id=r.spot_id left join snapshots s on s.spot_id=r.spot_id
$$;

create or replace function public.backyrd_read_n4_for_decision_v2(p_spot_ids uuid[])
returns table(spot_id uuid,available boolean,concepts jsonb,place_type text,snapshot_identity text,freshness timestamptz,suitability_facts jsonb)
language sql stable security definer set search_path=public,pg_catalog as $$
 with canonical as(select * from public.backyrd_read_n4_for_user_intelligence_v1(p_spot_ids)), facts as(
  select f.spot_id,jsonb_object_agg(f.field_key,jsonb_build_object('value',f.value,'status',f.status,'confidence',f.confidence_policy_result,'sourceIdentity','accepted-fact:'||f.id,'observedAt',coalesce(f.observed_at,f.accepted_at),'contractVersion',coalesce(f.semantic_contract_version,f.contract_version)) order by f.field_key) value
  from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_sources_v1 s on s.id=f.source_id join public.spots sp on sp.id=f.spot_id
  where f.spot_id=any(coalesce(p_spot_ids,'{}'::uuid[])) and f.status in ('ACTIVE','UNKNOWN') and f.field_key in ('suitability.family_kids','suitability.age','suitability.environment','suitability.rain','activity.types','suitability.conversation','social.suitability','accessibility.capabilities','price.level','time.dayparts') and s.source_type<>'LEGACY' and sp.data_origin not in ('FIXTURE','TEST')
  group by f.spot_id
 ) select c.spot_id,c.available or coalesce(f.value,'{}'::jsonb)<>'{}'::jsonb,c.concepts,c.place_type,c.snapshot_identity,c.freshness,coalesce(f.value,'{}'::jsonb) from canonical c left join facts f on f.spot_id=c.spot_id
$$;

alter table public.backyrd_canonical_semantic_contracts_v1 enable row level security;
alter table public.backyrd_category_place_type_v1 enable row level security;
create policy backyrd_canonical_contract_read_v1 on public.backyrd_canonical_semantic_contracts_v1 for select to authenticated using(true);
create policy backyrd_category_place_type_read_v1 on public.backyrd_category_place_type_v1 for select to authenticated using(true);
revoke all on table public.backyrd_canonical_semantic_contracts_v1,public.backyrd_category_place_type_v1,public.backyrd_self_declared_taste_v1 from anon,authenticated;
grant select on public.backyrd_canonical_semantic_contracts_v1,public.backyrd_category_place_type_v1 to authenticated;
grant select on public.backyrd_self_declared_taste_v1 to authenticated;
grant all on public.backyrd_canonical_semantic_contracts_v1,public.backyrd_category_place_type_v1,public.backyrd_self_declared_taste_v1 to service_role;
revoke all on function public.backyrd_set_self_declared_taste_v1(text,boolean,text),public.complete_decision_onboarding_v2(text,uuid[]),public.backyrd_read_n4_for_decision_v2(uuid[]) from public,anon,authenticated;
grant execute on function public.backyrd_set_self_declared_taste_v1(text,boolean,text),public.complete_decision_onboarding_v2(text,uuid[]) to authenticated;
grant execute on function public.backyrd_set_self_declared_taste_v1(text,boolean,text),public.complete_decision_onboarding_v2(text,uuid[]),public.backyrd_read_n4_for_decision_v2(uuid[]) to service_role;

comment on table public.backyrd_self_declared_taste_v1 is 'Explicit SELF_DECLARED source evidence. It is a weak prior, never behavioral proof or directly HIGH.';
comment on function public.backyrd_read_n4_for_decision_v2(uuid[]) is 'Minimal canonical N4 plus provenance-bound accepted suitability facts. Legacy/fixture evidence is excluded.';
