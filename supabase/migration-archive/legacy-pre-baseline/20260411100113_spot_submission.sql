-- 20260411100113_spot_submission.sql
-- Spot Submission / Creation Workflow für Backyrd
--
-- Ziel:
-- - Neue Spots serverseitig und nachvollziehbar anlegen
-- - Frontends sollen nicht direkt "irgendwie" in spots schreiben
-- - Pending-Submission-Flow als Grundlage für Admin Review
-- - Optional erste Spot-Fotos direkt mit anlegen
-- - Optional Owner-Claim-Intent direkt mit erzeugen

-- ----------------------------------------
-- 1) Submission-Metadaten auf spots ergänzen
-- ----------------------------------------

alter table public.spots
  add column if not exists submitted_via text;

alter table public.spots
  add column if not exists submission_note text;

alter table public.spots
  add column if not exists approved_at timestamptz;

alter table public.spots
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

alter table public.spots
  add column if not exists rejected_at timestamptz;

alter table public.spots
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null;

alter table public.spots
  add column if not exists moderation_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spots_submitted_via_check'
  ) then
    alter table public.spots
      add constraint spots_submitted_via_check
      check (
        submitted_via is null
        or submitted_via in ('mobile', 'web', 'admin', 'import', 'api')
      );
  end if;
end
$$;

create index if not exists idx_spots_submitted_via
  on public.spots(submitted_via);

create index if not exists idx_spots_approved_at
  on public.spots(approved_at desc);

create index if not exists idx_spots_rejected_at
  on public.spots(rejected_at desc);

create index if not exists idx_spots_approved_by
  on public.spots(approved_by);

create index if not exists idx_spots_rejected_by
  on public.spots(rejected_by);

-- ----------------------------------------
-- 2) Hilfsfunktion: Slug aus Namen ableiten
-- ----------------------------------------

create or replace function public.slugify_v1(input text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
begin
  s := lower(coalesce(input, ''));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '(^-+|-+$)', '', 'g');
  s := regexp_replace(s, '-{2,}', '-', 'g');

  if s = '' then
    return null;
  end if;

  return s;
end;
$$;

-- ----------------------------------------
-- 3) Hilfsfunktion: einzigartigen Spot-Slug erzeugen
-- ----------------------------------------

create or replace function public.generate_unique_spot_slug_v1(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text;
  candidate text;
  counter integer := 0;
begin
  base_slug := public.slugify_v1(p_name);

  if base_slug is null then
    base_slug := 'spot';
  end if;

  candidate := base_slug;

  while exists (
    select 1
    from public.spots s
    where s.slug = candidate
  ) loop
    counter := counter + 1;
    candidate := base_slug || '-' || counter::text;
  end loop;

  return candidate;
end;
$$;

-- ----------------------------------------
-- 4) Spot Submission Create RPC
-- ----------------------------------------
-- Legt einen neuen Spot als pending an.
-- Optional:
-- - erste Foto-URLs
-- - direkter Claim-Intent
--
-- Wichtig:
-- - keine Auto-Approval hier
-- - keine Ownership direkt setzen
-- - status bleibt pending
-- - created_by wird auth.uid()

