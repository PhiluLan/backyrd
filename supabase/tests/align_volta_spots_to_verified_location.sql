\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Volta shared location: %', p_message;
  end if;
end;
$$;

insert into public.spots (id, name, address, city, lat, lng, status)
values
  ('1101ee26-5046-4cdc-921a-5a3bd4cb5306', 'Volta Bräu', 'Voltastrasse 30, 4056 Basel', 'Basel', 47.57103, 7.57845, 'approved'),
  ('580d1398-38e7-46d2-8cff-07f0b167e2ae', 'Volta Pong', 'Voltastrasse 30, 4056 Basel, Schweiz', 'Basel', 47.5717, 7.5799, 'approved');

-- Exercise the actual pending migration sequence on fresh spot rows.
\ir ../migrations/20261024160151_correct_volta_venue_coordinates.sql
\ir ../migrations/20261024162056_align_volta_spots_to_verified_location.sql

select pg_temp.assert(
  (select count(*) = 2 from public.spots
   where id in ('1101ee26-5046-4cdc-921a-5a3bd4cb5306', '580d1398-38e7-46d2-8cff-07f0b167e2ae')
     and abs(lat - 47.571175840560464) < 0.0000001
     and abs(lng - 7.5801917) < 0.0000001),
  'both spots must use the same verified location'
);

-- Reapplying the forward alignment is safe after the coordinates match.
\ir ../migrations/20261024162056_align_volta_spots_to_verified_location.sql
select pg_temp.assert(
  (select count(*) = 2 from public.spots
   where id in ('1101ee26-5046-4cdc-921a-5a3bd4cb5306', '580d1398-38e7-46d2-8cff-07f0b167e2ae')
     and abs(lat - 47.571175840560464) < 0.0000001
     and abs(lng - 7.5801917) < 0.0000001),
  'repeat alignment changed the shared location'
);

rollback;
