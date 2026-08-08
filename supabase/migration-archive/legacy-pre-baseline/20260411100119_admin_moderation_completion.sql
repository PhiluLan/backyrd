-- 20260411100119_admin_moderation_completion.sql
-- Admin Moderation Completion für Backyrd
--
-- Ziel:
-- - Reviews moderierbar machen
-- - zentrale Admin Queues erweitern
-- - Dashboard Summary für Admin bereitstellen
-- - Moderation serverseitig vereinheitlichen

-- ----------------------------------------
-- 1) Review Moderation Felder
-- ----------------------------------------

alter table public.reviews
  add column if not exists moderation_status text not null default 'visible';

alter table public.reviews
  add column if not exists moderated_at timestamptz;

alter table public.reviews
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null;

alter table public.reviews
  add column if not exists moderation_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reviews_moderation_status_check'
  ) then
    alter table public.reviews
      add constraint reviews_moderation_status_check
      check (
        moderation_status in ('visible', 'hidden', 'flagged')
      );
  end if;
end
$$;

create index if not exists idx_reviews_moderation_status
  on public.reviews(moderation_status);

create index if not exists idx_reviews_moderated_at
  on public.reviews(moderated_at desc);

create index if not exists idx_reviews_moderated_by
  on public.reviews(moderated_by);

-- ----------------------------------------
-- 2) Spot Detail RPC erweitern:
-- nur sichtbare Reviews öffentlich ausliefern
-- ----------------------------------------
-- ersetzt bestehende Funktion aus rpc_core.sql

create or replace function public.get_spot_detail_v1(p_spot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  spot_json jsonb;
  photos_json jsonb;
  reviews_json jsonb;
  moods_json jsonb;
begin
  select jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'slug', s.slug,
    'address', s.address,
    'city', s.city,
    'country', s.country,
    'lat', s.lat,
    'lng', s.lng,
    'description', s.description,
    'website', s.website,
    'phone', s.phone,
    'email', s.email,
    'price_level', s.price_level,
    'header_photo_path', s.header_photo_path,
    'status', s.status,
    'owner_id', s.owner_id,
    'created_by', s.created_by,
    'review_count', (
      select count(*)::integer
      from public.reviews rx
      where rx.spot_id = s.id
        and rx.moderation_status = 'visible'
    ),
    'category', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug,
      'icon', c.icon,
      'color', c.color
    )
  )
  into spot_json
  from public.spots s
  left join public.categories c on c.id = s.category_id
  where s.id = p_spot_id
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sp.id,
        'url', sp.url,
        'created_at', sp.created_at
      )
      order by sp.created_at desc
    ),
    '[]'::jsonb
  )
  into photos_json
  from public.spot_photos sp
  where sp.spot_id = p_spot_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'text', r.text,
        'mood_a', r.mood_a,
        'mood_b', r.mood_b,
        'moderation_status', r.moderation_status,
        'created_at', r.created_at,
        'user', jsonb_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'avatar_url', p.avatar_url
        ),
        'photos', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', rp.id,
                'url', rp.url,
                'created_at', rp.created_at
              )
              order by rp.created_at asc
            ),
            '[]'::jsonb
          )
          from public.review_photos rp
          where rp.review_id = r.id
        )
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into reviews_json
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  where r.spot_id = p_spot_id
    and r.moderation_status = 'visible';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'mood_id', sm.mood_id,
        'token', mt.token,
        'mood_count', sm.mood_count,
        'rank', sm.rank
      )
      order by sm.rank asc nulls last, sm.mood_count desc
    ),
    '[]'::jsonb
  )
  into moods_json
  from public.spot_moods sm
  join public.mood_tokens mt on mt.id = sm.mood_id
  where sm.spot_id = p_spot_id;

  return jsonb_build_object(
    'spot', coalesce(spot_json, '{}'::jsonb),
    'photos', coalesce(photos_json, '[]'::jsonb),
    'reviews', coalesce(reviews_json, '[]'::jsonb),
    'top_moods', coalesce(moods_json, '[]'::jsonb)
  );
end;
$$;

-- ----------------------------------------
-- 3) Review moderieren
-- ----------------------------------------
-- visible / hidden / flagged

create or replace function public.moderate_review_v1(
  p_review_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
  v_review public.reviews%rowtype;
begin
  v_user_id := auth.uid();
  v_status := lower(trim(p_status));

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_admin_v1(v_user_id) is not true then
    raise exception 'Admin access required';
  end if;

  if v_status not in ('visible', 'hidden', 'flagged') then
    raise exception 'Invalid moderation status';
  end if;

  update public.reviews
  set
    moderation_status = v_status,
    moderated_at = now(),
    moderated_by = v_user_id,
    moderation_note = nullif(trim(p_note), ''),
    updated_at = now()
  where id = p_review_id
  returning *
  into v_review;

  if v_review.id is null then
    raise exception 'Review not found';
  end if;

  perform public.refresh_spot_moods_v1(v_review.spot_id);

  return jsonb_build_object(
    'review', jsonb_build_object(
      'id', v_review.id,
      'spot_id', v_review.spot_id,
      'user_id', v_review.user_id,
      'moderation_status', v_review.moderation_status,
      'moderated_at', v_review.moderated_at,
      'moderated_by', v_review.moderated_by,
      'moderation_note', v_review.moderation_note,
      'updated_at', v_review.updated_at
    )
  );
end;
$$;

-- ----------------------------------------
-- 4) Review Queue für Admin
-- ----------------------------------------

