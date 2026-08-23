-- Basis Spot Details persistence repair.
-- Direct browser UPDATEs are intentionally blocked by spots RLS. This
-- transactional boundary authorizes Founder/Admin, validates an explicit
-- allowlist, reconciles equivalent accepted facts, and returns the committed
-- row plus refreshed readiness.

create or replace function public.backyrd_admin_save_spot_basics_v1(
  p_spot_id uuid,
  p_patch jsonb,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_actor jsonb;
  v_current public.spots%rowtype;
  v_saved public.spots%rowtype;
  v_key text;
  v_value jsonb;
  v_fact record;
  v_result jsonb;
  v_allowed constant text[]:=array[
    'name','address','city','country','lat','lng','category_id','price_level',
    'website','phone','email','header_photo_path','google_place_id',
    'google_photo_enabled','status'
  ];
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then
    raise exception 'spot_basics_patch_invalid' using errcode='22023';
  end if;
  if p_request_id is null then
    raise exception 'spot_basics_request_id_required' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k<>all(v_allowed)) then
    raise exception 'spot_basics_field_not_allowed' using errcode='22023';
  end if;

  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  if v_actor->>'role' not in ('FOUNDER','ADMIN') then
    raise exception 'admin_or_founder_required' using errcode='42501';
  end if;

  select * into v_current from public.spots where id=p_spot_id for update;
  if not found then raise exception 'spot_not_found' using errcode='22023'; end if;
  if exists(
    select 1 from public.backyrd_spot_gold_authoring_audit_v1
    where spot_id=p_spot_id and action='UPDATE_PRODUCT_BASICS'
      and metadata->>'requestId'=p_request_id::text
  ) then
    return jsonb_build_object(
      'spot',to_jsonb(v_current),
      'readiness',public.backyrd_gold_readiness_v1(p_spot_id),
      'requestId',p_request_id,
      'persisted',true,
      'replayed',true
    );
  end if;

  if p_patch ? 'name' and nullif(btrim(p_patch->>'name'),'') is null then
    raise exception 'spot_name_required' using errcode='22023';
  end if;
  if p_patch ? 'website' and nullif(btrim(p_patch->>'website'),'') is not null
     and btrim(p_patch->>'website') !~* '^https?://[^[:space:]]+$' then
    raise exception 'spot_website_invalid' using errcode='22023';
  end if;
  if p_patch ? 'email' and nullif(btrim(p_patch->>'email'),'') is not null
     and btrim(p_patch->>'email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'spot_email_invalid' using errcode='22023';
  end if;
  if p_patch ? 'country' and length(coalesce(p_patch->>'country',''))>120 then
    raise exception 'spot_country_invalid' using errcode='22023';
  end if;
  if p_patch ? 'phone' and length(coalesce(p_patch->>'phone',''))>80 then
    raise exception 'spot_phone_invalid' using errcode='22023';
  end if;
  if p_patch ? 'price_level' and p_patch->'price_level'<>'null'::jsonb
     and (p_patch->>'price_level')::integer not between 1 and 5 then
    raise exception 'spot_price_level_invalid' using errcode='22023';
  end if;
  if p_patch ? 'category_id' and nullif(p_patch->>'category_id','') is not null
     and not exists(select 1 from public.categories where id=(p_patch->>'category_id')::uuid) then
    raise exception 'spot_category_invalid' using errcode='22023';
  end if;
  if p_patch ? 'lat' and p_patch->'lat'<>'null'::jsonb
     and (p_patch->>'lat')::double precision not between -90 and 90 then
    raise exception 'spot_lat_invalid' using errcode='22023';
  end if;
  if p_patch ? 'lng' and p_patch->'lng'<>'null'::jsonb
     and (p_patch->>'lng')::double precision not between -180 and 180 then
    raise exception 'spot_lng_invalid' using errcode='22023';
  end if;

  -- Reconcile the Product fields that have an equivalent canonical Basic Fact.
  -- A conflicting/restricted proposal fails the whole transaction rather than
  -- letting Product and canonical truth diverge.
  for v_key,v_value in
    select * from (values
      ('identity.name',case when p_patch ? 'name' then to_jsonb(nullif(btrim(p_patch->>'name'),'')) end),
      ('contact.website',case when p_patch ? 'website' then to_jsonb(nullif(btrim(p_patch->>'website'),'')) end),
      ('contact.phone',case when p_patch ? 'phone' then to_jsonb(nullif(btrim(p_patch->>'phone'),'')) end),
      ('contact.email',case when p_patch ? 'email' then to_jsonb(nullif(btrim(p_patch->>'email'),'')) end),
      ('price.level',case when p_patch ? 'price_level' and p_patch->'price_level'<>'null'::jsonb then to_jsonb((p_patch->>'price_level')::integer) end)
    ) x(field_key,value)
    where (field_key='identity.name' and p_patch ? 'name')
       or (field_key='contact.website' and p_patch ? 'website')
       or (field_key='contact.phone' and p_patch ? 'phone')
       or (field_key='contact.email' and p_patch ? 'email')
       or (field_key='price.level' and p_patch ? 'price_level')
  loop
    if v_value is null or v_value='null'::jsonb then
      for v_fact in
        select id from public.backyrd_spot_accepted_facts_v1
        where spot_id=p_spot_id and field_key=v_key and status='ACTIVE'
      loop
        perform public.backyrd_gold_review_accepted_fact_v1(v_fact.id,'RETRACT','Basisangabe wurde bewusst geleert');
      end loop;
    elsif not exists(
      select 1 from public.backyrd_spot_accepted_facts_v1
      where spot_id=p_spot_id and field_key=v_key and status='ACTIVE' and value=v_value
    ) then
      v_result:=public.backyrd_gold_save_human_fact_v1(
        p_spot_id,v_key,v_value,'ADMIN_VERIFIED',null,
        'Human Spot Editor – Basisangaben','SPOT',
        'spot-basics-v1:'||p_request_id||':'||v_key
      );
      if not coalesce((v_result->>'accepted')::boolean,false) then
        raise exception 'canonical_basic_fact_requires_review:%',v_key using errcode='23514';
      end if;
    end if;
  end loop;

  update public.spots set
    name=case when p_patch ? 'name' then btrim(p_patch->>'name') else name end,
    address=case when p_patch ? 'address' then nullif(btrim(p_patch->>'address'),'') else address end,
    city=case when p_patch ? 'city' then nullif(btrim(p_patch->>'city'),'') else city end,
    country=case when p_patch ? 'country' then nullif(btrim(p_patch->>'country'),'') else country end,
    lat=case when p_patch ? 'lat' then (p_patch->>'lat')::double precision else lat end,
    lng=case when p_patch ? 'lng' then (p_patch->>'lng')::double precision else lng end,
    category_id=case when p_patch ? 'category_id' then nullif(p_patch->>'category_id','')::uuid else category_id end,
    price_level=case when p_patch ? 'price_level' then (p_patch->>'price_level')::integer else price_level end,
    website=case when p_patch ? 'website' then nullif(btrim(p_patch->>'website'),'') else website end,
    phone=case when p_patch ? 'phone' then nullif(btrim(p_patch->>'phone'),'') else phone end,
    email=case when p_patch ? 'email' then nullif(btrim(p_patch->>'email'),'') else email end,
    header_photo_path=case when p_patch ? 'header_photo_path' then nullif(btrim(p_patch->>'header_photo_path'),'') else header_photo_path end,
    google_place_id=case when p_patch ? 'google_place_id' then nullif(btrim(p_patch->>'google_place_id'),'') else google_place_id end,
    google_photo_enabled=case when p_patch ? 'google_photo_enabled' then (p_patch->>'google_photo_enabled')::boolean else google_photo_enabled end,
    status=case when p_patch ? 'status' then (p_patch->>'status')::public.spot_status else status end
  where id=p_spot_id
  returning * into v_saved;

  insert into public.backyrd_spot_gold_authoring_audit_v1(
    spot_id,actor_id,action,subject_type,subject_id,metadata
  ) values(
    p_spot_id,(v_actor->>'actorId')::uuid,'UPDATE_PRODUCT_BASICS','SPOT',p_spot_id,
    jsonb_build_object('requestId',p_request_id,'fields',(select jsonb_agg(k order by k) from jsonb_object_keys(p_patch) k),'ui','human-spot-editor-v1.1')
  );

  return jsonb_build_object(
    'spot',to_jsonb(v_saved),
    'readiness',public.backyrd_gold_readiness_v1(p_spot_id),
    'requestId',p_request_id,
    'persisted',true
  );
end $$;

revoke all on function public.backyrd_admin_save_spot_basics_v1(uuid,jsonb,uuid) from public,anon;
grant execute on function public.backyrd_admin_save_spot_basics_v1(uuid,jsonb,uuid) to authenticated,service_role;

comment on function public.backyrd_admin_save_spot_basics_v1(uuid,jsonb,uuid) is
  'Atomic Founder/Admin Basis Spot Details persistence with canonical Basic Fact reconciliation and readiness response.';
