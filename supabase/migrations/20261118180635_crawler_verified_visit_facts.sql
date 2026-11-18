-- Apply reviewed visit facts through the existing transactional crawler approval.
create or replace function public.admin_backyrd_crawler_approve_spot_v1(
  p_source_id integer,p_fingerprint text,p_revision text,p_category_id uuid,p_confirm_distinct boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_spot uuid; v_data jsonb; v_hours jsonb; v_price jsonb; v_fields jsonb; v_field record;
  v_observed timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.uid() is null or public.admin_is_admin_v1() is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('basel-place-source-create-spot',0));
  select spot_id into v_spot from world_knowledge_private.basel_spot_source_imports_v1
    where source_key='BASEL_WEB' and source_id=p_source_id;
  if found then return v_spot; end if;
  v_spot:=world_knowledge_private.basel_place_source_create_spot_v2(
    'BASEL_WEB',p_source_id,p_fingerprint,p_revision,p_category_id,p_confirm_distinct);
  select source_facts->'basics' into v_data from world_knowledge_private.basel_spot_source_imports_v1
    where source_key='BASEL_WEB' and source_id=p_source_id;
  if v_data is null then return v_spot; end if;
  update public.spots set
    email=coalesce(v_data->>'email',email),
    phone=coalesce(v_data->>'phone',phone),
    website=coalesce(v_data->>'website',website)
  where id=v_spot;

  v_hours:=v_data->'fullHours';
  if jsonb_typeof(v_hours)='array' and jsonb_array_length(v_hours)=7 then
    insert into public.spot_hours(spot_id,day_of_week,open_time,close_time,idx)
    select v_spot, days.label, (slot->>'start')::time,(slot->>'end')::time,(row_number() over(order by day_order,ordinality)-1)::integer
    from jsonb_array_elements(v_hours) with ordinality as d(day,day_order)
    join (values ('MONDAY','Montag'),('TUESDAY','Dienstag'),('WEDNESDAY','Mittwoch'),
      ('THURSDAY','Donnerstag'),('FRIDAY','Freitag'),('SATURDAY','Samstag'),('SUNDAY','Sonntag'))
      days(key,label) on days.key=day->>'day'
    cross join lateral jsonb_array_elements(day->'intervals') with ordinality as i(slot,ordinality);
  end if;

  v_price:=v_data->'fixedAdmission';
  if not world_knowledge_private.product_admin_authoring_active_v1() then return v_spot; end if;
  select jsonb_strip_nulls(jsonb_build_object(
    'identity.name', name, 'location.address_line1', address, 'location.locality',city,
    'location.country_code','CH','location.timezone','Europe/Zurich',
    'location.latitude',lat,'location.longitude',lng,
    'contact.website',case when website ~ '^https://' then website end,
    'contact.public_email',email,'contact.phone',v_data->>'phone'
  )) into v_fields from public.spots where id=v_spot;
  if jsonb_typeof(v_hours)='array' and jsonb_array_length(v_hours)=7 then
    v_fields:=v_fields || jsonb_build_object('hours.regular',v_hours);
  end if;
  if jsonb_typeof(v_data->'specialHours')='array' and jsonb_array_length(v_data->'specialHours')>0 then
    v_fields:=v_fields || jsonb_build_object('hours.special',v_data->'specialHours');
  end if;
  if jsonb_typeof(v_data->'observedPrices')='array' and jsonb_array_length(v_data->'observedPrices') between 1 and 12 then
    select jsonb_agg(jsonb_build_object(
      'currency','CHF','min',item->'min','max',item->'max','purposes',jsonb_build_array(item->>'purpose'),
      'allOfferingsCovered',false,'basis','PER_PERSON','minimumAge',item->'minimumAge','maximumAge',null,
      'mandatoryFeesIncluded',false,'conditions',
      '{"days":[],"dayparts":[],"area":null,"occasion":null,"groupSize":null,"ageContext":null,"accompaniment":null,"eventMode":null}'::jsonb ||
        jsonb_build_object('days',coalesce(item->'days','[]'::jsonb),'occasion',item->'occasion')
    ) order by ordinality) into v_price
    from jsonb_array_elements(v_data->'observedPrices') with ordinality as price(item,ordinality);
    v_fields:=v_fields || jsonb_build_object('operation.price_options',v_price);
  elsif jsonb_typeof(v_price)='number' then
    v_fields:=v_fields || jsonb_build_object('operation.price_options',jsonb_build_array(jsonb_build_object('currency','CHF','min',v_price,'max',v_price,
        'purposes',jsonb_build_array('ADMISSION'),'allOfferingsCovered',false,'basis','PER_PERSON',
        'minimumAge',null,'maximumAge',null,'mandatoryFeesIncluded',false,'conditions',
        '{"days":[],"dayparts":[],"area":null,"occasion":null,"groupSize":null,"ageContext":null,"accompaniment":null,"eventMode":null}'::jsonb)));
  end if;
  for v_field in select key,value from jsonb_each(v_fields) order by key loop
    perform public.world_product_admin_submit_claim_v1(v_spot,v_field.key,'KNOWN_VALUE',v_field.value,
      v_observed,null,null,'PUBLIC',null,'crawler-basics:'||p_source_id::text||':'||v_field.key);
  end loop;
  perform world_knowledge_private.publish_approved_spot_search_v1(v_spot);
  return v_spot;
end
$$;
