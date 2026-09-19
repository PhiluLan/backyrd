-- Production Admin discovery uses the real approved spot catalog, never the
-- local Founder evaluation set. No private claims or actor data leave this RPC.
create function public.world_product_admin_search_spots_v1(
  p_search text default null,
  p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_query text := nullif(pg_catalog.btrim(p_search), '');
  v_spots jsonb;
  v_more boolean;
begin
  if auth.uid() is null or not public.admin_is_admin_v1() then
    raise exception 'world_product_admin_required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 30
     or pg_catalog.char_length(v_query) > 80
     or v_query ~ '[[:cntrl:]]' then
    raise exception 'world_product_search_input_invalid' using errcode = '22023';
  end if;

  with matches as (
    select s.id, s.name, s.city
    from public.spots s
    where s.status = 'approved'
      and (v_query is null or pg_catalog.strpos(pg_catalog.lower(s.name), pg_catalog.lower(v_query)) > 0)
    order by pg_catalog.lower(s.name), s.id
    limit p_limit + 1
  ), numbered as (
    select id, name, city, pg_catalog.row_number() over (order by pg_catalog.lower(name), id) as position
    from matches
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'spotId', id, 'name', name, 'city', city
    ) order by position) filter (where position <= p_limit), '[]'::jsonb),
    coalesce(pg_catalog.bool_or(position > p_limit), false)
  into v_spots, v_more
  from numbered;

  return pg_catalog.jsonb_build_object(
    'contractVersion', 'backyrd.world-knowledge.product-admin-spot-search@1.0',
    'spots', v_spots, 'hasMore', v_more
  );
end;
$$;

revoke all on function public.world_product_admin_search_spots_v1(text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.world_product_admin_search_spots_v1(text,integer)
  to authenticated;

comment on function public.world_product_admin_search_spots_v1(text,integer)
  is 'Bounded Admin-only name discovery over approved Production spots; no Founder cohort, private World claims, contacts, or actor identities.';
