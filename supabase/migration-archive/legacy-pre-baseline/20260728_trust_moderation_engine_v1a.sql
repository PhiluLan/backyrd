-- Backyrd Trust & Moderation Engine V1A
-- Additiv: bestehende Claim- und Owner-RPCs bleiben erhalten.

create table if not exists public.spot_owner_change_events (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  changed_by uuid not null references public.profiles(id) on delete cascade,
  change_area text not null,
  change_source text not null default 'unknown',
  old_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  moderation_status text not null default 'pending',
  risk_flags text[] not null default '{}'::text[],
  validation_warnings text[] not null default '{}'::text[],
  moderation_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reverted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint spot_owner_change_events_area_check
    check (change_area in ('profile','intelligence','taxonomy','mobile_profile')),
  constraint spot_owner_change_events_status_check
    check (moderation_status in ('pending','approved','flagged','reverted'))
);

create index if not exists idx_spot_owner_change_events_status_created
  on public.spot_owner_change_events(moderation_status, created_at desc);
create index if not exists idx_spot_owner_change_events_spot_created
  on public.spot_owner_change_events(spot_id, created_at desc);
create index if not exists idx_spot_owner_change_events_changed_by
  on public.spot_owner_change_events(changed_by, created_at desc);

alter table public.spot_owner_change_events enable row level security;

drop policy if exists "owner_changes_select_own_or_admin" on public.spot_owner_change_events;
create policy "owner_changes_select_own_or_admin"
on public.spot_owner_change_events
for select
to authenticated
using (
  changed_by = auth.uid()
  or public.is_admin_v1(auth.uid()) is true
);

revoke all on table public.spot_owner_change_events from anon;
grant select on table public.spot_owner_change_events to authenticated;
grant all on table public.spot_owner_change_events to service_role;

create or replace function public.backyrd_normalize_owner_email_v1(p_value text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(p_value, ''))), '');
$$;

create or replace function public.backyrd_normalize_owner_website_v1(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text := nullif(trim(coalesce(p_value, '')), '');
begin
  if v is null then return null; end if;
  if v !~* '^https?://' then v := 'https://' || v; end if;
  return v;
end;
$$;

create or replace function public.backyrd_normalize_owner_phone_v1(
  p_value text,
  p_country text default 'Schweiz'
)
returns text
language plpgsql
immutable
as $$
declare
  v text := nullif(trim(coalesce(p_value, '')), '');
  digits text;
begin
  if v is null then return null; end if;

  v := regexp_replace(v, '[^0-9+]', '', 'g');
  if left(v, 2) = '00' then v := '+' || substr(v, 3); end if;

  if lower(coalesce(p_country, '')) in ('schweiz','switzerland','ch','suisse','svizzera') then
    if left(v, 1) = '0' and left(v, 2) <> '00' then
      v := '+41' || substr(v, 2);
    end if;
  end if;

  return v;
end;
$$;

create or replace function public.backyrd_owner_text_risk_flags_v1(p_values text[])
returns text[]
language plpgsql
immutable
as $$
declare
  v_text text := lower(array_to_string(coalesce(p_values, '{}'::text[]), ' '));
  v_flags text[] := '{}'::text[];
begin
  if length(v_text) > 6000 then
    v_flags := array_append(v_flags, 'very_long_content');
  end if;

  if v_text ~ '(https?://|www\.)' then
    v_flags := array_append(v_flags, 'external_link_in_content');
  end if;

  if v_text ~ '(fuck|fucking|arschloch|hurensohn|verpiss|scheiss[e]?|bastard)' then
    v_flags := array_append(v_flags, 'possible_abusive_language');
  end if;

  return v_flags;
end;
$$;

create or replace function public.validate_owner_spot_contact_v1(
  p_email text default null,
  p_phone text default null,
  p_website text default null,
  p_country text default 'Schweiz'
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_email text := public.backyrd_normalize_owner_email_v1(p_email);
  v_phone text := public.backyrd_normalize_owner_phone_v1(p_phone, p_country);
  v_website text := public.backyrd_normalize_owner_website_v1(p_website);
  v_errors text[] := '{}'::text[];
  v_warnings text[] := '{}'::text[];
  v_phone_digits text;
begin
  if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,63}$' then
    v_errors := array_append(v_errors, 'email_invalid');
  end if;

  if v_website is not null and v_website !~* '^https?://([a-z0-9-]+\.)+[a-z]{2,63}([/:?#].*)?$' then
    v_errors := array_append(v_errors, 'website_invalid');
  end if;

  if v_phone is not null then
    v_phone_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');

    if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
      v_errors := array_append(v_errors, 'phone_invalid');
    elsif left(v_phone, 3) = '+41' and length(v_phone_digits) <> 11 then
      v_errors := array_append(v_errors, 'phone_ch_length_invalid');
    elsif left(v_phone, 3) <> '+41'
      and lower(coalesce(p_country, '')) in ('schweiz','switzerland','ch','suisse','svizzera') then
      v_warnings := array_append(v_warnings, 'phone_country_mismatch');
    end if;
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_errors) = 0,
    'errors', v_errors,
    'warnings', v_warnings,
    'normalized', jsonb_build_object(
      'email', v_email,
      'phone', v_phone,
      'website', v_website
    )
  );
