-- Founder acceptance closure for Canonical Product Mood V1.
-- Forward-only: no Review history or canonical contribution is rewritten.

-- Every accepted unresolved expression must be governable, including the
-- first occurrence. Frequency remains available for Admin prioritization but
-- must not decide whether evidence is visible at all.
create or replace view public.backyrd_mood_unresolved_candidates_v1
with (security_invoker=true) as
select e.normalized_expression,min(e.raw_expression) sample_expression,count(*)::integer usage_count,
  count(distinct e.spot_id)::integer affected_spots,min(e.created_at) first_seen_at,max(e.created_at) last_seen_at
from public.backyrd_review_mood_expressions_v1 e
where e.resolution_status='UNRESOLVED'
group by e.normalized_expression;

-- Autocomplete is public Product vocabulary. Its optional popularity order
-- may read only the already privacy-masked public profile projection; the
-- protected aggregate base table remains unavailable to anon/authenticated.
create or replace function public.backyrd_search_mood_concepts_v1(
  p_query text default null,p_locale text default 'de',p_limit integer default 12
) returns table(concept_key text,label text,matched_expression text,match_type text,usage_count bigint)
language sql stable security invoker set search_path = public, pg_catalog as $$
  with input as (
    select lower(regexp_replace(btrim(normalize(coalesce(p_query,''), NFC)), '\s+', ' ', 'g')) q
  ), usage as (
    select p.concept_key,coalesce(sum(p.concept_contributors),0)::bigint count
    from public.backyrd_spot_mood_profile_public_v1 p
    group by p.concept_key
  ), matches as (
    select c.concept_key,coalesce(c.display_labels->>coalesce(nullif(p_locale,''),'de'),c.canonical_label) label,
      a.expression matched_expression,case when a.origin='CANONICAL_LABEL' then 'CANONICAL' else 'ALIAS' end match_type,
      coalesce(u.count,0) usage_count,
      case when i.q='' then 2 when a.normalized_expression=i.q then 0 when a.normalized_expression like i.q||'%' then 1 else 2 end match_rank
    from public.backyrd_mood_concepts_v1 c
    join public.backyrd_mood_aliases_v1 a on a.concept_key=c.concept_key and a.active
    cross join input i left join usage u on u.concept_key=c.concept_key
    where c.active and (i.q='' or a.normalized_expression like '%'||i.q||'%')
  )
  select distinct on (m.concept_key) m.concept_key,m.label,m.matched_expression,m.match_type,m.usage_count
  from matches m order by m.concept_key,m.match_rank,m.usage_count desc,m.matched_expression
  limit greatest(1,least(coalesce(p_limit,12),30))
$$;

comment on view public.backyrd_mood_unresolved_candidates_v1 is
  'Admin-only governed queue of every unresolved submitted Mood expression; frequency prioritizes but never hides a candidate.';
comment on function public.backyrd_search_mood_concepts_v1(text,text,integer) is
  'Public deterministic canonical Mood and alias autocomplete backed only by privacy-safe Product vocabulary/profile reads.';
