-- Both venues advertise Voltastrasse 30, 4056 Basel. Their legacy spot
-- coordinates currently place them 132 m apart and away from that address.
-- Volta Bräu uses its current VERIFIED World Knowledge location; Volta Pong
-- uses the Swiss federal address point (GeoAdmin SearchServer, sr=4326):
-- https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Voltastrasse%2030%204056%20Basel&type=locations&origins=address&sr=4326
-- Keep separate, accurate coordinates on the same premises so both pins can
-- still be selected independently on the consumer map.

do $$
declare
  v_braeu public.spots%rowtype;
  v_pong public.spots%rowtype;
begin
  select * into v_braeu from public.spots
  where id = '1101ee26-5046-4cdc-921a-5a3bd4cb5306' for update;
  select * into v_pong from public.spots
  where id = '580d1398-38e7-46d2-8cff-07f0b167e2ae' for update;

  -- Fresh local and staging databases may contain neither or only one spot.
  if v_braeu.id is null or v_pong.id is null then
    return;
  end if;

  if v_braeu.status <> 'approved' or v_pong.status <> 'approved'
    or coalesce(v_braeu.address, '') not ilike 'Voltastrasse 30%'
    or coalesce(v_pong.address, '') not ilike 'Voltastrasse 30%'
    or v_braeu.lat is null or v_braeu.lng is null
    or v_pong.lat is null or v_pong.lng is null
  then
    raise exception 'volta_coordinate_correction_spot_identity_changed';
  end if;

  if not (
    (abs(v_braeu.lat - 47.57103) < 0.0000001 and abs(v_braeu.lng - 7.57845) < 0.0000001)
    or (abs(v_braeu.lat - 47.571175840560464) < 0.0000001 and abs(v_braeu.lng - 7.5801917) < 0.0000001)
  ) or not (
    (abs(v_pong.lat - 47.5717) < 0.0000001 and abs(v_pong.lng - 7.5799) < 0.0000001)
    or (abs(v_pong.lat - 47.570945739746094) < 0.0000001 and abs(v_pong.lng - 7.580190658569336) < 0.0000001)
  ) then
    raise exception 'volta_coordinate_correction_requires_recheck';
  end if;

  update public.spots
  set lat = 47.571175840560464, lng = 7.5801917
  where id = v_braeu.id
    and (abs(lat - 47.571175840560464) >= 0.0000001
      or abs(lng - 7.5801917) >= 0.0000001);

  update public.spots
  set lat = 47.570945739746094, lng = 7.580190658569336
  where id = v_pong.id
    and (abs(lat - 47.570945739746094) >= 0.0000001
      or abs(lng - 7.580190658569336) >= 0.0000001);
end;
$$;