end;
$$;

create or replace function public.update_owner_spot_profile_moderated_v1(
  p_spot_id uuid,
  p_name text,
  p_address text default null,
  p_city text default null,
  p_country text default null,
  p_phone text default null,
  p_website text default null,
  p_email text default null,
  p_price_level integer default null,
  p_owner_description text default null,
  p_owner_keywords text[] default '{}'::text[],
  p_change_source text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_validation jsonb;
  v_old jsonb;
  v_new jsonb;
  v_detail jsonb;
  v_flags text[];
  v_event_id uuid;
  v_status text;
begin
  perform public.backyrd_owner_assert_spot_v1(p_spot_id);

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'owner_validation:name_required';
  end if;

  v_validation := public.validate_owner_spot_contact_v1(
    p_email, p_phone, p_website, p_country
  );

  if coalesce((v_validation ->> 'ok')::boolean, false) is not true then
    raise exception 'owner_validation:%', array_to_string(
      array(select jsonb_array_elements_text(v_validation -> 'errors')), ','
    );
  end if;

  select jsonb_build_object(
    'name', s.name, 'address', s.address, 'city', s.city, 'country', s.country,
    'phone', s.phone, 'website', s.website, 'email', s.email,
    'price_level', s.price_level,
    'owner_description', sd.owner_description,
    'owner_keywords', coalesce(sd.owner_keywords, '{}'::text[])
  )
  into v_old
  from public.spots s
  left join public.spot_descriptions sd on sd.spot_id = s.id
  where s.id = p_spot_id;

  v_detail := public.update_owner_spot_profile_v1(
    p_spot_id,
    p_name,
    p_address,
    p_city,
    p_country,
    v_validation #>> '{normalized,phone}',
    v_validation #>> '{normalized,website}',
    v_validation #>> '{normalized,email}',
    p_price_level,
    p_owner_description,
    coalesce(p_owner_keywords, '{}'::text[])
  );

  select jsonb_build_object(
    'name', s.name, 'address', s.address, 'city', s.city, 'country', s.country,
    'phone', s.phone, 'website', s.website, 'email', s.email,
    'price_level', s.price_level,
    'owner_description', sd.owner_description,
    'owner_keywords', coalesce(sd.owner_keywords, '{}'::text[])
  )
  into v_new
  from public.spots s
  left join public.spot_descriptions sd on sd.spot_id = s.id
  where s.id = p_spot_id;

  v_flags := public.backyrd_owner_text_risk_flags_v1(array[
    p_name, p_address, p_city, p_country, p_owner_description,
    array_to_string(coalesce(p_owner_keywords, '{}'::text[]), ' ')
  ]);
  v_status := case when cardinality(v_flags) > 0 then 'flagged' else 'pending' end;

  insert into public.spot_owner_change_events(
    spot_id, changed_by, change_area, change_source,
    old_data, new_data, moderation_status, risk_flags, validation_warnings
  )
  values (
    p_spot_id, auth.uid(), 'profile', coalesce(nullif(trim(p_change_source), ''), 'unknown'),
    coalesce(v_old, '{}'::jsonb), coalesce(v_new, '{}'::jsonb),
    v_status, v_flags,
    array(select jsonb_array_elements_text(v_validation -> 'warnings'))
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_event_id,
    'moderation_status', v_status,
    'risk_flags', v_flags,
    'validation', v_validation,
    'detail', v_detail
  );
end;
$$;

create or replace function public.update_owner_spot_intelligence_moderated_v1(
  p_spot_id uuid,
  p_best_for text[] default '{}'::text[],
  p_occasion_tags text[] default '{}'::text[],
  p_atmosphere_tags text[] default '{}'::text[],
  p_avoid_if_tags text[] default '{}'::text[],
  p_good_for_time text[] default '{}'::text[],
  p_noise_level text default null,
  p_crowd_type text[] default '{}'::text[],
  p_dress_code text default null,
  p_reservation_recommended boolean default null,
  p_average_duration_minutes integer default null,
  p_signature_items text[] default '{}'::text[],
  p_special_notes text default null,
  p_change_source text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_detail jsonb;
  v_flags text[];
  v_status text;
  v_event_id uuid;
begin
  perform public.backyrd_owner_assert_spot_v1(p_spot_id);

  select to_jsonb(si) - 'spot_id'
  into v_old
  from public.spot_intelligence_v1 si
  where si.spot_id = p_spot_id;

  v_detail := public.update_owner_spot_intelligence_v1(
    p_spot_id, p_best_for, p_occasion_tags, p_atmosphere_tags,
    p_avoid_if_tags, p_good_for_time, p_noise_level, p_crowd_type,
    p_dress_code, p_reservation_recommended, p_average_duration_minutes,
    p_signature_items, p_special_notes
  );

  select to_jsonb(si) - 'spot_id'
  into v_new
  from public.spot_intelligence_v1 si
  where si.spot_id = p_spot_id;

  v_flags := public.backyrd_owner_text_risk_flags_v1(array[
    array_to_string(coalesce(p_best_for, '{}'::text[]), ' '),
    array_to_string(coalesce(p_occasion_tags, '{}'::text[]), ' '),
    array_to_string(coalesce(p_atmosphere_tags, '{}'::text[]), ' '),
    array_to_string(coalesce(p_avoid_if_tags, '{}'::text[]), ' '),
    array_to_string(coalesce(p_good_for_time, '{}'::text[]), ' '),
    p_noise_level,
    array_to_string(coalesce(p_crowd_type, '{}'::text[]), ' '),
    p_dress_code,
    array_to_string(coalesce(p_signature_items, '{}'::text[]), ' '),
    p_special_notes
  ]);
  v_status := case when cardinality(v_flags) > 0 then 'flagged' else 'pending' end;

  insert into public.spot_owner_change_events(
    spot_id, changed_by, change_area, change_source,
    old_data, new_data, moderation_status, risk_flags
  )
  values (
    p_spot_id, auth.uid(), 'intelligence',
    coalesce(nullif(trim(p_change_source), ''), 'unknown'),
    coalesce(v_old, '{}'::jsonb), coalesce(v_new, '{}'::jsonb),
    v_status, v_flags
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_event_id,
    'moderation_status', v_status,
    'risk_flags', v_flags,
    'detail', v_detail
  );
end;
$$;

create or replace function public.set_owner_spot_taxonomies_moderated_v1(
  p_spot_id uuid,
  p_taxonomy_node_ids uuid[],
  p_change_source text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_result jsonb;
  v_event_id uuid;
begin
  perform public.backyrd_owner_assert_spot_v1(p_spot_id);

  select coalesce(jsonb_agg(st.taxonomy_node_id order by st.taxonomy_node_id), '[]'::jsonb)
  into v_old
  from public.spot_taxonomies st
  where st.spot_id = p_spot_id and st.source = 'owner';

  v_result := public.set_owner_spot_taxonomies_v1(p_spot_id, p_taxonomy_node_ids);

  select coalesce(jsonb_agg(st.taxonomy_node_id order by st.taxonomy_node_id), '[]'::jsonb)
  into v_new
  from public.spot_taxonomies st
  where st.spot_id = p_spot_id and st.source = 'owner';

  insert into public.spot_owner_change_events(
    spot_id, changed_by, change_area, change_source,
    old_data, new_data, moderation_status
  )
  values (
    p_spot_id, auth.uid(), 'taxonomy',
    coalesce(nullif(trim(p_change_source), ''), 'unknown'),
    jsonb_build_object('taxonomy_node_ids', coalesce(v_old, '[]'::jsonb)),
    jsonb_build_object('taxonomy_node_ids', coalesce(v_new, '[]'::jsonb)),
    'pending'
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true, 'event_id', v_event_id,
    'moderation_status', 'pending', 'result', v_result
  );
end;
$$;

create or replace function public.update_owner_spot_mobile_moderated_v1(
  p_spot_id uuid,
  p_category_id uuid default null,
  p_price_level integer default null,
  p_email text default null,
  p_phone text default null,
  p_website text default null,
  p_owner_description text default null,
  p_owner_keywords text[] default '{}'::text[],
  p_change_source text default 'mobile'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spot public.spots%rowtype;
  v_validation jsonb;
  v_old jsonb;
  v_new jsonb;
  v_flags text[];
  v_status text;
  v_event_id uuid;
begin
  perform public.backyrd_owner_assert_spot_v1(p_spot_id);

  select * into v_spot from public.spots where id = p_spot_id;
  if v_spot.id is null then raise exception 'Spot not found'; end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id
  ) then
    raise exception 'owner_validation:category_invalid';
  end if;

  v_validation := public.validate_owner_spot_contact_v1(
    p_email, p_phone, p_website, v_spot.country
  );

  if coalesce((v_validation ->> 'ok')::boolean, false) is not true then
    raise exception 'owner_validation:%', array_to_string(
      array(select jsonb_array_elements_text(v_validation -> 'errors')), ','
    );
  end if;

  select jsonb_build_object(
    'category_id', s.category_id, 'price_level', s.price_level,
    'email', s.email, 'phone', s.phone, 'website', s.website,
    'owner_description', sd.owner_description,
    'owner_keywords', coalesce(sd.owner_keywords, '{}'::text[])
  )
  into v_old
  from public.spots s
  left join public.spot_descriptions sd on sd.spot_id = s.id
  where s.id = p_spot_id;

  update public.spots
  set category_id = coalesce(p_category_id, category_id),
      price_level = case when p_price_level is null then price_level else greatest(1, least(p_price_level, 4)) end,
      email = v_validation #>> '{normalized,email}',
      phone = v_validation #>> '{normalized,phone}',
      website = v_validation #>> '{normalized,website}'
  where id = p_spot_id;

  insert into public.spot_descriptions(
    spot_id, owner_user_id, owner_description, owner_keywords,
    owner_updated_at, content_status, updated_at
  )
  values(
    p_spot_id, auth.uid(),
    nullif(trim(coalesce(p_owner_description, '')), ''),
    coalesce(p_owner_keywords, '{}'::text[]),
    now(), 'draft', now()
  )
  on conflict (spot_id) do update set
    owner_user_id = auth.uid(),
    owner_description = excluded.owner_description,
    owner_keywords = excluded.owner_keywords,
    owner_updated_at = now(),
    updated_at = now();

  select jsonb_build_object(
    'category_id', s.category_id, 'price_level', s.price_level,
    'email', s.email, 'phone', s.phone, 'website', s.website,
    'owner_description', sd.owner_description,
    'owner_keywords', coalesce(sd.owner_keywords, '{}'::text[])
  )
  into v_new
  from public.spots s
  left join public.spot_descriptions sd on sd.spot_id = s.id
  where s.id = p_spot_id;

  v_flags := public.backyrd_owner_text_risk_flags_v1(array[
    p_owner_description,
    array_to_string(coalesce(p_owner_keywords, '{}'::text[]), ' ')
  ]);
  v_status := case when cardinality(v_flags) > 0 then 'flagged' else 'pending' end;

  insert into public.spot_owner_change_events(
    spot_id, changed_by, change_area, change_source,
    old_data, new_data, moderation_status, risk_flags, validation_warnings
  )
  values(
    p_spot_id, auth.uid(), 'mobile_profile',
    coalesce(nullif(trim(p_change_source), ''), 'mobile'),
    v_old, v_new, v_status, v_flags,
    array(select jsonb_array_elements_text(v_validation -> 'warnings'))
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_event_id,
    'moderation_status', v_status,
    'risk_flags', v_flags,
    'validation', v_validation,
    'detail', public.get_owner_spot_detail_v1(p_spot_id)
  );
end;
$$;

create or replace function public.admin_get_spot_owner_moderation_queue_v1(
  p_status text default null,
  p_limit integer default 200
)
returns table(
  event_id uuid,
  spot_id uuid,
  spot_name text,
  changed_by uuid,
  changed_by_name text,
  change_area text,
  change_source text,
  old_data jsonb,
  new_data jsonb,
  moderation_status text,
  risk_flags text[],
  validation_warnings text[],
  moderation_note text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if public.is_admin_v1(auth.uid()) is not true then raise exception 'admin_required'; end if;

  return query
  select
    e.id, e.spot_id, s.name, e.changed_by,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.display_name, p.username, e.changed_by::text),
    e.change_area, e.change_source, e.old_data, e.new_data,
    e.moderation_status, e.risk_flags, e.validation_warnings,
    e.moderation_note, e.created_at
  from public.spot_owner_change_events e
  join public.spots s on s.id = e.spot_id
  left join public.profiles p on p.id = e.changed_by
  where p_status is null or e.moderation_status = lower(trim(p_status))
  order by
    case when e.moderation_status = 'flagged' then 0 else 1 end,
    e.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;

create or replace function public.admin_review_spot_owner_change_v1(
  p_event_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.spot_owner_change_events%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if public.is_admin_v1(auth.uid()) is not true then raise exception 'admin_required'; end if;
  if v_decision not in ('approved','flagged','reverted') then
    raise exception 'invalid_decision';
  end if;

  select * into v_event
  from public.spot_owner_change_events
  where id = p_event_id
  for update;

  if v_event.id is null then raise exception 'change_event_not_found'; end if;

  if v_decision = 'reverted' then
    if v_event.change_area in ('profile','mobile_profile') then
      update public.spots set
        name = coalesce(v_event.old_data ->> 'name', name),
        address = case when v_event.old_data ? 'address' then nullif(v_event.old_data ->> 'address','') else address end,
        city = case when v_event.old_data ? 'city' then nullif(v_event.old_data ->> 'city','') else city end,
        country = case when v_event.old_data ? 'country' then nullif(v_event.old_data ->> 'country','') else country end,
        category_id = case when v_event.old_data ? 'category_id' and nullif(v_event.old_data ->> 'category_id','') is not null then (v_event.old_data ->> 'category_id')::uuid else category_id end,
        phone = case when v_event.old_data ? 'phone' then nullif(v_event.old_data ->> 'phone','') else phone end,
        website = case when v_event.old_data ? 'website' then nullif(v_event.old_data ->> 'website','') else website end,
        email = case when v_event.old_data ? 'email' then nullif(v_event.old_data ->> 'email','') else email end,
        price_level = case when v_event.old_data ? 'price_level' and (v_event.old_data ->> 'price_level') is not null then (v_event.old_data ->> 'price_level')::integer else price_level end
      where id = v_event.spot_id;

      if v_event.old_data ? 'owner_description' then
        update public.spot_descriptions set
          owner_description = nullif(v_event.old_data ->> 'owner_description',''),
          owner_keywords = coalesce(
            array(select jsonb_array_elements_text(v_event.old_data -> 'owner_keywords')),
            '{}'::text[]
          ),
          updated_at = now()
        where spot_id = v_event.spot_id;
      end if;
    elsif v_event.change_area = 'intelligence' then
      update public.spot_intelligence_v1 set
        best_for = coalesce(array(select jsonb_array_elements_text(v_event.old_data -> 'best_for')), '{}'::text[]),
        occasion_tags = coalesce(array(select jsonb_array_elements_text(v_event.old_data -> 'occasion_tags')), '{}'::text[]),
        atmosphere_tags = coalesce(array(select jsonb_array_elements_text(v_event.old_data -> 'atmosphere_tags')), '{}'::text[]),
        avoid_if_tags = coalesce(array(select jsonb_array_elements_text(v_event.old_data -> 'avoid_if_tags')), '{}'::text[]),
        good_for_time = coalesce(array(select jsonb_array_elements_text(v_event.old_data -> 'good_for_time')), '{}'::text[]),
        noise_level = nullif(v_event.old_data ->> 'noise_level',''),
        crowd_type = coalesce(array(select jsonb_array_elements_text(v_event.old_data -> 'crowd_type')), '{}'::text[]),
        dress_code = nullif(v_event.old_data ->> 'dress_code',''),
        reservation_recommended = case when v_event.old_data ? 'reservation_recommended' then (v_event.old_data ->> 'reservation_recommended')::boolean else null end,
        average_duration_minutes = case when nullif(v_event.old_data ->> 'average_duration_minutes','') is not null then (v_event.old_data ->> 'average_duration_minutes')::integer else null end,
        signature_items = coalesce(array(select jsonb_array_elements_text(v_event.old_data -> 'signature_items')), '{}'::text[]),
        special_notes = nullif(v_event.old_data ->> 'special_notes',''),
        updated_by = auth.uid(),
        updated_at = now()
      where spot_id = v_event.spot_id;
    elsif v_event.change_area = 'taxonomy' then
      select coalesce(array_agg(x::uuid), '{}'::uuid[])
      into v_ids
      from jsonb_array_elements_text(v_event.old_data -> 'taxonomy_node_ids') x;

      delete from public.spot_taxonomies
      where spot_id = v_event.spot_id and source = 'owner';

      insert into public.spot_taxonomies(
        spot_id, taxonomy_node_id, source, confidence,
        is_verified, created_by, verified_by, verified_at
      )
      select v_event.spot_id, unnest(v_ids), 'owner', 1.000, true,
             auth.uid(), auth.uid(), now();
    end if;
  end if;

  update public.spot_owner_change_events set
    moderation_status = v_decision,
    moderation_note = nullif(trim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    reverted_at = case when v_decision = 'reverted' then now() else reverted_at end
  where id = p_event_id;

  return jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'decision', v_decision
  );
end;
$$;

revoke all on function public.update_owner_spot_profile_moderated_v1(uuid,text,text,text,text,text,text,text,integer,text,text[],text) from public;
grant execute on function public.update_owner_spot_profile_moderated_v1(uuid,text,text,text,text,text,text,text,integer,text,text[],text) to authenticated, service_role;

revoke all on function public.update_owner_spot_intelligence_moderated_v1(uuid,text[],text[],text[],text[],text[],text,text[],text,boolean,integer,text[],text,text) from public;
grant execute on function public.update_owner_spot_intelligence_moderated_v1(uuid,text[],text[],text[],text[],text[],text,text[],text,boolean,integer,text[],text,text) to authenticated, service_role;

revoke all on function public.set_owner_spot_taxonomies_moderated_v1(uuid,uuid[],text) from public;
grant execute on function public.set_owner_spot_taxonomies_moderated_v1(uuid,uuid[],text) to authenticated, service_role;

revoke all on function public.update_owner_spot_mobile_moderated_v1(uuid,uuid,integer,text,text,text,text,text[],text) from public;
grant execute on function public.update_owner_spot_mobile_moderated_v1(uuid,uuid,integer,text,text,text,text,text[],text) to authenticated, service_role;

revoke all on function public.admin_get_spot_owner_moderation_queue_v1(text,integer) from public;
grant execute on function public.admin_get_spot_owner_moderation_queue_v1(text,integer) to authenticated, service_role;

revoke all on function public.admin_review_spot_owner_change_v1(uuid,text,text) from public;
grant execute on function public.admin_review_spot_owner_change_v1(uuid,text,text) to authenticated, service_role;
