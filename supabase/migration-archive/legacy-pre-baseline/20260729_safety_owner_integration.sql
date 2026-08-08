-- Backyrd Safety & Integrity Engine
-- Owner integration: guaranteed DB case creation + retry-safe linkage.

create unique index if not exists idx_safety_content_unique_entity
on public.safety_content_items(content_type, entity_type, entity_id)
where entity_id is not null;

create or replace function public.safety_owner_change_text_v1(
  p_change_area text,
  p_new_data jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[] := '{}'::text[];
begin
  if p_change_area in ('profile', 'mobile_profile') then
    v_parts := array[
      nullif(trim(coalesce(p_new_data ->> 'name', '')), ''),
      nullif(trim(coalesce(p_new_data ->> 'owner_description', '')), ''),
      nullif(trim(coalesce(
        array_to_string(
          array(select jsonb_array_elements_text(coalesce(p_new_data -> 'owner_keywords', '[]'::jsonb))),
          ', '
        ),
        ''
      )), '')
    ];
  elsif p_change_area = 'intelligence' then
    v_parts := array[
      nullif(trim(coalesce(
        array_to_string(array(select jsonb_array_elements_text(coalesce(p_new_data -> 'best_for', '[]'::jsonb))), ', '),
        ''
      )), ''),
      nullif(trim(coalesce(
        array_to_string(array(select jsonb_array_elements_text(coalesce(p_new_data -> 'occasion_tags', '[]'::jsonb))), ', '),
        ''
      )), ''),
      nullif(trim(coalesce(
        array_to_string(array(select jsonb_array_elements_text(coalesce(p_new_data -> 'atmosphere_tags', '[]'::jsonb))), ', '),
        ''
      )), ''),
      nullif(trim(coalesce(
        array_to_string(array(select jsonb_array_elements_text(coalesce(p_new_data -> 'avoid_if_tags', '[]'::jsonb))), ', '),
        ''
      )), ''),
      nullif(trim(coalesce(
        array_to_string(array(select jsonb_array_elements_text(coalesce(p_new_data -> 'signature_items', '[]'::jsonb))), ', '),
        ''
      )), ''),
      nullif(trim(coalesce(p_new_data ->> 'special_notes', '')), '')
    ];
  end if;

  return nullif(
    trim(
      array_to_string(
        array(select x from unnest(v_parts) x where x is not null),
        E'\n'
      )
    ),
    ''
  );
end;
$$;

create or replace function public.safety_create_case_for_owner_change_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_type text;
  v_text text;
  v_item_id uuid;
  v_policy_id uuid;
begin
  if new.change_area not in ('profile', 'mobile_profile', 'intelligence') then
    return new;
  end if;

  v_content_type := case
    when new.change_area in ('profile', 'mobile_profile') then 'owner_spot_profile'
    else 'owner_spot_intelligence'
  end;

  v_text := public.safety_owner_change_text_v1(new.change_area, new.new_data);

  if v_text is null then
    return new;
  end if;

  select id into v_policy_id
  from public.safety_policy_versions
  where policy_key = 'backyrd-global'
    and status in ('active', 'shadow')
  order by
    case status when 'active' then 0 else 1 end,
    activated_at desc nulls last,
    created_at desc
  limit 1;

  insert into public.safety_content_items(
    content_type,
    entity_type,
    entity_id,
    spot_id,
    actor_user_id,
    locale,
    text_content,
    context,
    lifecycle_status
  )
  values(
    v_content_type,
    'spot_owner_change',
    new.id,
    new.spot_id,
    new.changed_by,
    'de-CH',
    v_text,
    jsonb_build_object(
      'surface', new.change_source,
      'change_area', new.change_area,
      'owner_change_event_id', new.id,
      'old_data', new.old_data,
      'new_data', new.new_data
    ),
    'live'
  )
  on conflict (content_type, entity_type, entity_id)
  where entity_id is not null
  do update set
    text_content = excluded.text_content,
    context = excluded.context,
    updated_at = now()
  returning id into v_item_id;

  insert into public.safety_cases(
    content_item_id,
    policy_version_id,
    case_status,
    priority
  )
  select
    v_item_id,
    v_policy_id,
    'queued',
    case
      when new.moderation_status = 'flagged' then 80
      else 50
    end
  where not exists (
    select 1
    from public.safety_cases c
    where c.content_item_id = v_item_id
  );

  return new;
end;
$$;

drop trigger if exists trg_safety_owner_change_case_v1
on public.spot_owner_change_events;

create trigger trg_safety_owner_change_case_v1
after insert on public.spot_owner_change_events
for each row
execute function public.safety_create_case_for_owner_change_v1();

create or replace function public.safety_get_case_for_owner_change_v1(
  p_owner_change_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select jsonb_build_object(
    'case_id', c.id,
    'case_status', c.case_status,
    'content_item_id', i.id,
    'content_type', i.content_type
  )
  into v_result
  from public.safety_content_items i
  join public.safety_cases c on c.content_item_id = i.id
  where i.entity_type = 'spot_owner_change'
    and i.entity_id = p_owner_change_event_id
    and (
      i.actor_user_id = auth.uid()
      or public.safety_is_admin_v1()
    )
  order by c.created_at desc
  limit 1;

  return v_result;
end;
$$;

grant execute on function public.safety_get_case_for_owner_change_v1(uuid)
to authenticated, service_role;

-- Existing events can be imported explicitly with safety_backfill_owner_changes_v1().

-- Backfill helper separated because trigger functions cannot be called directly.
create or replace function public.safety_backfill_owner_changes_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_content_type text;
  v_text text;
  v_item_id uuid;
  v_policy_id uuid;
  v_created integer := 0;
begin
  if not public.safety_is_admin_v1() then
    raise exception 'admin_required';
  end if;

  select id into v_policy_id
  from public.safety_policy_versions
  where policy_key = 'backyrd-global'
    and status in ('active', 'shadow')
  order by case status when 'active' then 0 else 1 end,
           activated_at desc nulls last,
           created_at desc
  limit 1;

  for v_event in
    select *
    from public.spot_owner_change_events
    where change_area in ('profile', 'mobile_profile', 'intelligence')
    order by created_at
  loop
    v_content_type := case
      when v_event.change_area in ('profile', 'mobile_profile') then 'owner_spot_profile'
      else 'owner_spot_intelligence'
    end;

    v_text := public.safety_owner_change_text_v1(v_event.change_area, v_event.new_data);
    if v_text is null then continue; end if;

    insert into public.safety_content_items(
      content_type, entity_type, entity_id, spot_id, actor_user_id,
      locale, text_content, context, lifecycle_status
    )
    values(
      v_content_type, 'spot_owner_change', v_event.id, v_event.spot_id,
      v_event.changed_by, 'de-CH', v_text,
      jsonb_build_object(
        'surface', v_event.change_source,
        'change_area', v_event.change_area,
        'owner_change_event_id', v_event.id,
        'old_data', v_event.old_data,
        'new_data', v_event.new_data
      ),
      'live'
    )
    on conflict (content_type, entity_type, entity_id)
    where entity_id is not null
    do update set text_content = excluded.text_content,
                  context = excluded.context,
                  updated_at = now()
    returning id into v_item_id;

    if not exists(select 1 from public.safety_cases where content_item_id = v_item_id) then
      insert into public.safety_cases(
        content_item_id, policy_version_id, case_status, priority
      )
      values(
        v_item_id, v_policy_id, 'queued',
        case when v_event.moderation_status = 'flagged' then 80 else 50 end
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'cases_created', v_created);
end;
$$;

grant execute on function public.safety_backfill_owner_changes_v1()
to authenticated, service_role;
