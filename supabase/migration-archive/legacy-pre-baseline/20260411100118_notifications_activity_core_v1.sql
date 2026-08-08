-- 20260411100118_notifications_activity_core_v1.sql
-- Notifications / Activity Core v1 für Backyrd
--
-- Ziel:
-- - zentrale Notification-Tabelle
-- - systemische Domain-Events persistieren
-- - lesbare Inbox für User
-- - read/unread Status
-- - erste automatische Notifications bei Claim-/Submission-Entscheidungen

-- ----------------------------------------
-- 1) Notifications-Tabelle
-- ----------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,

  type text not null,
  title text not null,
  body text,

  data jsonb not null default '{}'::jsonb,

  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_type_check check (
    type in (
      'spot_submission_approved',
      'spot_submission_rejected',
      'spot_claim_approved',
      'spot_claim_rejected',
      'review_received',
      'generic'
    )
  )
);

create index if not exists idx_notifications_user_id
  on public.notifications(user_id);

create index if not exists idx_notifications_created_at
  on public.notifications(created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, created_at desc)
  where read_at is null;

create index if not exists idx_notifications_type
  on public.notifications(type);

-- ----------------------------------------
-- 2) RLS
-- ----------------------------------------

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_v1(auth.uid())
);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_v1(auth.uid())
)
with check (
  user_id = auth.uid()
  or public.is_admin_v1(auth.uid())
);

drop policy if exists "notifications_insert_admin_only" on public.notifications;
create policy "notifications_insert_admin_only"
on public.notifications
for insert
to authenticated
with check (
  public.is_admin_v1(auth.uid())
);

drop policy if exists "notifications_delete_admin_only" on public.notifications;
create policy "notifications_delete_admin_only"
on public.notifications
for delete
to authenticated
using (
  public.is_admin_v1(auth.uid())
);

-- ----------------------------------------
-- 3) Helper: Notification erzeugen
-- ----------------------------------------
-- zentrale serverseitige Schreibfunktion

create or replace function public.create_notification_v1(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification public.notifications%rowtype;
  v_type text;
  v_title text;
begin
  v_type := lower(trim(p_type));
  v_title := nullif(trim(p_title), '');

  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if v_type is null then
    raise exception 'p_type is required';
  end if;

  if v_title is null then
    raise exception 'p_title is required';
  end if;

  if v_type not in (
    'spot_submission_approved',
    'spot_submission_rejected',
    'spot_claim_approved',
    'spot_claim_rejected',
    'review_received',
    'generic'
  ) then
    raise exception 'Invalid notification type';
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    data
  )
  values (
    p_user_id,
    v_type,
    v_title,
    nullif(trim(p_body), ''),
    coalesce(p_data, '{}'::jsonb)
  )
  returning *
  into v_notification;

  return jsonb_build_object(
    'id', v_notification.id,
    'user_id', v_notification.user_id,
    'type', v_notification.type,
    'title', v_notification.title,
    'body', v_notification.body,
    'data', v_notification.data,
    'read_at', v_notification.read_at,
    'created_at', v_notification.created_at
  );
end;
$$;

-- ----------------------------------------
-- 4) Inbox lesen
-- ----------------------------------------

create or replace function public.get_my_notifications_v1(
  p_unread_only boolean default false,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_limit integer;
  v_offset integer;
  result_json jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));

  with filtered as (
    select n.*
    from public.notifications n
    where n.user_id = v_user_id
      and (
        p_unread_only = false
        or n.read_at is null
      )
  ),
  total_count as (
    select count(*)::integer as total
    from filtered
  ),
  unread_count as (
    select count(*)::integer as unread_total
    from public.notifications n
    where n.user_id = v_user_id
      and n.read_at is null
  ),
  paged as (
    select *
    from filtered
    order by created_at desc
    limit v_limit
    offset v_offset
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'type', p.type,
            'title', p.title,
            'body', p.body,
            'data', p.data,
            'read_at', p.read_at,
            'created_at', p.created_at
          )
          order by p.created_at desc
        )
        from paged p
      ),
      '[]'::jsonb
    ),
    'total',
    coalesce((select total from total_count), 0),
    'unread_total',
    coalesce((select unread_total from unread_count), 0),
    'limit',
    v_limit,
    'offset',
    v_offset
  )
  into result_json;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 5) Einzelne Notification als gelesen markieren
-- ----------------------------------------

create or replace function public.mark_notification_read_v1(
  p_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_notification public.notifications%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.notifications
  set
    read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = v_user_id
  returning *
  into v_notification;

  if v_notification.id is null then
    raise exception 'Notification not found';
  end if;

  return jsonb_build_object(
    'id', v_notification.id,
    'read_at', v_notification.read_at
  );
end;
$$;

-- ----------------------------------------
-- 6) Alle Notifications als gelesen markieren
-- ----------------------------------------

create or replace function public.mark_all_notifications_read_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rows integer := 0;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.notifications
  set read_at = now()
  where user_id = v_user_id
    and read_at is null;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  return jsonb_build_object(
    'updated', v_rows
  );
end;
$$;

-- ----------------------------------------
-- 7) Unread Count
-- ----------------------------------------

create or replace function public.get_my_notification_unread_count_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select count(*)::integer
  into v_count
  from public.notifications n
  where n.user_id = v_user_id
    and n.read_at is null;

  return jsonb_build_object(
    'unread_total', coalesce(v_count, 0)
  );
end;
$$;

-- ----------------------------------------
-- 8) Claim Decision Hook
-- ----------------------------------------
-- ersetzt decide_spot_claim_v1 durch Version mit Notification

