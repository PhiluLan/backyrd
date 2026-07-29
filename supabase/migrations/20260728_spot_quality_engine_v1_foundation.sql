begin;

create extension if not exists unaccent;

create or replace function public.admin_spot_quality_v1(
  p_limit integer default 250,
  p_offset integer default 0,
  p_search text default null,
  p_issue text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  ) then
    raise exception 'Admin access required';
  end if;

  with
  photo_stats as (
    select
      sp.spot_id,
      count(*) filter (
        where sp.url is not null
          and btrim(sp.url) <> ''
      )::integer as photo_count
    from public.spot_photos sp
    group by sp.spot_id
  ),
  hour_stats as (
    select
      sh.spot_id,
      count(*) filter (
        where sh.open_time is not null
          and sh.close_time is not null
      )::integer as opening_slot_count
    from public.spot_hours sh
    group by sh.spot_id
  ),
  description_stats as (
    select
      sd.spot_id,
      (
        coalesce(nullif(btrim(sd.owner_description), ''), '') <> ''
        or coalesce(nullif(btrim(sd.enriched_description), ''), '') <> ''
      ) as has_description,
      (
        coalesce(array_length(sd.owner_keywords, 1), 0) > 0
        or coalesce(array_length(sd.enriched_keywords, 1), 0) > 0
      ) as has_keywords
    from public.spot_descriptions sd
  ),
  taxonomy_stats as (
    select
      st.spot_id,
      count(*)::integer as taxonomy_count,
      count(*) filter (
        where coalesce(st.is_verified, false) = true
      )::integer as verified_taxonomy_count
    from public.spot_taxonomies st
    group by st.spot_id
  ),
  normalized as (
    select
      s.*,
      lower(
        regexp_replace(
          unaccent(coalesce(s.name, '')),
          '[^a-zA-Z0-9]+',
          '',
          'g'
        )
      ) as normalized_name,
      lower(
        regexp_replace(
          unaccent(coalesce(s.address, '')),
          '[^a-zA-Z0-9]+',
          '',
          'g'
        )
      ) as normalized_address
    from public.spots s
  ),
  duplicate_stats as (
    select
      n.id as spot_id,
      (
        n.google_place_id is not null
        and exists (
          select 1
          from normalized other
          where other.id <> n.id
            and other.google_place_id = n.google_place_id
        )
      ) as duplicate_google_place_id,
      (
        n.normalized_name <> ''
        and n.normalized_address <> ''
        and exists (
          select 1
          from normalized other
          where other.id <> n.id
            and other.normalized_name = n.normalized_name
            and other.normalized_address = n.normalized_address
        )
      ) as duplicate_name_address
    from normalized n
  ),
  scored as (
    select
      s.id,
      s.name,
      s.address,
      s.city,
      s.country,
      s.status,
      s.lat,
      s.lng,
      s.category_id,
      s.website,
      s.phone,
      s.price_level,
      s.header_photo_path,
      s.google_place_id,
      coalesce(s.google_photo_enabled, true) as google_photo_enabled,
      s.created_at,

      coalesce(ps.photo_count, 0) as photo_count,
      coalesce(hs.opening_slot_count, 0) as opening_slot_count,
      coalesce(ds.has_description, false) as has_description,
      coalesce(ds.has_keywords, false) as has_keywords,
      coalesce(ts.taxonomy_count, 0) as taxonomy_count,
      coalesce(ts.verified_taxonomy_count, 0) as verified_taxonomy_count,
      coalesce(dup.duplicate_google_place_id, false) as duplicate_google_place_id,
      coalesce(dup.duplicate_name_address, false) as duplicate_name_address,

      (
        case when coalesce(nullif(btrim(s.name), ''), '') <> '' then 5 else 0 end
        + case when coalesce(nullif(btrim(s.address), ''), '') <> '' then 10 else 0 end
        + case when s.lat is not null and s.lng is not null then 10 else 0 end
        + case when s.category_id is not null then 5 else 0 end
        + case when coalesce(nullif(btrim(s.google_place_id), ''), '') <> '' then 10 else 0 end
        + case
            when coalesce(nullif(btrim(s.header_photo_path), ''), '') <> ''
              or coalesce(ps.photo_count, 0) > 0
              then 15
            when coalesce(nullif(btrim(s.google_place_id), ''), '') <> ''
              and coalesce(s.google_photo_enabled, true) = true
              then 8
            else 0
          end
        + case when coalesce(ds.has_description, false) then 10 else 0 end
        + case when coalesce(hs.opening_slot_count, 0) > 0 then 10 else 0 end
        + case when coalesce(nullif(btrim(s.website), ''), '') <> '' then 5 else 0 end
        + case when coalesce(nullif(btrim(s.phone), ''), '') <> '' then 3 else 0 end
        + case
            when coalesce(ts.taxonomy_count, 0) >= 8 then 12
            when coalesce(ts.taxonomy_count, 0) >= 4 then 8
            when coalesce(ts.taxonomy_count, 0) >= 1 then 4
            else 0
          end
        + case when s.status = 'approved' then 5 else 0 end
      )::integer as quality_score
    from public.spots s
    left join photo_stats ps on ps.spot_id = s.id
    left join hour_stats hs on hs.spot_id = s.id
    left join description_stats ds on ds.spot_id = s.id
    left join taxonomy_stats ts on ts.spot_id = s.id
    left join duplicate_stats dup on dup.spot_id = s.id
  ),
  enriched as (
    select
      scored.*,
      jsonb_strip_nulls(
        jsonb_build_object(
          'missing_google_place_id',
            case
              when google_place_id is null or btrim(google_place_id) = ''
              then jsonb_build_object(
                'key', 'missing_google_place_id',
                'label', 'Google Place ID fehlt',
                'severity', 'high',
                'points', 10
              )
            end,
          'missing_photo',
            case
              when (
                coalesce(nullif(btrim(header_photo_path), ''), '') = ''
                and photo_count = 0
                and (
                  google_place_id is null
                  or btrim(google_place_id) = ''
                  or google_photo_enabled = false
                )
              )
              then jsonb_build_object(
                'key', 'missing_photo',
                'label', 'Kein Bild verfügbar',
                'severity', 'high',
                'points', 15
              )
            end,
          'missing_description',
            case
              when has_description = false
              then jsonb_build_object(
                'key', 'missing_description',
                'label', 'Beschreibung fehlt',
                'severity', 'high',
                'points', 10
              )
            end,
          'missing_opening_hours',
            case
              when opening_slot_count = 0
              then jsonb_build_object(
                'key', 'missing_opening_hours',
                'label', 'Öffnungszeiten fehlen',
                'severity', 'high',
                'points', 10
              )
            end,
          'missing_taxonomies',
            case
              when taxonomy_count < 4
              then jsonb_build_object(
                'key', 'missing_taxonomies',
                'label',
                  case
                    when taxonomy_count = 0
                    then 'Taxonomien fehlen'
                    else 'Zu wenige Taxonomien'
                  end,
                'severity', 'medium',
                'points',
                  case
                    when taxonomy_count = 0 then 12
                    else 8
                  end
              )
            end,
          'missing_coordinates',
            case
              when lat is null or lng is null
              then jsonb_build_object(
                'key', 'missing_coordinates',
                'label', 'Koordinaten fehlen',
                'severity', 'high',
                'points', 10
              )
            end,
          'missing_category',
            case
              when category_id is null
              then jsonb_build_object(
                'key', 'missing_category',
                'label', 'Kategorie fehlt',
                'severity', 'medium',
                'points', 5
              )
            end,
          'missing_website',
            case
              when website is null or btrim(website) = ''
              then jsonb_build_object(
                'key', 'missing_website',
                'label', 'Website fehlt',
                'severity', 'low',
                'points', 5
              )
            end,
          'missing_phone',
            case
              when phone is null or btrim(phone) = ''
              then jsonb_build_object(
                'key', 'missing_phone',
                'label', 'Telefonnummer fehlt',
                'severity', 'low',
                'points', 3
              )
            end,
          'not_approved',
            case
              when status is distinct from 'approved'
              then jsonb_build_object(
                'key', 'not_approved',
                'label', 'Spot ist nicht approved',
                'severity', 'medium',
                'points', 5
              )
            end,
          'possible_duplicate',
            case
              when duplicate_google_place_id or duplicate_name_address
              then jsonb_build_object(
                'key', 'possible_duplicate',
                'label', 'Mögliches Duplikat',
                'severity', 'critical',
                'points', 0
              )
            end
        )
      ) as issue_map
    from scored
  ),
  filtered as (
    select *
    from enriched e
    where (
      p_search is null
      or btrim(p_search) = ''
      or e.name ilike '%' || p_search || '%'
      or coalesce(e.address, '') ilike '%' || p_search || '%'
      or coalesce(e.city, '') ilike '%' || p_search || '%'
    )
    and (
      p_issue is null
      or btrim(p_issue) = ''
      or p_issue = 'all'
      or e.issue_map ? p_issue
      or (
        p_issue = 'low_quality'
        and e.quality_score < 70
      )
    )
  ),
  summary as (
    select jsonb_build_object(
      'total', count(*),
      'excellent', count(*) filter (where quality_score >= 90),
      'good', count(*) filter (where quality_score between 75 and 89),
      'needs_work', count(*) filter (where quality_score between 50 and 74),
      'critical', count(*) filter (where quality_score < 50),
      'missing_google_place_id',
        count(*) filter (where issue_map ? 'missing_google_place_id'),
      'missing_photo',
        count(*) filter (where issue_map ? 'missing_photo'),
      'missing_description',
        count(*) filter (where issue_map ? 'missing_description'),
      'missing_opening_hours',
        count(*) filter (where issue_map ? 'missing_opening_hours'),
      'missing_taxonomies',
        count(*) filter (where issue_map ? 'missing_taxonomies'),
      'possible_duplicates',
        count(*) filter (where issue_map ? 'possible_duplicate'),
      'average_score',
        coalesce(round(avg(quality_score)::numeric, 1), 0)
    ) as payload
    from enriched
  ),
  page_rows as (
    select *
    from filtered
    order by
      (issue_map ? 'possible_duplicate') desc,
      quality_score asc,
      created_at desc
    limit greatest(1, least(coalesce(p_limit, 250), 1000))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'summary', (select payload from summary),
    'rows', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'spot_id', p.id,
            'name', p.name,
            'address', p.address,
            'city', p.city,
            'country', p.country,
            'status', p.status,
            'quality_score', p.quality_score,
            'photo_count', p.photo_count,
            'opening_slot_count', p.opening_slot_count,
            'has_description', p.has_description,
            'has_keywords', p.has_keywords,
            'taxonomy_count', p.taxonomy_count,
            'verified_taxonomy_count', p.verified_taxonomy_count,
            'google_place_id', p.google_place_id,
            'google_photo_enabled', p.google_photo_enabled,
            'duplicate_google_place_id', p.duplicate_google_place_id,
            'duplicate_name_address', p.duplicate_name_address,
            'issues', (
              select coalesce(jsonb_agg(value), '[]'::jsonb)
              from jsonb_each(p.issue_map)
            ),
            'created_at', p.created_at
          )
          order by
            (p.issue_map ? 'possible_duplicate') desc,
            p.quality_score asc,
            p.created_at desc
        )
        from page_rows p
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_spot_quality_v1(
  integer,
  integer,
  text,
  text
) from public;

grant execute on function public.admin_spot_quality_v1(
  integer,
  integer,
  text,
  text
) to authenticated;

commit;
