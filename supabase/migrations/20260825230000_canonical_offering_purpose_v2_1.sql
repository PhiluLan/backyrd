-- Canonical Offering + Purpose V2.1
-- Additive factual axes beside frozen N4. No historical display fact is
-- reinterpreted and no Offering value is a User Taste concept.

do $$ begin
  if (select count(*) from public.backyrd_taste_concepts_v1) <> 45 then raise exception 'frozen_taste_registry_must_remain_45'; end if;
  if (select count(*) from public.backyrd_spot_intelligence_dimensions_v1) <> 60 then raise exception 'frozen_n4_registry_must_remain_60'; end if;
end $$;

insert into public.backyrd_spot_fact_catalog_v1(field_key,section,capability,value_kind,allowed_values,engine_role,owner_editable,contract_version) values
 ('offering.availability','ACTIVITY_DETAILS','BASIC','STRUCTURED_OBJECT','["DRINKS","BEER","CRAFT_BEER","OWN_BREWED_BEER","WINE","COCKTAILS","COFFEE","NON_ALCOHOLIC","FOOD","SNACKS","SMALL_PLATES","FULL_MEALS","BREAKFAST","BRUNCH","LUNCH","DINNER"]','SUITABILITY_FACT',true,'backyrd-canonical-offering-v1'),
 ('purpose.occasions','ACTIVITY_DETAILS','DEEP','STRUCTURED_OBJECT','["DRINK","EAT","QUICK_BITE","AFTERWORK","APERO","LONG_EVENING"]','SUITABILITY_FACT',true,'backyrd-canonical-offering-v1')
on conflict(field_key) do nothing;

alter table public.backyrd_human_spot_questions_v2 drop constraint if exists backyrd_human_spot_questions_v2_control_type_check;
alter table public.backyrd_human_spot_questions_v2 add constraint backyrd_human_spot_questions_v2_control_type_check
  check(control_type in ('SINGLE_CHOICE','MULTI_CHOICE','TRI_STATE_MAP','AVAILABILITY_MAP','PURPOSE_MAP','AGE_RANGE','DURATION_RANGE','ACCESSIBILITY_MAP'));

update public.backyrd_human_spot_questions_v2 set
  label_de='Wofür kommen Gäste hauptsächlich hierher?',
  help_de='Beschreibt typische Besuchszwecke dieses Orts. Es wird keine persönliche Vorliebe daraus abgeleitet.',
  control_type='PURPOSE_MAP',canonical_field_key='purpose.occasions',
  options='[{"id":"drink","label":"Etwas trinken","value":"DRINK"},{"id":"eat","label":"Etwas essen","value":"EAT"},{"id":"quick_bite","label":"Noch schnell etwas essen","value":"QUICK_BITE"},{"id":"apero","label":"Apéro","value":"APERO"},{"id":"afterwork","label":"Afterwork","value":"AFTERWORK"},{"id":"long_evening","label":"Einen längeren Abend verbringen","value":"LONG_EVENING"}]',
  engine_use=array['DECISION_FACTUAL_MATCHER','RETRIEVAL','REASON_AUTHORIZATION'],contract_version='backyrd-human-spot-intelligence-v2.1'
where question_id='purpose.gastronomy';

