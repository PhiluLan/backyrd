-- Schematic restaurant table geometry. Capacity and reservations are unchanged.
create function booking_private.valid_table_layout_v1(p_layout jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare x numeric; y numeric; w numeric; h numeric; begin
 if p_layout is null or p_layout='null'::jsonb then return true; end if;
 if jsonb_typeof(p_layout) is distinct from 'object'
   or not p_layout ?& array['x','y','width','height','shape']
   or p_layout-array['x','y','width','height','shape']<>'{}'::jsonb then return false; end if;
 if jsonb_typeof(p_layout->'x') is distinct from 'number' or jsonb_typeof(p_layout->'y') is distinct from 'number'
   or jsonb_typeof(p_layout->'width') is distinct from 'number' or jsonb_typeof(p_layout->'height') is distinct from 'number'
   or jsonb_typeof(p_layout->'shape') is distinct from 'string'
   or p_layout->>'shape' not in ('rectangle','round') then return false; end if;
 x:=(p_layout->>'x')::numeric; y:=(p_layout->>'y')::numeric;
 w:=(p_layout->>'width')::numeric; h:=(p_layout->>'height')::numeric;
 return x=floor(x) and y=floor(y) and w=floor(w) and h=floor(h)
   and x>=0 and y>=0 and w between 40 and 300 and h between 40 and 300 and x+w<=1000 and y+h<=700;
 exception when numeric_value_out_of_range or invalid_text_representation then return false;
end $$;
revoke all on function booking_private.valid_table_layout_v1(jsonb) from public,anon,authenticated;
grant usage on schema booking_private to service_role;
grant execute on function booking_private.valid_table_layout_v1(jsonb) to service_role;
alter table public.booking_restaurant_tables add column layout jsonb,
 add constraint booking_table_layout_valid check (booking_private.valid_table_layout_v1(layout));

-- Old setup clients continue to preserve geometry. An actual room move resets
-- its room-relative position; the temporary retire/reactivate setup sequence
-- intentionally does not clear geometry on ordinary configuration saves.
create function booking_private.reset_moved_table_layout_v1() returns trigger
language plpgsql set search_path='' as $$ begin
 if new.area_id is distinct from old.area_id then new.layout:=null; end if;
 return new;
end $$;
revoke all on function booking_private.reset_moved_table_layout_v1() from public,anon,authenticated;
create trigger booking_table_room_move_layout before update of area_id on public.booking_restaurant_tables
 for each row execute function booking_private.reset_moved_table_layout_v1();

create function public.booking_console_save_layout_v1(p_spot_id uuid,p_revision bigint,p_entries jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_revision bigint; v_item jsonb; v_table public.booking_restaurant_tables%rowtype; v_changed boolean:=false;
begin
 perform booking_private.assert_operator(p_spot_id);
 if p_revision is null or p_revision<0 or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)>200 then
  raise exception 'invalid_booking_layout' using errcode='22023'; end if;
 select revision into v_revision from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 if (select count(distinct (j->>'table_id')::uuid) from jsonb_array_elements(p_entries) j)<>jsonb_array_length(p_entries) then
  raise exception 'invalid_booking_layout' using errcode='22023'; end if;
 for v_item in select * from jsonb_array_elements(p_entries) loop
  if jsonb_typeof(v_item) is distinct from 'object' or not v_item ?& array['table_id','area_id','layout']
    or v_item-array['table_id','area_id','layout']<>'{}'::jsonb
    or not booking_private.valid_table_layout_v1(v_item->'layout') then
   raise exception 'invalid_booking_layout' using errcode='22023'; end if;
  select * into v_table from public.booking_restaurant_tables where spot_id=p_spot_id and id=(v_item->>'table_id')::uuid;
  if not found then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
  if v_table.area_id is distinct from (v_item->>'area_id')::uuid then
   raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
  v_changed:=v_changed or v_table.layout is distinct from nullif(v_item->'layout','null'::jsonb);
 end loop;
 -- An identical patch after a lost response is already satisfied, even if
 -- another operator has since edited an unrelated part of the setup.
 if not v_changed then return v_revision; end if;
 if v_revision<>p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
 for v_item in select * from jsonb_array_elements(p_entries) loop
  update public.booking_restaurant_tables set layout=nullif(v_item->'layout','null'::jsonb)
   where spot_id=p_spot_id and id=(v_item->>'table_id')::uuid;
 end loop;
 update public.booking_restaurant_settings set revision=revision+1,updated_at=now() where spot_id=p_spot_id;
 insert into public.booking_audit_events(spot_id,actor_id,action) values(p_spot_id,auth.uid(),'table_layout_saved');
 return v_revision+1;
end $$;
revoke all on function public.booking_console_save_layout_v1(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.booking_console_save_layout_v1(uuid,bigint,jsonb) to authenticated;

create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_operator(p_spot_id);
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true),
   'operating_date', (now() at time zone 'Europe/Zurich')::date,
   'settings', (select to_jsonb(s) from public.booking_restaurant_settings s where spot_id=p_spot_id),
   'areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.name) from public.booking_restaurant_areas a where spot_id=p_spot_id), '[]'),
   'tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.label) from public.booking_restaurant_tables t where spot_id=p_spot_id), '[]'),
   'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.opens_at) from public.booking_restaurant_services s where spot_id=p_spot_id), '[]'),
   'unclosed_visits', case when p_date=(now() at time zone 'Europe/Zurich')::date then
     coalesce((select jsonb_agg((to_jsonb(r)-'creation_fingerprint'-'last_amend_request_id') order by r.starts_at)
       from public.booking_reservations r where r.spot_id=p_spot_id and r.status='seated'
         and r.starts_at<(p_date::timestamp at time zone 'Europe/Zurich')), '[]'::jsonb) else '[]'::jsonb end,
   'reservations', coalesce((select jsonb_agg((to_jsonb(r)-'creation_fingerprint'-'last_amend_request_id') order by r.starts_at) from public.booking_reservations r
     where spot_id=p_spot_id and starts_at >= (p_date::timestamp at time zone 'Europe/Zurich')
       and starts_at < ((p_date+1)::timestamp at time zone 'Europe/Zurich')), '[]')
 );
end;
$$;
