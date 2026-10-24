-- Volta Pong and Volta Bräu share the same physical location. The founder
-- verified the same World Knowledge coordinates for both on 2026-10-24.
-- The earlier, still pending correction used a separate address centroid for
-- Pong. Align the legacy map source with the verified canonical coordinates.
do $$
declare
  v_braeu public.spots%rowtype;
  v_pong public.spots%rowtype;
begin
  select * into v_braeu from public.spots
  where id = '1101ee26-5046-4cdc-921a-5a3bd4cb5306' for update;
  select * into v_pong from public.spots
  where id = '580d1398-38e7-46d2-8cff-07f0b167e2ae' for update;

  if v_braeu.id is null or v_pong.id is null then
    return;
  end if;
  if v_braeu.status <> 'approved' or v_pong.status <> 'approved'
    or coalesce(v_braeu.address, '') not ilike 'Voltastrasse 30%'
    or coalesce(v_pong.address, '') not ilike 'Voltastrasse 30%'
  then
    raise exception 'volta_shared_location_spot_identity_changed';
  end if;
  if abs(v_braeu.lat - 47.571175840560464) >= 0.0000001
    or abs(v_braeu.lng - 7.5801917) >= 0.0000001
    or not (
      (abs(v_pong.lat - 47.570945739746094) < 0.0000001
        and abs(v_pong.lng - 7.580190658569336) < 0.0000001)
      or (abs(v_pong.lat - 47.571175840560464) < 0.0000001
        and abs(v_pong.lng - 7.5801917) < 0.0000001)
    )
  then
    raise exception 'volta_shared_location_requires_recheck';
  end if;

  update public.spots
  set lat = 47.571175840560464, lng = 7.5801917
  where id = v_pong.id
    and (abs(lat - 47.571175840560464) >= 0.0000001
      or abs(lng - 7.5801917) >= 0.0000001);
end;
$$;