insert into public.backyrd_human_spot_questions_v2
(question_id,section_id,label_de,help_de,control_type,canonical_field_key,mapping_class,archetypes,common,priority,sort_order,options,relevance,engine_use,owner_access,contract_version)
values('offering.gastronomy','PURPOSE','Was gibt es hier zu trinken und zu essen?','Jedes Angebot bewusst bestätigen. Nicht ausgewählt bedeutet nicht automatisch „nicht verfügbar“.','AVAILABILITY_MAP','offering.availability','CANONICAL_WRITE',
 array['BREWPUB','BAR','COCKTAIL_BAR','WINE_BAR','RESTAURANT','CAFE','BAKERY','NIGHTLIFE','MULTI_PURPOSE'],false,'ESSENTIAL',12,
 '[{"id":"drinks","label":"Getränke allgemein","value":"DRINKS"},{"id":"beer","label":"Bier","value":"BEER"},{"id":"craft_beer","label":"Craft Beer","value":"CRAFT_BEER","archetypes":["BREWPUB","BAR"]},{"id":"own_brewed_beer","label":"Vor Ort gebrautes Bier","value":"OWN_BREWED_BEER","archetypes":["BREWPUB"]},{"id":"wine","label":"Wein","value":"WINE","archetypes":["WINE_BAR","BAR","RESTAURANT"]},{"id":"cocktails","label":"Cocktails","value":"COCKTAILS","archetypes":["COCKTAIL_BAR","BAR","NIGHTLIFE"]},{"id":"coffee","label":"Kaffee","value":"COFFEE","archetypes":["CAFE","BAKERY","RESTAURANT"]},{"id":"non_alcoholic","label":"Alkoholfreie Getränke","value":"NON_ALCOHOLIC"},{"id":"food","label":"Essen allgemein","value":"FOOD"},{"id":"snacks","label":"Snacks","value":"SNACKS"},{"id":"small_plates","label":"Kleine Gerichte","value":"SMALL_PLATES"},{"id":"full_meals","label":"Vollständige Mahlzeiten","value":"FULL_MEALS","archetypes":["BREWPUB","RESTAURANT","CAFE"]},{"id":"breakfast","label":"Frühstück","value":"BREAKFAST","archetypes":["CAFE","BAKERY","RESTAURANT"]},{"id":"brunch","label":"Brunch","value":"BRUNCH","archetypes":["CAFE","RESTAURANT"]},{"id":"lunch","label":"Mittagessen","value":"LUNCH","archetypes":["RESTAURANT","BREWPUB","CAFE"]},{"id":"dinner","label":"Abendessen","value":"DINNER","archetypes":["RESTAURANT","BREWPUB"]}]',
 '{}',array['DECISION_FACTUAL_MATCHER','RETRIEVAL','REASON_AUTHORIZATION'],'OWNER_BASIC','backyrd-human-spot-intelligence-v2.1')
on conflict(question_id) do update set canonical_field_key=excluded.canonical_field_key,control_type=excluded.control_type,options=excluded.options,engine_use=excluded.engine_use,contract_version=excluded.contract_version;

alter function public.backyrd_gold_validate_fact_value_v1(text,jsonb) rename to backyrd_gold_validate_fact_value_v2_1_base;
create or replace function public.backyrd_gold_validate_fact_value_v1(p_field_key text,p_value jsonb)
returns boolean language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_key text;v_entry text;
begin
  if not public.backyrd_gold_validate_fact_value_v2_1_base(p_field_key,p_value) then return false; end if;
  if p_field_key in ('offering.availability','purpose.occasions') then
    if jsonb_typeof(p_value)<>'object' then return false; end if;
    for v_key,v_entry in select key,value from jsonb_each_text(p_value) loop
      if p_field_key='offering.availability' then
        if v_key not in ('DRINKS','BEER','CRAFT_BEER','OWN_BREWED_BEER','WINE','COCKTAILS','COFFEE','NON_ALCOHOLIC','FOOD','SNACKS','SMALL_PLATES','FULL_MEALS','BREAKFAST','BRUNCH','LUNCH','DINNER') or v_entry not in ('AVAILABLE','NOT_AVAILABLE','UNKNOWN') then return false; end if;
      elsif v_key not in ('DRINK','EAT','QUICK_BITE','AFTERWORK','APERO','LONG_EVENING') or v_entry not in ('SUITABLE','NOT_SUITABLE','UNKNOWN') then return false; end if;
    end loop;
    if p_field_key='offering.availability' and (
      (p_value->>'DRINKS'='NOT_AVAILABLE' and exists(select 1 from jsonb_each_text(p_value) e where e.key in ('BEER','CRAFT_BEER','OWN_BREWED_BEER','WINE','COCKTAILS','COFFEE','NON_ALCOHOLIC') and e.value='AVAILABLE')) or
      (p_value->>'BEER'='NOT_AVAILABLE' and exists(select 1 from jsonb_each_text(p_value) e where e.key in ('CRAFT_BEER','OWN_BREWED_BEER') and e.value='AVAILABLE')) or
      (p_value->>'FOOD'='NOT_AVAILABLE' and exists(select 1 from jsonb_each_text(p_value) e where e.key in ('SNACKS','SMALL_PLATES','FULL_MEALS','BREAKFAST','BRUNCH','LUNCH','DINNER') and e.value='AVAILABLE'))
    ) then return false; end if;
  end if;
  return true;
