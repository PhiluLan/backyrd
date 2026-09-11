-- Slice 4A authoring reliability closure.
-- This forward migration aligns the database boundary with the already published
-- registry@1.1 TypeScript contract. It performs no data rewrite or activation.

create or replace function world_knowledge_private.attribute_value_valid_v1(p_registry_version text,p_attribute_key text,p_state text,p_value jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare definition world_knowledge_private.attribute_definitions%rowtype; item jsonb; nested jsonb; values_count integer; distinct_count integer;
begin
  select * into definition from world_knowledge_private.attribute_definitions where registry_version=p_registry_version and attribute_key=p_attribute_key;
  if not found or p_state not in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE','UNKNOWN') then return false; end if;
  if p_state='UNKNOWN' then return p_value is null; end if;
  if p_value is null then return false; end if;
  if p_state='KNOWN_TRUE' and (definition.value_type<>'BOOLEAN' or p_value<>'true'::jsonb) then return false; end if;
  if p_state='KNOWN_FALSE' and (definition.value_type<>'BOOLEAN' or p_value<>'false'::jsonb) then return false; end if;
  if p_state in ('KNOWN_TRUE','KNOWN_FALSE') and definition.value_type<>'BOOLEAN' then return false; end if;
  if definition.value_type='BOOLEAN' then return jsonb_typeof(p_value)='boolean'; end if;
  if definition.value_type in ('TEXT','EMAIL','URL','PHONE','COUNTRY_CODE','IANA_TIMEZONE','ENUM') and jsonb_typeof(p_value)<>'string' then return false; end if;
  if definition.value_type='EMAIL' and (length(p_value#>>'{}') not between 3 and 254 or p_value#>>'{}' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then return false; end if;
  if definition.value_type='URL' and (length(p_value#>>'{}') not between 1 and 500 or p_value#>>'{}' !~ '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$') then return false; end if;
  if definition.value_type='PHONE' and p_value#>>'{}' !~ '^\+[1-9][0-9]{6,14}$' then return false; end if;
  if definition.value_type='COUNTRY_CODE' and p_value#>>'{}' !~ '^[A-Z]{2}$' then return false; end if;
  if definition.value_type='IANA_TIMEZONE' and not exists(select 1 from pg_catalog.pg_timezone_names() zone where zone.name=p_value#>>'{}') then return false; end if;
  if definition.value_type='TEXT' and (length(p_value#>>'{}')<coalesce(definition.minimum,0) or length(p_value#>>'{}')>coalesce(definition.maximum,100000)) then return false; end if;
  if definition.value_type='ENUM' and not definition.allowed_values @> jsonb_build_array(p_value#>>'{}') then return false; end if;
  if definition.value_type='ENUM_SET' then
    if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>jsonb_array_length(definition.allowed_values) then return false; end if;
    select count(*),count(distinct value) into values_count,distinct_count from jsonb_array_elements(p_value);
    if values_count<>distinct_count then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop if jsonb_typeof(item)<>'string' or not definition.allowed_values @> jsonb_build_array(item#>>'{}') then return false; end if; end loop;
  end if;
  if definition.value_type in ('DECIMAL','INTEGER') then
    if jsonb_typeof(p_value)<>'number' then return false; end if;
    if definition.value_type='INTEGER' and (p_value#>>'{}')::numeric<>trunc((p_value#>>'{}')::numeric) then return false; end if;
    if (definition.minimum is not null and (p_value#>>'{}')::numeric<definition.minimum) or (definition.maximum is not null and (p_value#>>'{}')::numeric>definition.maximum) then return false; end if;
  end if;
  if definition.value_type='INTEGER_RANGE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>2 or not p_value ?& array['min','max'] or jsonb_typeof(p_value->'min')<>'number' or jsonb_typeof(p_value->'max')<>'number' or (p_value->>'min')::numeric<>trunc((p_value->>'min')::numeric) or (p_value->>'max')::numeric<>trunc((p_value->>'max')::numeric) or (p_value->>'min')::numeric>(p_value->>'max')::numeric or (p_value->>'min')::numeric<definition.minimum or (p_value->>'max')::numeric>definition.maximum) then return false; end if;
  if definition.value_type='MONEY_RANGE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>3 or not p_value ?& array['currency','min','max'] or p_value->>'currency' !~ '^[A-Z]{3}$' or jsonb_typeof(p_value->'min')<>'number' or jsonb_typeof(p_value->'max')<>'number' or (p_value->>'min')::numeric>(p_value->>'max')::numeric or (p_value->>'min')::numeric<definition.minimum or (p_value->>'max')::numeric>definition.maximum) then return false; end if;
  if definition.value_type in ('WEEKLY_SCHEDULE','SPECIAL_HOURS') then
    if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>(case when definition.value_type='WEEKLY_SCHEDULE' then 7 else 366 end) then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop
      if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>(case when definition.value_type='WEEKLY_SCHEDULE' then 2 else 3 end) or not item ? 'intervals' or jsonb_typeof(item->'intervals')<>'array' or jsonb_array_length(item->'intervals')>8 then return false; end if;
      if definition.value_type='WEEKLY_SCHEDULE' and coalesce(item->>'day','') not in ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY') then return false; end if;
      if definition.value_type='SPECIAL_HOURS' and (coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or pg_catalog.to_char((item->>'date')::date,'YYYY-MM-DD')<>item->>'date' or coalesce(item->>'status','') not in ('OPEN','CLOSED') or (item->>'status'='CLOSED' and jsonb_array_length(item->'intervals')<>0) or (item->>'status'='OPEN' and jsonb_array_length(item->'intervals')=0)) then return false; end if;
      for nested in select value from jsonb_array_elements(item->'intervals') loop if jsonb_typeof(nested)<>'object' or (select count(*) from jsonb_object_keys(nested))<>2 or coalesce(nested->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(nested->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or nested->>'start'=nested->>'end' then return false; end if; end loop;
    end loop;
    if definition.value_type='WEEKLY_SCHEDULE' and (select count(*)<>count(distinct value->>'day') from jsonb_array_elements(p_value)) then return false; end if;
    if definition.value_type='SPECIAL_HOURS' and (select count(*)<>count(distinct value->>'date') from jsonb_array_elements(p_value)) then return false; end if;
  end if;
  if definition.value_type='RESERVATION_RULE' then
    if jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>5 or not p_value ?& array['mode','minimumPartySize','days','fromTime','toTime'] or coalesce(p_value->>'mode','') not in ('NOT_REQUIRED','RECOMMENDED','REQUIRED','CONDITIONAL') or jsonb_typeof(p_value->'days')<>'array' or jsonb_array_length(p_value->'days')>7 then return false; end if;
    if p_value->'minimumPartySize'<>'null'::jsonb and (jsonb_typeof(p_value->'minimumPartySize')<>'number' or (p_value->>'minimumPartySize')::numeric<>trunc((p_value->>'minimumPartySize')::numeric) or (p_value->>'minimumPartySize')::numeric not between 1 and 100000) then return false; end if;
    if (p_value->'fromTime'='null'::jsonb)<>(p_value->'toTime'='null'::jsonb) then return false; end if;
    if p_value->'fromTime'<>'null'::jsonb and (p_value->>'fromTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_value->>'toTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then return false; end if;
    for item in select value from jsonb_array_elements(p_value->'days') loop if jsonb_typeof(item)<>'string' or item#>>'{}' not in ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY') then return false; end if; end loop;
    if (select count(*)<>count(distinct value) from jsonb_array_elements(p_value->'days')) then return false; end if;
    if p_value->>'mode'='CONDITIONAL' and p_value->'minimumPartySize'='null'::jsonb and jsonb_array_length(p_value->'days')=0 and p_value->'fromTime'='null'::jsonb then return false; end if;
  end if;
  if definition.value_type='CONSUMPTION_RULE' then
    if jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>2 or not p_value ?& array['policy','exceptions'] or coalesce(p_value->>'policy','') not in ('ALLOWED','NOT_ALLOWED','CONDITIONAL') or jsonb_typeof(p_value->'exceptions')<>'array' or jsonb_array_length(p_value->'exceptions')>20 then return false; end if;
    for item in select value from jsonb_array_elements(p_value->'exceptions') loop if jsonb_typeof(item)<>'string' or length(item#>>'{}') not between 1 and 160 then return false; end if; end loop;
    if (select count(*)<>count(distinct value) from jsonb_array_elements(p_value->'exceptions')) then return false; end if;
  end if;
  if definition.value_type='PET_ACCESS_RULE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>4 or not p_value ?& array['indoor','outdoor','assistanceAnimals','notes'] or coalesce(p_value->>'indoor','') not in ('ALLOWED','NOT_ALLOWED','UNKNOWN') or coalesce(p_value->>'outdoor','') not in ('ALLOWED','NOT_ALLOWED','UNKNOWN') or coalesce(p_value->>'assistanceAnimals','') not in ('ALLOWED','NOT_ALLOWED','UNKNOWN') or (p_value->'notes'<>'null'::jsonb and (jsonb_typeof(p_value->'notes')<>'string' or length(p_value->>'notes') not between 1 and 500))) then return false; end if;
  if definition.value_type='AGE_ACCESS_RULE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>3 or not p_value ?& array['policy','minimumAge','appliesFromTime'] or coalesce(p_value->>'policy','') not in ('ALL_AGES','MINIMUM_AGE') or (p_value->>'policy'='ALL_AGES' and (p_value->'minimumAge'<>'null'::jsonb or p_value->'appliesFromTime'<>'null'::jsonb)) or (p_value->>'policy'='MINIMUM_AGE' and (jsonb_typeof(p_value->'minimumAge')<>'number' or (p_value->>'minimumAge')::numeric not between 0 and 120 or (p_value->>'minimumAge')::numeric<>trunc((p_value->>'minimumAge')::numeric))) or (p_value->'appliesFromTime'<>'null'::jsonb and p_value->>'appliesFromTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')) then return false; end if;
  if definition.value_type='CURRENT_STATE' and (jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>2 or not (p_value ?& array['kind','scope']) or not definition.allowed_values @> jsonb_build_array(p_value->>'kind') or coalesce(p_value->>'scope','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') then return false; end if;
  return true;
exception when others then return false;
end $$;

revoke execute on function world_knowledge_private.attribute_value_valid_v1(text,text,text,jsonb) from public,anon,authenticated,service_role;
comment on function world_knowledge_private.attribute_value_valid_v1(text,text,text,jsonb) is 'Registry@1.1 fail-closed value boundary aligned with the TypeScript parseAttributeValue contract; no data migration or runtime activation.';
