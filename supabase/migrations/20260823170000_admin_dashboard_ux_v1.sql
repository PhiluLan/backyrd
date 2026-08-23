-- UI-only admin worklist projection. Canonical Gold truth remains authoritative.
create or replace function public.admin_spot_readiness_worklist_v1(p_spot_ids uuid[] default null)
returns table(
  spot_id uuid,
  readiness_status text,
  coverage integer,
  gap_count integer,
  conflict_count integer,
  attention_state text
)
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
begin
  if not coalesce(public.admin_is_admin_v1(),false) then
    raise exception 'admin_required' using errcode='42501';
  end if;

  return query
  select
    s.id,
    r.value->>'status',
    coalesce((r.value->>'coverage')::integer,0),
    jsonb_array_length(coalesce(r.value->'gaps','[]'::jsonb)),
    (select count(*)::integer from jsonb_array_elements(coalesce(r.value->'gaps','[]'::jsonb)) gap where gap->>'state'='CONFLICT'),
    case
      when exists(select 1 from jsonb_array_elements(coalesce(r.value->'gaps','[]'::jsonb)) gap where gap->>'state' in ('CONFLICT','INVALID')) then 'REVIEW'
      when r.value->>'status'='GOLD_READY' then 'READY'
      else 'INCOMPLETE'
    end
  from public.spots s
  cross join lateral (select public.backyrd_gold_readiness_v1(s.id) as value) r
  where p_spot_ids is null or s.id=any(p_spot_ids)
  order by s.name;
end;
$$;

revoke all on function public.admin_spot_readiness_worklist_v1(uuid[]) from public,anon;
grant execute on function public.admin_spot_readiness_worklist_v1(uuid[]) to authenticated,service_role;

comment on function public.admin_spot_readiness_worklist_v1(uuid[]) is
  'Admin-only UI projection of authoritative Human Gold Readiness. It does not alter truth, N4, eligibility, or ranking.';
