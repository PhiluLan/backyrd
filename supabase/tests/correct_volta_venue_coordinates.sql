\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Volta coordinates: %', p_message;
  end if;
end;
$$;

-- Production rows are absent from a clean boot. Recreate only the two
-- migration preconditions, then execute the actual migration in this tx.
insert into public.spots (id, name, address, city, lat, lng, status)
values
  ('1101ee26-5046-4cdc-921a-5a3bd4cb5306', 'Volta Bräu', 'Voltastrasse 30, 4056 Basel', 'Basel', 47.57103, 7.57845, 'approved'),
  ('580d1398-38e7-46d2-8cff-07f0b167e2ae', 'Volta Pong', 'Voltastrasse 30, 4056 Basel, Schweiz', 'Basel', 47.5717, 7.5799, 'approved');

\ir ../migrations/20261024160151_correct_volta_venue_coordinates.sql

select pg_temp.assert(
  (select abs(lat - 47.571175840560464) < 0.0000001
      and abs(lng - 7.5801917) < 0.0000001
   from public.spots where id = '1101ee26-5046-4cdc-921a-5a3bd4cb5306'),
  'Volta Bräu did not move to the verified venue position'
);
select pg_temp.assert(
  (select abs(lat - 47.570945739746094) < 0.0000001
      and abs(lng - 7.580190658569336) < 0.0000001
   from public.spots where id = '580d1398-38e7-46d2-8cff-07f0b167e2ae'),
  'Volta Pong did not move to the federal address point'
);

-- Both independent pins must remain close enough to represent one address.
select pg_temp.assert(
  (select 6371000 * 2 * asin(sqrt(
    power(sin(radians((p.lat - b.lat) / 2)), 2)
    + cos(radians(b.lat)) * cos(radians(p.lat))
      * power(sin(radians((p.lng - b.lng) / 2)), 2)
  )) < 30
  from public.spots b, public.spots p
  where b.id = '1101ee26-5046-4cdc-921a-5a3bd4cb5306'
    and p.id = '580d1398-38e7-46d2-8cff-07f0b167e2ae'),
  'two spots at Voltastrasse 30 are still far apart'
);

-- A repeated migration must preserve the corrected positions.
\ir ../migrations/20261024160151_correct_volta_venue_coordinates.sql
select pg_temp.assert(
  (select count(*) = 2 from public.spots
   where id in ('1101ee26-5046-4cdc-921a-5a3bd4cb5306', '580d1398-38e7-46d2-8cff-07f0b167e2ae')
     and lng > 7.58018),
  'repeat execution changed or removed a corrected spot'
);

rollback;
