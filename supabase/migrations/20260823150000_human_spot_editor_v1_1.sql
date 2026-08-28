-- Human Spot Editor V1.1
-- UX authority and existing-contract consumption closure. Frozen 45/60
-- registries, ranking weights and public Owner rollout remain unchanged.

do $$ begin
  if (select count(*) from public.backyrd_taste_concepts_v1) <> 45 then raise exception 'frozen_taste_registry_must_remain_45'; end if;
  if (select count(*) from public.backyrd_spot_intelligence_dimensions_v1) <> 60 then raise exception 'frozen_n4_registry_must_remain_60'; end if;
end $$;

-- One canonical audience truth. Historical audience.basic rows remain
-- auditable but cannot be authored or qualified as a parallel truth.
update public.backyrd_spot_fact_catalog_v1
set owner_editable=false,engine_role='DISPLAY_ONLY'
where field_key='audience.basic';
update public.backyrd_spot_fact_catalog_v1
set capability='BASIC',owner_editable=true,engine_role='N4_EVIDENCE'
where field_key='social.suitability';

alter table public.backyrd_spot_fact_proposals_v1
  add column if not exists interpretation_basis text
    check(interpretation_basis in ('HUMAN_QUALITATIVE','SOURCE_EXPLICIT','SCHEDULE_DERIVED','UNKNOWN'));
alter table public.backyrd_spot_accepted_facts_v1
  add column if not exists interpretation_basis text
    check(interpretation_basis in ('HUMAN_QUALITATIVE','SOURCE_EXPLICIT','SCHEDULE_DERIVED','UNKNOWN'));

create or replace function public.backyrd_gold_copy_proposal_scope_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if new.proposal_id is not null and (new.evidence_scope is null or new.interpretation_basis is null) then
    select coalesce(new.evidence_scope,p.evidence_scope,p.research_evidence_scope),
           coalesce(new.interpretation_basis,p.interpretation_basis)
      into new.evidence_scope,new.interpretation_basis
    from public.backyrd_spot_fact_proposals_v1 p where p.id=new.proposal_id;
  end if;
  return new;
end $$;

-- Existing manually authored dayparts have objective audit metadata proving
-- that they were qualitative human answers, not schedule derivations.
update public.backyrd_spot_fact_proposals_v1
set interpretation_basis='HUMAN_QUALITATIVE'
where field_key='time.dayparts' and proposed_by_type in ('FOUNDER','ADMIN')
  and evidence_scope='SPOT' and idempotency_key like 'human-editor-v1:%' and interpretation_basis is null;
update public.backyrd_spot_accepted_facts_v1 f
set interpretation_basis='HUMAN_QUALITATIVE'
from public.backyrd_spot_fact_proposals_v1 p
where p.id=f.proposal_id and f.field_key='time.dayparts' and f.evidence_scope='SPOT'
  and p.interpretation_basis='HUMAN_QUALITATIVE' and f.interpretation_basis is null;

