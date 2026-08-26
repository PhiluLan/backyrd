-- Audited production fixture cleanup. Only ids with FIXTURE provenance and no
-- real-account-linked durable history are hard-deleted. Five history-bearing
-- fixtures are retained as archived tombstones and excluded from normal reads.
create temporary table backyrd_fixture_delete_v1(
  spot_id uuid primary key,
  expected_name text not null
) on commit drop;

insert into backyrd_fixture_delete_v1(spot_id,expected_name) values
  ('5900a6c2-b8a7-4a7a-9360-f941739b7cee','testtestets'),
  ('1466d63f-517c-46e3-b1a6-9e827ff95f4f','Execution B'),
  ('bd6c1f4c-b279-4863-a2d3-1d73e29bface','Execution C'),
  ('edb5435b-cbaf-40c2-850d-ba4dd3b4fc0c','Execution A'),
  ('0d6e8e24-be6d-4fbd-a8af-3a093c3d7bfa','Execution C'),
  ('b6a7821d-39fb-44d1-a068-9afbe872057a','Execution A'),
  ('f11f1fd9-53f1-4724-a877-54aede23aafc','Execution B'),
  ('9078e5ca-d3f4-49e9-93f0-1486b6bd8fc6','Execution C'),
  ('cfa74c43-12d5-4895-b0b4-cc89ba3c1f6b','Execution B'),
  ('d89765d4-75a9-4328-bea0-f71936380459','Execution A'),
  ('1af217f0-131e-408b-99e3-db333cc26e38','Execution B'),
  ('c55972cf-9ca6-4133-8d9b-c6edc03b1e67','Execution A'),
  ('ef284062-52c4-413b-8c53-0c6c7f3b43d3','Execution C'),
  ('b8d65210-19b1-4dcd-9c37-32d72ad764df','S4 Lively 63befa75'),
  ('adb07db7-8e83-484d-9f86-1080344f74d7','S4 Partial 63befa75'),
  ('c8dfb9c2-143c-4317-8051-5ec8fb3ad1ab','S4 Unknown 63befa75'),
  ('32384a20-3ab1-440d-9352-8e70b4f13796','S4 Copenhagen 63befa75'),
  ('1d580d67-6297-4cd9-9300-a4eed652d1bc','S5 Quiet 67ebde1b'),
  ('e4f9f3d5-a812-4345-844a-af383630271d','S5 Lively 67ebde1b'),
  ('51c77c7f-65ec-41b3-a6f0-b1994ae009cd','S5 Romantic 67ebde1b'),
  ('45dc13d1-650f-448c-8809-73fc3cd9655b','S5 Unknown 67ebde1b'),
  ('c474f944-3c68-403d-b677-d7845d3eab76','S5 Partial 67ebde1b'),
  ('0ebb970b-6026-46e0-b5b2-e1bb1125beda','S5 Copenhagen 67ebde1b'),
  ('e88e7ad6-276f-4bbc-a24f-bb648d162c87','S4 Lively 377f2d32'),
  ('98e25732-7723-40e9-ab92-2ebb18521b3b','S4 Partial 377f2d32'),
  ('50db72b9-2a06-4a39-9f23-a9325ee78cdc','S4 Unknown 377f2d32');

create temporary table backyrd_fixture_tombstone_v1(
  spot_id uuid primary key,
  expected_name text not null
) on commit drop;

insert into backyrd_fixture_tombstone_v1(spot_id,expected_name) values
  ('6af880c0-215e-40b6-8a7e-8b7e68321afe','Philipps Home'),
  ('13affe38-b268-4109-8c66-a7469f9823b7','TEST Smilla Café'),
  ('347c6088-56f4-4001-b960-10ef0b20ea02','S4 Quiet 63befa75'),
  ('cafb40dc-3502-4ee9-9774-3dbfba1c454e','S4 Quiet 377f2d32'),
  ('a6cd394c-1e8c-44ba-82de-0e48a36789fc','S4 Copenhagen 377f2d32');

do $$
begin
  if (select count(*) from backyrd_fixture_delete_v1) <> 26
     or (select count(*) from backyrd_fixture_tombstone_v1) <> 5 then
    raise exception 'fixture_cleanup_set_size_mismatch';
  end if;
  if exists(
    select 1 from (
      select * from backyrd_fixture_delete_v1
      union all select * from backyrd_fixture_tombstone_v1
    ) c left join public.spots s on s.id=c.spot_id
    where s.id is null or s.data_origin <> 'FIXTURE' or s.name <> c.expected_name
  ) then
    raise exception 'fixture_cleanup_identity_or_provenance_mismatch';
  end if;
  if exists(
    select 1 from public.reviews r join backyrd_fixture_delete_v1 c on c.spot_id=r.spot_id
    where r.data_origin <> 'FIXTURE' or r.review_origin <> 'FIXTURE'
  ) then raise exception 'fixture_cleanup_non_fixture_review_guard'; end if;

  -- Fail closed if any durable consumer, social, or learning history appeared
  -- on the hard-delete set after the inventory.
  if exists(select 1 from public.backyrd_memory_event_evidence_envelopes_v1 e join backyrd_fixture_delete_v1 c on c.spot_id=e.spot_id)
     or exists(select 1 from public.backyrd_memory_events_v1 e join backyrd_fixture_delete_v1 c on c.spot_id=e.spot_id)
     or exists(select 1 from public.backyrd_self_declared_taste_v1 e join backyrd_fixture_delete_v1 c on c.spot_id=e.spot_id)
     or exists(select 1 from public.backyrd_taste_evidence_v1 e join backyrd_fixture_delete_v1 c on c.spot_id=e.spot_id)
     or exists(select 1 from public.backyrd_decision_candidate_evidence_v1 e join backyrd_fixture_delete_v1 c on c.spot_id=e.spot_id)
     or exists(select 1 from public.backyrd_decision_candidate_offerings_v1 e join backyrd_fixture_delete_v1 c on c.spot_id=e.spot_id)
     or exists(select 1 from public.analytics_events e join backyrd_fixture_delete_v1 c on c.spot_id=e.spot_id)
     or exists(select 1 from public.social_posts e join backyrd_fixture_delete_v1 c on c.spot_id=e.spot_id)
     or exists(select 1 from public.social_feed_events e join backyrd_fixture_delete_v1 c on c.spot_id=e.spot_id)
  then raise exception 'fixture_cleanup_durable_history_guard'; end if;
