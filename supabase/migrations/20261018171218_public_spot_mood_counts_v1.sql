-- Total published resolved Mood submissions, not Review count or distinct label count.
-- A repeated concept within one Review counts once; legitimate later visits remain submissions.
create or replace function public.backyrd_public_spot_mood_counts_v1(p_spot_ids uuid[])
returns table(spot_id uuid, mood_count bigint)
language plpgsql stable security definer
set search_path = public, pg_catalog
as $$
begin
  if cardinality(coalesce(p_spot_ids, array[]::uuid[])) > 200 then
    raise exception 'spot_mood_count_batch_limit' using errcode='22023';
  end if;
  return query
  with requested as materialized (
    select s.id from public.spots s
    where s.id = any(coalesce(p_spot_ids, array[]::uuid[]))
      and s.status = 'approved'
      and coalesce(s.data_origin, 'LEGACY') not in ('TEST','FIXTURE')
      and public.distribution_trust_entity_is_eligible_v1('spot', s.id, 'discovery')
  )
  select s.id, count(distinct (e.review_id,e.concept_key)) filter (where c.active)::bigint
  from requested s
  left join public.reviews r on r.spot_id = s.id
    and coalesce(r.data_origin, 'LEGACY') not in ('TEST','FIXTURE')
    and not exists (
      select 1 from public.safety_content_items i
      where i.entity_type = 'review' and i.entity_id = r.id
        and i.lifecycle_status in ('hidden','removed','deleted')
    )
    and public.distribution_trust_entity_is_eligible_v1('review', r.id, 'feed')
  left join public.backyrd_review_mood_expressions_v1 e on e.review_id=r.id
    and e.spot_id=s.id and e.user_id=r.user_id and e.resolution_status='RESOLVED'
  left join public.backyrd_mood_concepts_v1 c on c.concept_key=e.concept_key
  group by s.id;
end;
$$;
revoke all on function public.backyrd_public_spot_mood_counts_v1(uuid[]) from public;
grant execute on function public.backyrd_public_spot_mood_counts_v1(uuid[]) to anon, authenticated, service_role;
comment on function public.backyrd_public_spot_mood_counts_v1(uuid[]) is
 'Public total of resolved active Mood submissions on visible eligible Reviews, bounded to 200 Product Spots. No identities or raw expressions. Not a rating, unique person count or distinct label count.';
