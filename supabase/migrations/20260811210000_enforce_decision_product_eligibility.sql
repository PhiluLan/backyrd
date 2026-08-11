-- Product eligibility is independent of Distribution eligibility. Public
-- Decision scoring must never admit a Spot before its canonical product state
-- is approved. Keeping this predicate in the shared V3 candidate source makes
-- V11, V12, Mobile V13 personalized candidates and Public Web inherit one
-- deterministic boundary without changing any ranking formula or weight.
create or replace function public.backyrd_get_decision_debug_v3(
  p_city text default null,
  p_selected_cluster_ids integer[] default null,
  p_query text default null,
  p_limit integer default 30,
  p_k numeric default 3.0,
  p_open_bonus numeric default 0.02
) returns table(
  spot_id uuid,
  name text,
  city text,
  is_open_now boolean,
  raw_mood_strength integer,
  mood_strength_norm numeric,
  mood_match_count integer,
  text_match_score numeric,
  open_now_bonus numeric,
  final_score numeric,
  has_mood_signal boolean,
  has_text_signal boolean,
  used_semantic_fallback boolean,
  matched_tokens text[],
  matched_counts integer[],
  matched_terms text[],
  why_this text
)
language sql
stable
as $$
with base_spots as (
  select s.id as spot_id, s.name, s.city
  from public.spots s
  where s.status = 'approved'::public.spot_status
    and (p_city is null or s.city = p_city)
),
text_sig as (
  select
    b.spot_id,
    case
      when p_query is null or length(trim(p_query)) = 0 then 0::numeric
      when lower(b.name) like '%' || lower(p_query) || '%' then 1::numeric
      when lower(b.city) like '%' || lower(p_query) || '%' then 0.5::numeric
      else 0::numeric
    end as text_match_score,
    case
      when p_query is null or length(trim(p_query)) = 0 then array[]::text[]
      else array[p_query]::text[]
    end as matched_terms
  from base_spots b
),
cluster_tokens_mapped as (
  select distinct mtc.cluster_id, mtc.token_id
  from public.mood_token_clusters mtc
  where p_selected_cluster_ids is null or mtc.cluster_id = any(p_selected_cluster_ids)
),
cluster_tokens_seed as (
  select distinct c.id as cluster_id, t.id as token_id
  from public.mood_clusters c
  join public.mood_tokens t on t.token_norm = c.name_norm
  where p_selected_cluster_ids is null or c.id = any(p_selected_cluster_ids)
),
selected_cluster_tokens as (
  select * from cluster_tokens_mapped
  union
  select * from cluster_tokens_seed
),
token_counts as (
  select a.spot_id, a.mood_id as token_id, a.mood_count
  from public.spot_moods_agg_reviews_v1 a
  join base_spots b on b.spot_id = a.spot_id
),
selected_token_counts as (
  select tc.spot_id, sct.cluster_id, tc.token_id, tc.mood_count
  from token_counts tc
  join selected_cluster_tokens sct on sct.token_id = tc.token_id
),
mood_sig as (
  select
    stc.spot_id,
    coalesce(sum(stc.mood_count), 0)::integer as raw_mood_strength,
    count(distinct stc.cluster_id)::integer as mood_match_count,
    array_agg(mt.token_norm order by stc.mood_count desc, mt.token_norm)
      filter (where stc.mood_count > 0) as matched_tokens_all,
    array_agg(stc.mood_count order by stc.mood_count desc, mt.token_norm)
      filter (where stc.mood_count > 0) as matched_counts_all
  from selected_token_counts stc
  join public.mood_tokens mt on mt.id = stc.token_id
  group by stc.spot_id
),
open_sig as (
  select b.spot_id, public.spot_is_open_now_safe_v1(b.spot_id) as is_open_now
  from base_spots b
),
final as (
  select
    b.spot_id,
    b.name,
    b.city,
    o.is_open_now,
    coalesce(m.raw_mood_strength, 0) as raw_mood_strength,
    (1 - exp(-(coalesce(m.raw_mood_strength, 0)::numeric) / nullif(p_k, 0)))::numeric
      as mood_strength_norm,
    coalesce(m.mood_match_count, 0) as mood_match_count,
    coalesce(t.text_match_score, 0) as text_match_score,
    case when o.is_open_now is true then p_open_bonus else 0::numeric end as open_now_bonus,
    (
      (1 - exp(-(coalesce(m.raw_mood_strength, 0)::numeric) / nullif(p_k, 0)))::numeric
      + coalesce(t.text_match_score, 0) * 0.15
      + case when o.is_open_now is true then p_open_bonus else 0::numeric end
    ) as final_score,
    coalesce(m.raw_mood_strength, 0) > 0 as has_mood_signal,
    coalesce(t.text_match_score, 0) > 0 as has_text_signal,
    coalesce(m.raw_mood_strength, 0) = 0 as used_semantic_fallback,
    coalesce(m.matched_tokens_all[1:5], array[]::text[]) as matched_tokens,
    coalesce(m.matched_counts_all[1:5], array[]::integer[]) as matched_counts,
    coalesce(t.matched_terms, array[]::text[]) as matched_terms,
    case
      when coalesce(m.raw_mood_strength, 0) > 0 then
        'Mood-Match: ' || coalesce(m.raw_mood_strength, 0)::text || ' Signals, ' ||
        coalesce(m.mood_match_count, 0)::text || ' Cluster. Top Token: ' ||
        coalesce((m.matched_tokens_all[1])::text, '—') || '.'
      when coalesce(t.text_match_score, 0) > 0 then
        'Text-Match zu "' || p_query || '".'
      else
        'Fallback: wenig Mood/Text-Signal (Trend/Popularität o.ä.).'
    end as why_this
  from base_spots b
  left join mood_sig m on m.spot_id = b.spot_id
  left join text_sig t on t.spot_id = b.spot_id
  left join open_sig o on o.spot_id = b.spot_id
)
select *
from final
order by final_score desc, raw_mood_strength desc, name asc
limit p_limit;
$$;

comment on function public.backyrd_get_decision_debug_v3(
  text, integer[], text, integer, numeric, numeric
) is
  'Shared Decision candidate scorer. Public product eligibility is enforced before scoring: only approved Spots participate.';
