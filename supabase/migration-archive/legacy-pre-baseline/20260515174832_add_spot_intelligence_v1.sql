-- supabase/migrations/<timestamp>_add_spot_intelligence_v1.sql

begin;

-- ============================================================
-- 1) Spot Intelligence Table
-- ============================================================

create table if not exists public.spot_intelligence_v1 (
  spot_id uuid primary key references public.spots(id) on delete cascade,

  -- Core fit signals for decision/recommendation quality
  best_for text[] not null default '{}'::text[],
  occasion_tags text[] not null default '{}'::text[],
  atmosphere_tags text[] not null default '{}'::text[],
  avoid_if_tags text[] not null default '{}'::text[],
  good_for_time text[] not null default '{}'::text[],

  -- Structured owner/admin metadata
  noise_level text null,
  crowd_type text[] not null default '{}'::text[],
  dress_code text null,
  reservation_recommended boolean null,
  average_duration_minutes integer null,

  -- Rich but controlled text fields
  signature_items text[] not null default '{}'::text[],
  special_notes text null,
  admin_notes text null,

  -- Governance/source
  source text not null default 'admin',
  is_verified boolean not null default false,
  updated_by uuid null references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint spot_intelligence_source_check
    check (source in ('admin', 'owner', 'import', 'enrichment')),

  constraint spot_intelligence_noise_level_check
    check (
      noise_level is null
      or noise_level in ('quiet', 'moderate', 'lively', 'loud')
    ),

  constraint spot_intelligence_dress_code_check
    check (
      dress_code is null
      or dress_code in ('casual', 'smart_casual', 'dressy', 'formal')
    ),

  constraint spot_intelligence_average_duration_check
    check (
      average_duration_minutes is null
      or (
        average_duration_minutes >= 10
        and average_duration_minutes <= 720
      )
    )
);

create index if not exists spot_intelligence_v1_source_idx
  on public.spot_intelligence_v1(source);

create index if not exists spot_intelligence_v1_verified_idx
  on public.spot_intelligence_v1(is_verified);

create index if not exists spot_intelligence_v1_best_for_gin_idx
  on public.spot_intelligence_v1 using gin(best_for);

create index if not exists spot_intelligence_v1_occasion_tags_gin_idx
  on public.spot_intelligence_v1 using gin(occasion_tags);

create index if not exists spot_intelligence_v1_atmosphere_tags_gin_idx
  on public.spot_intelligence_v1 using gin(atmosphere_tags);

create index if not exists spot_intelligence_v1_good_for_time_gin_idx
  on public.spot_intelligence_v1 using gin(good_for_time);


-- ============================================================
-- 2) updated_at trigger helper
-- ============================================================

create or replace function public.set_spot_intelligence_updated_at_v1()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_spot_intelligence_updated_at_v1
on public.spot_intelligence_v1;

create trigger trg_set_spot_intelligence_updated_at_v1
before update on public.spot_intelligence_v1
for each row
execute function public.set_spot_intelligence_updated_at_v1();


-- ============================================================
-- 3) RLS
-- ============================================================

alter table public.spot_intelligence_v1 enable row level security;

drop policy if exists spot_intelligence_v1_read_all
on public.spot_intelligence_v1;

create policy spot_intelligence_v1_read_all
on public.spot_intelligence_v1
for select
to anon, authenticated
using (true);

-- Direct writes are blocked. Writes should happen via RPC.
drop policy if exists spot_intelligence_v1_insert_none
on public.spot_intelligence_v1;

create policy spot_intelligence_v1_insert_none
on public.spot_intelligence_v1
for insert
to authenticated
with check (false);

drop policy if exists spot_intelligence_v1_update_none
on public.spot_intelligence_v1;

create policy spot_intelligence_v1_update_none
on public.spot_intelligence_v1
for update
to authenticated
using (false)
with check (false);

drop policy if exists spot_intelligence_v1_delete_none
on public.spot_intelligence_v1;

create policy spot_intelligence_v1_delete_none
on public.spot_intelligence_v1
for delete
to authenticated
using (false);


-- ============================================================
-- 4) Permission helper: admin or verified owner
-- ============================================================

