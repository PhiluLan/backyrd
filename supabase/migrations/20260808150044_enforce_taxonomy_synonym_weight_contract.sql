-- Backyrd taxonomy synonym weights are confidence multipliers in the inclusive
-- range 0.1..1.5. Reject invalid input before replacing existing synonyms.

create or replace function public.admin_set_taxonomy_synonyms_v1(
  p_taxonomy_node_id uuid,
  p_synonyms jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer;
begin
  if coalesce(public.admin_is_admin_v1(), false) is not true then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_synonyms, '[]'::jsonb)) item
    where nullif(trim(item->>'synonym'), '') is not null
      and (
        coalesce((item->>'weight')::numeric, 1) < 0.1
        or coalesce((item->>'weight')::numeric, 1) > 1.5
      )
  ) then
    raise exception 'synonym weight must be between 0.1 and 1.5'
      using errcode = '22023';
  end if;

  delete from public.taxonomy_synonyms ts
  where ts.taxonomy_node_id = p_taxonomy_node_id;

  insert into public.taxonomy_synonyms (
    taxonomy_node_id, locale, synonym, weight
  )
  select
    p_taxonomy_node_id,
    case when lower(coalesce(item->>'locale', 'de')) = 'en' then 'en' else 'de' end,
    trim(item->>'synonym'),
    coalesce((item->>'weight')::numeric, 1)
  from jsonb_array_elements(coalesce(p_synonyms, '[]'::jsonb)) item
  where nullif(trim(item->>'synonym'), '') is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_set_taxonomy_synonyms_v1(uuid, jsonb)
  from public, anon;
grant execute on function public.admin_set_taxonomy_synonyms_v1(uuid, jsonb)
  to authenticated, service_role;
