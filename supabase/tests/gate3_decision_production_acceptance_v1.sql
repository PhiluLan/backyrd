\set ON_ERROR_STOP on
begin;

create function pg_temp.gate3_uuid(p_value text) returns uuid
language sql immutable as $$
  select (substr(md5(p_value),1,8)||'-'||substr(md5(p_value),9,4)||'-4'||substr(md5(p_value),14,3)||'-8'||substr(md5(p_value),18,3)||'-'||substr(md5(p_value),21,12))::uuid
$$;

create function pg_temp.gate3_assert(p_ok boolean,p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then raise exception 'Gate-3 availability acceptance failed: %',p_message; end if;
end
$$;

do $$
declare
  v_day uuid:=pg_temp.gate3_uuid('gate3-day-hours');
  v_overnight uuid:=pg_temp.gate3_uuid('gate3-overnight-hours');
  v_unknown uuid:=pg_temp.gate3_uuid('gate3-unknown-hours');
begin
  insert into public.spots(id,name,lat,lng,status,city,data_origin)
  values
    (v_day,'Gate 3 day schedule',47.55,7.59,'approved','Basel','TEST'),
    (v_overnight,'Gate 3 overnight schedule',47.56,7.60,'approved','Basel','TEST'),
    (v_unknown,'Gate 3 unknown schedule',47.57,7.61,'approved','Basel','TEST');

  insert into public.spot_hours(spot_id,idx,day_of_week,open_time,close_time)
  values
    (v_day,1,'Mittwoch','12:00','14:00'),
    (v_overnight,1,'Freitag','22:00','02:00');

  perform pg_temp.gate3_assert(public.backyrd_spot_is_open_at_v1(v_day,'2026-09-02 12:30 Europe/Zurich'), 'day interval did not open');
  perform pg_temp.gate3_assert(not public.backyrd_spot_is_open_at_v1(v_day,'2026-09-02 14:00 Europe/Zurich'), 'closing boundary was treated as open');
  perform pg_temp.gate3_assert(public.backyrd_spot_is_open_at_v1(v_overnight,'2026-09-04 23:00 Europe/Zurich'), 'overnight start day did not open');
  perform pg_temp.gate3_assert(public.backyrd_spot_is_open_at_v1(v_overnight,'2026-09-05 01:00 Europe/Zurich'), 'overnight next-day interval did not open');
  perform pg_temp.gate3_assert(not public.backyrd_spot_is_open_at_v1(v_overnight,'2026-09-05 02:00 Europe/Zurich'), 'overnight closing boundary was treated as open');
  perform pg_temp.gate3_assert(public.backyrd_spot_is_open_at_v1(v_unknown,'2026-09-02 12:30 Europe/Zurich') is null, 'missing hours did not remain UNKNOWN');
  perform pg_temp.gate3_assert(public.backyrd_spot_is_open_at_v1(null,'2026-09-02 12:30 Europe/Zurich') is null, 'missing spot did not remain UNKNOWN');
end
$$;

rollback;