create or replace function public.can_edit_spot_v1(p_spot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
  or exists (
    select 1
    from public.spots s
    where s.id = p_spot_id
      and s.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.spot_claims sc
    where sc.spot_id = p_spot_id
      and sc.user_id = auth.uid()
      and sc.status = 'approved'
  );
$$;


-- ============================================================
-- 5) RPC: upsert spot intelligence
--    This is the future Admin/Owner UI write API.
-- ============================================================

create or replace function public.upsert_spot_intelligence_v1(
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
  p_admin_notes text default null,
  p_source text default 'admin',
  p_is_verified boolean default false
)
returns table (
  ok boolean,
  spot_id uuid,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_source text := coalesce(nullif(trim(p_source), ''), 'admin');
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_spot_id is null then
    raise exception 'spot_id_required';
  end if;

  if not exists (
    select 1
    from public.spots s
    where s.id = p_spot_id
  ) then
    raise exception 'spot_not_found';
  end if;

  select coalesce(p.is_admin, false)
  into v_is_admin
  from public.profiles p
  where p.id = v_user_id;

  if not public.can_edit_spot_v1(p_spot_id) then
    raise exception 'not_allowed_to_edit_spot' using errcode = '42501';
  end if;

  -- Only admins may write admin_notes, admin source, or verified flag.
  if not v_is_admin then
    v_source := 'owner';
    p_admin_notes := null;
    p_is_verified := false;
  end if;

  insert into public.spot_intelligence_v1 (
    spot_id,
    best_for,
    occasion_tags,
    atmosphere_tags,
    avoid_if_tags,
    good_for_time,
    noise_level,
    crowd_type,
    dress_code,
    reservation_recommended,
    average_duration_minutes,
    signature_items,
    special_notes,
    admin_notes,
    source,
    is_verified,
    updated_by,
    created_at,
    updated_at
  )
  values (
    p_spot_id,
    coalesce(p_best_for, '{}'::text[]),
    coalesce(p_occasion_tags, '{}'::text[]),
    coalesce(p_atmosphere_tags, '{}'::text[]),
    coalesce(p_avoid_if_tags, '{}'::text[]),
    coalesce(p_good_for_time, '{}'::text[]),
    nullif(trim(p_noise_level), ''),
    coalesce(p_crowd_type, '{}'::text[]),
    nullif(trim(p_dress_code), ''),
    p_reservation_recommended,
    p_average_duration_minutes,
    coalesce(p_signature_items, '{}'::text[]),
    nullif(trim(p_special_notes), ''),
    nullif(trim(p_admin_notes), ''),
    v_source,
    coalesce(p_is_verified, false),
    v_user_id,
    now(),
    now()
  )
  on conflict (spot_id)
  do update set
    best_for = excluded.best_for,
    occasion_tags = excluded.occasion_tags,
    atmosphere_tags = excluded.atmosphere_tags,
    avoid_if_tags = excluded.avoid_if_tags,
    good_for_time = excluded.good_for_time,
    noise_level = excluded.noise_level,
    crowd_type = excluded.crowd_type,
    dress_code = excluded.dress_code,
    reservation_recommended = excluded.reservation_recommended,
    average_duration_minutes = excluded.average_duration_minutes,
    signature_items = excluded.signature_items,
    special_notes = excluded.special_notes,
    admin_notes = excluded.admin_notes,
    source = excluded.source,
    is_verified = excluded.is_verified,
    updated_by = excluded.updated_by,
    updated_at = now();

  ok := true;
  spot_id := p_spot_id;
  message := 'spot_intelligence_upserted';
  return next;
end;
$$;

grant execute on function public.upsert_spot_intelligence_v1(
  uuid,
  text[],
  text[],
  text[],
  text[],
  text[],
  text,
  text[],
  text,
  boolean,
  integer,
  text[],
  text,
  text,
  text,
  boolean
) to authenticated;


-- ============================================================
-- 6) RPC: read one spot intelligence row
--    Useful for Admin/Owner UI edit form.
-- ============================================================