end $$;

create or replace function public.backyrd_human_spot_validate_answer_v2(p_spot_id uuid,p_question_id text,p_value jsonb)
returns boolean language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_question public.backyrd_human_spot_questions_v2%rowtype;v_primary text;v_secondary text[];v_item jsonb;v_key text;v_entry text;
begin
  select * into v_question from public.backyrd_human_spot_questions_v2 where question_id=p_question_id and active;
  if not found or v_question.mapping_class<>'CANONICAL_WRITE' then return false; end if;
  v_primary:=public.backyrd_human_spot_derived_archetype_v2(p_spot_id);
  select coalesce(secondary_archetypes,'{}'::text[]) into v_secondary from public.backyrd_spot_authoring_profiles_v2 where spot_id=p_spot_id;v_secondary:=coalesce(v_secondary,'{}'::text[]);
  if not (v_question.common or v_primary=any(v_question.archetypes) or v_question.archetypes&&v_secondary) then return false; end if;
  if not public.backyrd_gold_validate_fact_value_v1(v_question.canonical_field_key,p_value) then return false; end if;
  if v_question.control_type in ('SINGLE_CHOICE','DURATION_RANGE') then return exists(select 1 from jsonb_array_elements(v_question.options) o where o->'value'=p_value);
  elsif v_question.control_type='MULTI_CHOICE' then
    if jsonb_typeof(p_value)<>'array' then return false; end if;
    for v_item in select value from jsonb_array_elements(p_value) loop if not exists(select 1 from jsonb_array_elements(v_question.options) o where o->'value'=v_item and (not o?'archetypes' or exists(select 1 from jsonb_array_elements_text(o->'archetypes') a(value) where value=v_primary or value=any(v_secondary)))) then return false; end if;end loop;return true;
  elsif v_question.control_type in ('TRI_STATE_MAP','ACCESSIBILITY_MAP','AVAILABILITY_MAP','PURPOSE_MAP') then
    if jsonb_typeof(p_value)<>'object' then return false; end if;
    for v_key,v_entry in select key,value from jsonb_each_text(p_value) loop
      if (v_question.control_type='AVAILABILITY_MAP' and v_entry not in ('AVAILABLE','NOT_AVAILABLE','UNKNOWN')) or (v_question.control_type<>'AVAILABILITY_MAP' and v_entry not in ('SUITABLE','NOT_SUITABLE','UNKNOWN')) or not exists(select 1 from jsonb_array_elements(v_question.options) o where o->>'value'=v_key) then return false; end if;
    end loop;return true;
  elsif v_question.control_type='AGE_RANGE' then return true;end if;return false;
end $$;

create or replace function public.backyrd_read_offering_for_decision_v1(p_spot_ids uuid[])
returns table(spot_id uuid,offerings jsonb,purposes jsonb,source_identity text,observed_at timestamptz,confidence numeric)
language sql stable security definer set search_path=public,pg_catalog as $$
 with facts as(
  select f.*,row_number() over(partition by f.spot_id,f.field_key order by f.accepted_at desc,f.id desc) rn
  from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_sources_v1 s on s.id=f.source_id join public.spots sp on sp.id=f.spot_id
  where f.spot_id=any(coalesce(p_spot_ids,'{}')) and f.field_key in ('offering.availability','purpose.occasions') and f.status in ('ACTIVE','UNKNOWN') and f.evidence_scope='SPOT' and s.source_type<>'LEGACY' and sp.data_origin not in ('FIXTURE','TEST')
 ), grouped as(
  select spot_id,coalesce((jsonb_agg(value order by accepted_at desc) filter(where field_key='offering.availability'))->0,'{}'::jsonb) offerings,coalesce((jsonb_agg(value order by accepted_at desc) filter(where field_key='purpose.occasions'))->0,'{}'::jsonb) purposes,
   'accepted-facts:'||string_agg(id::text,',' order by field_key) source_identity,max(coalesce(observed_at,accepted_at)) observed_at,min(confidence_policy_result) confidence
  from facts where rn=1 group by spot_id
 ) select * from grouped