end;
$$;

-- These NO ACTION rows belong to deleted fixture accounts and validation runs.
delete from public.backyrd_ml_events_v1 e using backyrd_fixture_delete_v1 c where e.spot_id=c.spot_id;
delete from public.safety_content_items e using backyrd_fixture_delete_v1 c where e.spot_id=c.spot_id;

-- Review deletion refreshes the derived ML document. Run it while the parent
-- fixture Spot still exists; deleting it through the parent cascade makes that
-- trigger fail closed because the document builder can no longer read the Spot.
delete from public.reviews e using backyrd_fixture_delete_v1 c where e.spot_id=c.spot_id;
delete from public.spot_hours e using backyrd_fixture_delete_v1 c where e.spot_id=c.spot_id;

-- All remaining audited dependencies use ON DELETE CASCADE.
delete from public.spots s using backyrd_fixture_delete_v1 c where s.id=c.spot_id;

-- Preserve history-bearing fixtures without keeping them active.
update public.spots s set status='archived',updated_at=now()
from backyrd_fixture_tombstone_v1 c where s.id=c.spot_id and s.status<>'archived';

-- Product-data Admin worklists must not contain internal fixture tombstones.
create or replace function public.admin_spots_intelligence_v1(
  p_from timestamptz,p_to timestamptz,p_limit integer default 500,
  p_offset integer default 0,p_search text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare r jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'not_authorized' using errcode='42501'; end if;
  with b as(
    select s.id spot_id,s.name,s.city,s.status,(s.owner_id is not null) partner,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name in('spot_opened','spot_detail_opened','decision_spot_opened','map_spot_opened','feed_spot_opened','profile_spot_opened','profile_favorite_spot_opened','nearby_spot_opened')) views,
      count(distinct e.user_id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to) users,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name='decision_spot_impression') decision_impressions,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name='decision_spot_opened') decision_opens,
      count(distinct rv.id) filter(where rv.created_at>=p_from and rv.created_at<p_to) reviews,
      count(distinct f.user_id) favorites,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name='spot_route_clicked') route_clicks,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name='spot_website_clicked') website_clicks,
      count(e.id) filter(where e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name='spot_phone_clicked') phone_clicks
    from public.spots s
    left join public.analytics_events e on e.spot_id=s.id
    left join public.reviews rv on rv.spot_id=s.id
    left join public.favorites f on f.spot_id=s.id
    where s.data_origin not in ('TEST','FIXTURE')
      and (p_search is null or concat_ws(' ',s.name,s.city) ilike '%'||p_search||'%')
    group by s.id,s.name,s.city,s.status,s.owner_id
  ), page as(
    select *,case when decision_impressions>0 then round(decision_opens*100.0/decision_impressions,1) else 0 end ctr
    from b order by views desc,name limit greatest(1,least(p_limit,2000)) offset greatest(p_offset,0)
  )
  select jsonb_build_object('summary',jsonb_build_object('spots',(select count(*) from b),'viewed',(select count(*) from b where views>0),'partner_spots',(select count(*) from b where partner),'views',(select coalesce(sum(views),0) from b)),'spots',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into r;
  return r;
end;
$$;

create or replace function public.admin_spot_readiness_worklist_v1(p_spot_ids uuid[] default null)
returns table(spot_id uuid,readiness_status text,coverage integer,gap_count integer,conflict_count integer,attention_state text)
language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
  if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'admin_required' using errcode='42501'; end if;
  return query
  select s.id,r.value->>'status',coalesce((r.value->>'coverage')::integer,0),jsonb_array_length(coalesce(r.value->'gaps','[]'::jsonb)),
    (select count(*)::integer from jsonb_array_elements(coalesce(r.value->'gaps','[]'::jsonb)) gap where gap->>'state'='CONFLICT'),
    case when exists(select 1 from jsonb_array_elements(coalesce(r.value->'gaps','[]'::jsonb)) gap where gap->>'state' in ('CONFLICT','INVALID')) then 'REVIEW' when r.value->>'status'='GOLD_READY' then 'READY' else 'INCOMPLETE' end
  from public.spots s cross join lateral (select public.backyrd_gold_readiness_v1(s.id) as value) r
  where s.data_origin not in ('TEST','FIXTURE') and (p_spot_ids is null or s.id=any(p_spot_ids)) order by s.name;
end;
$$;

comment on function public.admin_spots_intelligence_v1(timestamptz,timestamptz,integer,integer,text) is
  'Admin product-spot worklist. TEST/FIXTURE rows remain directly inspectable but never pollute the normal list.';