create or replace function public.get_spot_intelligence_v1(p_spot_id uuid)
returns table (
  spot_id uuid,
  best_for text[],
  occasion_tags text[],
  atmosphere_tags text[],
  avoid_if_tags text[],
  good_for_time text[],
  noise_level text,
  crowd_type text[],
  dress_code text,
  reservation_recommended boolean,
  average_duration_minutes integer,
  signature_items text[],
  special_notes text,
  admin_notes text,
  source text,
  is_verified boolean,
  can_edit boolean,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    si.spot_id,
    si.best_for,
    si.occasion_tags,
    si.atmosphere_tags,
    si.avoid_if_tags,
    si.good_for_time,
    si.noise_level,
    si.crowd_type,
    si.dress_code,
    si.reservation_recommended,
    si.average_duration_minutes,
    si.signature_items,
    si.special_notes,
    si.admin_notes,
    si.source,
    si.is_verified,
    public.can_edit_spot_v1(si.spot_id) as can_edit,
    si.updated_by,
    si.created_at,
    si.updated_at
  from public.spot_intelligence_v1 si
  where si.spot_id = p_spot_id;
$$;

grant execute on function public.get_spot_intelligence_v1(uuid)
to anon, authenticated;


-- ============================================================
-- 7) Update V13 ML document builder to include intelligence
-- ============================================================

