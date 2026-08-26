-- Image projection only: this RPC does not rank, order, or expand Product
-- visibility. It supplies the existing Owner/Admin-selected header for already
-- visible public spot cards.
create or replace function public.backyrd_web_canonical_spot_image_headers_v1(
  p_spot_ids uuid[]
) returns table(spot_id uuid, header_photo_path text)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select s.id, nullif(btrim(s.header_photo_path), '')
  from public.spots s
  where s.id = any(coalesce(p_spot_ids, array[]::uuid[]))
    and s.status = 'approved'
    and public.distribution_trust_entity_is_eligible_v1('spot', s.id, 'discovery');
$$;

revoke all on function public.backyrd_web_canonical_spot_image_headers_v1(uuid[]) from public;
grant execute on function public.backyrd_web_canonical_spot_image_headers_v1(uuid[]) to anon, authenticated, service_role;