create or replace function public.create_spot_submission_v1(
  p_name text,
  p_category_slug text default null,
  p_address text default null,
  p_city text default null,
  p_country text default 'Switzerland',
  p_lat double precision default null,
  p_lng double precision default null,
  p_description text default null,
  p_website text default null,
  p_phone text default null,
  p_email text default null,
  p_price_level integer default null,
  p_header_photo_path text default null,
  p_photo_urls text[] default null,
  p_submission_note text default null,
  p_submitted_via text default 'mobile',
  p_claim_after_create boolean default false,
  p_claim_business_name text default null,
  p_claim_contact_name text default null,
  p_claim_contact_email text default null,
  p_claim_contact_phone text default null,
  p_claim_website text default null,
  p_claim_message text default null,
  p_claim_proof_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_name text;
  v_category_id bigint;
  v_slug text;
  v_submitted_via text;
  v_spot public.spots%rowtype;
  v_photo_url text;
  v_claim_result jsonb;
begin
  v_user_id := auth.uid();
  v_name := nullif(trim(p_name), '');
  v_submitted_via := lower(coalesce(trim(p_submitted_via), 'mobile'));

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_name is null then
    raise exception 'Spot name is required';
  end if;

  if coalesce(p_price_level, 1) is not null and p_price_level is not null and (p_price_level < 1 or p_price_level > 5) then
    raise exception 'price_level must be between 1 and 5';
  end if;

  if v_submitted_via not in ('mobile', 'web', 'admin', 'import', 'api') then
    raise exception 'Invalid submitted_via';
  end if;

  if p_category_slug is not null and trim(p_category_slug) <> '' then
    select c.id
    into v_category_id
    from public.categories c
    where lower(c.slug) = lower(trim(p_category_slug))
    limit 1;

    if v_category_id is null then
      raise exception 'Category not found for slug: %', p_category_slug;
    end if;
  else
    v_category_id := null;
  end if;

  v_slug := public.generate_unique_spot_slug_v1(v_name);

  insert into public.spots (
    name,
    slug,
    address,
    city,
    country,
    lat,
    lng,
    category_id,
    description,
    website,
    phone,
    email,
    price_level,
    header_photo_path,
    status,
    owner_id,
    created_by,
    submitted_via,
    submission_note
  )
  values (
    v_name,
    v_slug,
    nullif(trim(p_address), ''),
    nullif(trim(p_city), ''),
    coalesce(nullif(trim(p_country), ''), 'Switzerland'),
    p_lat,
    p_lng,
    v_category_id,
    nullif(trim(p_description), ''),
    nullif(trim(p_website), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_email), ''),
    p_price_level,
    nullif(trim(p_header_photo_path), ''),
    'pending',
    null,
    v_user_id,
    v_submitted_via,
    nullif(trim(p_submission_note), '')
  )
  returning *
  into v_spot;

  if p_photo_urls is not null and cardinality(p_photo_urls) > 0 then
    foreach v_photo_url in array p_photo_urls loop
      if nullif(trim(v_photo_url), '') is not null then
        insert into public.spot_photos (
          spot_id,
          url,
          uploaded_by
        )
        values (
          v_spot.id,
          trim(v_photo_url),
          v_user_id
        );
      end if;
    end loop;
  end if;

  if coalesce(p_claim_after_create, false) = true then
    v_claim_result := public.create_spot_claim_v1(
      p_spot_id := v_spot.id,
      p_business_name := p_claim_business_name,
      p_contact_name := p_claim_contact_name,
      p_contact_email := p_claim_contact_email,
      p_contact_phone := p_claim_contact_phone,
      p_website := p_claim_website,
      p_message := p_claim_message,
      p_proof_note := p_claim_proof_note
    );
  else
    v_claim_result := null;
  end if;

  return jsonb_build_object(
    'spot', jsonb_build_object(
      'id', v_spot.id,
      'name', v_spot.name,
      'slug', v_spot.slug,
      'status', v_spot.status,
      'address', v_spot.address,
      'city', v_spot.city,
      'country', v_spot.country,
      'category_id', v_spot.category_id,
      'description', v_spot.description,
      'website', v_spot.website,
      'phone', v_spot.phone,
      'email', v_spot.email,
      'price_level', v_spot.price_level,
      'header_photo_path', v_spot.header_photo_path,
      'submitted_via', v_spot.submitted_via,
      'submission_note', v_spot.submission_note,
      'created_by', v_spot.created_by,
      'created_at', v_spot.created_at
    ),
    'claim', v_claim_result
  );
end;
$$;

-- ----------------------------------------
-- 5) Submission entscheiden (Admin)
-- ----------------------------------------
-- approved:
-- - status = approved
-- - approved_at/by setzen
-- - rejected-Felder leeren
--
-- rejected:
-- - status = rejected
-- - rejected_at/by setzen
-- - approved-Felder leeren

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

-- ----------------------------------------
-- 6) Submission Detail RPC
-- ----------------------------------------

