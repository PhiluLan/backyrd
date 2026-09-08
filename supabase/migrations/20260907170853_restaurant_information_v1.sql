-- Restaurant Information V1
-- Extends the canonical Accepted Facts / evidence architecture. New fields are
-- display/read facts only and do not enter Decision, ranking, eligibility,
-- Taste, Mood Engine semantics or User Learning.

insert into public.backyrd_spot_fact_catalog_v1
  (field_key,section,capability,value_kind,allowed_values,engine_role,owner_editable,contract_version)
values
 ('location.neighborhood','LOCATION','BASIC','TEXT','[]','RAW_FACT',true,'backyrd-restaurant-information-v1'),
 ('contact.instagram','BASIC','BASIC','TEXT','[]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('contact.facebook','BASIC','BASIC','TEXT','[]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('contact.linkedin','BASIC','BASIC','TEXT','[]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('contact.tiktok','BASIC','BASIC','TEXT','[]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('profile.distinctive_fact','DESCRIPTION_MEDIA','BASIC','TEXT','[]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('opening.special_overrides','OPENING_HOURS','DEEP','STRUCTURED_OBJECT','[]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('restaurant.takeaway','ACTIVITY_DETAILS','BASIC','ENUM','["YES","NO","UNKNOWN"]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('restaurant.cuisines','ACTIVITY_DETAILS','BASIC','MULTI_SELECT','["SWISS","ITALIAN","FRENCH","JAPANESE","THAI","INDIAN","MEDITERRANEAN","LEVANTINE","MEXICAN","VEGAN","INTERNATIONAL","FUSION","UNKNOWN"]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('restaurant.payment_methods','ACTIVITY_DETAILS','BASIC','STRUCTURED_OBJECT','[]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('restaurant.capacity','ACTIVITY_DETAILS','DEEP','STRUCTURED_OBJECT','[]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('restaurant.areas','ACTIVITY_DETAILS','BASIC','STRUCTURED_OBJECT','[]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('restaurant.reservation_policy','ACTIVITY_DETAILS','BASIC','ENUM','["NOT_AVAILABLE","OPTIONAL","RECOMMENDED","REQUIRED","UNKNOWN"]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('restaurant.service_types','ACTIVITY_DETAILS','BASIC','MULTI_SELECT','["TABLE_SERVICE","SELF_SERVICE","TAKEAWAY_ONLY","MIXED","UNKNOWN"]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('restaurant.meal_formats','ACTIVITY_DETAILS','BASIC','MULTI_SELECT','["MENU","A_LA_CARTE","UNKNOWN"]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1'),
 ('restaurant.additional_visit_times','AUDIENCE_SOCIAL','DEEP','MULTI_SELECT','["MIDDAY","HOLIDAY","UNKNOWN"]','DISPLAY_ONLY',true,'backyrd-restaurant-information-v1')
on conflict(field_key) do nothing;

alter table public.backyrd_human_spot_questions_v2
  drop constraint backyrd_human_spot_questions_v2_control_type_check;
alter table public.backyrd_human_spot_questions_v2
  add constraint backyrd_human_spot_questions_v2_control_type_check
  check(control_type in ('SINGLE_CHOICE','MULTI_CHOICE','TRI_STATE_MAP','AVAILABILITY_MAP','PURPOSE_MAP','AGE_RANGE','DURATION_RANGE','ACCESSIBILITY_MAP','TEXT_INPUT','URL_INPUT','CAPACITY','SPECIAL_HOURS'));

insert into public.backyrd_human_spot_questions_v2
  (question_id,section_id,label_de,help_de,control_type,canonical_field_key,mapping_class,archetypes,common,priority,sort_order,options,relevance,engine_use,owner_access,contract_version)
values
 ('restaurant.neighborhood','IDENTITY','Quartier','Nur das tatsächlich bestätigte Quartier eintragen.','TEXT_INPUT','location.neighborhood','CANONICAL_WRITE',array['RESTAURANT'],false,'HIGH_VALUE',201,'[]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.instagram','IDENTITY','Instagram','Vollständige offizielle Profil-URL.','URL_INPUT','contact.instagram','CANONICAL_WRITE',array['RESTAURANT'],false,'OPTIONAL',202,'[]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.facebook','IDENTITY','Facebook','Vollständige offizielle Profil-URL.','URL_INPUT','contact.facebook','CANONICAL_WRITE',array['RESTAURANT'],false,'OPTIONAL',203,'[]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.linkedin','IDENTITY','LinkedIn','Vollständige offizielle Unternehmens-URL.','URL_INPUT','contact.linkedin','CANONICAL_WRITE',array['RESTAURANT'],false,'OPTIONAL',204,'[]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.tiktok','IDENTITY','TikTok','Vollständige offizielle Profil-URL.','URL_INPUT','contact.tiktok','CANONICAL_WRITE',array['RESTAURANT'],false,'OPTIONAL',205,'[]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.distinctive','IDENTITY','Was macht diesen Ort besonders?','Ein kurzer, überprüfbarer Fakt – kein Marketingtext.','TEXT_INPUT','profile.distinctive_fact','CANONICAL_WRITE',array['RESTAURANT'],false,'HIGH_VALUE',206,'[]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.special_hours','PRACTICAL','Sonderöffnungszeiten','Nur bestätigte Abweichungen für konkrete Daten. Diese Angaben ändern in V1 nicht automatisch den „Jetzt geöffnet“-Status.','SPECIAL_HOURS','opening.special_overrides','CANONICAL_WRITE',array['RESTAURANT'],false,'HIGH_VALUE',220,'[]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.takeaway','PRACTICAL','Take-away','Unbekannt ist nicht dasselbe wie nicht angeboten.','SINGLE_CHOICE','restaurant.takeaway','CANONICAL_WRITE',array['RESTAURANT'],false,'HIGH_VALUE',221,'[{"id":"yes","label":"Ja","value":"YES"},{"id":"no","label":"Nein","value":"NO"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.payment','PRACTICAL','Bezahlarten','Jede Methode separat bestätigen; keine Annahmen aus dem Standort ableiten.','AVAILABILITY_MAP','restaurant.payment_methods','CANONICAL_WRITE',array['RESTAURANT'],false,'HIGH_VALUE',222,'[{"id":"cash","label":"Bargeld","value":"CASH"},{"id":"debit","label":"Debitkarte","value":"DEBIT_CARD"},{"id":"credit","label":"Kreditkarte","value":"CREDIT_CARD"},{"id":"twint","label":"TWINT","value":"TWINT"},{"id":"other","label":"Andere","value":"OTHER"}]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.capacity','PRACTICAL','Kapazität','Nur bekannte Größen eintragen. Innen und außen dürfen leer bleiben.','CAPACITY','restaurant.capacity','CANONICAL_WRITE',array['RESTAURANT'],false,'OPTIONAL',223,'[]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.areas','PRACTICAL','Bereiche','Ausstattung getrennt von Atmosphäre und Wettereignung erfassen.','AVAILABILITY_MAP','restaurant.areas','CANONICAL_WRITE',array['RESTAURANT'],false,'HIGH_VALUE',224,'[{"id":"indoor","label":"Innenbereich","value":"INDOOR"},{"id":"outdoor","label":"Außenbereich","value":"OUTDOOR"},{"id":"terrace","label":"Terrasse","value":"TERRACE"},{"id":"garden","label":"Garten","value":"GARDEN"}]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.reservation','PRACTICAL','Reservierung','Ein eindeutiger Restaurant-Vertrag. Die bestehende Decision-Planungssemantik bleibt unverändert.','SINGLE_CHOICE','restaurant.reservation_policy','CANONICAL_WRITE',array['RESTAURANT'],false,'HIGH_VALUE',225,'[{"id":"not_available","label":"Nicht möglich","value":"NOT_AVAILABLE"},{"id":"optional","label":"Optional","value":"OPTIONAL"},{"id":"recommended","label":"Empfohlen","value":"RECOMMENDED"},{"id":"required","label":"Erforderlich","value":"REQUIRED"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.service','PRACTICAL','Service','Mehrere bestätigte Serviceformen sind möglich. „Unbekannt“ ausschließlich allein auswählen.','MULTI_CHOICE','restaurant.service_types','CANONICAL_WRITE',array['RESTAURANT'],false,'HIGH_VALUE',226,'[{"id":"table","label":"Tischservice","value":"TABLE_SERVICE"},{"id":"self","label":"Selbstbedienung","value":"SELF_SERVICE"},{"id":"takeaway_only","label":"Nur Take-away","value":"TAKEAWAY_ONLY"},{"id":"mixed","label":"Mischung Tischservice / Selbstbedienung","value":"MIXED"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.cuisines','PURPOSE','Art der Küche','Kontrollierte Mehrfachauswahl; nicht aus dem Namen ableiten. „Unbekannt“ ausschließlich allein auswählen.','MULTI_CHOICE','restaurant.cuisines','CANONICAL_WRITE',array['RESTAURANT'],false,'ESSENTIAL',240,'[{"id":"swiss","label":"Schweizerisch","value":"SWISS"},{"id":"italian","label":"Italienisch","value":"ITALIAN"},{"id":"french","label":"Französisch","value":"FRENCH"},{"id":"japanese","label":"Japanisch","value":"JAPANESE"},{"id":"thai","label":"Thai","value":"THAI"},{"id":"indian","label":"Indisch","value":"INDIAN"},{"id":"mediterranean","label":"Mediterran","value":"MEDITERRANEAN"},{"id":"levantine","label":"Levantinisch","value":"LEVANTINE"},{"id":"mexican","label":"Mexikanisch","value":"MEXICAN"},{"id":"vegan","label":"Vegan","value":"VEGAN"},{"id":"international","label":"International","value":"INTERNATIONAL"},{"id":"fusion","label":"Fusion","value":"FUSION"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.meal_formats','PURPOSE','Form des Speiseangebots','Snacks, Frühstück und Brunch bleiben im bestehenden Angebot; hier nur ergänzende Menüformen.','MULTI_CHOICE','restaurant.meal_formats','CANONICAL_WRITE',array['RESTAURANT'],false,'OPTIONAL',241,'[{"id":"menu","label":"Menü","value":"MENU"},{"id":"a_la_carte","label":"À la carte","value":"A_LA_CARTE"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1'),
 ('restaurant.additional_times','FIT','Zusätzliche passende Zeiten','Ergänzt Mittag und Feiertage, ohne die bestehende Decision-Daypart-Semantik zu verändern.','MULTI_CHOICE','restaurant.additional_visit_times','CANONICAL_WRITE',array['RESTAURANT'],false,'OPTIONAL',242,'[{"id":"midday","label":"Mittags","value":"MIDDAY"},{"id":"holiday","label":"Feiertage","value":"HOLIDAY"},{"id":"unknown","label":"Unbekannt","value":"UNKNOWN"}]','{}','{}','FOUNDER_ONLY','backyrd-restaurant-information-v1')
on conflict(question_id) do nothing;

create or replace function public.backyrd_restaurant_url_is_valid_v1(p_field_key text,p_value jsonb)
returns boolean language sql immutable set search_path=public,pg_catalog as $$
  select jsonb_typeof(p_value)='string'
    and length(p_value#>>'{}') between 8 and 500
    and (p_value#>>'{}') ~ '^https://[^[:space:]]+$'
    and case p_field_key
      when 'contact.instagram' then lower(p_value#>>'{}') ~ '^https://(www\.)?instagram\.com/'
      when 'contact.facebook' then lower(p_value#>>'{}') ~ '^https://(www\.)?(facebook\.com|fb\.com)/'
      when 'contact.linkedin' then lower(p_value#>>'{}') ~ '^https://(www\.)?linkedin\.com/'
      when 'contact.tiktok' then lower(p_value#>>'{}') ~ '^https://(www\.)?tiktok\.com/'
      else false end
$$;

create or replace function public.backyrd_restaurant_value_is_valid_v1(p_field_key text,p_value jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_catalog as $$
declare v_key text;v_entry text;v_item text;v_seen text[]:='{}';v_override jsonb;v_interval jsonb;
begin
  if p_field_key in ('location.neighborhood','profile.distinctive_fact') then
    return jsonb_typeof(p_value)='string' and length(btrim(p_value#>>'{}')) between 1 and case when p_field_key='location.neighborhood' then 120 else 280 end;
  end if;
  if p_field_key like 'contact.%' then return public.backyrd_restaurant_url_is_valid_v1(p_field_key,p_value); end if;
  if p_field_key in ('restaurant.payment_methods','restaurant.areas') then
    if jsonb_typeof(p_value)<>'object' then return false; end if;
    for v_key,v_entry in select key,value from jsonb_each_text(p_value) loop
      if v_entry not in ('AVAILABLE','NOT_AVAILABLE','UNKNOWN') then return false; end if;
      if p_field_key='restaurant.payment_methods' and v_key not in ('CASH','DEBIT_CARD','CREDIT_CARD','TWINT','OTHER') then return false; end if;
      if p_field_key='restaurant.areas' and v_key not in ('INDOOR','OUTDOOR','TERRACE','GARDEN') then return false; end if;
    end loop;
    return exists(select 1 from jsonb_object_keys(p_value));
  end if;
  if p_field_key='restaurant.capacity' then
    if jsonb_typeof(p_value)<>'object' or exists(select 1 from jsonb_object_keys(p_value) k where k not in ('total','indoor','outdoor')) then return false; end if;
    if not exists(select 1 from jsonb_each(p_value) e where e.value<>'null'::jsonb) then return false; end if;
    if exists(select 1 from jsonb_each(p_value) e where e.value<>'null'::jsonb and (jsonb_typeof(e.value)<>'number' or (e.value#>>'{}')::numeric<>trunc((e.value#>>'{}')::numeric) or (e.value#>>'{}')::numeric not between 0 and 100000)) then return false; end if;
    return coalesce((p_value->>'total')::integer,(p_value->>'indoor')::integer+(p_value->>'outdoor')::integer,1)>0;
  end if;
  if p_field_key='opening.special_overrides' then
    if jsonb_typeof(p_value)<>'object' or jsonb_typeof(p_value->'overrides')<>'array' or jsonb_array_length(p_value->'overrides') not between 1 and 64 then return false; end if;
    for v_override in select value from jsonb_array_elements(p_value->'overrides') loop
      if jsonb_typeof(v_override)<>'object' or coalesce(v_override->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (v_override->>'date')::date::text<>v_override->>'date' or v_override->>'status' not in ('OPEN','CLOSED') then return false; end if;
      if v_override->>'date'=any(v_seen) then return false; end if; v_seen:=array_append(v_seen,v_override->>'date');
      if v_override->>'status'='OPEN' then
        if jsonb_typeof(v_override->'intervals')<>'array' or jsonb_array_length(v_override->'intervals')=0 then return false; end if;
        for v_interval in select value from jsonb_array_elements(v_override->'intervals') loop
          if coalesce(v_interval->>'open','') !~ '^([01]\d|2[0-3]):[0-5]\d$' or coalesce(v_interval->>'close','') !~ '^([01]\d|2[0-3]):[0-5]\d$' then return false; end if;
        end loop;
      elsif coalesce(jsonb_array_length(v_override->'intervals'),0)<>0 then return false; end if;
    end loop;
    return true;
  end if;
  if p_field_key in ('restaurant.cuisines','restaurant.service_types','restaurant.meal_formats','restaurant.additional_visit_times') then
    if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)=0 then return false; end if;
    if p_value ? 'UNKNOWN' and jsonb_array_length(p_value)<>1 then return false; end if;
    return (select count(*)=count(distinct value) from jsonb_array_elements_text(p_value));
  end if;
  return true;
end $$;

revoke all on function public.backyrd_restaurant_url_is_valid_v1(text,jsonb),public.backyrd_restaurant_value_is_valid_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_restaurant_url_is_valid_v1(text,jsonb),public.backyrd_restaurant_value_is_valid_v1(text,jsonb) to service_role;

create or replace function public.backyrd_human_spot_validate_answer_v3(p_spot_id uuid,p_question_id text,p_value jsonb)
returns boolean language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_question public.backyrd_human_spot_questions_v2%rowtype;v_primary text;v_secondary text[];v_item jsonb;v_key text;v_entry text;
begin
  select * into v_question from public.backyrd_human_spot_questions_v2 where question_id=p_question_id and active;
  if not found or v_question.mapping_class<>'CANONICAL_WRITE' then return false; end if;
  v_primary:=public.backyrd_human_spot_derived_archetype_v2(p_spot_id);
  select coalesce(secondary_archetypes,'{}'::text[]) into v_secondary from public.backyrd_spot_authoring_profiles_v2 where spot_id=p_spot_id;
  v_secondary:=coalesce(v_secondary,'{}'::text[]);
  if not (v_question.common or v_primary=any(v_question.archetypes) or v_question.archetypes&&v_secondary) then return false; end if;
  if not public.backyrd_gold_validate_fact_value_v1(v_question.canonical_field_key,p_value) then return false; end if;
  if not public.backyrd_restaurant_value_is_valid_v1(v_question.canonical_field_key,p_value) then return false; end if;
  if v_question.control_type in ('SINGLE_CHOICE','DURATION_RANGE') then return exists(select 1 from jsonb_array_elements(v_question.options) o where o->'value'=p_value);
  elsif v_question.control_type='MULTI_CHOICE' then
    if jsonb_typeof(p_value)<>'array' then return false; end if;
    for v_item in select value from jsonb_array_elements(p_value) loop if not exists(select 1 from jsonb_array_elements(v_question.options) o where o->'value'=v_item and (not o ? 'archetypes' or exists(select 1 from jsonb_array_elements_text(o->'archetypes') a(value) where value=v_primary or value=any(v_secondary)))) then return false; end if; end loop; return true;
  elsif v_question.control_type in ('TRI_STATE_MAP','ACCESSIBILITY_MAP') then
    if jsonb_typeof(p_value)<>'object' then return false; end if;
    for v_key,v_entry in select key,value from jsonb_each_text(p_value) loop if v_entry not in ('SUITABLE','NOT_SUITABLE','UNKNOWN') or not exists(select 1 from jsonb_array_elements(v_question.options) o where o->>'value'=v_key) then return false; end if; end loop; return true;
  elsif v_question.control_type in ('AVAILABILITY_MAP','PURPOSE_MAP') then
    if jsonb_typeof(p_value)<>'object' then return false; end if;
    for v_key,v_entry in select key,value from jsonb_each_text(p_value) loop
      if (v_question.control_type='AVAILABILITY_MAP' and v_entry not in ('AVAILABLE','NOT_AVAILABLE','UNKNOWN')) or (v_question.control_type='PURPOSE_MAP' and v_entry not in ('SUITABLE','NOT_SUITABLE','UNKNOWN')) or not exists(select 1 from jsonb_array_elements(v_question.options) o where o->>'value'=v_key) then return false; end if;
    end loop; return true;
  elsif v_question.control_type in ('AGE_RANGE','TEXT_INPUT','URL_INPUT','CAPACITY','SPECIAL_HOURS') then return true;
  end if;
  return false;
end $$;

revoke all on function public.backyrd_human_spot_validate_answer_v3(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_human_spot_validate_answer_v3(uuid,text,jsonb) to service_role;

create or replace function public.backyrd_human_spot_save_section_v3(
  p_spot_id uuid,p_section_id text,p_answers jsonb,p_source_type text default 'ADMIN_VERIFIED',
  p_source_url text default null,p_source_reference text default null,p_evidence_scope text default 'SPOT',
  p_idempotency_key text default null,p_expected_snapshot_hash text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare
 v_actor jsonb;v_payload_hash text;v_request public.backyrd_human_spot_save_requests_v2%rowtype;
 v_source uuid;v_answer jsonb;v_question public.backyrd_human_spot_questions_v2%rowtype;
 v_value jsonb;v_status text;v_rebuild jsonb;v_result jsonb;v_current_hash text;
 v_count integer:=0;v_proposal jsonb;v_data_origin text;v_hierarchy_conflict text;
begin
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  if v_actor->>'role' not in ('FOUNDER','ADMIN') then raise exception 'admin_or_founder_required' using errcode='42501'; end if;
  select data_origin into v_data_origin from public.spots where id=p_spot_id;
  if v_data_origin in ('FIXTURE','TEST') and (
    p_section_id<>'PURPOSE' or p_evidence_scope<>'SPOT' or exists(
      select 1 from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) answer
      left join public.backyrd_human_spot_questions_v2 question on question.question_id=answer->>'questionId' and question.active
      where question.canonical_field_key is null or question.canonical_field_key not in ('offering.availability','purpose.occasions')
    )
  ) then raise exception 'fixture_authoring_limited_to_offering_acceptance' using errcode='42501'; end if;
  if p_section_id not in ('IDENTITY','PURPOSE','FIT','EXPERIENCE','PRACTICAL') then raise exception 'unknown_authoring_section' using errcode='22023'; end if;
  if jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)=0 then raise exception 'authoring_answers_required' using errcode='22023'; end if;
  if p_source_type not in ('ADMIN_VERIFIED','OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT') then raise exception 'authoring_source_not_allowed' using errcode='22023'; end if;
  if p_evidence_scope not in ('SPOT','EVENT','PROGRAM','TEMPORARY') then raise exception 'authoring_scope_not_allowed' using errcode='22023'; end if;
  v_payload_hash:=encode(extensions.digest(convert_to(jsonb_build_object('version','restaurant-information-v1','section',p_section_id,'answers',p_answers,'source',p_source_type,'url',p_source_url,'reference',p_source_reference,'scope',p_evidence_scope)::text,'UTF8'),'sha256'),'hex');
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'idempotency_key_required' using errcode='22023'; end if;
  select * into v_request from public.backyrd_human_spot_save_requests_v2 where spot_id=p_spot_id and idempotency_key=p_idempotency_key;
  if found then
    if v_request.payload_hash<>v_payload_hash then raise exception 'authoring_idempotency_conflict' using errcode='23505'; end if;
    return v_request.result||jsonb_build_object('replayed',true);
  end if;
  select fingerprint into v_current_hash from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=p_spot_id and context_key='global';
  if p_expected_snapshot_hash is not null and v_current_hash is distinct from p_expected_snapshot_hash then raise exception 'authoring_state_changed_reload_required' using errcode='40001'; end if;
  insert into public.backyrd_human_spot_save_requests_v2(spot_id,idempotency_key,payload_hash) values(p_spot_id,p_idempotency_key,v_payload_hash);
  insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_url,source_reference,title,observed_at,last_checked_at,legal_use_status,created_by_type,created_by_id)
  values(p_spot_id,p_source_type,nullif(btrim(p_source_url),''),coalesce(nullif(btrim(p_source_reference),''),'human-spot-v3:'||p_section_id||':'||p_idempotency_key),'Restaurant Information V1 · '||p_section_id,now(),now(),'NOT_REQUIRED',v_actor->>'role',(v_actor->>'actorId')::uuid) returning id into v_source;
  for v_answer in select value from jsonb_array_elements(p_answers) loop
    select * into v_question from public.backyrd_human_spot_questions_v2 where question_id=v_answer->>'questionId' and active for share;
    if not found or v_question.section_id<>p_section_id then raise exception 'unknown_or_wrong_section_question' using errcode='22023'; end if;
    if v_question.mapping_class<>'CANONICAL_WRITE' then raise exception 'question_not_canonical_write' using errcode='22023'; end if;
    v_value:=v_answer->'value';
    if v_question.canonical_field_key='offering.availability' then
      v_hierarchy_conflict:=public.backyrd_offering_hierarchy_conflict_v1(v_value);
      if v_hierarchy_conflict is not null then raise exception 'offering_hierarchy_conflict:%',v_hierarchy_conflict using errcode='22023'; end if;
    end if;
    if v_value is null or not public.backyrd_human_spot_validate_answer_v3(p_spot_id,v_question.question_id,v_value) then raise exception 'invalid_human_answer' using errcode='22023'; end if;
    if p_evidence_scope='SPOT' then
      update public.backyrd_spot_accepted_facts_v1 set status='SUPERSEDED' where spot_id=p_spot_id and field_key=v_question.canonical_field_key and status in ('ACTIVE','UNKNOWN','STALE');
      v_status:=case when v_value='"UNKNOWN"'::jsonb then 'UNKNOWN' else 'ACTIVE' end;
      insert into public.backyrd_spot_accepted_facts_v1(spot_id,field_key,value,source_id,status,confidence_policy_result,accepted_by,observed_at,last_checked_at,evidence_scope,interpretation_basis,semantic_contract_version,contract_version)
      values(p_spot_id,v_question.canonical_field_key,v_value,v_source,v_status,.95,(v_actor->>'actorId')::uuid,now(),now(),'SPOT',case when v_question.canonical_field_key='time.dayparts' then 'HUMAN_QUALITATIVE' else 'SOURCE_EXPLICIT' end,'backyrd-canonical-semantics-v1','backyrd-spot-accepted-fact-v1');
    else
      v_proposal:=public.backyrd_gold_submit_proposal_v1(p_spot_id,v_question.canonical_field_key,v_value,v_source,p_idempotency_key||':'||v_question.question_id,'Restaurant Information V1',null);
      update public.backyrd_spot_fact_proposals_v1 set evidence_scope=p_evidence_scope,interpretation_basis=case when v_question.canonical_field_key='time.dayparts' then 'HUMAN_QUALITATIVE' else 'SOURCE_EXPLICIT' end where id=(v_proposal->>'proposalId')::uuid;
    end if;
    v_count:=v_count+1;
  end loop;
  if p_evidence_scope='SPOT' then
    if v_data_origin in ('FIXTURE','TEST') then v_rebuild:=jsonb_build_object('skipped',true,'reason','TEST_FIXTURE_OFFERING_OUTSIDE_N4');
    else v_rebuild:=public.backyrd_gold_rebuild_spot_v1(p_spot_id); end if;
  end if;
  insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
  values(p_spot_id,(v_actor->>'actorId')::uuid,case when p_evidence_scope='SPOT' then 'SAVE_SECTION_V3' else 'PROPOSE_SECTION_V3' end,'AUTHORING_SECTION',p_spot_id,jsonb_build_object('sectionId',p_section_id,'answerCount',v_count,'scope',p_evidence_scope,'sourceId',v_source,'rebuild',v_rebuild,'ui','restaurant-information-v1'));
  v_result:=jsonb_build_object('ok',true,'persisted',v_count,'accepted',p_evidence_scope='SPOT','reviewRequired',p_evidence_scope<>'SPOT','rebuild',v_rebuild,'profile',public.backyrd_human_spot_profile_v2(p_spot_id));
  update public.backyrd_human_spot_save_requests_v2 set result=v_result where spot_id=p_spot_id and idempotency_key=p_idempotency_key;
  return v_result;
end $$;

revoke all on function public.backyrd_human_spot_save_section_v3(uuid,text,jsonb,text,text,text,text,text,text) from public,anon;
grant execute on function public.backyrd_human_spot_save_section_v3(uuid,text,jsonb,text,text,text,text,text,text) to authenticated,service_role;

create or replace function public.backyrd_restaurant_information_v1(p_spot_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_catalog as $$
  with eligible as (
    select s.id,s.name,s.address,s.city,s.website,s.phone,s.price_level
    from public.spots s join public.categories c on c.id=s.category_id
    where s.id=p_spot_id and lower(c.name)='restaurant' and s.status='approved'
      and coalesce(s.data_origin,'LEGACY') not in ('TEST','FIXTURE')
      and public.distribution_trust_entity_is_eligible_v1('spot',s.id,'discovery')
  ), facts as (
    select f.field_key,f.value,f.status,f.last_checked_at
    from public.backyrd_spot_accepted_facts_v1 f join eligible e on e.id=f.spot_id
    join public.backyrd_spot_sources_v1 src on src.id=f.source_id
    where f.evidence_scope='SPOT' and f.status in ('ACTIVE','UNKNOWN') and src.source_type<>'LEGACY'
      and (f.field_key like 'restaurant.%' or f.field_key in ('location.neighborhood','profile.distinctive_fact','opening.special_overrides','contact.instagram','contact.facebook','contact.linkedin','contact.tiktok','offering.availability','purpose.occasions','social.suitability','time.dayparts','duration.approximate','atmosphere.descriptors','suitability.family_kids','character.noise','accessibility.capabilities'))
  )
  select jsonb_build_object(
    'contractVersion','backyrd-restaurant-information-v1',
    'identity',jsonb_build_object('name',e.name,'address',e.address,'city',e.city,'neighborhood',(select value from facts where field_key='location.neighborhood' limit 1)),
    'contact',jsonb_build_object('website',nullif(trim(e.website),''),'phone',nullif(trim(e.phone),''),'instagram',(select value from facts where field_key='contact.instagram' limit 1),'facebook',(select value from facts where field_key='contact.facebook' limit 1),'linkedin',(select value from facts where field_key='contact.linkedin' limit 1),'tiktok',(select value from facts where field_key='contact.tiktok' limit 1)),
    'priceLevel',e.price_level,
    'facts',coalesce((select jsonb_object_agg(field_key,jsonb_build_object('value',value,'status',status,'lastCheckedAt',last_checked_at)) from facts),'{}'::jsonb),
    'refreshedAt',now()
  ) from eligible e
$$;

revoke all on function public.backyrd_restaurant_information_v1(uuid) from public;
grant execute on function public.backyrd_restaurant_information_v1(uuid) to anon,authenticated,service_role;
comment on function public.backyrd_restaurant_information_v1(uuid) is 'Consumer-safe Restaurant V1 display facts. Fails closed for non-Product, non-approved or Distribution-ineligible Spots; no Decision authority.';

create or replace function public.admin_restaurant_information_coverage_v1()
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_total integer;v_result jsonb;
begin
  if not public.admin_is_admin_v1() then raise exception 'admin_required' using errcode='42501'; end if;
  select count(*) into v_total from public.spots s join public.categories c on c.id=s.category_id where lower(c.name)='restaurant' and s.status='approved' and coalesce(s.data_origin,'LEGACY') not in ('TEST','FIXTURE');
  select jsonb_build_object('contractVersion','backyrd-admin-restaurant-coverage-v1','population',v_total,'fields',coalesce(jsonb_agg(jsonb_build_object('fieldKey',field_key,'covered',covered,'coveragePercent',case when v_total=0 then 0 else round(100*covered::numeric/v_total,1) end) order by field_key),'[]'::jsonb)) into v_result
  from (
    select key.field_key,count(distinct f.spot_id)::integer covered
    from (values ('name'),('address'),('website'),('phone'),('price.level'),('location.neighborhood'),('contact.instagram'),('contact.facebook'),('contact.linkedin'),('contact.tiktok'),('profile.distinctive_fact'),('opening.regular'),('opening.special_overrides'),('restaurant.takeaway'),('restaurant.cuisines'),('restaurant.payment_methods'),('restaurant.capacity'),('restaurant.areas'),('restaurant.reservation_policy'),('restaurant.service_types'),('offering.availability'),('purpose.occasions'),('restaurant.meal_formats'),('social.suitability'),('time.dayparts'),('restaurant.additional_visit_times'),('duration.approximate'),('atmosphere.descriptors'),('suitability.family_kids'),('character.noise'),('accessibility.capabilities')) key(field_key)
    left join lateral (
      select s.id spot_id from public.spots s join public.categories c on c.id=s.category_id where lower(c.name)='restaurant' and s.status='approved' and coalesce(s.data_origin,'LEGACY') not in ('TEST','FIXTURE') and ((key.field_key='name' and nullif(trim(s.name),'') is not null) or (key.field_key='address' and nullif(trim(s.address),'') is not null) or (key.field_key='website' and nullif(trim(s.website),'') is not null) or (key.field_key='phone' and nullif(trim(s.phone),'') is not null) or (key.field_key='price.level' and s.price_level is not null) or (key.field_key='opening.regular' and exists(select 1 from public.spot_hours h where h.spot_id=s.id)) or exists(select 1 from public.backyrd_spot_accepted_facts_v1 af join public.backyrd_spot_sources_v1 src on src.id=af.source_id where af.spot_id=s.id and af.field_key=key.field_key and af.status='ACTIVE' and af.evidence_scope='SPOT' and src.source_type<>'LEGACY'))
    ) f on true group by key.field_key
  ) coverage;
  return v_result;
end $$;

revoke all on function public.admin_restaurant_information_coverage_v1() from public,anon;
grant execute on function public.admin_restaurant_information_coverage_v1() to authenticated,service_role;