$$;

create or replace function public.backyrd_retrieve_spots_by_offering_v1(p_city text,p_offerings text[],p_purposes text[],p_limit integer default 40,p_exclude_spot_ids uuid[] default '{}')
returns table(spot_id uuid,name text,city text,category_name text,similarity numeric,document_text text,offering_matches text[],purpose_matches text[])
language sql stable security definer set search_path=public,pg_catalog as $$
 with latest as(
  select f.*,row_number() over(partition by f.spot_id,f.field_key order by f.accepted_at desc,f.id desc) rn
  from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_sources_v1 src on src.id=f.source_id
  where f.status='ACTIVE' and f.evidence_scope='SPOT' and f.field_key in ('offering.availability','purpose.occasions') and src.source_type<>'LEGACY'
 ),facts as(
  select spot_id,coalesce((jsonb_agg(value) filter(where field_key='offering.availability'))->0,'{}'::jsonb) offerings,coalesce((jsonb_agg(value) filter(where field_key='purpose.occasions'))->0,'{}'::jsonb) purposes
  from latest where rn=1 group by spot_id
 ), matched as(
  select f.*,
   array(select requested from unnest(coalesce(p_offerings,'{}')) requested where f.offerings->>requested='AVAILABLE' or (requested='DRINKS' and exists(select 1 from jsonb_each_text(coalesce(f.offerings,'{}')) e where e.value='AVAILABLE' and e.key in ('BEER','CRAFT_BEER','OWN_BREWED_BEER','WINE','COCKTAILS','COFFEE','NON_ALCOHOLIC'))) or (requested='BEER' and (f.offerings->>'CRAFT_BEER'='AVAILABLE' or f.offerings->>'OWN_BREWED_BEER'='AVAILABLE')) or (requested='FOOD' and exists(select 1 from jsonb_each_text(coalesce(f.offerings,'{}')) e where e.value='AVAILABLE' and e.key in ('SNACKS','SMALL_PLATES','FULL_MEALS','BREAKFAST','BRUNCH','LUNCH','DINNER')))) offering_matches,
   array(select requested from unnest(coalesce(p_purposes,'{}')) requested where f.purposes->>requested='SUITABLE') purpose_matches
  from facts f
 )
 select s.id,s.name,s.city,c.name,0.000001::numeric,'Canonical Offering match',m.offering_matches,m.purpose_matches
 from matched m join public.spots s on s.id=m.spot_id left join public.categories c on c.id=s.category_id
 where s.status='approved' and s.data_origin not in ('FIXTURE','TEST') and (p_city is null or lower(s.city)=lower(p_city)) and not(s.id=any(coalesce(p_exclude_spot_ids,'{}'))) and (cardinality(m.offering_matches)>0 or cardinality(m.purpose_matches)>0)
 order by cardinality(m.offering_matches)+cardinality(m.purpose_matches) desc,s.id limit greatest(1,least(coalesce(p_limit,40),100))
$$;

revoke all on function public.backyrd_read_offering_for_decision_v1(uuid[]),public.backyrd_retrieve_spots_by_offering_v1(text,text[],text[],integer,uuid[]) from public,anon,authenticated;
grant execute on function public.backyrd_read_offering_for_decision_v1(uuid[]),public.backyrd_retrieve_spots_by_offering_v1(text,text[],text[],integer,uuid[]) to service_role;

