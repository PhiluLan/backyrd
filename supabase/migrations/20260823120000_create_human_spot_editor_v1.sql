-- Human Spot Editor V1
-- Human authoring stays proposal/source-bound. Frozen 45/60 registries and
-- ranking semantics are not changed.

do $$ begin
  if (select count(*) from public.backyrd_taste_concepts_v1) <> 45 then raise exception 'frozen_taste_registry_must_remain_45'; end if;
  if (select count(*) from public.backyrd_spot_intelligence_dimensions_v1) <> 60 then raise exception 'frozen_n4_registry_must_remain_60'; end if;
end $$;

alter table public.backyrd_spot_fact_proposals_v1
  add column if not exists evidence_scope text
    check(evidence_scope in ('SPOT','EVENT','PROGRAM','TEMPORARY'));
alter table public.backyrd_spot_accepted_facts_v1
  add column if not exists evidence_scope text
    check(evidence_scope in ('SPOT','EVENT','PROGRAM','TEMPORARY'));

create or replace function public.backyrd_gold_default_human_scope_v1()
returns trigger language plpgsql as $$
begin
  if new.evidence_scope is null and new.proposed_by_type in ('FOUNDER','ADMIN','OWNER') then new.evidence_scope:='SPOT'; end if;
  return new;
end $$;
drop trigger if exists trg_backyrd_gold_default_human_scope_v1 on public.backyrd_spot_fact_proposals_v1;
create trigger trg_backyrd_gold_default_human_scope_v1 before insert on public.backyrd_spot_fact_proposals_v1
for each row execute function public.backyrd_gold_default_human_scope_v1();

-- Activities are standard authoring. Derived place type and ambiguous operating
-- status are not directly authorable; category and regular hours remain human.
update public.backyrd_spot_fact_catalog_v1 set capability='BASIC' where field_key='activity.types';
update public.backyrd_spot_fact_catalog_v1 set owner_editable=false where field_key in ('place_type','opening.status');
update public.backyrd_spot_fact_catalog_v1
set value_kind='ENUM',allowed_values='["Aktivität","Aussichtspunkt","Bar","Besonderes Erlebnis","Café","Event","Kino","Museum","Nachtleben","Restaurant","Spaziergang","Unterkunft / Hotel","Weinbar","Wellness & Spa"]'::jsonb
where field_key='category.primary';

create or replace function public.backyrd_gold_copy_proposal_scope_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if new.proposal_id is not null and new.evidence_scope is null then
    select coalesce(p.evidence_scope,p.research_evidence_scope)
      into new.evidence_scope
    from public.backyrd_spot_fact_proposals_v1 p where p.id=new.proposal_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_backyrd_gold_copy_proposal_scope_v1 on public.backyrd_spot_accepted_facts_v1;
create trigger trg_backyrd_gold_copy_proposal_scope_v1 before insert on public.backyrd_spot_accepted_facts_v1
for each row execute function public.backyrd_gold_copy_proposal_scope_v1();