create or replace function public.decide_spot_claim_v1(
  p_claim_id uuid,
  p_decision text,
  p_decision_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_claim public.spot_claims%rowtype;
  v_decision text;
  v_spot_name text;
begin
  v_user_id := auth.uid();
  v_decision := lower(trim(p_decision));

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_admin_v1(v_user_id) is not true then
    raise exception 'Admin access required';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select sc.*, s.name as spot_name
  into v_claim
  from public.spot_claims sc
  join public.spots s on s.id = sc.spot_id
  where sc.id = p_claim_id
  limit 1;

  if v_claim.id is null then
    raise exception 'Claim not found';
  end if;

  if v_claim.status <> 'pending' then
    raise exception 'Only pending claims can be decided';
  end if;

  v_spot_name := v_claim.spot_name;

  update public.spot_claims
  set
    status = v_decision,
    reviewed_by = v_user_id,
    reviewed_at = now(),
    decision_note = nullif(trim(p_decision_note), ''),
    updated_at = now()
  where id = p_claim_id
  returning *
  into v_claim;

  if v_decision = 'approved' then
    update public.spots
    set
      owner_id = v_claim.claimant_id,
      updated_at = now()
    where id = v_claim.spot_id;

    update public.spot_claims
    set
      status = 'rejected',
      reviewed_by = v_user_id,
      reviewed_at = now(),
      decision_note = coalesce(decision_note, 'Auto-rejected because another claim was approved'),
      updated_at = now()
    where spot_id = v_claim.spot_id
      and id <> v_claim.id
      and status = 'pending';

    perform public.create_notification_v1(
      p_user_id := v_claim.claimant_id,
      p_type := 'spot_claim_approved',
      p_title := 'Dein Claim wurde bestätigt',
      p_body := coalesce('Dein Claim für "' || v_spot_name || '" wurde bestätigt.', 'Dein Claim wurde bestätigt.'),
      p_data := jsonb_build_object(
        'claim_id', v_claim.id,
        'spot_id', v_claim.spot_id,
        'status', v_claim.status
      )
    );
  else
    perform public.create_notification_v1(
      p_user_id := v_claim.claimant_id,
      p_type := 'spot_claim_rejected',
      p_title := 'Dein Claim wurde abgelehnt',
      p_body := coalesce('Dein Claim für "' || v_spot_name || '" wurde abgelehnt.', 'Dein Claim wurde abgelehnt.'),
      p_data := jsonb_build_object(
        'claim_id', v_claim.id,
        'spot_id', v_claim.spot_id,
        'status', v_claim.status
      )
    );
  end if;

  return jsonb_build_object(
    'claim', jsonb_build_object(
      'id', v_claim.id,
      'spot_id', v_claim.spot_id,
      'claimant_id', v_claim.claimant_id,
      'status', v_claim.status,
      'reviewed_by', v_claim.reviewed_by,
      'reviewed_at', v_claim.reviewed_at,
      'decision_note', v_claim.decision_note
    )
  );
end;
$$;

-- ----------------------------------------
-- 9) Submission Decision Hook
-- ----------------------------------------
-- ersetzt decide_spot_submission_v1 durch Version mit Notification

create or replace function public.decide_spot_submission_v1(
  p_spot_id uuid,
  p_decision text,
  p_moderation_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_decision text;
  v_spot public.spots%rowtype;
begin
  v_user_id := auth.uid();
  v_decision := lower(trim(p_decision));

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_admin_v1(v_user_id) is not true then
    raise exception 'Admin access required';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select *
  into v_spot
  from public.spots s
  where s.id = p_spot_id
  limit 1;

  if v_spot.id is null then
    raise exception 'Spot not found';
  end if;

  if v_decision = 'approved' then
    update public.spots
    set
      status = 'approved',
      approved_at = now(),
      approved_by = v_user_id,
      rejected_at = null,
      rejected_by = null,
      moderation_note = nullif(trim(p_moderation_note), ''),
      updated_at = now()
    where id = p_spot_id
    returning *
    into v_spot;

    if v_spot.created_by is not null then
      perform public.create_notification_v1(
        p_user_id := v_spot.created_by,
        p_type := 'spot_submission_approved',
        p_title := 'Dein Spot wurde freigegeben',
        p_body := coalesce('Dein eingereichter Spot "' || v_spot.name || '" wurde freigegeben.', 'Dein Spot wurde freigegeben.'),
        p_data := jsonb_build_object(
          'spot_id', v_spot.id,
          'status', v_spot.status
        )
      );
    end if;
  else
    update public.spots
    set
      status = 'rejected',
      rejected_at = now(),
      rejected_by = v_user_id,
      approved_at = null,
      approved_by = null,
      moderation_note = nullif(trim(p_moderation_note), ''),
      updated_at = now()
    where id = p_spot_id
    returning *
    into v_spot;

    if v_spot.created_by is not null then
      perform public.create_notification_v1(
        p_user_id := v_spot.created_by,
        p_type := 'spot_submission_rejected',
        p_title := 'Dein Spot wurde nicht freigegeben',
        p_body := coalesce('Dein eingereichter Spot "' || v_spot.name || '" wurde nicht freigegeben.', 'Dein Spot wurde nicht freigegeben.'),
        p_data := jsonb_build_object(
          'spot_id', v_spot.id,
          'status', v_spot.status
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'spot', jsonb_build_object(
      'id', v_spot.id,
      'name', v_spot.name,
      'slug', v_spot.slug,
      'status', v_spot.status,
      'approved_at', v_spot.approved_at,
      'approved_by', v_spot.approved_by,
      'rejected_at', v_spot.rejected_at,
      'rejected_by', v_spot.rejected_by,
      'moderation_note', v_spot.moderation_note,
      'updated_at', v_spot.updated_at
    )
  );
end;
$$;