create or replace function public.backyrd_build_spot_ml_document_v13(p_spot_id uuid)
returns table (
  spot_id uuid,
  document_text text,
  document_json jsonb,
  source_hash text
)
language sql
stable
security definer
set search_path = public
as $function$
  with spot_base as (
    select
      s.id as spot_id,
      s.name,
      s.address,
      s.city,
      s.country,
      s.price_level,
      s.website,
      s.phone,
      s.email,
      s.status::text as status,
      c.name as category_name,
      ec.description_source,
      ec.effective_description,
      ec.effective_keywords
    from public.spots s
    left join public.categories c
      on c.id = s.category_id
    left join public.spot_effective_content_v1 ec
      on ec.spot_id = s.id
    where s.id = p_spot_id
  ),

  moods as (
    select
      sm.spot_id,
      array_agg(distinct mt.token order by mt.token)
        filter (where mt.token is not null) as mood_tokens,
      jsonb_agg(
        distinct jsonb_build_object(
          'token', mt.token,
          'token_norm', mt.token_norm,
          'count', sm.mood_count,
          'rank', sm.rank
        )
      ) filter (where mt.token is not null) as mood_json
    from public.spot_moods sm
    join public.mood_tokens mt
      on mt.id = sm.mood_id
    where sm.spot_id = p_spot_id
      and mt.valid = true
    group by sm.spot_id
  ),

  concepts as (
    select
      smc.spot_id,
      array_agg(distinct mc.label order by mc.label)
        filter (where mc.label is not null) as concept_labels,
      jsonb_agg(
        distinct jsonb_build_object(
          'label', mc.label,
          'label_norm', mc.label_norm,
          'cluster_id', mc.primary_cluster_id,
          'strength', smc.strength,
          'source', smc.source
        )
      ) filter (where mc.label is not null) as concept_json
    from public.spot_mood_concepts smc
    join public.mood_concepts mc
      on mc.id = smc.concept_id
    where smc.spot_id = p_spot_id
    group by smc.spot_id
  ),

  intelligence as (
    select
      si.spot_id,
      si.best_for,
      si.occasion_tags,
      si.atmosphere_tags,
      si.avoid_if_tags,
      si.good_for_time,
      si.noise_level,
      si.crowd_type,
      si.dress_code,
      si.reservation_recommended,
      si.average_duration_minutes,
      si.signature_items,
      si.special_notes,
      si.source,
      si.is_verified
    from public.spot_intelligence_v1 si
    where si.spot_id = p_spot_id
  ),

  review_summary as (
    select
      r.spot_id,
      count(*)::integer as review_count,

      array_agg(distinct public.backyrd_ml_clean_text_v13(r.mood_a))
        filter (where public.backyrd_ml_clean_text_v13(r.mood_a) is not null) as review_mood_a,

      array_agg(distinct public.backyrd_ml_clean_text_v13(r.mood_b))
        filter (where public.backyrd_ml_clean_text_v13(r.mood_b) is not null) as review_mood_b,

      array_agg(public.backyrd_ml_clean_text_v13(left(r.text, 280)) order by r.created_at desc)
        filter (where public.backyrd_ml_clean_text_v13(r.text) is not null) as review_texts

    from public.reviews r
    where r.spot_id = p_spot_id
    group by r.spot_id
  ),

  hours_summary as (
    select
      sh.spot_id,
      jsonb_agg(
        jsonb_build_object(
          'day', sh.day_of_week,
          'open', sh.open_time::text,
          'close', sh.close_time::text,
          'idx', sh.idx
        )
        order by sh.idx nulls last, sh.day_of_week, sh.open_time
      ) as hours_json,
      string_agg(
        sh.day_of_week || ' ' || sh.open_time::text || '-' || sh.close_time::text,
        '; '
        order by sh.idx nulls last, sh.day_of_week, sh.open_time
      ) as hours_text
    from public.spot_hours sh
    where sh.spot_id = p_spot_id
    group by sh.spot_id
  ),

  assembled as (
    select
      sb.spot_id,

      jsonb_build_object(
        'name', sb.name,
        'category', sb.category_name,
        'address', sb.address,
        'city', sb.city,
        'country', sb.country,
        'price_level', sb.price_level,
        'status', sb.status,
        'description_source', sb.description_source,
        'description', public.backyrd_ml_clean_text_v13(sb.effective_description),
        'keywords', coalesce(sb.effective_keywords, '{}'::text[]),

        'moods', coalesce(m.mood_tokens, '{}'::text[]),
        'mood_details', coalesce(m.mood_json, '[]'::jsonb),
        'concepts', coalesce(c.concept_labels, '{}'::text[]),
        'concept_details', coalesce(c.concept_json, '[]'::jsonb),

        'intelligence', jsonb_build_object(
          'best_for', coalesce(i.best_for, '{}'::text[]),
          'occasion_tags', coalesce(i.occasion_tags, '{}'::text[]),
          'atmosphere_tags', coalesce(i.atmosphere_tags, '{}'::text[]),
          'avoid_if_tags', coalesce(i.avoid_if_tags, '{}'::text[]),
          'good_for_time', coalesce(i.good_for_time, '{}'::text[]),
          'noise_level', i.noise_level,
          'crowd_type', coalesce(i.crowd_type, '{}'::text[]),
          'dress_code', i.dress_code,
          'reservation_recommended', i.reservation_recommended,
          'average_duration_minutes', i.average_duration_minutes,
          'signature_items', coalesce(i.signature_items, '{}'::text[]),
          'special_notes', public.backyrd_ml_clean_text_v13(i.special_notes),
          'source', i.source,
          'is_verified', coalesce(i.is_verified, false)
        ),

        'review_count', coalesce(rs.review_count, 0),
        'review_moods_a', coalesce(rs.review_mood_a, '{}'::text[]),
        'review_moods_b', coalesce(rs.review_mood_b, '{}'::text[]),
        'review_texts', coalesce(rs.review_texts[1:5], '{}'::text[]),
        'hours', coalesce(h.hours_json, '[]'::jsonb)
      ) as document_json,

      concat_ws(
        E'\n',
        'Spot: ' || coalesce(sb.name, ''),
        'Kategorie: ' || coalesce(sb.category_name, ''),
        'Stadt: ' || coalesce(sb.city, ''),
        'Land: ' || coalesce(sb.country, ''),
        case when sb.address is not null then 'Adresse: ' || sb.address end,
        case when sb.price_level is not null then 'Preislevel: ' || sb.price_level::text end,

        case
          when public.backyrd_ml_clean_text_v13(sb.effective_description) is not null
          then 'Beschreibung: ' || public.backyrd_ml_clean_text_v13(sb.effective_description)
        end,

        case
          when coalesce(array_length(sb.effective_keywords, 1), 0) > 0
          then 'Keywords: ' || array_to_string(sb.effective_keywords, ', ')
        end,

        case
          when coalesce(array_length(m.mood_tokens, 1), 0) > 0
          then 'Moods: ' || array_to_string(m.mood_tokens, ', ')
        end,

        case
          when coalesce(array_length(c.concept_labels, 1), 0) > 0
          then 'Mood Concepts: ' || array_to_string(c.concept_labels, ', ')
        end,

        case
          when coalesce(array_length(i.best_for, 1), 0) > 0
          then 'Gut für: ' || array_to_string(i.best_for, ', ')
        end,

        case
          when coalesce(array_length(i.occasion_tags, 1), 0) > 0
          then 'Anlässe: ' || array_to_string(i.occasion_tags, ', ')
        end,

        case
          when coalesce(array_length(i.atmosphere_tags, 1), 0) > 0
          then 'Atmosphäre: ' || array_to_string(i.atmosphere_tags, ', ')
        end,

        case
          when coalesce(array_length(i.good_for_time, 1), 0) > 0
          then 'Gute Tageszeiten: ' || array_to_string(i.good_for_time, ', ')
        end,

        case
          when coalesce(array_length(i.avoid_if_tags, 1), 0) > 0
          then 'Eher nicht geeignet für: ' || array_to_string(i.avoid_if_tags, ', ')
        end,

        case
          when i.noise_level is not null
          then 'Geräuschlevel: ' || i.noise_level
        end,

        case
          when coalesce(array_length(i.crowd_type, 1), 0) > 0
          then 'Crowd: ' || array_to_string(i.crowd_type, ', ')
        end,

        case
          when i.dress_code is not null
          then 'Dresscode: ' || i.dress_code
        end,

        case
          when i.reservation_recommended is not null
          then 'Reservation empfohlen: ' || case when i.reservation_recommended then 'ja' else 'nein' end
        end,

        case
          when i.average_duration_minutes is not null
          then 'Typische Aufenthaltsdauer Minuten: ' || i.average_duration_minutes::text
        end,

        case
          when coalesce(array_length(i.signature_items, 1), 0) > 0
          then 'Signature Items: ' || array_to_string(i.signature_items, ', ')
        end,

        case
          when public.backyrd_ml_clean_text_v13(i.special_notes) is not null
          then 'Besondere Hinweise: ' || public.backyrd_ml_clean_text_v13(i.special_notes)
        end,

        case
          when coalesce(array_length(rs.review_mood_a, 1), 0) > 0
          then 'Review Mood A: ' || array_to_string(rs.review_mood_a, ', ')
        end,

        case
          when coalesce(array_length(rs.review_mood_b, 1), 0) > 0
          then 'Review Mood B: ' || array_to_string(rs.review_mood_b, ', ')
        end,

        case
          when coalesce(array_length(rs.review_texts, 1), 0) > 0
          then 'Review Auszüge: ' || array_to_string(rs.review_texts[1:5], ' | ')
        end,

        case
          when public.backyrd_ml_clean_text_v13(h.hours_text) is not null
          then 'Öffnungszeiten: ' || public.backyrd_ml_clean_text_v13(h.hours_text)
        end
      ) as document_text

    from spot_base sb
    left join moods m
      on m.spot_id = sb.spot_id
    left join concepts c
      on c.spot_id = sb.spot_id
    left join intelligence i
      on i.spot_id = sb.spot_id
    left join review_summary rs
      on rs.spot_id = sb.spot_id
    left join hours_summary h
      on h.spot_id = sb.spot_id
  )

  select
    a.spot_id,
    a.document_text,
    a.document_json,
    md5(
      coalesce(a.document_text, '') || '|' || coalesce(a.document_json::text, '')
    ) as source_hash
  from assembled a;
