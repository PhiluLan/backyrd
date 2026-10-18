-- Public counts are separate from unique Mood contributors. No Review data leaves this RPC.
create or replace function public.backyrd_public_spot_review_counts_v1(p_spot_ids uuid[])
returns table(spot_id uuid, review_count bigint)
language plpgsql stable security definer
set search_path = public, pg_catalog
as $$
begin
  if cardinality(coalesce(p_spot_ids, array[]::uuid[])) > 200 then
    raise exception 'spot_review_count_batch_limit' using errcode='22023';
  end if;
  return query
  with requested as materialized (
    select s.id from public.spots s
    where s.id = any(coalesce(p_spot_ids, array[]::uuid[]))
      and s.status = 'approved'
      and coalesce(s.data_origin, 'LEGACY') not in ('TEST','FIXTURE')
      and public.distribution_trust_entity_is_eligible_v1('spot', s.id, 'discovery')
  )
  select s.id, count(r.id)::bigint
  from requested s
  left join public.reviews r on r.spot_id = s.id
    and coalesce(r.data_origin, 'LEGACY') not in ('TEST','FIXTURE')
    and not exists (
      select 1 from public.safety_content_items i
      where i.entity_type = 'review' and i.entity_id = r.id
        and i.lifecycle_status in ('hidden','removed','deleted')
    )
    and public.distribution_trust_entity_is_eligible_v1('review', r.id, 'feed')
  group by s.id;
end;
$$;
revoke all on function public.backyrd_public_spot_review_counts_v1(uuid[]) from public;
grant execute on function public.backyrd_public_spot_review_counts_v1(uuid[]) to anon, authenticated, service_role;
comment on function public.backyrd_public_spot_review_counts_v1(uuid[]) is
  'Bounded public counts of visible, distribution-eligible non-test Reviews for eligible Product Spots. Not a rating or unique contributor count.';