-- Tighten structured validation before direct acceptance. The prior validator
-- remains the fallback authority for the rest of the versioned catalog.
alter function public.backyrd_gold_validate_fact_value_v1(text,jsonb) rename to backyrd_gold_validate_fact_value_v1_1_base;
create or replace function public.backyrd_gold_validate_fact_value_v1(p_field_key text,p_value jsonb)
returns boolean language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_key text;v_entry text;v_min numeric;v_max numeric;
begin
  if not public.backyrd_gold_validate_fact_value_v1_1_base(p_field_key,p_value) then return false; end if;
  if p_field_key='suitability.age' then
    if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('min_age','max_age','adult_supervision_required')) then return false; end if;
    if p_value ? 'min_age' and p_value->'min_age'<>'null'::jsonb and jsonb_typeof(p_value->'min_age')<>'number' then return false; end if;
    if p_value ? 'max_age' and p_value->'max_age'<>'null'::jsonb and jsonb_typeof(p_value->'max_age')<>'number' then return false; end if;
    if p_value ? 'adult_supervision_required' and p_value->'adult_supervision_required'<>'null'::jsonb
      and p_value->'adult_supervision_required' not in ('true'::jsonb,'false'::jsonb,'"UNKNOWN"'::jsonb) then return false; end if;
    v_min:=case when jsonb_typeof(p_value->'min_age')='number' then (p_value->>'min_age')::numeric end;
    v_max:=case when jsonb_typeof(p_value->'max_age')='number' then (p_value->>'max_age')::numeric end;
    return coalesce(v_min between 0 and 120,true) and coalesce(v_max between 0 and 120,true) and (v_min is null or v_max is null or v_min<=v_max);
  elsif p_field_key='duration.approximate' then
    if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('min','max')) then return false; end if;
    if p_value ? 'min' and p_value->'min'<>'null'::jsonb and jsonb_typeof(p_value->'min')<>'number' then return false; end if;
    if p_value ? 'max' and p_value->'max'<>'null'::jsonb and jsonb_typeof(p_value->'max')<>'number' then return false; end if;
    v_min:=case when jsonb_typeof(p_value->'min')='number' then (p_value->>'min')::numeric end;
    v_max:=case when jsonb_typeof(p_value->'max')='number' then (p_value->>'max')::numeric end;
    return coalesce(v_min>=0,true) and coalesce(v_max>=0,true) and (v_min is null or v_max is null or v_min<=v_max);
  elsif p_field_key='social.suitability' then
    if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('solo','date','friends','family','groups','work')) then return false; end if;
    for v_key,v_entry in select e.key,e.value#>>'{}' from jsonb_each(p_value) as e(key,value) loop
      if v_entry not in ('SUITABLE','NOT_SUITABLE','UNKNOWN') then return false; end if;
    end loop;
  elsif p_field_key='accessibility.capabilities' then
    if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('step_free','wheelchair_spaces','accessible_toilet','elevator','hearing_support','assistance_dogs')) then return false; end if;
    for v_key,v_entry in select e.key,e.value#>>'{}' from jsonb_each(p_value) as e(key,value) loop
      if v_entry not in ('SUITABLE','NOT_SUITABLE','UNKNOWN') then return false; end if;
    end loop;
  end if;
  return true;
end $$;