$function$;


-- ============================================================
-- 8) Update feature extractor to include intelligence tags
-- ============================================================

create or replace function public.backyrd_ml_extract_spot_features_v1(p_spot_id uuid)
returns table (
  feature_type text,
  feature_key text,
  feature_strength numeric
)
language sql
stable
security definer
set search_path = public
as $function$
  with base_spot as (
    select
      s.id,
      s.city,
      s.price_level,
      s.category_id,
      c.name as category_name
    from public.spots s
    left join public.categories c on c.id = s.category_id
    where s.id = p_spot_id
  ),

  city_features as (
    select
      'city'::text as feature_type,
      'city:' || public.backyrd_ml_norm_text_v1(city) as feature_key,
      0.45::numeric as feature_strength
    from base_spot
    where public.backyrd_ml_norm_text_v1(city) is not null
  ),

  category_features as (
    select
      'category'::text as feature_type,
      'category:' || public.backyrd_ml_norm_text_v1(category_name) as feature_key,
      0.85::numeric as feature_strength
    from base_spot
    where public.backyrd_ml_norm_text_v1(category_name) is not null
  ),

  price_features as (
    select
      'price'::text as feature_type,
      'price:' || price_level::text as feature_key,
      0.35::numeric as feature_strength
    from base_spot
    where price_level is not null
  ),

  mood_features as (
    select
      'mood'::text as feature_type,
      'mood:' || public.backyrd_ml_norm_text_v1(coalesce(mt.token_norm, mt.token::text)) as feature_key,
      greatest(
        0.15,
        least(
          1.15,
          0.25 + coalesce(sm.rank, 1)::numeric * 0.2 + least(0.5, coalesce(sm.mood_count, 0)::numeric * 0.08)
        )
      )::numeric as feature_strength
    from public.spot_moods sm
    join public.mood_tokens mt on mt.id = sm.mood_id
    where sm.spot_id = p_spot_id
      and mt.valid = true
      and public.backyrd_ml_norm_text_v1(coalesce(mt.token_norm, mt.token::text)) is not null
  ),

  concept_features as (
    select
      'mood_concept'::text as feature_type,
      'concept:' || public.backyrd_ml_norm_text_v1(coalesce(mc.label_norm, mc.label)) as feature_key,
      greatest(0.1, least(1.5, coalesce(smc.strength, 0.4)))::numeric as feature_strength
    from public.spot_mood_concepts smc
    join public.mood_concepts mc on mc.id = smc.concept_id
    where smc.spot_id = p_spot_id
      and public.backyrd_ml_norm_text_v1(coalesce(mc.label_norm, mc.label)) is not null
  ),

  keyword_features as (
    select
      'keyword'::text as feature_type,
      'keyword:' || public.backyrd_ml_norm_text_v1(keyword_value) as feature_key,
      0.42::numeric as feature_strength
    from public.spot_effective_content_v1 ec
    cross join lateral unnest(coalesce(ec.effective_keywords, '{}'::text[])) as keyword_value
    where ec.spot_id = p_spot_id
      and public.backyrd_ml_norm_text_v1(keyword_value) is not null
  ),

  intelligence_best_for_features as (
    select
      'best_for'::text as feature_type,
      'best_for:' || public.backyrd_ml_norm_text_v1(value) as feature_key,
      0.72::numeric as feature_strength
    from public.spot_intelligence_v1 si
    cross join lateral unnest(coalesce(si.best_for, '{}'::text[])) as value
    where si.spot_id = p_spot_id
      and public.backyrd_ml_norm_text_v1(value) is not null
  ),

  intelligence_occasion_features as (
    select
      'occasion'::text as feature_type,
      'occasion:' || public.backyrd_ml_norm_text_v1(value) as feature_key,
      0.62::numeric as feature_strength
    from public.spot_intelligence_v1 si
    cross join lateral unnest(coalesce(si.occasion_tags, '{}'::text[])) as value
    where si.spot_id = p_spot_id
      and public.backyrd_ml_norm_text_v1(value) is not null
  ),

  intelligence_atmosphere_features as (
    select
      'atmosphere'::text as feature_type,
      'atmosphere:' || public.backyrd_ml_norm_text_v1(value) as feature_key,
      0.68::numeric as feature_strength
    from public.spot_intelligence_v1 si
    cross join lateral unnest(coalesce(si.atmosphere_tags, '{}'::text[])) as value
    where si.spot_id = p_spot_id
      and public.backyrd_ml_norm_text_v1(value) is not null
  ),

  intelligence_time_features as (
    select
      'good_for_time'::text as feature_type,
      'good_for_time:' || public.backyrd_ml_norm_text_v1(value) as feature_key,
      0.46::numeric as feature_strength
    from public.spot_intelligence_v1 si
    cross join lateral unnest(coalesce(si.good_for_time, '{}'::text[])) as value
    where si.spot_id = p_spot_id
      and public.backyrd_ml_norm_text_v1(value) is not null
  ),

  intelligence_noise_features as (
    select
      'noise_level'::text as feature_type,
      'noise_level:' || public.backyrd_ml_norm_text_v1(si.noise_level) as feature_key,
      0.36::numeric as feature_strength
    from public.spot_intelligence_v1 si
    where si.spot_id = p_spot_id
      and public.backyrd_ml_norm_text_v1(si.noise_level) is not null
  )

  select * from city_features
  union all
  select * from category_features
  union all
  select * from price_features
  union all
  select * from mood_features
  union all
  select * from concept_features
  union all
  select * from keyword_features
  union all
  select * from intelligence_best_for_features
  union all
  select * from intelligence_occasion_features
  union all
  select * from intelligence_atmosphere_features
  union all
  select * from intelligence_time_features
  union all
  select * from intelligence_noise_features;
$function$;

commit;