create or replace function public.get_spot_submission_detail_v1(
  p_spot_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_is_admin boolean;
  result_json jsonb;
begin
  v_user_id := auth.uid();
  v_is_admin := case
    when v_user_id is null then false
    else public.is_admin_v1(v_user_id)
  end;

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

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
    'submitted_via', s.submitted_via,
    'submission_note', s.submission_note,
    'moderation_note', s.moderation_note,
    'approved_at', s.approved_at,
    'approved_by', s.approved_by,
    'rejected_at', s.rejected_at,
    'rejected_by', s.rejected_by,
    'created_at', s.created_at,
    'updated_at', s.updated_at,
    'category', case
      when c.id is null then null
      else jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'name', c.name,
        'icon', c.icon,
        'color', c.color
      )
    end,
    'creator', case
      when p.id is null then null
      else jsonb_build_object(
        'id', p.id,
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
            'id', sp.id,
            'url', sp.url,
            'uploaded_by', sp.uploaded_by,
            'created_at', sp.created_at
          )
          order by sp.created_at desc
        ),
        '[]'::jsonb
      )
      from public.spot_photos sp
      where sp.spot_id = s.id
    )
  )
  into result_json
  from public.spots s
  left join public.categories c on c.id = s.category_id
  left join public.profiles p on p.id = s.created_by
  where s.id = p_spot_id
    and (
      v_is_admin = true
      or s.created_by = v_user_id
      or s.owner_id = v_user_id
    )
  limit 1;

  if result_json is null then
    raise exception 'Spot submission not found or access denied';
  end if;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 7) Meine Submissions
-- ----------------------------------------

create or replace function public.get_my_spot_submissions_v1(
  p_status text default null,
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
  v_status text;
  v_limit integer;
  v_offset integer;
  result_json jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_status := nullif(lower(trim(p_status)), '');
  v_limit := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));

  if v_status is not null and v_status not in ('pending', 'approved', 'rejected', 'archived') then
    raise exception 'Invalid status filter';
  end if;

  with filtered as (
    select
      s.*,
      c.slug as category_slug,
      c.name as category_name
    from public.spots s
    left join public.categories c on c.id = s.category_id
    where s.created_by = v_user_id
      and (
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
            'rejected_at', p.rejected_at,
            'created_at', p.created_at,
            'updated_at', p.updated_at
          )
          order by p.created_at desc
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
-- 8) Admin Submission Queue
-- ----------------------------------------

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
      p.avatar_url
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
-- 9) Public/Client Insert auf spots einschränken
-- ----------------------------------------
-- Ziel:
-- Frontends sollen neue Spots über create_spot_submission_v1 anlegen.
-- Nicht mehr direkt in public.spots insertieren.
--
-- Diese Policy lässt Admins direkte Inserts zu, falls im Admin-Backend
-- später bewusst gewünscht.

drop policy if exists "spots_insert_authenticated" on public.spots;
drop policy if exists "spots_insert_admin_only" on public.spots;

create policy "spots_insert_admin_only"
on public.spots
for insert
to authenticated
with check (
  public.is_admin_v1(auth.uid())
);

-- ----------------------------------------
-- 10) Update-Policy für Moderation / Creator / Owner ergänzen
-- ----------------------------------------
-- Falls in eurer bisherigen RLS bereits eine spots-update-policy existiert,
-- bleibt sie bestehen. Diese zusätzliche Policy erlaubt:
-- - Admin volle Updates
-- - Creator nur eigene pending/rejected submissions
-- - Owner eigene Spots
--
-- Achtung:
-- Durch RLS allein verhindert man nicht jede Feldänderung.
-- Die echte Fachlogik soll weiterhin primär über RPCs laufen.

drop policy if exists "spots_update_admin_creator_owner" on public.spots;
create policy "spots_update_admin_creator_owner"
on public.spots
for update
to authenticated
using (
  public.is_admin_v1(auth.uid())
  or created_by = auth.uid()
  or owner_id = auth.uid()
)
with check (
  public.is_admin_v1(auth.uid())
  or created_by = auth.uid()
  or owner_id = auth.uid()
);