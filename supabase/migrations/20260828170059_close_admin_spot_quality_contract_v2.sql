-- Admin Spot Quality V2: live, canonical and internally consistent.
-- This projection is deliberately presentation-only. It does not participate
-- in Product eligibility, ranking, Gold acceptance or user learning.

create or replace function public.admin_spot_quality_v2(
  p_limit integer default 250,
  p_offset integer default 0,
  p_search text default null,
  p_issue text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  with
  -- Normal operations include only active Product work. Historical archived or
  -- rejected rows and synthetic identities remain available elsewhere, but
  -- cannot distort launch-quality counts.
  product_spots as (
    select s.*
    from public.spots s
    where s.data_origin in ('REAL', 'IMPORT', 'LEGACY')
      and s.status in ('approved', 'pending')
  ),
  photo_stats as (
    select sp.spot_id,
      count(*) filter (where nullif(btrim(sp.url), '') is not null)::integer as photo_count
    from public.spot_photos sp
    join product_spots s on s.id = sp.spot_id
    group by sp.spot_id
  ),
  hour_stats as (
    select sh.spot_id,
      count(*) filter (
        where sh.open_time is not null and sh.close_time is not null
      )::integer as opening_slot_count
    from public.spot_hours sh
    join product_spots s on s.id = sh.spot_id
    group by sh.spot_id
  ),
  description_stats as (
    select s.id as spot_id,
      nullif(btrim(ec.effective_description), '') is not null as has_description,
      coalesce(array_length(ec.effective_keywords, 1), 0) > 0 as has_keywords,
      ec.description_source
    from product_spots s
    left join public.spot_effective_content_v1 ec on ec.spot_id = s.id
  ),
  taxonomy_stats as (
    select st.spot_id,
      count(*)::integer as taxonomy_count,
      count(*) filter (where coalesce(st.is_verified, false))::integer as verified_taxonomy_count
    from public.spot_taxonomies st
    join product_spots s on s.id = st.spot_id
    group by st.spot_id
  ),
  normalized as (
    select s.*,
      lower(regexp_replace(public.unaccent(coalesce(s.name, '')), '[^a-zA-Z0-9]+', '', 'g')) as normalized_name,
      lower(regexp_replace(public.unaccent(coalesce(s.address, '')), '[^a-zA-Z0-9]+', '', 'g')) as normalized_address
    from product_spots s
  ),
  duplicate_stats as (
    select n.id as spot_id,
      nullif(btrim(n.google_place_id), '') is not null
        and count(*) over (partition by n.google_place_id) > 1 as duplicate_google_place_id,
      n.normalized_name <> '' and n.normalized_address <> ''
        and count(*) over (partition by n.normalized_name, n.normalized_address) > 1 as duplicate_name_address
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
      s.data_origin,
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
      s.updated_at,
      coalesce(ps.photo_count, 0) as photo_count,
      coalesce(hs.opening_slot_count, 0) as opening_slot_count,
      coalesce(ds.has_description, false) as has_description,
      coalesce(ds.has_keywords, false) as has_keywords,
      ds.description_source,
      coalesce(ts.taxonomy_count, 0) as taxonomy_count,
      coalesce(ts.verified_taxonomy_count, 0) as verified_taxonomy_count,
      coalesce(dup.duplicate_google_place_id, false) as duplicate_google_place_id,
      coalesce(dup.duplicate_name_address, false) as duplicate_name_address,
      (
        case when nullif(btrim(s.name), '') is not null then 5 else 0 end
        + case when nullif(btrim(s.address), '') is not null then 10 else 0 end
        + case when s.lat is not null and s.lng is not null then 10 else 0 end
        + case when s.category_id is not null then 5 else 0 end
        + case when nullif(btrim(s.google_place_id), '') is not null then 10 else 0 end
        + case
            when nullif(btrim(s.header_photo_path), '') is not null or coalesce(ps.photo_count, 0) > 0 then 15
            when nullif(btrim(s.google_place_id), '') is not null and coalesce(s.google_photo_enabled, true) then 8
            else 0
          end
        + case when coalesce(ds.has_description, false) then 10 else 0 end
        + case when coalesce(hs.opening_slot_count, 0) > 0 then 10 else 0 end
        + case when nullif(btrim(s.website), '') is not null then 5 else 0 end
        + case when nullif(btrim(s.phone), '') is not null then 3 else 0 end
        + case
            when coalesce(ts.taxonomy_count, 0) >= 8 then 12
            when coalesce(ts.taxonomy_count, 0) >= 4 then 8
            when coalesce(ts.taxonomy_count, 0) >= 1 then 4
            else 0
          end
        + case when s.status = 'approved' then 5 else 0 end
      )::integer as quality_score
    from product_spots s
    left join photo_stats ps on ps.spot_id = s.id
    left join hour_stats hs on hs.spot_id = s.id
    left join description_stats ds on ds.spot_id = s.id
    left join taxonomy_stats ts on ts.spot_id = s.id
    left join duplicate_stats dup on dup.spot_id = s.id
  ),
  enriched as (
    select scored.*,
      jsonb_strip_nulls(jsonb_build_object(
        'missing_google_place_id', case when nullif(btrim(google_place_id), '') is null then
          jsonb_build_object('key','missing_google_place_id','label','Google-Verknüpfung fehlt','severity','high','points',10) end,
        'missing_photo', case when nullif(btrim(header_photo_path), '') is null and photo_count = 0
          and (nullif(btrim(google_place_id), '') is null or not google_photo_enabled) then
          jsonb_build_object('key','missing_photo','label','Kein sichtbares Bild verfügbar','severity','high','points',15) end,
        'missing_description', case when not has_description then
          jsonb_build_object('key','missing_description','label','Veröffentlichbare Beschreibung fehlt','severity','high','points',10) end,
        'missing_opening_hours', case when opening_slot_count = 0 then
          jsonb_build_object('key','missing_opening_hours','label','Öffnungszeiten fehlen','severity','high','points',10) end,
        'missing_taxonomies', case when taxonomy_count < 4 then
          jsonb_build_object('key','missing_taxonomies','label',case when taxonomy_count=0 then 'Taxonomie fehlt' else 'Taxonomie unvollständig' end,'severity','medium','points',case when taxonomy_count=0 then 12 else 8 end) end,
        'missing_coordinates', case when lat is null or lng is null then
          jsonb_build_object('key','missing_coordinates','label','Koordinaten fehlen','severity','high','points',10) end,
        'missing_category', case when category_id is null then
          jsonb_build_object('key','missing_category','label','Kategorie fehlt','severity','medium','points',5) end,
        'missing_website', case when nullif(btrim(website), '') is null then
          jsonb_build_object('key','missing_website','label','Website fehlt','severity','low','points',5) end,
        'missing_phone', case when nullif(btrim(phone), '') is null then
          jsonb_build_object('key','missing_phone','label','Telefonnummer fehlt','severity','low','points',3) end,
        'not_approved', case when status <> 'approved' then
          jsonb_build_object('key','not_approved','label','Freigabe steht aus','severity','medium','points',5) end,
        'possible_duplicate', case when duplicate_google_place_id or duplicate_name_address then
          jsonb_build_object('key','possible_duplicate','label','Mögliches Duplikat','severity','critical','points',0) end
      )) as issue_map
    from scored
  ),
  filtered as (
    select * from enriched e
    where (
      nullif(btrim(p_search), '') is null
      or e.name ilike '%' || p_search || '%'
      or coalesce(e.address, '') ilike '%' || p_search || '%'
      or coalesce(e.city, '') ilike '%' || p_search || '%'
      or e.id::text ilike '%' || p_search || '%'
      or coalesce(e.google_place_id, '') ilike '%' || p_search || '%'
    )
    and (
      nullif(btrim(p_issue), '') is null or p_issue = 'all'
      or e.issue_map ? p_issue
      or (p_issue = 'low_quality' and e.quality_score < 70)
    )
  ),
  summary as (
    select jsonb_build_object(
      'total', count(*),
      'excellent', count(*) filter (where quality_score >= 90),
      'good', count(*) filter (where quality_score between 75 and 89),
      'needs_work', count(*) filter (where quality_score between 50 and 74),
      'critical', count(*) filter (where quality_score < 50),
      'missing_google_place_id', count(*) filter (where issue_map ? 'missing_google_place_id'),
      'missing_photo', count(*) filter (where issue_map ? 'missing_photo'),
      'missing_description', count(*) filter (where issue_map ? 'missing_description'),
      'missing_opening_hours', count(*) filter (where issue_map ? 'missing_opening_hours'),
      'missing_taxonomies', count(*) filter (where issue_map ? 'missing_taxonomies'),
      'possible_duplicates', count(*) filter (where issue_map ? 'possible_duplicate'),
      'average_score', coalesce(round(avg(quality_score)::numeric, 1), 0)
    ) as payload
    from enriched
  ),
  filtered_summary as (
    select count(*)::integer as filtered_total from filtered
  ),
  page_rows as (
    select * from filtered
    order by (issue_map ? 'possible_duplicate') desc, quality_score asc, updated_at desc, id
    limit greatest(1, least(coalesce(p_limit, 250), 1000))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'summary', (select payload from summary),
    'filtered_total', (select filtered_total from filtered_summary),
    'freshness', jsonb_build_object(
      'mode', 'live',
      'calculated_at', statement_timestamp(),
      'universe', 'active_product_spots',
      'excluded_statuses', jsonb_build_array('archived','rejected'),
      'excluded_origins', jsonb_build_array('FIXTURE','TEST')
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'spot_id', p.id,
        'name', p.name,
        'address', p.address,
        'city', p.city,
        'country', p.country,
        'status', p.status,
        'data_origin', p.data_origin,
        'quality_score', p.quality_score,
        'photo_count', p.photo_count,
        'opening_slot_count', p.opening_slot_count,
        'has_description', p.has_description,
        'description_source', p.description_source,
        'has_keywords', p.has_keywords,
        'taxonomy_count', p.taxonomy_count,
        'verified_taxonomy_count', p.verified_taxonomy_count,
        'google_place_id', p.google_place_id,
        'google_photo_enabled', p.google_photo_enabled,
        'duplicate_google_place_id', p.duplicate_google_place_id,
        'duplicate_name_address', p.duplicate_name_address,
        'issues', (select coalesce(jsonb_agg(value order by key), '[]'::jsonb) from jsonb_each(p.issue_map)),
        'created_at', p.created_at,
        'updated_at', p.updated_at
      ) order by (p.issue_map ? 'possible_duplicate') desc, p.quality_score, p.updated_at desc, p.id)
      from page_rows p
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_spot_quality_v2(integer, integer, text, text) from public, anon;
grant execute on function public.admin_spot_quality_v2(integer, integer, text, text) to authenticated, service_role;

comment on function public.admin_spot_quality_v2(integer, integer, text, text) is
  'Live Admin-only operational completeness projection for active Product spots. Excludes archived/rejected and FIXTURE/TEST identities. Presentation-only: no eligibility, ranking, Gold or learning side effects.';

create or replace function public.admin_spots_operations_v2(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_status text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare v_result jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_from>=p_to then raise exception 'invalid_period' using errcode='22023'; end if;
  if nullif(p_status,'') is not null and p_status<>'all' and p_status not in ('approved','pending') then raise exception 'invalid_status_filter' using errcode='22023'; end if;

  with universe as (
    select s.* from public.spots s where s.data_origin in ('REAL','IMPORT','LEGACY') and s.status in ('approved','pending')
  ), filtered as (
    select s.* from universe s where
      (nullif(btrim(p_status),'') is null or p_status='all' or s.status::text=p_status)
      and (nullif(btrim(p_search),'') is null or s.name ilike '%'||p_search||'%' or coalesce(s.city,'') ilike '%'||p_search||'%' or coalesce(s.address,'') ilike '%'||p_search||'%' or s.id::text ilike '%'||p_search||'%' or coalesce(s.google_place_id,'') ilike '%'||p_search||'%')
  ), page as (
    select * from filtered order by updated_at desc,id limit greatest(1,least(coalesce(p_limit,50),200)) offset greatest(coalesce(p_offset,0),0)
  ), event_stats as (
    select e.spot_id,
      count(*) filter(where e.event_name in('spot_opened','spot_detail_opened','decision_spot_opened','map_spot_opened','feed_spot_opened','profile_spot_opened','profile_favorite_spot_opened','nearby_spot_opened'))::integer views,
      count(distinct e.user_id)::integer users,
      count(*) filter(where e.event_name='decision_spot_impression')::integer decision_impressions,
      count(*) filter(where e.event_name='decision_spot_opened')::integer decision_opens,
      count(*) filter(where e.event_name='spot_route_clicked')::integer route_clicks,
      count(*) filter(where e.event_name='spot_website_clicked')::integer website_clicks,
      count(*) filter(where e.event_name='spot_phone_clicked')::integer phone_clicks
    from public.analytics_events e join page p on p.id=e.spot_id
    where e.occurred_at>=p_from and e.occurred_at<p_to group by e.spot_id
  ), review_stats as (
    select r.spot_id,count(*)::integer reviews from public.reviews r join page p on p.id=r.spot_id
    where r.created_at>=p_from and r.created_at<p_to and r.data_origin in ('REAL','IMPORT','LEGACY') group by r.spot_id
  ), favorite_stats as (
    select f.spot_id,count(*)::integer favorites from public.favorites f join page p on p.id=f.spot_id group by f.spot_id
  ), global_events as (
    select count(*) filter(where e.event_name in('spot_opened','spot_detail_opened','decision_spot_opened','map_spot_opened','feed_spot_opened','profile_spot_opened','profile_favorite_spot_opened','nearby_spot_opened'))::integer views,
      count(distinct e.spot_id) filter(where e.event_name in('spot_opened','spot_detail_opened','decision_spot_opened','map_spot_opened','feed_spot_opened','profile_spot_opened','profile_favorite_spot_opened','nearby_spot_opened'))::integer viewed
    from public.analytics_events e join universe s on s.id=e.spot_id where e.occurred_at>=p_from and e.occurred_at<p_to
  )
  select jsonb_build_object(
    'summary',jsonb_build_object('spots',(select count(*) from universe),'viewed',(select viewed from global_events),'partner_spots',(select count(*) from universe where owner_id is not null),'views',(select views from global_events)),
    'filtered_total',(select count(*) from filtered),
    'freshness',jsonb_build_object('mode','live','calculated_at',statement_timestamp(),'excluded_origins',jsonb_build_array('FIXTURE','TEST')),
    'spots',coalesce((select jsonb_agg(jsonb_build_object(
      'spot_id',p.id,'name',p.name,'address',p.address,'city',p.city,'status',p.status,'partner',p.owner_id is not null,'google_place_id',p.google_place_id,'updated_at',p.updated_at,
      'views',coalesce(e.views,0),'users',coalesce(e.users,0),'decision_impressions',coalesce(e.decision_impressions,0),'decision_opens',coalesce(e.decision_opens,0),
      'ctr',case when coalesce(e.decision_impressions,0)>0 then round(e.decision_opens*100.0/e.decision_impressions,1) else 0 end,
      'reviews',coalesce(r.reviews,0),'favorites',coalesce(f.favorites,0),'route_clicks',coalesce(e.route_clicks,0),'website_clicks',coalesce(e.website_clicks,0),'phone_clicks',coalesce(e.phone_clicks,0)
    ) order by p.updated_at desc,p.id) from page p left join event_stats e on e.spot_id=p.id left join review_stats r on r.spot_id=p.id left join favorite_stats f on f.spot_id=p.id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.admin_spots_operations_v2(timestamptz,timestamptz,integer,integer,text,text) from public,anon;
grant execute on function public.admin_spots_operations_v2(timestamptz,timestamptz,integer,integer,text,text) to authenticated,service_role;
comment on function public.admin_spots_operations_v2(timestamptz,timestamptz,integer,integer,text,text) is 'Paginated live Admin Spot operations read. Excludes synthetic identities and has no Product-side effects.';

create or replace function public.admin_review_spots_v2()
returns table(id uuid,name text,city text,review_count bigint)
language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
  if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'admin_required' using errcode='42501'; end if;
  return query
  select s.id,s.name,s.city,count(r.id)
  from public.spots s
  left join public.reviews r on r.spot_id=s.id and r.data_origin in ('REAL','IMPORT','LEGACY')
  where s.data_origin in ('REAL','IMPORT','LEGACY') and s.status in ('approved','pending')
  group by s.id,s.name,s.city
  order by count(r.id) desc,s.name;
end $$;
revoke all on function public.admin_review_spots_v2() from public,anon;
grant execute on function public.admin_review_spots_v2() to authenticated,service_role;
comment on function public.admin_review_spots_v2() is 'Admin-only active Product Spot review queue; excludes synthetic identities and archived/rejected rows.';

create or replace function public.admin_review_spot_detail_v2(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'admin_required' using errcode='42501'; end if;
  select jsonb_build_object(
    'spot',jsonb_build_object('id',s.id,'name',s.name,'city',s.city),
    'reviews',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'text',r.text,'created_at',r.created_at,'mood_a',coalesce(ma.token,r.mood_a),
      'mood_b',coalesce(mb.token,r.mood_b),'profile_name',p.first_name,
      'photos',coalesce((select jsonb_agg(jsonb_build_object('url',rp.url) order by rp.created_at,rp.id) from public.review_photos rp where rp.review_id=r.id),'[]'::jsonb)
    ) order by r.created_at desc,r.id) from public.reviews r left join public.profiles p on p.id=r.user_id left join public.mood_tokens ma on ma.id=r.mood_a_id left join public.mood_tokens mb on mb.id=r.mood_b_id where r.spot_id=s.id and r.data_origin in ('REAL','IMPORT','LEGACY')),'[]'::jsonb)
  ) into v_result
  from public.spots s
  where s.id=p_spot_id and s.data_origin in ('REAL','IMPORT','LEGACY') and s.status in ('approved','pending');
  return v_result;
end $$;
revoke all on function public.admin_review_spot_detail_v2(uuid) from public,anon;
grant execute on function public.admin_review_spot_detail_v2(uuid) to authenticated,service_role;
comment on function public.admin_review_spot_detail_v2(uuid) is 'Read-only Admin review detail for an active non-synthetic Product Spot.';

create or replace function public.admin_spot_detail_operations_v2(p_spot_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
  if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'admin_required' using errcode='42501'; end if;
  if not exists(select 1 from public.spots s where s.id=p_spot_id and s.data_origin in('REAL','IMPORT','LEGACY') and s.status in('approved','pending')) then return null; end if;
  return public.admin_spot_detail_intelligence_v1(p_spot_id,p_from,p_to);
end $$;
revoke all on function public.admin_spot_detail_operations_v2(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_spot_detail_operations_v2(uuid,timestamptz,timestamptz) to authenticated,service_role;
comment on function public.admin_spot_detail_operations_v2(uuid,timestamptz,timestamptz) is 'Admin Spot detail boundary for active non-synthetic Product Spots; metric semantics unchanged.';