comment on function public.backyrd_read_offering_for_decision_v1(uuid[]) is 'Bounded Offering/Purpose facts beside N4. No place-type inference, display-fact reinterpretation or User Taste authority.';
comment on function public.backyrd_retrieve_spots_by_offering_v1(text,text[],text[],integer,uuid[]) is 'Candidate recall only. It adds no score; deterministic factual matching remains ranking authority.';

alter function public.backyrd_human_spot_summary_v2(uuid) rename to backyrd_human_spot_summary_v2_1_base;
create or replace function public.backyrd_human_spot_summary_v2(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_base jsonb;v_offering text;v_purpose text;v_lineage jsonb;
begin
  v_base:=public.backyrd_human_spot_summary_v2_1_base(p_spot_id);
  select string_agg(case e.key when 'DRINKS' then 'Getränke' when 'BEER' then 'Bier' when 'CRAFT_BEER' then 'Craft Beer' when 'OWN_BREWED_BEER' then 'vor Ort gebrautes Bier' when 'WINE' then 'Wein' when 'COCKTAILS' then 'Cocktails' when 'COFFEE' then 'Kaffee' when 'NON_ALCOHOLIC' then 'alkoholfreie Getränke' when 'FOOD' then 'Essen' when 'SNACKS' then 'Snacks' when 'SMALL_PLATES' then 'kleine Gerichte' when 'FULL_MEALS' then 'vollständige Mahlzeiten' when 'BREAKFAST' then 'Frühstück' when 'BRUNCH' then 'Brunch' when 'LUNCH' then 'Mittagessen' when 'DINNER' then 'Abendessen' end,', ' order by e.key)
  into v_offering from public.backyrd_spot_accepted_facts_v1 f cross join lateral jsonb_each_text(f.value) e where f.spot_id=p_spot_id and f.field_key='offering.availability' and f.status='ACTIVE' and f.evidence_scope='SPOT' and e.value='AVAILABLE';
  select string_agg(case e.key when 'DRINK' then 'etwas trinken' when 'EAT' then 'etwas essen' when 'QUICK_BITE' then 'einen schnellen Happen' when 'AFTERWORK' then 'Afterwork' when 'APERO' then 'Apéro' when 'LONG_EVENING' then 'einen längeren Abend' end,', ' order by e.key)
  into v_purpose from public.backyrd_spot_accepted_facts_v1 f cross join lateral jsonb_each_text(f.value) e where f.spot_id=p_spot_id and f.field_key='purpose.occasions' and f.status='ACTIVE' and f.evidence_scope='SPOT' and e.value='SUITABLE';
  select coalesce(jsonb_agg(jsonb_build_object('clause',case field_key when 'offering.availability' then 'OFFERING' else 'PURPOSE' end,'acceptedFactId',id,'fieldKey',field_key,'sourceId',source_id) order by field_key),'[]') into v_lineage from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot_id and field_key in ('offering.availability','purpose.occasions') and status='ACTIVE' and evidence_scope='SPOT';
  if nullif(v_offering,'') is not null then v_base:=jsonb_set(v_base,'{text}',to_jsonb((v_base->>'text')||' Bestätigtes Angebot: '||v_offering||'.')); end if;
  if nullif(v_purpose,'') is not null then v_base:=jsonb_set(v_base,'{text}',to_jsonb((v_base->>'text')||' Typische Besuchsgründe: '||v_purpose||'.')); end if;
  return jsonb_set(jsonb_set(v_base,'{lineage}',coalesce(v_base->'lineage','[]')||v_lineage),'{contractVersion}',to_jsonb('backyrd-human-spot-intelligence-v2.1'::text));
end $$;

revoke all on function public.backyrd_human_spot_summary_v2(uuid) from public,anon;
grant execute on function public.backyrd_human_spot_summary_v2(uuid) to service_role;

-- Immutable Decision-time Offering audit. This is a bounded snapshot, not a
-- second Spot truth store and not a User-Evidence/Taste input.
create table public.backyrd_decision_candidate_offerings_v1(
 decision_id uuid not null references public.decision_sessions(id) on delete cascade,
 spot_id uuid not null references public.spots(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 package_hash text not null check(package_hash~'^[0-9a-f]{64}$'),
 snapshot_hash text not null check(snapshot_hash~'^[0-9a-f]{64}$'),
 availability text not null check(availability in ('KNOWN','UNKNOWN')),
 offerings jsonb not null default '{}' check(jsonb_typeof(offerings)='object'),
 purposes jsonb not null default '{}' check(jsonb_typeof(purposes)='object'),
 source_identity text,observed_at timestamptz,confidence numeric check(confidence is null or confidence between 0 and 1),
 contract_version text not null default 'backyrd-canonical-offering-v1',created_at timestamptz not null default now(),
 primary key(decision_id,spot_id),unique(decision_id,spot_id,snapshot_hash)
);
alter table public.backyrd_decision_candidate_offerings_v1 enable row level security;
revoke all on public.backyrd_decision_candidate_offerings_v1 from public,anon,authenticated;
grant all on public.backyrd_decision_candidate_offerings_v1 to service_role;

create or replace function public.backyrd_persist_decision_offering_snapshot_v1(p_decision_id uuid,p_user_id uuid,p_package_hash text,p_candidates jsonb)
returns integer language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_candidate jsonb;v_count integer:=0;v_existing text;
begin
 if auth.role()<>'service_role' then raise exception 'decision_offering_snapshot_service_only' using errcode='42501';end if;
 if jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>50 or not exists(select 1 from public.backyrd_decision_input_traces_v1 where decision_id=p_decision_id and user_id=p_user_id and package_hash=p_package_hash) then raise exception 'decision_offering_snapshot_trace_invalid' using errcode='42501';end if;
 for v_candidate in select value from jsonb_array_elements(p_candidates) loop
  if coalesce(v_candidate->>'snapshotHash','')!~'^[0-9a-f]{64}$' or v_candidate->>'spotId' is null or not exists(select 1 from public.decision_impressions where decision_id=p_decision_id and spot_id=(v_candidate->>'spotId')::uuid) or not public.backyrd_gold_validate_fact_value_v1('offering.availability',coalesce(v_candidate->'offerings','{}')) or not public.backyrd_gold_validate_fact_value_v1('purpose.occasions',coalesce(v_candidate->'purposes','{}')) or coalesce((v_candidate->'boundaries'->>'userTaste')::boolean,true) then raise exception 'decision_offering_snapshot_invalid' using errcode='22023';end if;
  select snapshot_hash into v_existing from public.backyrd_decision_candidate_offerings_v1 where decision_id=p_decision_id and spot_id=(v_candidate->>'spotId')::uuid;
  if v_existing is not null and v_existing<>v_candidate->>'snapshotHash' then raise exception 'decision_offering_snapshot_already_frozen' using errcode='23505';end if;
  insert into public.backyrd_decision_candidate_offerings_v1(decision_id,spot_id,user_id,package_hash,snapshot_hash,availability,offerings,purposes,source_identity,observed_at,confidence,contract_version)
  values(p_decision_id,(v_candidate->>'spotId')::uuid,p_user_id,p_package_hash,v_candidate->>'snapshotHash',v_candidate->>'availability',coalesce(v_candidate->'offerings','{}'),coalesce(v_candidate->'purposes','{}'),nullif(v_candidate->>'sourceIdentity',''),nullif(v_candidate->>'observedAt','')::timestamptz,nullif(v_candidate->>'confidence','')::numeric,coalesce(nullif(v_candidate->>'contractVersion',''),'backyrd-canonical-offering-v1')) on conflict(decision_id,spot_id) do nothing;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;
revoke all on function public.backyrd_persist_decision_offering_snapshot_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_persist_decision_offering_snapshot_v1(uuid,uuid,text,jsonb) to service_role;

-- Feed confirmed positive Offering/Purpose truth into the existing semantic
-- retrieval document. Explicit negatives stay in factual matching and are not
-- embedded as positive search terms.
alter function public.backyrd_build_spot_ml_document_v13(uuid) rename to backyrd_build_spot_ml_document_v2_1_base;
create or replace function public.backyrd_build_spot_ml_document_v13(p_spot_id uuid)
returns table(spot_id uuid,document_text text,document_json jsonb,source_hash text)
language sql stable security definer set search_path=public,pg_catalog as $$
 with base as(select * from public.backyrd_build_spot_ml_document_v2_1_base(p_spot_id)), facts as(
  select coalesce((jsonb_agg(value order by accepted_at desc) filter(where field_key='offering.availability'))->0,'{}'::jsonb) offerings,
         coalesce((jsonb_agg(value order by accepted_at desc) filter(where field_key='purpose.occasions'))->0,'{}'::jsonb) purposes
  from (select f.*,row_number() over(partition by f.field_key order by f.accepted_at desc,f.id desc) rn from public.backyrd_spot_accepted_facts_v1 f join public.backyrd_spot_sources_v1 s on s.id=f.source_id where f.spot_id=p_spot_id and f.field_key in ('offering.availability','purpose.occasions') and f.status='ACTIVE' and f.evidence_scope='SPOT' and s.source_type<>'LEGACY') x where rn=1
 ),labels as(
  select f.*,
   (select string_agg(case key when 'DRINKS' then 'Getränke' when 'BEER' then 'Bier' when 'CRAFT_BEER' then 'Craft Beer' when 'OWN_BREWED_BEER' then 'vor Ort gebrautes Bier' when 'WINE' then 'Wein' when 'COCKTAILS' then 'Cocktails' when 'COFFEE' then 'Kaffee' when 'NON_ALCOHOLIC' then 'alkoholfreie Getränke' when 'FOOD' then 'Essen' when 'SNACKS' then 'Snacks' when 'SMALL_PLATES' then 'kleine Gerichte' when 'FULL_MEALS' then 'vollständige Mahlzeiten' when 'BREAKFAST' then 'Frühstück' when 'BRUNCH' then 'Brunch' when 'LUNCH' then 'Mittagessen' when 'DINNER' then 'Abendessen' end,', ' order by key) from jsonb_each_text(f.offerings) where value='AVAILABLE') offering_text,
   (select string_agg(case key when 'DRINK' then 'etwas trinken' when 'EAT' then 'etwas essen' when 'QUICK_BITE' then 'schnell etwas essen' when 'AFTERWORK' then 'Afterwork' when 'APERO' then 'Apéro' when 'LONG_EVENING' then 'längerer Abend' end,', ' order by key) from jsonb_each_text(f.purposes) where value='SUITABLE') purpose_text
  from facts f
 ),assembled as(
  select b.spot_id,concat_ws(E'\n',b.document_text,case when nullif(l.offering_text,'') is not null then 'Kanonisches Angebot: '||l.offering_text end,case when nullif(l.purpose_text,'') is not null then 'Kanonische Besuchsgründe: '||l.purpose_text end) text_value,
   b.document_json||jsonb_build_object('canonical_offering',l.offerings,'canonical_purpose',l.purposes,'offering_contract','backyrd-canonical-offering-v1') json_value
  from base b cross join labels l
 ) select a.spot_id,a.text_value,a.json_value,md5(coalesce(a.text_value,'')||'|'||coalesce(a.json_value::text,'')) from assembled a
$$;

create or replace function public.backyrd_trigger_enqueue_embedding_from_offering_v2_1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce(new.field_key,old.field_key) in ('offering.availability','purpose.occasions') then perform public.backyrd_enqueue_spot_embedding_v13(coalesce(new.spot_id,old.spot_id),'canonical_offering_changed');end if;
 return coalesce(new,old);
end $$;
create trigger trg_backyrd_offering_enqueue_embedding_v2_1 after insert or update or delete on public.backyrd_spot_accepted_facts_v1 for each row execute function public.backyrd_trigger_enqueue_embedding_from_offering_v2_1();

revoke all on function public.backyrd_build_spot_ml_document_v13(uuid),public.backyrd_trigger_enqueue_embedding_from_offering_v2_1() from public,anon,authenticated;
grant execute on function public.backyrd_build_spot_ml_document_v13(uuid),public.backyrd_trigger_enqueue_embedding_from_offering_v2_1() to service_role;
