-- Mood Engine V1 final Founder closure.
--
-- Product changes are deliberately limited to:
--   1. one published REAL review per user/Spot/Europe-Zurich calendar day;
--   2. multi-visit Mood evidence normalized at user x Spot x concept level.
-- Historical Review rows and raw Mood expressions remain authoritative history.

create table public.backyrd_review_daily_publications_v1 (
  user_id uuid not null references auth.users(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  local_day date not null,
  review_id uuid not null,
  reservation_origin text not null
    check (reservation_origin in ('HISTORY_RECONCILIATION','PUBLISHED_INSERT')),
  created_at timestamptz not null default now(),
  primary key (user_id,spot_id,local_day),
  unique (review_id)
);

comment on table public.backyrd_review_daily_publications_v1 is
  'Race-safe Product publication limit. One REAL Review per user and Spot per Europe/Zurich calendar day; not a Safety signal.';

alter table public.backyrd_review_daily_publications_v1 enable row level security;
revoke all on table public.backyrd_review_daily_publications_v1 from public,anon,authenticated,service_role;
grant select on table public.backyrd_review_daily_publications_v1 to service_role;

-- Preserve every historical Review. Existing same-day duplicates reconcile to
-- one reservation only; no Review content, ownership or timestamp is changed.
insert into public.backyrd_review_daily_publications_v1(
  user_id,spot_id,local_day,review_id,reservation_origin,created_at
)
select distinct on (r.user_id,r.spot_id,(r.created_at at time zone 'Europe/Zurich')::date)
  r.user_id,r.spot_id,(r.created_at at time zone 'Europe/Zurich')::date,r.id,
  'HISTORY_RECONCILIATION',r.created_at
from public.reviews r
where r.user_id is not null and r.data_origin='REAL'
order by r.user_id,r.spot_id,(r.created_at at time zone 'Europe/Zurich')::date,r.created_at,r.id;

create or replace function public.backyrd_enforce_review_daily_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_local_day date := (clock_timestamp() at time zone 'Europe/Zurich')::date;
begin
  -- Provenance hardening runs first and forces untrusted Product writes to REAL.
  -- Migrations/import reconciliation run without an end-user/service JWT and do
  -- not manufacture publication reservations.
  if new.user_id is null
     or new.data_origin <> 'REAL'
     or coalesce(auth.role(),'') not in ('authenticated','service_role') then
    return new;
  end if;

  begin
    insert into public.backyrd_review_daily_publications_v1(
      user_id,spot_id,local_day,review_id,reservation_origin
    ) values (
      new.user_id,new.spot_id,v_local_day,new.id,'PUBLISHED_INSERT'
    );
  exception when unique_violation then
    raise exception 'REVIEW_SAME_DAY_LIMIT'
      using errcode='P0001',
        detail='One published Review per user and Spot per Europe/Zurich calendar day.',
        hint='Du hast diesen Ort heute bereits bewertet.';
  end;

  return new;
end
$$;

drop trigger if exists trg_backyrd_review_daily_publication_v1 on public.reviews;
create trigger trg_backyrd_review_daily_publication_v1
before insert on public.reviews
for each row execute function public.backyrd_enforce_review_daily_publication_v1();

revoke execute on function public.backyrd_enforce_review_daily_publication_v1()
  from public,anon,authenticated,service_role;

-- Evolve the existing one-row-per-user/Spot contribution into a normalized
-- multi-visit evidence row. source_review_id remains the latest eligible
-- Mood-bearing Review as a lineage anchor, never as the sole evidence source.
alter table public.backyrd_spot_mood_contributions_v1
  add column eligible_mood_review_count integer not null default 1
    check (eligible_mood_review_count > 0);

alter table public.backyrd_spot_mood_contribution_concepts_v1
  add column concept_review_count integer not null default 1
    check (concept_review_count > 0),
  add column user_mood_score numeric(9,8) not null default 1
    check (user_mood_score > 0 and user_mood_score <= 1);

-- source_slot is lineage metadata only after multi-visit aggregation. Several
-- distinct concepts across visits may legitimately have the same earliest slot.
do $$
declare v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid='public.backyrd_spot_mood_contribution_concepts_v1'::regclass
    and contype='u'
    and pg_get_constraintdef(oid)='UNIQUE (contribution_id, source_slot)';
  if v_constraint is not null then
    execute format('alter table public.backyrd_spot_mood_contribution_concepts_v1 drop constraint %I',v_constraint);
  end if;
end $$;

alter table public.backyrd_spot_mood_profile_v1
  add column community_score numeric(14,8) not null default 1
    check (community_score > 0);

create or replace function public.backyrd_rebuild_spot_mood_profile_v1(p_spot_id uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if p_spot_id is null then return; end if;
  delete from public.backyrd_spot_mood_profile_v1 where spot_id = p_spot_id;
  insert into public.backyrd_spot_mood_profile_v1(
    spot_id,concept_key,concept_contributors,eligible_contributors,percentage,
    evidence_state,rank,rebuilt_at,community_score
  )
  with eligible as (
    select c.id from public.backyrd_spot_mood_contributions_v1 c
    where c.spot_id=p_spot_id and c.eligible and c.eligible_mood_review_count>0
      and exists(select 1 from public.backyrd_spot_mood_contribution_concepts_v1 cc where cc.contribution_id=c.id)
  ), denominator as (
    select count(*)::integer value from eligible
  ), scores as (
    select cc.concept_key,
      count(*)::integer concept_contributors,
      sum(cc.user_mood_score)::numeric(14,8) community_score
    from eligible e
    join public.backyrd_spot_mood_contribution_concepts_v1 cc on cc.contribution_id=e.id
    group by cc.concept_key
  ), ranked as (
    select scores.*,denominator.value eligible_contributors,
      round(100.0*scores.community_score/denominator.value,2) percentage,
      row_number() over(
        order by scores.community_score desc,scores.concept_contributors desc,scores.concept_key
      )::integer rank
    from scores cross join denominator where denominator.value>0
  )
  select p_spot_id,concept_key,concept_contributors,eligible_contributors,percentage,
    case when eligible_contributors>=3 then 'ESTABLISHED' else 'EARLY' end,
    rank,now(),community_score
  from ranked;
end $$;

create or replace function public.backyrd_refresh_current_mood_contribution_v1(p_user_id uuid,p_spot_id uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_latest_review_id uuid;
  v_latest_created_at timestamptz;
  v_contribution_id uuid;
  v_existing_key uuid;
  v_denominator integer;
begin
  if p_user_id is null or p_spot_id is null then return; end if;

  with eligible_reviews as (
    select r.id,r.created_at
    from public.reviews r
    where r.user_id=p_user_id and r.spot_id=p_spot_id
      and r.data_origin not in ('TEST','FIXTURE')
      and exists (
        select 1
        from public.backyrd_review_mood_expressions_v1 e
        join public.backyrd_mood_concepts_v1 mc on mc.concept_key=e.concept_key and mc.active
        where e.review_id=r.id and e.resolution_status='RESOLVED'
      )
      and not exists (
        select 1 from public.safety_content_items sci
        where sci.entity_type='review' and sci.entity_id=r.id
          and sci.lifecycle_status in ('hidden','removed','deleted')
      )
      and public.distribution_trust_entity_is_eligible_v1('review',r.id,'feed')
  )
  select er.id,er.created_at,count(*) over()::integer
    into v_latest_review_id,v_latest_created_at,v_denominator
  from eligible_reviews er
  order by er.created_at desc,er.id desc
  limit 1;

  select contributor_key into v_existing_key
  from public.backyrd_spot_mood_contributions_v1
  where spot_id=p_spot_id and user_id=p_user_id
  for update;

  if v_latest_review_id is null then
    delete from public.backyrd_spot_mood_contributions_v1
    where spot_id=p_spot_id and user_id=p_user_id;
    perform public.backyrd_rebuild_spot_mood_profile_v1(p_spot_id);
    return;
  end if;

  insert into public.backyrd_spot_mood_contributions_v1(
    contributor_key,spot_id,user_id,source_review_id,contributed_at,eligible,
    ineligibility_reason,eligible_mood_review_count,updated_at
  ) values (
    coalesce(v_existing_key,gen_random_uuid()),p_spot_id,p_user_id,
    v_latest_review_id,v_latest_created_at,true,null,v_denominator,now()
  )
  on conflict (spot_id,user_id) where user_id is not null do update set
    source_review_id=excluded.source_review_id,
    contributed_at=excluded.contributed_at,
    eligible=true,
    ineligibility_reason=null,
    eligible_mood_review_count=excluded.eligible_mood_review_count,
    updated_at=now()
  returning id into v_contribution_id;

  delete from public.backyrd_spot_mood_contribution_concepts_v1
  where contribution_id=v_contribution_id;

  insert into public.backyrd_spot_mood_contribution_concepts_v1(
    contribution_id,concept_key,source_slot,concept_review_count,user_mood_score
  )
  with eligible_reviews as (
    select r.id
    from public.reviews r
    where r.user_id=p_user_id and r.spot_id=p_spot_id
      and r.data_origin not in ('TEST','FIXTURE')
      and exists (
        select 1
        from public.backyrd_review_mood_expressions_v1 e
        join public.backyrd_mood_concepts_v1 mc on mc.concept_key=e.concept_key and mc.active
        where e.review_id=r.id and e.resolution_status='RESOLVED'
      )
      and not exists (
        select 1 from public.safety_content_items sci
        where sci.entity_type='review' and sci.entity_id=r.id
          and sci.lifecycle_status in ('hidden','removed','deleted')
      )
      and public.distribution_trust_entity_is_eligible_v1('review',r.id,'feed')
  ), per_review_concept as (
    select distinct er.id review_id,e.concept_key,min(e.slot)::smallint source_slot
    from eligible_reviews er
    join public.backyrd_review_mood_expressions_v1 e on e.review_id=er.id
    join public.backyrd_mood_concepts_v1 mc on mc.concept_key=e.concept_key and mc.active
    where e.resolution_status='RESOLVED'
    group by er.id,e.concept_key
  )
  select v_contribution_id,prc.concept_key,min(prc.source_slot)::smallint,
    count(*)::integer,(count(*)::numeric/v_denominator)::numeric(9,8)
  from per_review_concept prc
  group by prc.concept_key;

  perform public.backyrd_rebuild_spot_mood_profile_v1(p_spot_id);
end $$;

-- A merge changes per-review concept distinctness and therefore requires a
-- source-based user-evidence rebuild, not a direct derived-row rewrite.
create or replace function public.backyrd_admin_merge_mood_concepts_v1(
  p_source_concept_key text,p_target_concept_key text,p_reason text
) returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid:=auth.uid();r record;v_target text;
begin
  if v_uid is null or not public.is_admin_v1(v_uid) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_source_concept_key is null or p_target_concept_key is null or p_source_concept_key=p_target_concept_key then
    raise exception 'distinct_concepts_required' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'reason_required' using errcode='22023'; end if;
  if not exists(select 1 from public.backyrd_mood_concepts_v1 where concept_key=p_source_concept_key and active)
     or not exists(select 1 from public.backyrd_mood_concepts_v1 where concept_key=p_target_concept_key and active) then
    raise exception 'active_concepts_required' using errcode='22023';
  end if;
  v_target:=p_target_concept_key;

  update public.backyrd_mood_aliases_v1 set concept_key=v_target,updated_at=now()
  where concept_key=p_source_concept_key;
  update public.backyrd_review_mood_expressions_v1 set concept_key=v_target,
    resolution_kind='ADMIN',resolved_at=now(),updated_at=now()
  where concept_key=p_source_concept_key;
  update public.backyrd_mood_concepts_v1 set active=false,
    merged_into_concept_key=v_target,updated_at=now()
  where concept_key=p_source_concept_key;

  for r in
    select distinct user_id,spot_id
    from public.backyrd_review_mood_expressions_v1
    where concept_key=v_target and user_id is not null
  loop
    perform public.backyrd_refresh_current_mood_contribution_v1(r.user_id,r.spot_id);
  end loop;

  insert into public.backyrd_mood_governance_audit_v1(
    actor_user_id,action,source_concept_key,target_concept_key,reason,metadata
  ) values (
    v_uid,'MERGE_CONCEPT',p_source_concept_key,v_target,btrim(p_reason),
    jsonb_build_object('sourceConceptKey',p_source_concept_key,'targetConceptKey',v_target)
  );
  return jsonb_build_object('ok',true,'sourceConceptKey',p_source_concept_key,'targetConceptKey',v_target);
end $$;

-- Reconcile every existing user/Spot contribution from preserved Review
-- history, then rebuild the one canonical Spot profile.
do $$ declare r record; begin
  for r in select distinct user_id,spot_id from public.reviews where user_id is not null loop
    perform public.backyrd_refresh_current_mood_contribution_v1(r.user_id,r.spot_id);
  end loop;
end $$;

comment on column public.backyrd_spot_mood_contributions_v1.eligible_mood_review_count is
  'Eligible Mood-bearing Review denominator for this unique user and Spot.';
comment on column public.backyrd_spot_mood_contribution_concepts_v1.user_mood_score is
  'concept_review_count / eligible_mood_review_count for one unique user and Spot.';
comment on column public.backyrd_spot_mood_profile_v1.community_score is
  'Sum of normalized user-level Mood scores across unique eligible contributors.';
comment on table public.backyrd_spot_mood_contributions_v1 is
  'One normalized multi-visit Community Mood evidence row per user and Spot. Historical Reviews remain separate.';