create or replace function public.backyrd_gold_project_basic_fact_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if new.status<>'ACTIVE' then return new; end if;
  if new.field_key='contact.website' then update public.spots set website=nullif(new.value#>>'{}','') where id=new.spot_id;
  elsif new.field_key='contact.phone' then update public.spots set phone=nullif(new.value#>>'{}','') where id=new.spot_id;
  elsif new.field_key='contact.email' then update public.spots set email=nullif(new.value#>>'{}','') where id=new.spot_id;
  elsif new.field_key='identity.name' then update public.spots set name=new.value#>>'{}' where id=new.spot_id;
  elsif new.field_key='price.level' then update public.spots set price_level=(new.value#>>'{}')::integer where id=new.spot_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_backyrd_gold_project_basic_fact_v1 on public.backyrd_spot_accepted_facts_v1;
create trigger trg_backyrd_gold_project_basic_fact_v1 after insert on public.backyrd_spot_accepted_facts_v1
for each row execute function public.backyrd_gold_project_basic_fact_v1();

-- Reconcile only already accepted, non-conflicting contact truth into empty
-- Product fields. Existing non-empty Product values are never overwritten.
update public.spots s set website=f.value#>>'{}'
from public.backyrd_spot_accepted_facts_v1 f
where f.spot_id=s.id and f.field_key='contact.website' and f.status='ACTIVE'
  and nullif(btrim(s.website),'') is null and nullif(btrim(f.value#>>'{}'),'') is not null;
update public.spots s set phone=f.value#>>'{}'
from public.backyrd_spot_accepted_facts_v1 f
where f.spot_id=s.id and f.field_key='contact.phone' and f.status='ACTIVE'
  and nullif(btrim(s.phone),'') is null and nullif(btrim(f.value#>>'{}'),'') is not null;
update public.spots s set email=f.value#>>'{}'
from public.backyrd_spot_accepted_facts_v1 f
where f.spot_id=s.id and f.field_key='contact.email' and f.status='ACTIVE'
  and nullif(btrim(s.email),'') is null and nullif(btrim(f.value#>>'{}'),'') is not null;

create or replace function public.backyrd_gold_submit_human_proposal_v1(
  p_spot_id uuid,p_field_key text,p_value jsonb,p_source_type text,
  p_source_url text default null,p_source_reference text default null,
  p_evidence_scope text default 'SPOT',p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor jsonb;v_catalog public.backyrd_spot_fact_catalog_v1%rowtype;v_source uuid;v_result jsonb;v_key text;
begin
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  select * into v_catalog from public.backyrd_spot_fact_catalog_v1 where field_key=p_field_key;
  if not found or not v_catalog.owner_editable then raise exception 'field_not_authorable' using errcode='22023'; end if;
  if v_actor->>'role'='OWNER' and v_catalog.capability='DEEP' and v_actor->>'capability'<>'DEEP' then raise exception 'owner_pro_required' using errcode='42501'; end if;
  if p_evidence_scope not in ('SPOT','EVENT','PROGRAM','TEMPORARY') then raise exception 'human_evidence_scope_invalid' using errcode='22023'; end if;
  if p_source_type not in ('ADMIN_VERIFIED','OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT','OWNER_CLAIM') then raise exception 'human_source_type_invalid' using errcode='22023'; end if;
  if v_actor->>'role'='OWNER' and p_source_type not in ('OWNER_CLAIM','OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT') then raise exception 'owner_source_type_denied' using errcode='42501'; end if;
  if p_source_type in ('OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT') and nullif(btrim(p_source_url),'') is null then raise exception 'official_source_url_required' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_source_url,'')),'') is null and nullif(btrim(coalesce(p_source_reference,'')),'') is null then raise exception 'source_identity_required' using errcode='22023'; end if;
  if not public.backyrd_gold_validate_fact_value_v1(p_field_key,p_value) then raise exception 'invalid_typed_fact_value' using errcode='22023'; end if;
  v_key:=coalesce(nullif(btrim(p_idempotency_key),''),'human-editor-v1:'||gen_random_uuid());
  v_source:=public.backyrd_gold_create_source_v1(p_spot_id,p_source_type,p_source_url,p_source_reference,'Human Spot Editor V1',case when v_actor->>'role'='OWNER' then 'Spot Owner' else 'Backyrd Admin' end,now(),now(),'NOT_REQUIRED');
  v_result:=public.backyrd_gold_submit_proposal_v1(p_spot_id,p_field_key,p_value,v_source,v_key,'Menschlich erfasst; Qualifikation bleibt serverseitig.',null);
  update public.backyrd_spot_fact_proposals_v1 set evidence_scope=p_evidence_scope where id=(v_result->>'proposalId')::uuid;
  return v_result||jsonb_build_object('evidenceScope',p_evidence_scope,'canonicalWrite',false);
end $$;

-- Preserve the original reviewed transaction, but require general Spot scope
-- before anything may enter the general accepted-fact/N4 path.
alter function public.backyrd_gold_review_proposal_v1(uuid,text,text) rename to backyrd_gold_review_proposal_legacy_v1;
create or replace function public.backyrd_gold_review_proposal_v1(p_proposal_id uuid,p_action text,p_resolution_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_scope text;v_proposer text;v_field text;v_value jsonb;
begin
  select coalesce(evidence_scope,research_evidence_scope),proposed_by_type,field_key,proposed_value
    into v_scope,v_proposer,v_field,v_value from public.backyrd_spot_fact_proposals_v1 where id=p_proposal_id;
  if not found then raise exception 'proposal_not_found' using errcode='22023'; end if;
  if p_action in ('ACCEPT','MARK_UNKNOWN') and v_scope is distinct from 'SPOT' then raise exception 'general_spot_acceptance_requires_spot_scope' using errcode='22023'; end if;
  if p_action='ACCEPT' and v_field='place_type' and not exists(select 1 from public.backyrd_category_place_type_v1 where place_type=v_value#>>'{}') then raise exception 'canonical_place_type_required' using errcode='22023'; end if;
  return public.backyrd_gold_review_proposal_legacy_v1(p_proposal_id,p_action,p_resolution_note);
end $$;

-- Correct derived place type at the qualification boundary. Historical facts
-- remain auditable and are surfaced for review; only the canonical adapter may
-- populate the current N4/Decision place type.
alter function public.backyrd_gold_rebuild_spot_v1(uuid) rename to backyrd_gold_rebuild_spot_legacy_v1;
create or replace function public.backyrd_gold_rebuild_spot_v1(p_spot_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_result jsonb;v_place_type text;v_intelligence jsonb;v_hash text;
begin
  v_result:=public.backyrd_gold_rebuild_spot_legacy_v1(p_spot_id);
  select m.place_type into v_place_type from public.spots s join public.categories c on c.id=s.category_id join public.backyrd_category_place_type_v1 m on m.category_name=c.name where s.id=p_spot_id;
  if v_place_type is null then raise exception 'canonical_place_type_unknown' using errcode='22023'; end if;
  update public.backyrd_spot_intelligence_evidence_v1 set status='SUPERSEDED',valid_until=coalesce(valid_until,greatest(clock_timestamp(),valid_from+interval '1 microsecond'))
   where spot_id=p_spot_id and dimension_key='place_type' and source_family='backyrd_derived' and status='ACTIVE' and value<>to_jsonb(v_place_type);
  select intelligence into v_intelligence from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=p_spot_id and context_key='global' for update;
  v_intelligence:=jsonb_set(jsonb_set(coalesce(v_intelligence,'{}'::jsonb),'{placeType}',to_jsonb(v_place_type),true),'{facts,place_type}',to_jsonb(v_place_type),true);
  v_hash:=encode(extensions.digest(convert_to(v_intelligence::text,'UTF8'),'sha256'),'hex');
  update public.backyrd_spot_intelligence_snapshots_v1 set intelligence=v_intelligence,fingerprint=v_hash,calculated_at=now() where spot_id=p_spot_id and context_key='global';
  return v_result||jsonb_build_object('snapshotHash',v_hash,'placeType',v_place_type);
end $$;

create or replace function public.backyrd_gold_review_issues_internal_v1(p_spot_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_catalog as $$
  with issues as (
    select 'NON_CANONICAL_PLACE_TYPE' code,f.id fact_id,f.field_key,
      'Ortsart muss geprüft werden' label,
      'Der bestätigte Wert '||(f.value#>>'{}')||' ist keine kanonische Ortsart; die Kategorie wird sicher über den gemeinsamen Adapter übersetzt.' detail,'BLOCKING' severity
    from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.field_key='place_type' and f.status='ACTIVE'
      and not exists(select 1 from public.backyrd_category_place_type_v1 m where m.place_type=f.value#>>'{}')
    union all
    select 'UNSCOPED_RESEARCH:'||f.id,f.id,f.field_key,'Gültigkeit der Quelle prüfen',
      'Diese bestätigte Research-Angabe stammt aus einem älteren Vertrag ohne Nachweis, dass sie allgemein für den Ort gilt.','BLOCKING'
    from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_fact_proposals_v1 p on p.id=f.proposal_id
    where f.spot_id=p_spot_id and f.status='ACTIVE' and p.proposed_by_type='RESEARCH_AGENT' and coalesce(f.evidence_scope,p.evidence_scope,p.research_evidence_scope) is null
    union all
    select 'NON_SPOT_ACCEPTED:'||f.id,f.id,f.field_key,'Nur zeitweise oder angebotsspezifisch',
      'Diese Angabe gilt nicht allgemein für den Ort und darf allgemeines Spot-Verständnis nicht qualifizieren.','BLOCKING'
    from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.status='ACTIVE' and f.evidence_scope in ('EVENT','PROGRAM','TEMPORARY')
    union all
    select 'OPENING_STATUS_REVIEW:'||f.id,f.id,f.field_key,'Öffnungsstatus prüfen',
      'Regelmäßige Öffnungszeiten sind kein Beleg dafür, dass der Ort gerade jetzt offen ist.','REVIEW'
    from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.field_key='opening.status' and f.status='ACTIVE' and f.value='"OPEN"'::jsonb
    union all
    select 'DAYPART_REVIEW:'||f.id,f.id,f.field_key,'Zeitliche Eignung prüfen',
      'Öffnungszeiten dürfen nicht automatisch als besondere Eignung für Tageszeiten oder Wochenende gelten.','REVIEW'
    from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.field_key='time.dayparts' and f.status='ACTIVE'
  )
  select coalesce(jsonb_agg(jsonb_build_object('code',code,'factId',fact_id,'fieldKey',field_key,'label',label,'detail',detail,'severity',severity) order by severity,code),'[]'::jsonb) from issues;
$$;

create or replace function public.backyrd_gold_review_issues_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
  perform public.backyrd_gold_actor_v1(p_spot_id);
  return public.backyrd_gold_review_issues_internal_v1(p_spot_id);
end $$;

-- Founder/Admin can explicitly retract or stale problematic accepted truth.
-- History is retained and the derived snapshot/readiness are rebuilt atomically.
create or replace function public.backyrd_gold_review_accepted_fact_v1(
  p_fact_id uuid,p_action text,p_resolution_note text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_fact public.backyrd_spot_accepted_facts_v1%rowtype;v_actor jsonb;v_rebuild jsonb;v_status text;
begin
  select * into v_fact from public.backyrd_spot_accepted_facts_v1 where id=p_fact_id for update;
  if not found then raise exception 'accepted_fact_not_found' using errcode='22023'; end if;
  v_actor:=public.backyrd_gold_actor_v1(v_fact.spot_id);
  if v_actor->>'role' not in ('FOUNDER','ADMIN') then raise exception 'admin_or_founder_required' using errcode='42501'; end if;
  if p_action not in ('RETRACT','MARK_STALE') then raise exception 'accepted_fact_review_action_invalid' using errcode='22023'; end if;
  if v_fact.status not in ('ACTIVE','UNKNOWN','STALE') then raise exception 'accepted_fact_not_reviewable' using errcode='22023'; end if;
  v_status:=case when p_action='RETRACT' then 'SUPERSEDED' else 'STALE' end;
  update public.backyrd_spot_accepted_facts_v1
     set status=v_status,last_checked_at=now()
   where id=p_fact_id;
  insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
  values(v_fact.spot_id,(v_actor->>'actorId')::uuid,p_action,'ACCEPTED_FACT',p_fact_id,jsonb_build_object('fieldKey',v_fact.field_key,'previousStatus',v_fact.status,'status',v_status,'note',p_resolution_note,'ui','human-spot-editor-v1'));
  v_rebuild:=public.backyrd_gold_rebuild_spot_v1(v_fact.spot_id);
  return jsonb_build_object('factId',p_fact_id,'status',v_status,'rebuild',v_rebuild);
end $$;

create or replace function public.backyrd_gold_readiness_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;
begin
  perform public.backyrd_gold_actor_v1(p_spot_id);
  with s as (select * from public.spots where id=p_spot_id),
  d as (select * from public.spot_descriptions where spot_id=p_spot_id),
  active as (select * from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and status in ('ACTIVE','UNKNOWN')),
  checks as (
    select * from (values
      ('IDENTITY','Grunddaten und Standort','MISSING',exists(select 1 from s where nullif(btrim(name),'') is null or nullif(btrim(city),'') is null or nullif(btrim(address),'') is null),true),
      ('CATEGORY','Kategorie','INVALID',not exists(select 1 from s join public.categories c on c.id=s.category_id join public.backyrd_category_place_type_v1 m on m.category_name=c.name),true),
      ('DESCRIPTION','Beschreibung','MISSING',not exists(select 1 from d where length(coalesce(nullif(btrim(admin_description),''),nullif(btrim(owner_description),''),nullif(btrim(enriched_description),''),''))>=80),true),
      ('VISUAL','Bilder','MISSING',not exists(select 1 from s where nullif(btrim(header_photo_path),'') is not null or (google_photo_enabled and google_place_id is not null)) and not exists(select 1 from public.spot_photos where spot_id=p_spot_id),true),
      ('CONTACT','Website oder Telefonnummer','MISSING',not exists(select 1 from s where nullif(btrim(website),'') is not null or nullif(btrim(phone),'') is not null) and not exists(select 1 from active where field_key in ('contact.website','contact.phone') and status='ACTIVE' and nullif(value#>>'{}','') is not null),true),
      ('OPENING_HOURS','Öffnungszeiten','MISSING',not exists(select 1 from public.spot_hours where spot_id=p_spot_id) and not exists(select 1 from active where field_key='opening.regular' and status='ACTIVE'),true),
      ('ENVIRONMENT','Drinnen oder draußen','UNKNOWN',not exists(select 1 from active where field_key='suitability.environment' and status='ACTIVE' and value<>'"UNKNOWN"'::jsonb),false),
      ('AGE','Geeignetes Alter','UNKNOWN',not exists(select 1 from active where field_key='suitability.age' and status='ACTIVE'),false),
      ('RAIN','Eignung bei Regen','UNKNOWN',not exists(select 1 from active where field_key='suitability.rain' and status='ACTIVE' and value<>'"UNKNOWN"'::jsonb),false),
      ('N4','Aktuelles Spot-Verständnis','INVALID',not exists(select 1 from public.backyrd_spot_intelligence_snapshots_v1 n join s on true join public.categories c on c.id=s.category_id join public.backyrd_category_place_type_v1 m on m.category_name=c.name where n.spot_id=p_spot_id and n.context_key='global' and n.intelligence->>'placeType'=m.place_type and n.intelligence#>>'{facts,place_type}'=m.place_type),true),
      ('CONFLICTS','Ungeklärte Widersprüche','CONFLICT',exists(select 1 from public.backyrd_spot_fact_proposals_v1 where spot_id=p_spot_id and status='CONFLICT') or jsonb_path_exists(public.backyrd_gold_review_issues_v1(p_spot_id),'$[*] ? (@.severity == "BLOCKING")'),true),
      ('FRESHNESS','Veraltete Quellen','STALE',exists(select 1 from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and status='STALE'),true)
    ) x(item,label,state,is_gap,required)
  ),stats as (select count(*) total,count(*) filter(where not is_gap) done from checks)
  select jsonb_build_object(
    'version','backyrd-human-spot-readiness-v1',
    'status',case when not exists(select 1 from checks where is_gap and required) then 'GOLD_READY' else 'PARTIAL' end,
    'coverage',round(100*(select done from stats)::numeric/(select total from stats)),
    'ready',coalesce((select jsonb_agg(jsonb_build_object('item',item,'label',label) order by item) from checks where not is_gap),'[]'::jsonb),
    'gaps',coalesce((select jsonb_agg(jsonb_build_object('item',item,'label',label,'state',state,'detail',case when required then 'Für GOLD_READY erforderlich.' else 'Darf ehrlich unbekannt bleiben.' end) order by required desc,item) from checks where is_gap),'[]'::jsonb),
    'unknownIsValid',true,
    'n4',(select jsonb_build_object('snapshotHash',fingerprint,'conceptCount',(select count(*) from jsonb_object_keys(coalesce(intelligence->'concepts','{}'::jsonb)))) from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=p_spot_id and context_key='global')
  ) into v_result;
  return v_result;
end $$;

create or replace function public.backyrd_gold_profile_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_actor jsonb;
begin
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  return jsonb_build_object(
    'actor',v_actor,
    'catalog',(select coalesce(jsonb_agg(to_jsonb(c) order by c.section,c.field_key),'[]'::jsonb) from public.backyrd_spot_fact_catalog_v1 c where (v_actor->>'role') in ('FOUNDER','ADMIN') or c.owner_editable),
    'sources',(select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]'::jsonb) from public.backyrd_spot_sources_v1 s where s.spot_id=p_spot_id),
    'proposals',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]'::jsonb) from public.backyrd_spot_fact_proposals_v1 p where p.spot_id=p_spot_id and ((v_actor->>'role') in ('FOUNDER','ADMIN') or p.proposed_by_id=(v_actor->>'actorId')::uuid)),
    'acceptedFacts',(select coalesce(jsonb_agg(to_jsonb(f) order by f.field_key,f.accepted_at desc),'[]'::jsonb) from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.status in ('ACTIVE','UNKNOWN','STALE')),
    'readiness',public.backyrd_gold_readiness_v1(p_spot_id),
    'reviewIssues',public.backyrd_gold_review_issues_v1(p_spot_id),
    'canonicalN4',(select jsonb_build_object('snapshotHash',fingerprint,'intelligence',intelligence,'calculatedAt',calculated_at) from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=p_spot_id and context_key='global'),
    'legacy',jsonb_build_object('spotIntelligence',exists(select 1 from public.spot_intelligence_v1 where spot_id=p_spot_id),'label','Legacy-Daten – nicht Teil des aktuellen Spot-Verständnisses')
  );
end $$;

revoke all on function public.backyrd_gold_review_proposal_legacy_v1(uuid,text,text),public.backyrd_gold_rebuild_spot_legacy_v1(uuid),public.backyrd_gold_review_issues_internal_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function public.backyrd_gold_submit_human_proposal_v1(uuid,text,jsonb,text,text,text,text,text),public.backyrd_gold_review_issues_v1(uuid),public.backyrd_gold_review_proposal_v1(uuid,text,text),public.backyrd_gold_review_accepted_fact_v1(uuid,text,text),public.backyrd_gold_rebuild_spot_v1(uuid) from public,anon;
grant execute on function public.backyrd_gold_submit_human_proposal_v1(uuid,text,jsonb,text,text,text,text,text),public.backyrd_gold_review_issues_v1(uuid),public.backyrd_gold_review_proposal_v1(uuid,text,text),public.backyrd_gold_review_accepted_fact_v1(uuid,text,text),public.backyrd_gold_rebuild_spot_v1(uuid) to authenticated,service_role;

comment on function public.backyrd_gold_submit_human_proposal_v1(uuid,text,jsonb,text,text,text,text,text) is 'Human-language authoring boundary: source + scoped proposal only; never writes accepted truth or N4.';
comment on function public.backyrd_gold_readiness_v1(uuid) is 'Single authoritative human Product readiness. Optional UNKNOWN does not block Gold; material conflicts do.';
