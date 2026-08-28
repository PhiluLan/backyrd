-- Gate 1 schema convergence.
--
-- Two earlier migrations are immutable, exact-row Production data operations.
-- Re-state their schema effects here so a zero-data canonical bootstrap can
-- exclude those operations without changing runtime schema semantics.

-- Production retained this pre-baseline compatibility entry point after its
-- automatic review trigger was retired. The canonical baseline only commented
-- it when present, which made clean bootstrap omit the function entirely.
create or replace function public.check_review_achievements()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  review_count int;
begin
  select count(*) into review_count from public.reviews where user_id=new.user_id;
  if review_count>=1 then perform public.unlock_achievement(new.user_id,'review_1'); end if;
  if review_count>=5 then perform public.unlock_achievement(new.user_id,'review_5'); end if;
  if review_count>=25 then perform public.unlock_achievement(new.user_id,'review_25'); end if;
  if review_count>=50 then perform public.unlock_achievement(new.user_id,'review_50'); end if;
  if review_count>=100 then perform public.unlock_achievement(new.user_id,'review_100'); end if;
  if review_count>=200 then perform public.unlock_achievement(new.user_id,'review_200'); end if;
  if review_count>=500 then perform public.unlock_achievement(new.user_id,'review_500'); end if;
  if lower(new.city)='basel' then perform public.unlock_achievement(new.user_id,'city_basel_yoda'); end if;
  if lower(new.city) in ('zürich','zurich') then perform public.unlock_achievement(new.user_id,'city_zurich_yoda'); end if;
  if lower(new.city)='bern' then perform public.unlock_achievement(new.user_id,'city_bern_yoda'); end if;
  return new;
end;
$$;

revoke all on function public.check_review_achievements() from public,anon,authenticated;
grant execute on function public.check_review_achievements() to service_role;

comment on function public.check_review_achievements() is
  'Legacy trigger entry point retained for service-role compatibility; automatic review invocation is retired.';

-- Normalize two logically equivalent CHECK parse trees that differed only
-- because the canonical baseline and a schema-dump restore grouped associative
-- AND terms differently. The accepted value sets are unchanged.
alter table public.account_trust_engine_versions
  drop constraint account_trust_engine_versions_check1,
  add constraint account_trust_engine_versions_check1 check (
    trusted_min_score between 0 and 100
    and normal_min_score between 0 and trusted_min_score
    and suspicious_min_score between 0 and normal_min_score
  );

alter table public.account_trust_signal_registry
  drop constraint account_trust_signal_registry_base_score_impact_check,
  add constraint account_trust_signal_registry_base_score_impact_check check (
    base_score_impact between -100 and 100 and base_score_impact<>0
  );

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

drop policy if exists spots_select_internal_admin_product_all_status_v1 on public.spots;
create policy spots_select_internal_admin_product_all_status_v1
on public.spots for select to authenticated
using (data_origin not in ('TEST','FIXTURE') and public.is_admin_v1(auth.uid()));

comment on policy spots_select_internal_admin_product_all_status_v1 on public.spots is
  'Admin detail parity with admin_spots_intelligence_v1 for non-fixture Product Spots across workflow statuses.';

-- Runtime settings are an internal control plane. They were previously a
-- client-writable, RLS-disabled public table even though workers read them as
-- authoritative execution switches.
alter table public.backyrd_user_intelligence_runtime_settings_v1 enable row level security;
revoke all on table public.backyrd_user_intelligence_runtime_settings_v1 from public,anon,authenticated;
grant select,update on table public.backyrd_user_intelligence_runtime_settings_v1 to service_role;

-- These tables already had RLS with no client policies (therefore denied all
-- client access). Remove their unnecessary client grants to make that boundary
-- explicit and robust against accidental future policy additions.
revoke all on table public.backyrd_decision_review_links_v1 from public,anon,authenticated;
revoke all on table public.backyrd_user_context_feature_preferences_v1 from public,anon,authenticated;

comment on table public.backyrd_user_intelligence_runtime_settings_v1 is
  'Internal service-role runtime switch. RLS enabled; no client grants or policies.';

-- Three legacy own-read policies still called the service-only arbitrary-user
-- consent helper. Authenticated direct reads therefore hit a denied function
-- inside RLS (and PostgreSQL 17.6 local reproduces a backend crash). Route them
-- through the existing authenticated, current-user-only consent helper. The
-- authorization meaning is unchanged: own row plus active personalization
-- consent.
drop policy if exists backyrd_user_taste_map_v1_read_own_consented
  on public.backyrd_user_taste_map_v1;
create policy backyrd_user_taste_map_v1_read_own_consented
  on public.backyrd_user_taste_map_v1 for select to authenticated
  using (auth.uid()=user_id and public.backyrd_current_user_has_personalization_consent_v1());

drop policy if exists backyrd_user_behavior_patterns_v1_read_own
  on public.backyrd_user_behavior_patterns_v1;
create policy backyrd_user_behavior_patterns_v1_read_own
  on public.backyrd_user_behavior_patterns_v1 for select to authenticated
  using (auth.uid()=user_id and public.backyrd_current_user_has_personalization_consent_v1());

drop policy if exists backyrd_user_intelligence_state_v1_read_own
  on public.backyrd_user_intelligence_state_v1;
create policy backyrd_user_intelligence_state_v1_read_own
  on public.backyrd_user_intelligence_state_v1 for select to authenticated
  using (auth.uid()=user_id and public.backyrd_current_user_has_personalization_consent_v1());