-- Idempotent human proposal wrapper with explicit semantic basis.
alter function public.backyrd_gold_submit_human_proposal_v1(uuid,text,jsonb,text,text,text,text,text) rename to backyrd_gold_submit_human_proposal_v1_1_base;
create or replace function public.backyrd_gold_submit_human_proposal_v1(
  p_spot_id uuid,p_field_key text,p_value jsonb,p_source_type text,
  p_source_url text default null,p_source_reference text default null,
  p_evidence_scope text default 'SPOT',p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_existing public.backyrd_spot_fact_proposals_v1%rowtype;v_source public.backyrd_spot_sources_v1%rowtype;v_result jsonb;v_basis text;
begin
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is not null then
    select * into v_existing from public.backyrd_spot_fact_proposals_v1 where spot_id=p_spot_id and idempotency_key=p_idempotency_key;
    if found then
      select * into v_source from public.backyrd_spot_sources_v1 where id=v_existing.source_id;
      if v_existing.field_key<>p_field_key or v_existing.proposed_value<>p_value
        or coalesce(v_existing.evidence_scope,v_existing.research_evidence_scope) is distinct from p_evidence_scope
        or v_source.source_type<>p_source_type
        or coalesce(v_source.source_url,'')<>coalesce(nullif(btrim(p_source_url),''),'')
        or coalesce(v_source.source_reference,'')<>coalesce(nullif(btrim(p_source_reference),''),'')
      then raise exception 'proposal_idempotency_conflict' using errcode='23505'; end if;
      return jsonb_build_object('proposalId',v_existing.id,'status',v_existing.status,'inserted',false,'evidenceScope',coalesce(v_existing.evidence_scope,v_existing.research_evidence_scope),'canonicalWrite',v_existing.status='ACCEPTED');
    end if;
  end if;
  v_result:=public.backyrd_gold_submit_human_proposal_v1_1_base(p_spot_id,p_field_key,p_value,p_source_type,p_source_url,p_source_reference,p_evidence_scope,p_idempotency_key);
  v_basis:=case when p_field_key='time.dayparts' then 'HUMAN_QUALITATIVE' else 'SOURCE_EXPLICIT' end;
  update public.backyrd_spot_fact_proposals_v1 set interpretation_basis=v_basis where id=(v_result->>'proposalId')::uuid;
  return v_result||jsonb_build_object('interpretationBasis',v_basis);
end $$;

-- Founder/Admin one-click transaction. Restricted or scoped claims remain a
-- proposal. No Owner can enter this authority path.
create or replace function public.backyrd_gold_save_human_fact_v1(
  p_spot_id uuid,p_field_key text,p_value jsonb,p_source_type text,
  p_source_url text default null,p_source_reference text default null,
  p_evidence_scope text default 'SPOT',p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor jsonb;v_result jsonb;v_review jsonb;v_proposal public.backyrd_spot_fact_proposals_v1%rowtype;v_existing_conflict boolean;v_direct boolean;
begin
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  if v_actor->>'role' not in ('FOUNDER','ADMIN') then raise exception 'admin_or_founder_direct_accept_required' using errcode='42501'; end if;
  select exists(select 1 from public.backyrd_spot_fact_proposals_v1 where spot_id=p_spot_id and field_key=p_field_key and status='CONFLICT') into v_existing_conflict;
  v_result:=public.backyrd_gold_submit_human_proposal_v1(p_spot_id,p_field_key,p_value,p_source_type,p_source_url,p_source_reference,p_evidence_scope,p_idempotency_key);
  select * into v_proposal from public.backyrd_spot_fact_proposals_v1 where id=(v_result->>'proposalId')::uuid for update;
  if v_proposal.status='ACCEPTED' then
    return v_result||jsonb_build_object('accepted',true,'reviewRequired',false,'readiness',public.backyrd_gold_readiness_v1(p_spot_id),'replayed',true);
  end if;
  v_direct:=p_evidence_scope='SPOT'
    and p_source_type in ('ADMIN_VERIFIED','OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT')
    and p_field_key not in ('place_type','opening.status')
    and not v_existing_conflict;
  if not v_direct then
    return v_result||jsonb_build_object('accepted',false,'reviewRequired',true,'reason',case when p_evidence_scope<>'SPOT' then 'SCOPED_EVIDENCE' when p_field_key in ('place_type','opening.status') then 'RESTRICTED_CORRECTION' when v_existing_conflict then 'EXISTING_CONFLICT' else 'SOURCE_REVIEW_REQUIRED' end);
  end if;
  v_review:=public.backyrd_gold_review_proposal_v1(v_proposal.id,'ACCEPT','Founder/Admin one-click verified SPOT authoring');
  return v_result||jsonb_build_object('accepted',true,'reviewRequired',false,'review',v_review,'readiness',public.backyrd_gold_readiness_v1(p_spot_id));
end $$;

-- Existing concept mappings plus deterministic combined planning facts.
alter function public.backyrd_gold_rebuild_spot_v1(uuid) rename to backyrd_gold_rebuild_spot_v1_1_base;
create or replace function public.backyrd_gold_rebuild_spot_v1(p_spot_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_result jsonb;v_place_type text;v_intelligence jsonb;v_conf numeric;v_complete numeric;v_watermark timestamptz;v_hash text;
begin
  v_result:=public.backyrd_gold_rebuild_spot_v1_1_base(p_spot_id);

  -- Event/program/temporary or unresolved-scope facts cannot support general N4.
  update public.backyrd_spot_intelligence_evidence_v1 e set status='SUPERSEDED',valid_until=coalesce(e.valid_until,greatest(clock_timestamp(),e.valid_from+interval '1 microsecond'))
  where e.spot_id=p_spot_id and e.source_family='backyrd_derived' and e.status='ACTIVE'
    and e.provenance->>'acceptedFactId' ~* '^[0-9a-f-]{36}$' and exists(
      select 1 from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_sources_v1 s on s.id=f.source_id
      where f.id=(e.provenance->>'acceptedFactId')::uuid
        and (f.evidence_scope in ('EVENT','PROGRAM','TEMPORARY') or (f.evidence_scope is null and s.source_type='RESEARCH'))
    );
  delete from public.backyrd_spot_suitability_facts_v1 sf
  using public.backyrd_spot_accepted_facts_v1 f,public.backyrd_spot_sources_v1 s
  where sf.spot_id=p_spot_id and sf.source_table='backyrd_spot_accepted_facts_v1'
    and sf.source_record=f.id::text and s.id=f.source_id
    and (f.evidence_scope in ('EVENT','PROGRAM','TEMPORARY') or (f.evidence_scope is null and s.source_type='RESEARCH'));

  -- The old mapper emits separate rows into one planning dimension. Replace
  -- them with one deterministic structured value per frozen FACT dimension.
  update public.backyrd_spot_intelligence_evidence_v1 set status='SUPERSEDED',valid_until=coalesce(valid_until,greatest(clock_timestamp(),valid_from+interval '1 microsecond'))
  where spot_id=p_spot_id and source_family='backyrd_derived' and status='ACTIVE'
    and dimension_key in ('reservation_character','duration_character') and source_reference like 'gold-authoring:%';

  insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,status,data_origin)
  select p_spot_id,'reservation_character','FACT',jsonb_strip_nulls(jsonb_build_object(
      'accessMode',(select value from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key='reservation.character' and status='ACTIVE' and evidence_scope='SPOT'),
      'recommended',(select value from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key='reservation.recommended' and status='ACTIVE' and evidence_scope='SPOT')
    )),'backyrd_derived','gold-authoring:planning:'||p_spot_id,
    (select min(confidence_policy_result) from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key in ('reservation.character','reservation.recommended') and status='ACTIVE' and evidence_scope='SPOT'),
    (select max(coalesce(observed_at,accepted_at)) from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key in ('reservation.character','reservation.recommended') and status='ACTIVE' and evidence_scope='SPOT'),now(),
    jsonb_build_object('acceptedFactIds',(select jsonb_agg(id order by field_key) from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key in ('reservation.character','reservation.recommended') and status='ACTIVE' and evidence_scope='SPOT'),'mappingVersion','backyrd-gold-authoring-mapping-v1.1'),'ACTIVE','REAL'
  where exists(select 1 from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key in ('reservation.character','reservation.recommended') and status='ACTIVE' and evidence_scope='SPOT')
  on conflict(spot_id,source_family,source_reference,dimension_key,context_signature) do update set value=excluded.value,signal_confidence=excluded.signal_confidence,observed_at=excluded.observed_at,valid_from=excluded.valid_from,provenance=excluded.provenance,status='ACTIVE',valid_until=null,data_origin='REAL';

  insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,status,data_origin)
  select p_spot_id,'duration_character','FACT',jsonb_strip_nulls(jsonb_build_object(
      'character',(select value from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key='duration.character' and status='ACTIVE' and evidence_scope='SPOT'),
      'rangeMinutes',(select value from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key='duration.approximate' and status='ACTIVE' and evidence_scope='SPOT')
    )),'backyrd_derived','gold-authoring:duration:'||p_spot_id,
    (select min(confidence_policy_result) from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key in ('duration.character','duration.approximate') and status='ACTIVE' and evidence_scope='SPOT'),
    (select max(coalesce(observed_at,accepted_at)) from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key in ('duration.character','duration.approximate') and status='ACTIVE' and evidence_scope='SPOT'),now(),
    jsonb_build_object('acceptedFactIds',(select jsonb_agg(id order by field_key) from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key in ('duration.character','duration.approximate') and status='ACTIVE' and evidence_scope='SPOT'),'mappingVersion','backyrd-gold-authoring-mapping-v1.1'),'ACTIVE','REAL'
  where exists(select 1 from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key in ('duration.character','duration.approximate') and status='ACTIVE' and evidence_scope='SPOT')
  on conflict(spot_id,source_family,source_reference,dimension_key,context_signature) do update set value=excluded.value,signal_confidence=excluded.signal_confidence,observed_at=excluded.observed_at,valid_from=excluded.valid_from,provenance=excluded.provenance,status='ACTIVE',valid_until=null,data_origin='REAL';

  insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,status,data_origin)
  select f.spot_id,m.concept,'INTERPRETATION','1'::jsonb,'backyrd_derived','gold-authoring:'||f.id||':'||m.concept,
    f.confidence_policy_result,coalesce(f.observed_at,f.accepted_at),f.accepted_at,
    jsonb_build_object('acceptedFactId',f.id,'proposalId',f.proposal_id,'sourceId',f.source_id,'mappingVersion','backyrd-gold-authoring-mapping-v1.1'),'ACTIVE','REAL'
  from public.backyrd_spot_accepted_facts_v1 f
  cross join lateral jsonb_array_elements_text(f.value) as descriptor(value)
  cross join lateral (values(case descriptor.value
    when 'COZY' then 'vibe.cozy' when 'RELAXED' then 'vibe.relaxed' when 'ROMANTIC' then 'vibe.romantic'
    when 'LIVELY' then 'vibe.lively' when 'QUIET' then 'vibe.quiet' when 'SOCIAL' then 'vibe.social'
    when 'INSPIRING' then 'vibe.inspiring' when 'PLAYFUL' then 'vibe.playful' when 'ELEGANT' then 'vibe.elegant'
    when 'DESIGN_LED' then 'character.design_led' when 'AUTHENTIC' then 'vibe.authentic'
    when 'HIDDEN_GEM' then 'discovery.hidden_gem' end)) m(concept)
  join public.backyrd_spot_intelligence_dimensions_v1 d on d.dimension_key=m.concept and d.value_kind='INTERPRETATION'
  where f.spot_id=p_spot_id and f.field_key='atmosphere.descriptors' and f.status='ACTIVE' and f.evidence_scope='SPOT' and m.concept is not null
  on conflict(spot_id,source_family,source_reference,dimension_key,context_signature) do update set value=excluded.value,signal_confidence=excluded.signal_confidence,observed_at=excluded.observed_at,valid_from=excluded.valid_from,provenance=excluded.provenance,status='ACTIVE',valid_until=null,data_origin='REAL';

  select m.place_type into v_place_type from public.spots s join public.categories c on c.id=s.category_id join public.backyrd_category_place_type_v1 m on m.category_name=c.name where s.id=p_spot_id;
  if v_place_type is null then raise exception 'canonical_place_type_unknown' using errcode='22023'; end if;
  with active as (
    select * from public.backyrd_spot_intelligence_evidence_v1 where spot_id=p_spot_id and status='ACTIVE' and data_origin not in ('FIXTURE','TEST') and valid_from<=now() and (valid_until is null or valid_until>now())
  ),facts as (select coalesce(jsonb_object_agg(dimension_key,value order by dimension_key),'{}') value from active where value_kind='FACT'),
  suitability as (select coalesce(jsonb_object_agg(dimension_key,value order by dimension_key),'{}') value from public.backyrd_spot_suitability_facts_v1 where spot_id=p_spot_id),
  concepts as (select coalesce(jsonb_object_agg(dimension_key,jsonb_build_object('presence',(value#>>'{}')::numeric,'confidence',signal_confidence,'evidenceId',id,'sourceReference',source_reference) order by dimension_key),'{}') value from active where value_kind='INTERPRETATION'),
  stats as (select coalesce(avg(signal_confidence),0) conf,count(distinct dimension_key) cnt,max(observed_at) watermark from active)
  select jsonb_build_object('placeType',v_place_type,'facts',(select value from facts)||jsonb_build_object('suitability',(select value from suitability),'place_type',v_place_type),'concepts',(select value from concepts),'provenanceMode','EVIDENCE_BOUND'),least(1,(select stats.conf from stats)),least(1,(select stats.cnt::numeric/10 from stats)),(select stats.watermark from stats)
  into v_intelligence,v_conf,v_complete,v_watermark;
  v_hash:=encode(extensions.digest(convert_to(v_intelligence::text,'UTF8'),'sha256'),'hex');
  update public.backyrd_spot_intelligence_snapshots_v1 set intelligence=v_intelligence,confidence=v_conf,completeness=v_complete,evidence_watermark=v_watermark,fingerprint=v_hash,calculated_at=now() where spot_id=p_spot_id and context_key='global';
  return v_result||jsonb_build_object('snapshotHash',v_hash,'placeType',v_place_type,'confidence',v_conf,'completeness',v_complete);
end $$;

-- Human-readable review data and provenance-aware daypart warning.
create or replace function public.backyrd_gold_review_issues_internal_v1(p_spot_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_catalog as $$
  with raw as (
    select 'NON_CANONICAL_PLACE_TYPE' code,f.id fact_id,f.field_key,'Ortsart muss geprüft werden' label,
      'Der ältere Wert ist keine gültige Backyrd-Ortsart. Die Kategorie liefert bereits die aktuelle kanonische Wahrheit.' detail,'BLOCKING' severity,false can_confirm,false can_unknown,
      (select to_jsonb(m.place_type) from public.spots sp join public.categories c on c.id=sp.category_id join public.backyrd_category_place_type_v1 m on m.category_name=c.name where sp.id=f.spot_id) canonical_value
    from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.field_key='place_type' and f.status='ACTIVE'
      and not exists(select 1 from public.backyrd_category_place_type_v1 m where m.place_type=f.value#>>'{}')
    union all
    select 'UNSCOPED_RESEARCH:'||f.id,f.id,f.field_key,'Ältere Information sollte geprüft werden',
      'Diese Research-Angabe stammt aus einem älteren Vertrag. Bestätige nur, wenn sie allgemein für den Ort gilt.','BLOCKING',f.field_key not in ('place_type','opening.status'),
      f.field_key not in ('place_type','opening.status') and c.allowed_values @> '["UNKNOWN"]'::jsonb,null::jsonb
    from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_fact_proposals_v1 p on p.id=f.proposal_id join public.backyrd_spot_fact_catalog_v1 c on c.field_key=f.field_key
    where f.spot_id=p_spot_id and f.status='ACTIVE' and p.proposed_by_type='RESEARCH_AGENT' and coalesce(f.evidence_scope,p.evidence_scope,p.research_evidence_scope) is null
    union all
    select 'NON_SPOT_ACCEPTED:'||f.id,f.id,f.field_key,'Gilt nicht allgemein für den Ort',
      'Diese Information gilt nur für ein Event, Programm oder vorübergehend und darf keine allgemeine Spot-Wahrheit sein.','BLOCKING',false,false,null::jsonb
    from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.status='ACTIVE' and f.evidence_scope in ('EVENT','PROGRAM','TEMPORARY')
    union all
    select 'OPENING_STATUS_REVIEW:'||f.id,f.id,f.field_key,'Öffnungsstatus prüfen',
      'Regelmäßige Öffnungszeiten sind kein Beleg dafür, dass der Ort gerade jetzt offen ist.','REVIEW',false,true,to_jsonb('Aus Öffnungszeiten separat berechnen'::text)
    from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.field_key='opening.status' and f.status='ACTIVE' and f.value='"OPEN"'::jsonb
    union all
    select 'DAYPART_REVIEW:'||f.id,f.id,f.field_key,'Zeitliche Eignung prüfen',
      'Die Herkunft belegt nicht, dass dies eine qualitative Eignung statt nur eine Öffnungszeit ist.','REVIEW',true,true,null::jsonb
    from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.field_key='time.dayparts' and f.status='ACTIVE' and f.interpretation_basis is distinct from 'HUMAN_QUALITATIVE'
  )
  select coalesce(jsonb_agg(jsonb_build_object('code',r.code,'factId',r.fact_id,'fieldKey',r.field_key,'label',r.label,'detail',r.detail,'severity',r.severity,
    'currentValue',f.value,'sourceId',f.source_id,'canonicalValue',r.canonical_value,'canConfirm',r.can_confirm,'canMarkUnknown',r.can_unknown) order by r.severity,r.code),'[]'::jsonb)
  from raw r join public.backyrd_spot_accepted_facts_v1 f on f.id=r.fact_id
$$;

-- Founder/Admin can explicitly confirm scope, mark an allowed value unknown,
-- stale it, or stop using it. Every path remains audited and atomic.
create or replace function public.backyrd_gold_review_accepted_fact_v1(
  p_fact_id uuid,p_action text,p_resolution_note text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_fact public.backyrd_spot_accepted_facts_v1%rowtype;v_actor jsonb;v_rebuild jsonb;v_status text;v_submit jsonb;v_review jsonb;v_key text;
begin
  select * into v_fact from public.backyrd_spot_accepted_facts_v1 where id=p_fact_id for update;
  if not found then raise exception 'accepted_fact_not_found' using errcode='22023'; end if;
  v_actor:=public.backyrd_gold_actor_v1(v_fact.spot_id);
  if v_actor->>'role' not in ('FOUNDER','ADMIN') then raise exception 'admin_or_founder_required' using errcode='42501'; end if;
  if p_action not in ('CONFIRM_SPOT','MARK_UNKNOWN','RETRACT','MARK_STALE') then raise exception 'accepted_fact_review_action_invalid' using errcode='22023'; end if;
  if v_fact.status not in ('ACTIVE','UNKNOWN','STALE') then raise exception 'accepted_fact_not_reviewable' using errcode='22023'; end if;
  if p_action='CONFIRM_SPOT' then
    if v_fact.field_key in ('place_type','opening.status') then raise exception 'restricted_fact_cannot_be_confirmed_directly' using errcode='22023'; end if;
    update public.backyrd_spot_accepted_facts_v1 set evidence_scope='SPOT',last_checked_at=now() where id=p_fact_id;
    update public.backyrd_spot_fact_proposals_v1 set evidence_scope='SPOT' where id=v_fact.proposal_id;
    update public.backyrd_spot_sources_v1 set last_checked_at=now() where id=v_fact.source_id;
    v_rebuild:=public.backyrd_gold_rebuild_spot_v1(v_fact.spot_id);v_status:='ACTIVE';
  elsif p_action='MARK_UNKNOWN' then
    if v_fact.field_key in ('place_type','opening.status') or not public.backyrd_gold_validate_fact_value_v1(v_fact.field_key,'"UNKNOWN"'::jsonb) then raise exception 'fact_cannot_be_marked_unknown' using errcode='22023'; end if;
    v_key:='human-correction-unknown:'||p_fact_id;
    v_submit:=public.backyrd_gold_submit_human_proposal_v1(v_fact.spot_id,v_fact.field_key,'"UNKNOWN"'::jsonb,'ADMIN_VERIFIED',null,'human-correction:'||p_fact_id,'SPOT',v_key);
    v_review:=public.backyrd_gold_review_proposal_v1((v_submit->>'proposalId')::uuid,'MARK_UNKNOWN',coalesce(p_resolution_note,'Founder/Admin marked unknown'));
    v_rebuild:=v_review->'rebuild';v_status:='UNKNOWN';
  else
    v_status:=case when p_action='RETRACT' then 'SUPERSEDED' else 'STALE' end;
    update public.backyrd_spot_accepted_facts_v1 set status=v_status,last_checked_at=now() where id=p_fact_id;
    v_rebuild:=public.backyrd_gold_rebuild_spot_v1(v_fact.spot_id);
  end if;
  insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
  values(v_fact.spot_id,(v_actor->>'actorId')::uuid,p_action,'ACCEPTED_FACT',p_fact_id,jsonb_build_object('fieldKey',v_fact.field_key,'previousStatus',v_fact.status,'status',v_status,'note',p_resolution_note,'ui','human-spot-editor-v1.1'));
  return jsonb_build_object('factId',p_fact_id,'status',v_status,'rebuild',v_rebuild,'readiness',public.backyrd_gold_readiness_v1(v_fact.spot_id));
end $$;

-- Existing canonical fact keys now reach the bounded Decision package. No new
-- N4 dimensions, matching weights or reason codes are introduced.
create or replace function public.backyrd_read_n4_for_decision_v2(p_spot_ids uuid[])
returns table(spot_id uuid,available boolean,concepts jsonb,place_type text,snapshot_identity text,freshness timestamptz,suitability_facts jsonb)
language sql stable security definer set search_path=public,pg_catalog as $$
 with canonical as(select * from public.backyrd_read_n4_for_user_intelligence_v1(p_spot_ids)), facts as(
  select f.spot_id,jsonb_object_agg(f.field_key,jsonb_build_object('value',f.value,'status',f.status,'confidence',f.confidence_policy_result,'sourceIdentity','accepted-fact:'||f.id,'observedAt',coalesce(f.observed_at,f.accepted_at),'contractVersion',coalesce(f.semantic_contract_version,f.contract_version)) order by f.field_key) value
  from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_sources_v1 s on s.id=f.source_id join public.spots sp on sp.id=f.spot_id
  where f.spot_id=any(coalesce(p_spot_ids,'{}'::uuid[])) and f.status in ('ACTIVE','UNKNOWN')
    and (f.evidence_scope='SPOT' or (f.evidence_scope is null and s.source_type<>'RESEARCH'))
    and f.field_key in ('suitability.family_kids','suitability.age','suitability.environment','suitability.rain','activity.types','suitability.conversation','social.suitability','accessibility.capabilities','price.level','time.dayparts','character.noise','reservation.character','reservation.recommended','duration.character','duration.approximate')
    and s.source_type<>'LEGACY' and sp.data_origin not in ('FIXTURE','TEST')
  group by f.spot_id
 ) select c.spot_id,c.available or coalesce(f.value,'{}'::jsonb)<>'{}'::jsonb,c.concepts,c.place_type,c.snapshot_identity,c.freshness,coalesce(f.value,'{}'::jsonb) from canonical c left join facts f on f.spot_id=c.spot_id
$$;

revoke all on function public.backyrd_gold_save_human_fact_v1(uuid,text,jsonb,text,text,text,text,text) from public,anon;
grant execute on function public.backyrd_gold_save_human_fact_v1(uuid,text,jsonb,text,text,text,text,text) to authenticated,service_role;
revoke all on function public.backyrd_gold_submit_human_proposal_v1(uuid,text,jsonb,text,text,text,text,text),public.backyrd_gold_review_accepted_fact_v1(uuid,text,text),public.backyrd_gold_rebuild_spot_v1(uuid) from public,anon;
grant execute on function public.backyrd_gold_submit_human_proposal_v1(uuid,text,jsonb,text,text,text,text,text),public.backyrd_gold_review_accepted_fact_v1(uuid,text,text),public.backyrd_gold_rebuild_spot_v1(uuid) to authenticated,service_role;

comment on function public.backyrd_gold_save_human_fact_v1(uuid,text,jsonb,text,text,text,text,text) is 'Atomic Founder/Admin SPOT authoring. Restricted scope/source/conflict remains proposal-only; Owners are denied.';
comment on function public.backyrd_read_n4_for_decision_v2(uuid[]) is 'Minimal canonical N4 plus provenance-bound SPOT facts, including existing noise/planning/duration contracts. No ranking semantics.';