create or replace function public.get_review_moderation_queue_v1(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
  v_limit integer;
  v_offset integer;
  result_json jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_admin_v1(v_user_id) is not true then
    raise exception 'Admin access required';
  end if;

  v_status := nullif(lower(trim(p_status)), '');
  v_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));

  if v_status is not null and v_status not in ('visible', 'hidden', 'flagged') then
    raise exception 'Invalid status filter';
  end if;

  with filtered as (
    select
      r.*,
      s.name as spot_name,
      s.slug as spot_slug,
      s.city as spot_city,
      p.first_name,
      p.last_name,
      p.full_name,
      p.avatar_url
    from public.reviews r
    join public.spots s on s.id = r.spot_id
    left join public.profiles p on p.id = r.user_id
    where (
      v_status is null
      or r.moderation_status = v_status
    )
  ),
  total_count as (
    select count(*)::integer as total
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by
      case
        when moderation_status = 'flagged' then 0
        when moderation_status = 'hidden' then 1
        else 2
      end,
      created_at desc
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
            'spot_id', p.spot_id,
            'user_id', p.user_id,
            'text', p.text,
            'mood_a', p.mood_a,
            'mood_b', p.mood_b,
            'city', p.city,
            'moderation_status', p.moderation_status,
            'moderated_at', p.moderated_at,
            'moderated_by', p.moderated_by,
            'moderation_note', p.moderation_note,
            'created_at', p.created_at,
            'updated_at', p.updated_at,
            'spot', jsonb_build_object(
              'id', p.spot_id,
              'name', p.spot_name,
              'slug', p.spot_slug,
              'city', p.spot_city
            ),
            'author', case
              when p.user_id is null then null
              else jsonb_build_object(
                'id', p.user_id,
                'first_name', p.first_name,
                'last_name', p.last_name,
                'full_name', p.full_name,
                'avatar_url', p.avatar_url
              )
            end,
            'photos', (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'id', rp.id,
                    'url', rp.url,
                    'created_at', rp.created_at
                  )
                  order by rp.created_at asc
                ),
                '[]'::jsonb
              )
              from public.review_photos rp
              where rp.review_id = p.id
            )
          )
          order by
            case
              when p.moderation_status = 'flagged' then 0
              when p.moderation_status = 'hidden' then 1
              else 2
            end,
            p.created_at desc
        )
        from paged p
      ),
      '[]'::jsonb
    ),
    'total',
    coalesce((select total from total_count), 0),
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
-- 5) Spot Submission Queue erweitern
-- ----------------------------------------
-- ergänzt review_count + claim_count + creator basics

create or replace function public.get_spot_submission_queue_v1(
  p_status text default 'pending',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
  v_limit integer;
  v_offset integer;
  result_json jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_admin_v1(v_user_id) is not true then
    raise exception 'Admin access required';
  end if;

  v_status := nullif(lower(trim(p_status)), '');
  v_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));

  if v_status is not null and v_status not in ('pending', 'approved', 'rejected', 'archived') then
    raise exception 'Invalid status filter';
  end if;

  with filtered as (
    select
      s.*,
      c.slug as category_slug,
      c.name as category_name,
      p.first_name,
      p.last_name,
      p.full_name,
      p.avatar_url,
      (
        select count(*)::integer
        from public.reviews r
        where r.spot_id = s.id
          and r.moderation_status = 'visible'
      ) as review_count,
      (
        select count(*)::integer
        from public.spot_claims sc
        where sc.spot_id = s.id
      ) as claim_count
    from public.spots s
    left join public.categories c on c.id = s.category_id
    left join public.profiles p on p.id = s.created_by
    where (
      v_status is null
      or s.status = v_status
    )
  ),
  total_count as (
    select count(*)::integer as total
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by
      case when status = 'pending' then 0 else 1 end,
      created_at desc
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
            'name', p.name,
            'slug', p.slug,
            'address', p.address,
            'city', p.city,
            'country', p.country,
            'status', p.status,
            'category', case
              when p.category_name is null then null
              else jsonb_build_object(
                'slug', p.category_slug,
                'name', p.category_name
              )
            end,
            'submitted_via', p.submitted_via,
            'submission_note', p.submission_note,
            'moderation_note', p.moderation_note,
            'approved_at', p.approved_at,
            'approved_by', p.approved_by,
            'rejected_at', p.rejected_at,
            'rejected_by', p.rejected_by,
            'review_count', p.review_count,
            'claim_count', p.claim_count,
            'created_at', p.created_at,
            'updated_at', p.updated_at,
            'creator', case
              when p.created_by is null then null
              else jsonb_build_object(
                'id', p.created_by,
                'first_name', p.first_name,
                'last_name', p.last_name,
                'full_name', p.full_name,
                'avatar_url', p.avatar_url
              )
            end
          )
          order by
            case when p.status = 'pending' then 0 else 1 end,
            p.created_at desc
        )
        from paged p
      ),
      '[]'::jsonb
    ),
    'total',
    coalesce((select total from total_count), 0),
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
-- 6) Claim Queue erweitern
-- ----------------------------------------
-- ergänzt Spot-/Claim-Kontext

create or replace function public.get_claim_queue_v1(
  p_status text default 'pending',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
  v_limit integer;
  v_offset integer;
  result_json jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_admin_v1(v_user_id) is not true then
    raise exception 'Admin access required';
  end if;

  v_status := nullif(lower(trim(p_status)), '');
  v_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));

  if v_status is not null and v_status not in ('pending', 'approved', 'rejected', 'withdrawn') then
    raise exception 'Invalid status filter';
  end if;

  with filtered as (
    select
      sc.*,
      s.name as spot_name,
      s.slug as spot_slug,
      s.city as spot_city,
      s.status as spot_status,
      s.owner_id as spot_owner_id,
      (
        select count(*)::integer
        from public.reviews r
        where r.spot_id = s.id
          and r.moderation_status = 'visible'
      ) as review_count,
      p.first_name,
      p.last_name,
      p.full_name,
      p.avatar_url
    from public.spot_claims sc
    join public.spots s on s.id = sc.spot_id
    join public.profiles p on p.id = sc.claimant_id
    where (
      v_status is null
      or sc.status = v_status
    )
  ),
  total_count as (
    select count(*)::integer as total
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by
      case when status = 'pending' then 0 else 1 end,
      created_at desc
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
            'spot_id', p.spot_id,
            'claimant_id', p.claimant_id,
            'status', p.status,
            'business_name', p.business_name,
            'contact_name', p.contact_name,
            'contact_email', p.contact_email,
            'contact_phone', p.contact_phone,
            'website', p.website,
            'message', p.message,
            'proof_note', p.proof_note,
            'decision_note', p.decision_note,
            'reviewed_by', p.reviewed_by,
            'reviewed_at', p.reviewed_at,
            'created_at', p.created_at,
            'updated_at', p.updated_at,
            'spot', jsonb_build_object(
              'id', p.spot_id,
              'name', p.spot_name,
              'slug', p.spot_slug,
              'city', p.spot_city,
              'status', p.spot_status,
              'owner_id', p.spot_owner_id,
              'review_count', p.review_count
            ),
            'claimant', jsonb_build_object(
              'id', p.claimant_id,
              'first_name', p.first_name,
              'last_name', p.last_name,
              'full_name', p.full_name,
              'avatar_url', p.avatar_url
            )
          )
          order by
            case when p.status = 'pending' then 0 else 1 end,
            p.created_at desc
        )
        from paged p
      ),
      '[]'::jsonb
    ),
    'total',
    coalesce((select total from total_count), 0),
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
-- 7) Admin Summary RPC
-- ----------------------------------------

create or replace function public.get_admin_dashboard_summary_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  result_json jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_admin_v1(v_user_id) is not true then
    raise exception 'Admin access required';
  end if;

  select jsonb_build_object(
    'spots', jsonb_build_object(
      'pending', (
        select count(*)::integer
        from public.spots s
        where s.status = 'pending'
      ),
      'approved', (
        select count(*)::integer
        from public.spots s
        where s.status = 'approved'
      ),
      'rejected', (
        select count(*)::integer
        from public.spots s
        where s.status = 'rejected'
      )
    ),
    'claims', jsonb_build_object(
      'pending', (
        select count(*)::integer
        from public.spot_claims sc
        where sc.status = 'pending'
      ),
      'approved', (
        select count(*)::integer
        from public.spot_claims sc
        where sc.status = 'approved'
      ),
      'rejected', (
        select count(*)::integer
        from public.spot_claims sc
        where sc.status = 'rejected'
      )
    ),
    'reviews', jsonb_build_object(
      'visible', (
        select count(*)::integer
        from public.reviews r
        where r.moderation_status = 'visible'
      ),
      'hidden', (
        select count(*)::integer
        from public.reviews r
        where r.moderation_status = 'hidden'
      ),
      'flagged', (
        select count(*)::integer
        from public.reviews r
        where r.moderation_status = 'flagged'
      )
    ),
    'notifications', jsonb_build_object(
      'total', (
        select count(*)::integer
        from public.notifications n
      ),
      'unread', (
        select count(*)::integer
        from public.notifications n
        where n.read_at is null
      )
    )
  )
  into result_json;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 8) Optionaler Helper:
-- Reviews initial auf visible setzen
-- ----------------------------------------

update public.reviews
set moderation_status = 'visible'
where moderation_status is null;