-- Delegated Booking permissions do not grant global Owner/profile privileges.
create table public.booking_team_members (
 spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('viewer','host','manager')),
 revision bigint not null default 0 check(revision>=0),
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(spot_id,user_id), check(user_id<>owner_id)
);
create index booking_team_user_active on public.booking_team_members(user_id,spot_id) where revoked_at is null;
alter table public.booking_team_members enable row level security;
revoke all on public.booking_team_members from public,anon,authenticated;
grant all on public.booking_team_members to service_role;

create table booking_private.team_invitations_v1 (
 id uuid primary key,
 spot_id uuid not null references public.booking_restaurant_settings(spot_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 email text not null check(email=lower(trim(email)) and length(email)<=320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 role text not null check(role in ('viewer','host','manager')),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null,
 accepted_by uuid references auth.users(id) on delete set null,
 accepted_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index booking_invitation_pending_email on booking_private.team_invitations_v1(spot_id,email) where accepted_at is null and revoked_at is null;
create index booking_invitation_spot on booking_private.team_invitations_v1(spot_id,created_at);
alter table booking_private.team_invitations_v1 enable row level security;
revoke all on booking_private.team_invitations_v1 from public,anon,authenticated;
grant all on booking_private.team_invitations_v1 to service_role;

create function booking_private.console_role_v1(p_spot uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when s.owner_id=auth.uid() then 'owner' else m.role end
 from public.spots s left join public.booking_team_members m on m.spot_id=s.id and m.user_id=auth.uid() and m.owner_id=s.owner_id and m.revoked_at is null
 where s.id=p_spot and auth.uid() is not null;
$$;
create function booking_private.assert_team_safety_v1(p_owner uuid) returns void
language plpgsql set search_path='' as $$ declare u uuid; begin
 -- Shared actor/owner ordering also orders Safety expiry updates across restaurants.
 for u in select distinct x from unnest(array[p_owner,auth.uid()]) x where x is not null order by x loop
  perform public.safety_assert_user_can_perform_v2(u,'can_edit_owner_content');
 end loop;
end $$;
create function booking_private.assert_console_access_v1(p_spot uuid,p_scope text) returns void
language plpgsql security definer set search_path='' as $$ declare r text; o uuid; begin
 if p_scope not in ('read','write','manage','team') or p_scope is null or auth.uid() is null then raise exception 'booking_operator_required' using errcode='42501'; end if;
 -- Revocation and the check share the same restaurant serialization boundary.
 if p_scope='read' then perform 1 from public.booking_restaurant_settings where spot_id=p_spot for share;
 else perform 1 from public.booking_restaurant_settings where spot_id=p_spot for update; end if;
 r:=booking_private.console_role_v1(p_spot);
 if r is null or (p_scope='write' and r not in ('owner','manager','host')) or (p_scope='manage' and r not in ('owner','manager')) or (p_scope='team' and r<>'owner') then
  raise exception 'booking_operator_required' using errcode='42501'; end if;
 select owner_id into o from public.spots where id=p_spot;
 perform booking_private.assert_team_safety_v1(o);
end $$;
create function booking_private.console_access_v1(p_spot uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('role',r,'can_write',r in ('owner','manager','host'),'can_manage',r in ('owner','manager'),'can_manage_team',r='owner') from (select booking_private.console_role_v1(p_spot) r) role;
$$;
revoke all on function booking_private.console_role_v1(uuid),booking_private.assert_team_safety_v1(uuid),
 booking_private.assert_console_access_v1(uuid,text),booking_private.console_access_v1(uuid) from public,anon,authenticated;

create function public.booking_console_access_v1(p_spot_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 return booking_private.console_access_v1(p_spot_id);
end $$;
create function public.booking_console_spots_v1() returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'booking_operator_required' using errcode='42501'; end if;
 perform public.safety_assert_user_can_perform_v2(auth.uid(),'can_edit_owner_content');
 return (with candidates as (
  select id from public.spots where owner_id=auth.uid()
  union select spot_id from public.booking_team_members where user_id=auth.uid() and revoked_at is null
 ) select coalesce(jsonb_agg(jsonb_build_object('spot_id',s.id,'name',s.name,'city',s.city,'access_role',r.role) order by s.name,s.id),'[]'::jsonb)
 from candidates c join public.spots s on s.id=c.id cross join lateral (select booking_private.console_role_v1(s.id) role) r where r.role is not null);
end $$;
create function public.booking_console_team_v1(p_spot_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform booking_private.assert_console_access_v1(p_spot_id,'team');
 return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role,'revision',m.revision,'revoked_at',m.revoked_at) order by m.created_at,m.user_id)
  from public.booking_team_members m join auth.users u on u.id=m.user_id where m.spot_id=p_spot_id and m.owner_id=auth.uid()),'[]'::jsonb),
  'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'expires_at',i.expires_at,'accepted_at',i.accepted_at,'revoked_at',i.revoked_at) order by i.created_at desc,i.id)
   from (select * from booking_private.team_invitations_v1 where spot_id=p_spot_id and owner_id=auth.uid() order by created_at desc,id limit 100) i),'[]'::jsonb));
end $$;
create function public.booking_console_invite_v1(p_spot_id uuid,p_request_id uuid,p_email text,p_role text,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i booking_private.team_invitations_v1%rowtype; e text:=lower(trim(p_email)); h text; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'team');
 if p_request_id is null or e is null or length(e)>320 or e !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  or p_role is null or p_role not in ('viewer','host','manager') or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
  raise exception 'invalid_booking_invitation' using errcode='22023'; end if;
 if not exists(select 1 from public.booking_restaurant_settings where spot_id=p_spot_id) then raise exception 'booking_setup_required' using errcode='22023'; end if;
 h:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 select * into i from booking_private.team_invitations_v1 where id=p_request_id;
 if found then
  if i.spot_id<>p_spot_id or i.owner_id<>auth.uid() or i.email<>e or i.role<>p_role or i.token_hash<>h then raise exception 'booking_request_reused' using errcode='22023'; end if;
  if i.revoked_at is not null or i.accepted_at is not null or i.expires_at<=clock_timestamp() then raise exception 'booking_invitation_unavailable' using errcode='22023'; end if;
  return jsonb_build_object('id',i.id,'expires_at',i.expires_at);
 end if;
 if exists(select 1 from auth.users where id=auth.uid() and lower(email)=e) then raise exception 'booking_team_owner_has_access' using errcode='22023'; end if;
 if exists(select 1 from public.booking_team_members m join auth.users u on u.id=m.user_id where m.spot_id=p_spot_id and m.owner_id=auth.uid() and m.revoked_at is null and lower(u.email)=e) then
  raise exception 'booking_team_member_exists' using errcode='22023'; end if;
 update booking_private.team_invitations_v1 set revoked_at=clock_timestamp() where spot_id=p_spot_id and owner_id=auth.uid() and email=e and accepted_at is null and revoked_at is null and expires_at<=clock_timestamp();
 if exists(select 1 from booking_private.team_invitations_v1 where spot_id=p_spot_id and email=e and accepted_at is null and revoked_at is null) then
  raise exception 'booking_invitation_exists' using errcode='22023'; end if;
 insert into booking_private.team_invitations_v1(id,spot_id,owner_id,email,role,token_hash,expires_at)
  values(p_request_id,p_spot_id,auth.uid(),e,p_role,h,clock_timestamp()+interval '7 days') returning * into i;
 insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),'team_invited',jsonb_build_object('invitation_id',i.id,'role',i.role));
 return jsonb_build_object('id',i.id,'expires_at',i.expires_at);
end $$;
create function public.booking_console_revoke_invite_v1(p_spot_id uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
 perform booking_private.assert_console_access_v1(p_spot_id,'team');
 update booking_private.team_invitations_v1 set revoked_at=clock_timestamp() where id=p_id and spot_id=p_spot_id and owner_id=auth.uid() and revoked_at is null;
 if found then insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),'team_invitation_revoked',jsonb_build_object('invitation_id',p_id)); end if;
end $$;
create function public.booking_console_member_v1(p_spot_id uuid,p_user_id uuid,p_revision bigint,p_role text default null) returns bigint
language plpgsql security definer set search_path='' as $$ declare m public.booking_team_members%rowtype; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'team');
 if p_revision is null or p_revision<0 or (p_role is not null and p_role not in ('viewer','host','manager')) then raise exception 'invalid_booking_team_role' using errcode='22023'; end if;
 select * into m from public.booking_team_members where spot_id=p_spot_id and user_id=p_user_id and owner_id=auth.uid();
 if not found then raise exception 'booking_team_member_not_found' using errcode='22023'; end if;
 if (p_role is null and m.revoked_at is not null) or (m.revoked_at is null and m.role=p_role) then return m.revision; end if;
 if m.revision<>p_revision then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 if m.revoked_at is not null then raise exception 'booking_team_member_revoked' using errcode='22023'; end if;
 update public.booking_team_members set role=coalesce(p_role,role),revoked_at=case when p_role is null then clock_timestamp() else null end,revision=revision+1,updated_at=now() where spot_id=p_spot_id and user_id=p_user_id;
 if p_role is null then update booking_private.team_invitations_v1 set revoked_at=clock_timestamp() where spot_id=p_spot_id and accepted_by=p_user_id and revoked_at is null; end if;
 insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),case when p_role is null then 'team_member_revoked' else 'team_role_changed' end,jsonb_build_object('user_id',p_user_id,'previous_role',m.role,'role',p_role));
 return m.revision+1;
end $$;
create function public.booking_console_invitation_v1(p_token text,p_accept boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i booking_private.team_invitations_v1%rowtype; m public.booking_team_members%rowtype; o uuid; e text; verified timestamptz; role_name text; begin
 if auth.uid() is null then raise exception 'booking_operator_required' using errcode='42501'; end if;
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_accept is null then raise exception 'booking_invitation_unavailable' using errcode='22023'; end if;
 select * into i from booking_private.team_invitations_v1 where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then raise exception 'booking_invitation_unavailable' using errcode='22023'; end if;
 if p_accept then perform 1 from public.booking_restaurant_settings where spot_id=i.spot_id for update;
 else perform 1 from public.booking_restaurant_settings where spot_id=i.spot_id for share; end if;
 select * into i from booking_private.team_invitations_v1 where id=i.id;
 select owner_id into o from public.spots where id=i.spot_id;
 if i.revoked_at is not null or o is distinct from i.owner_id then raise exception 'booking_invitation_unavailable' using errcode='22023'; end if;
 select * into m from public.booking_team_members where spot_id=i.spot_id and user_id=auth.uid() and owner_id=o;
 if i.accepted_at is not null then
  if i.accepted_by is distinct from auth.uid() or m.revoked_at is not null or m.user_id is null then raise exception 'booking_invitation_unavailable' using errcode='22023'; end if;
  role_name:=m.role;
 else
  select lower(email),email_confirmed_at into e,verified from auth.users where id=auth.uid();
  if e is distinct from i.email or verified is null or i.expires_at<=clock_timestamp() or (m.user_id is not null and m.revoked_at is null) then
   raise exception 'booking_invitation_unavailable' using errcode='22023'; end if;
  role_name:=i.role;
 end if;
 perform booking_private.assert_team_safety_v1(o);
 if p_accept and i.accepted_at is null then
  insert into public.booking_team_members(spot_id,user_id,owner_id,role) values(i.spot_id,auth.uid(),o,i.role)
   on conflict(spot_id,user_id) do update set owner_id=excluded.owner_id,role=excluded.role,revoked_at=null,revision=public.booking_team_members.revision+1,updated_at=now();
  update booking_private.team_invitations_v1 set accepted_by=auth.uid(),accepted_at=clock_timestamp() where id=i.id;
  insert into public.booking_audit_events(spot_id,actor_id,action,details) values(i.spot_id,auth.uid(),'team_joined',jsonb_build_object('invitation_id',i.id,'role',i.role));
 end if;
 return jsonb_build_object('spot_id',i.spot_id,'spot_name',(select name from public.spots where id=i.spot_id),'role',role_name,'expires_at',i.expires_at,'accepted',p_accept or i.accepted_at is not null);
end $$;

create function booking_private.revoke_team_on_owner_change_v1() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.booking_restaurant_settings where spot_id=new.id for update;
 if not found then return new; end if;
 update public.booking_team_members set revoked_at=clock_timestamp(),revision=revision+1,updated_at=now() where spot_id=new.id and revoked_at is null;
 update booking_private.team_invitations_v1 set revoked_at=clock_timestamp() where spot_id=new.id and revoked_at is null;
 insert into public.booking_audit_events(spot_id,actor_id,action,details) values(new.id,auth.uid(),'team_owner_changed',jsonb_build_object('previous_owner',old.owner_id,'owner',new.owner_id));
 return new;
end $$;
revoke all on function booking_private.revoke_team_on_owner_change_v1() from public,anon,authenticated;
create trigger booking_revoke_team_on_owner_change after update of owner_id on public.spots for each row when(old.owner_id is distinct from new.owner_id) execute function booking_private.revoke_team_on_owner_change_v1();
revoke all on function public.booking_console_access_v1(uuid),public.booking_console_spots_v1(),public.booking_console_team_v1(uuid),public.booking_console_invite_v1(uuid,uuid,text,text,text),
 public.booking_console_revoke_invite_v1(uuid,uuid),public.booking_console_member_v1(uuid,uuid,bigint,text),public.booking_console_invitation_v1(text,boolean) from public,anon,authenticated;
grant execute on function public.booking_console_access_v1(uuid),public.booking_console_spots_v1(),public.booking_console_team_v1(uuid),public.booking_console_invite_v1(uuid,uuid,text,text,text),
 public.booking_console_revoke_invite_v1(uuid,uuid),public.booking_console_member_v1(uuid,uuid,bigint,text),public.booking_console_invitation_v1(text,boolean) to authenticated;

-- Explicit read authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_read_v1(p_spot_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_date is null then raise exception 'booking_date_required' using errcode='22023'; end if;
 return jsonb_build_object(
   'capabilities', jsonb_build_object('service_lifecycle',true,'reservation_amendments',true,'current_seating',true,'walk_ins',true,'table_layouts',true,'week_planning',true,'team_access',true),
   'access',booking_private.console_access_v1(p_spot_id),
   'operating_date', (now() at time zone 'Europe/Zurich')::date,
   'settings', (select to_jsonb(s) from public.booking_restaurant_settings s where spot_id=p_spot_id),
   'areas', coalesce((select jsonb_agg(to_jsonb(a) order by a.name) from public.booking_restaurant_areas a where spot_id=p_spot_id), '[]'),
   'tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.label) from public.booking_restaurant_tables t where spot_id=p_spot_id), '[]'),
   'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.opens_at) from public.booking_restaurant_services s where spot_id=p_spot_id), '[]'),
   'unclosed_visits', case when p_date=(now() at time zone 'Europe/Zurich')::date then
     coalesce((select jsonb_agg((to_jsonb(r)-'creation_fingerprint'-'last_amend_request_id') order by r.starts_at)
       from public.booking_reservations r where r.spot_id=p_spot_id and r.status='seated'
         and r.starts_at<(p_date::timestamp at time zone 'Europe/Zurich')), '[]'::jsonb) else '[]'::jsonb end,
   'closures',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('affected_reservations',booking_private.closure_affected_v1(p_spot_id,c.starts_at,c.ends_at,c.service_id,c.area_id)) order by c.starts_at,c.id) from public.booking_restaurant_closures c where spot_id=p_spot_id and book_date=p_date),'[]'),
   'reservations', coalesce((select jsonb_agg((to_jsonb(r)-'creation_fingerprint'-'last_amend_request_id') order by r.starts_at) from public.booking_reservations r
     where spot_id=p_spot_id and starts_at >= (p_date::timestamp at time zone 'Europe/Zurich')
       and starts_at < ((p_date+1)::timestamp at time zone 'Europe/Zurich')), '[]')
 );
end;
$$;

-- Explicit read authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_week_v1(p_spot_id uuid,p_start_date date,p_service_id uuid default null,p_area_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_revision bigint; result jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 if p_start_date is null or not isfinite(p_start_date) or p_start_date<date '0001-01-01' or p_start_date>date '9999-12-25' then
  raise exception 'invalid_booking_date_or_party' using errcode='22023'; end if;
 select revision into v_revision from public.booking_restaurant_settings where spot_id=p_spot_id for share;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 if (p_service_id is not null and not exists(select 1 from public.booking_restaurant_services where spot_id=p_spot_id and id=p_service_id))
   or (p_area_id is not null and not exists(select 1 from public.booking_restaurant_areas where spot_id=p_spot_id and id=p_area_id)) then
   raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
 select jsonb_build_object('start_date',p_start_date,'revision',v_revision,'observed_at',clock_timestamp(),
  'days',(select jsonb_agg(jsonb_build_object('date',d.day,'active_reservations',counts.active_reservations,'active_guests',counts.active_guests,
   'pending',counts.pending,'completed',counts.completed,'cancelled',counts.cancelled,'no_show',counts.no_show,
   'closed',exists(select 1 from public.booking_restaurant_closures c where c.spot_id=p_spot_id and c.book_date=d.day and c.start_time is null and c.service_id is null and c.area_id is null),
   'closures',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('affected_reservations',booking_private.closure_affected_v1(p_spot_id,c.starts_at,c.ends_at,c.service_id,c.area_id)) order by c.starts_at,c.id)
    from public.booking_restaurant_closures c where c.spot_id=p_spot_id and c.book_date=d.day
     and (p_service_id is null or c.service_id is null or c.service_id=p_service_id)
     and (p_area_id is null or c.area_id is null or c.area_id=p_area_id)),'[]'::jsonb)) order by d.day)
   from (select p_start_date+i as day from generate_series(0,6) i) d
   cross join lateral (
    select count(*) filter(where r.status in ('pending','confirmed','arrived','seated')) active_reservations,
      coalesce(sum(r.party_size) filter(where r.status in ('pending','confirmed','arrived','seated')),0) active_guests,
      count(*) filter(where r.status='pending') pending,count(*) filter(where r.status='completed') completed,
      count(*) filter(where r.status in ('cancelled','declined')) cancelled,count(*) filter(where r.status='no_show') no_show
    from public.booking_reservations r join public.booking_restaurant_tables t on t.id=r.table_id and t.spot_id=r.spot_id
    where r.spot_id=p_spot_id and r.starts_at>=(d.day::timestamp at time zone 'Europe/Zurich')
      and r.starts_at<((d.day+1)::timestamp at time zone 'Europe/Zurich')
      and (p_service_id is null or r.service_id=p_service_id) and (p_area_id is null or t.area_id=p_area_id)
   ) counts)) into result;
 return result;
end $$;

-- Explicit read authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_slots_v1(p_spot_id uuid,p_date date,p_party_size integer)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,table_id uuid)
language plpgsql security definer set search_path='' as $$ begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 return query select * from booking_private.slots_for_amendment_v1(p_spot_id,p_date,p_party_size,null,null);
end $$;

-- Explicit read authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_amendment_slots_v1(p_spot_id uuid,p_reservation_id uuid,p_date date,p_party_size integer,p_duration_minutes integer)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,table_id uuid)
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 select * into r from public.booking_reservations where spot_id=p_spot_id and id=p_reservation_id;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 if r.status not in ('pending','confirmed') then raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 if p_duration_minutes is null then raise exception 'invalid_booking_duration' using errcode='22023'; end if;
 return query select * from booking_private.slots_for_amendment_v1(p_spot_id,p_date,p_party_size,p_duration_minutes,r.id);
end $$;

-- Explicit read authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_walk_in_slots_v1(p_spot_id uuid,p_party_size integer,p_duration_minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_start timestamptz; v_slots jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'read');
 -- A short shared lock keeps configuration and both preview lists consistent
 -- with the same write serialization used by setup/reservations/attendance.
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for share;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 v_start:=booking_private.admission_clock_v1();
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('table_label',t.label,'seats',t.seats,
   'area_id',a.id,'area_name',a.name,'service_name',service.name) order by t.seats,t.label,s.service_id),'[]') into v_slots
  from booking_private.walk_in_slots_v1(p_spot_id,v_start,p_party_size,p_duration_minutes) s
  join public.booking_restaurant_tables t on t.id=s.table_id
  join public.booking_restaurant_areas a on a.id=t.area_id
  join public.booking_restaurant_services service on service.id=s.service_id;
 return jsonb_build_object('observed_at',v_start,'slots',v_slots,
  'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.opens_at,s.id)
   from booking_private.walk_in_services_v1(p_spot_id,v_start,p_duration_minutes) s),'[]'));
end $$;

-- Explicit write authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_create_v1(p_spot_id uuid,p_request_id uuid,p_service_id uuid,p_table_id uuid,p_starts_at timestamptz,
 p_party_size integer,p_guest_name text,p_guest_contact text default null,p_note text default null,p_source text default 'operator',p_status text default 'confirmed')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_end timestamptz; v_existing public.booking_reservations%rowtype;
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 if p_request_id is null or p_status is null or p_status not in ('pending','confirmed') then
   raise exception 'invalid_booking_request' using errcode='22023';
 end if;
 -- All setup/booking/state writes lock the same restaurant row. The exclusion
 -- constraint additionally enforces no overlap at the database boundary.
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 select * into v_existing from public.booking_reservations where spot_id=p_spot_id and request_id=p_request_id;
 if found then
   if v_existing.creation_fingerprint is not null then
     if v_existing.creation_fingerprint is distinct from booking_private.creation_fingerprint_v1(
       p_service_id,p_table_id,p_starts_at,p_party_size,p_guest_name,p_guest_contact,p_note,p_source) then
       raise exception 'booking_request_reused' using errcode='22023';
     end if;
     return v_existing.id;
   end if;
   if v_existing.service_id is distinct from p_service_id or v_existing.table_id is distinct from p_table_id or v_existing.starts_at is distinct from p_starts_at
     or v_existing.party_size is distinct from p_party_size or v_existing.guest_name is distinct from trim(p_guest_name)
     or v_existing.guest_contact is distinct from nullif(trim(p_guest_contact),'')
     or v_existing.note is distinct from nullif(trim(p_note),'') or v_existing.source is distinct from p_source then
     raise exception 'booking_request_reused' using errcode='22023';
   end if;
   return v_existing.id;
 end if;
 select s.ends_at into v_end from public.booking_console_slots_v1(p_spot_id,(p_starts_at at time zone 'Europe/Zurich')::date,p_party_size) s
 where s.service_id=p_service_id and s.table_id=p_table_id and s.starts_at=p_starts_at limit 1;
 if v_end is null then raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
 insert into public.booking_reservations(spot_id,request_id,service_id,table_id,starts_at,ends_at,party_size,guest_name,guest_contact,note,source,status,created_by)
 values(p_spot_id,p_request_id,p_service_id,p_table_id,p_starts_at,v_end,p_party_size,trim(p_guest_name),nullif(trim(p_guest_contact),''),nullif(trim(p_note),''),p_source,p_status,auth.uid())
 returning id into v_id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action) values(p_spot_id,v_id,auth.uid(),'reservation_created');
 return v_id;
end;
$$;

-- Explicit write authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_amend_v1(p_spot_id uuid,p_reservation_id uuid,p_request_id uuid,p_expected_revision bigint,
 p_service_id uuid,p_table_id uuid,p_starts_at timestamptz,p_duration_minutes integer,p_party_size integer,
 p_guest_name text,p_guest_contact text default null,p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; v_end timestamptz; v_same boolean; v_inventory_changed boolean; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_duration_minutes is null
  or p_duration_minutes not between 30 and 480 then raise exception 'invalid_booking_request' using errcode='22023'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 select * into r from public.booking_reservations where id=p_reservation_id and spot_id=p_spot_id for update;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 v_end:=p_starts_at+make_interval(mins=>p_duration_minutes);
 v_inventory_changed:=r.service_id is distinct from p_service_id or r.table_id is distinct from p_table_id
  or r.starts_at is distinct from p_starts_at or r.ends_at is distinct from v_end or r.party_size is distinct from p_party_size;
 v_same:=not v_inventory_changed and r.guest_name is not distinct from trim(p_guest_name)
  and r.guest_contact is not distinct from nullif(trim(p_guest_contact),'') and r.note is not distinct from nullif(trim(p_note),'');
 if r.last_amend_request_id=p_request_id then
  if not v_same then raise exception 'booking_request_reused' using errcode='22023'; end if;
  return r.id;
 end if;
 if exists(select 1 from public.booking_reservations where spot_id=p_spot_id and last_amend_request_id=p_request_id) then
  raise exception 'booking_request_reused' using errcode='22023'; end if;
 if r.revision<>p_expected_revision then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 if r.status not in ('pending','confirmed','arrived','seated') or (v_inventory_changed and r.status not in ('pending','confirmed')) then
  raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 if v_same then return r.id; end if;
 if v_inventory_changed and not exists(select 1 from booking_private.slots_for_amendment_v1(
   p_spot_id,(p_starts_at at time zone 'Europe/Zurich')::date,p_party_size,p_duration_minutes,r.id) s
   where s.service_id=p_service_id and s.table_id=p_table_id and s.starts_at=p_starts_at and s.ends_at=v_end) then
  raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
 update public.booking_reservations set service_id=p_service_id,table_id=p_table_id,starts_at=p_starts_at,ends_at=v_end,
  party_size=p_party_size,guest_name=trim(p_guest_name),guest_contact=nullif(trim(p_guest_contact),''),note=nullif(trim(p_note),''),
  revision=revision+1,updated_at=now(),last_amend_request_id=p_request_id,
  creation_fingerprint=coalesce(creation_fingerprint,booking_private.creation_fingerprint_v1(r.service_id,r.table_id,r.starts_at,r.party_size,r.guest_name,r.guest_contact,r.note,r.source))
 where id=r.id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action) values(p_spot_id,r.id,auth.uid(),'reservation_amended');
 return r.id;
end $$;

-- Explicit write authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_set_status_v1(p_spot_id uuid,p_reservation_id uuid,p_expected_status text,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.booking_reservations%rowtype;
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 -- Shared lock order with setup/create prevents state/setup allocation races.
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 select * into v_row from public.booking_reservations where id=p_reservation_id and spot_id=p_spot_id for update;
 if not found then raise exception 'booking_not_found' using errcode='22023'; end if;
 -- An identical retry after a lost response is successful, with no second
 -- event. Compare-and-set still rejects a stale attempt to a different target.
 if p_status = v_row.status and p_expected_status is distinct from p_status
   and exists(select 1 from public.booking_audit_events e where e.reservation_id=v_row.id
     and e.actor_id=auth.uid() and e.action=p_expected_status||'_to_'||p_status) then return; end if;
 if p_expected_status is distinct from v_row.status then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 if p_status is null or not (
   (v_row.status='pending' and p_status in ('confirmed','declined','cancelled')) or
   (v_row.status='confirmed' and p_status='cancelled') or
   (v_row.status='confirmed' and p_status='no_show' and v_row.starts_at<=now()) or
   (v_row.status in ('confirmed','arrived') and p_status in ('arrived','seated') and p_status<>v_row.status
     and (v_row.starts_at at time zone 'Europe/Zurich')::date=(now() at time zone 'Europe/Zurich')::date) or
   (v_row.status='arrived' and p_status='cancelled') or
   (v_row.status='seated' and p_status='completed')
 ) then raise exception 'invalid_booking_status_transition' using errcode='22023'; end if;
 if p_status='seated' and exists(select 1 from public.booking_reservations other
   where other.table_id=v_row.table_id and other.id<>v_row.id and other.status='seated') then
   raise exception 'booking_table_occupied' using errcode='22023';
 end if;
 update public.booking_reservations set status=p_status,revision=revision+1,updated_at=now(),
   arrived_at=case when p_status in ('arrived','seated') then coalesce(arrived_at,now()) else arrived_at end,
   seated_at=case when p_status='seated' then now() else seated_at end,
   completed_at=case when p_status='completed' then now() else completed_at end
 where id=v_row.id;
 insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action) values(p_spot_id,v_row.id,auth.uid(),v_row.status||'_to_'||p_status);
end;
$$;

-- Explicit write authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_walk_in_v1(p_spot_id uuid,p_request_id uuid,p_service_id uuid,p_table_id uuid,
 p_party_size integer,p_duration_minutes integer,p_guest_name text default null,p_guest_contact text default null,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; v_start timestamptz; v_end timestamptz;
 v_name text:=coalesce(nullif(trim(p_guest_name),''),'Walk-in'); v_original text; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'write');
 if p_request_id is null then raise exception 'invalid_booking_request' using errcode='22023'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 select * into r from public.booking_reservations where spot_id=p_spot_id and request_id=p_request_id;
 if found then
  v_original:=coalesce(r.creation_fingerprint,booking_private.creation_fingerprint_v1(r.service_id,r.table_id,r.starts_at,r.party_size,r.guest_name,r.guest_contact,r.note,r.source));
  if not r.is_walk_in or r.ends_at-r.starts_at is distinct from make_interval(mins=>p_duration_minutes)
   or v_original is distinct from booking_private.creation_fingerprint_v1(p_service_id,p_table_id,r.starts_at,p_party_size,v_name,p_guest_contact,p_note,'walk_in') then
   raise exception 'booking_request_reused' using errcode='22023'; end if;
 else
  -- Capture admission time AFTER waiting for the restaurant write lock.
  v_start:=booking_private.admission_clock_v1();
  select s.ends_at into v_end from booking_private.walk_in_slots_v1(p_spot_id,v_start,p_party_size,p_duration_minutes) s
   where s.service_id=p_service_id and s.table_id=p_table_id limit 1;
  if v_end is null then raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
  insert into public.booking_reservations(spot_id,request_id,service_id,table_id,starts_at,ends_at,party_size,guest_name,guest_contact,note,
   source,status,is_walk_in,arrived_at,seated_at,created_by)
  values(p_spot_id,p_request_id,p_service_id,p_table_id,v_start,v_end,p_party_size,v_name,nullif(trim(p_guest_contact),''),nullif(trim(p_note),''),
   'walk_in','seated',true,v_start,v_start,auth.uid()) returning * into r;
  insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action) values(p_spot_id,r.id,auth.uid(),'walk_in_created');
 end if;
 return jsonb_build_object('id',r.id,'service_id',r.service_id,'table_id',r.table_id,'starts_at',r.starts_at,'ends_at',r.ends_at);
end $$;

-- Explicit manage authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_save_setup_v1(p_spot_id uuid, p_revision bigint, p_setup jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_revision bigint; v_item jsonb;
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
 if jsonb_typeof(p_setup) is distinct from 'object'
   or jsonb_typeof(p_setup->'areas') is distinct from 'array'
   or jsonb_typeof(p_setup->'tables') is distinct from 'array'
   or jsonb_typeof(p_setup->'services') is distinct from 'array'
   or p_revision is null or p_revision < 0
   or jsonb_array_length(p_setup->'areas') > 30
   or jsonb_array_length(p_setup->'tables') > 200
   or jsonb_array_length(p_setup->'services') > 30 then
   raise exception 'invalid_booking_setup' using errcode='22023';
 end if;
 insert into public.booking_restaurant_settings(spot_id) values(p_spot_id) on conflict do nothing;
 select revision into v_revision from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if v_revision <> p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
 -- Cross-restaurant identifiers can never be reassigned, even by a multi-spot owner.
 if exists (select 1 from public.booking_restaurant_areas a join jsonb_array_elements(p_setup->'areas') j on a.id=(j->>'id')::uuid where a.spot_id<>p_spot_id)
   or exists (select 1 from public.booking_restaurant_tables t join jsonb_array_elements(p_setup->'tables') j on t.id=(j->>'id')::uuid where t.spot_id<>p_spot_id)
   or exists (select 1 from public.booking_restaurant_services s join jsonb_array_elements(p_setup->'services') j on s.id=(j->>'id')::uuid where s.spot_id<>p_spot_id) then
   raise exception 'booking_resource_spot_mismatch' using errcode='42501';
 end if;
 update public.booking_restaurant_settings set
   duration_minutes=(p_setup->>'duration_minutes')::integer,
   max_party_size=(p_setup->>'max_party_size')::integer,
   revision=revision+1, updated_at=now() where spot_id=p_spot_id;
 -- Retain resource identities referenced by reservations; missing resources retire.
 update public.booking_restaurant_areas set is_active=false where spot_id=p_spot_id;
 update public.booking_restaurant_tables set is_active=false where spot_id=p_spot_id;
 update public.booking_restaurant_services set is_active=false where spot_id=p_spot_id;
 for v_item in select * from jsonb_array_elements(p_setup->'areas') loop
   insert into public.booking_restaurant_areas(id,spot_id,name,is_active)
   values((v_item->>'id')::uuid,p_spot_id,trim(v_item->>'name'),(v_item->>'is_active')::boolean)
   on conflict(id) do update set name=excluded.name,is_active=excluded.is_active;
 end loop;
 for v_item in select * from jsonb_array_elements(p_setup->'tables') loop
   if exists(select 1 from public.booking_reservations r where r.table_id=(v_item->>'id')::uuid
       and r.status in ('pending','confirmed','arrived','seated') and r.ends_at>now() and r.party_size>(v_item->>'seats')::integer) then
     raise exception 'booking_table_has_larger_reservation' using errcode='22023';
   end if;
   insert into public.booking_restaurant_tables(id,spot_id,area_id,label,seats,is_active)
   values((v_item->>'id')::uuid,p_spot_id,(v_item->>'area_id')::uuid,trim(v_item->>'label'),(v_item->>'seats')::integer,(v_item->>'is_active')::boolean)
   on conflict(id) do update set area_id=excluded.area_id,label=excluded.label,seats=excluded.seats,is_active=excluded.is_active;
 end loop;
 for v_item in select * from jsonb_array_elements(p_setup->'services') loop
   insert into public.booking_restaurant_services(id,spot_id,name,weekdays,opens_at,closes_at,interval_minutes,is_active)
   values((v_item->>'id')::uuid,p_spot_id,trim(v_item->>'name'),array(select jsonb_array_elements_text(v_item->'weekdays')::integer),
     (v_item->>'opens_at')::time,(v_item->>'closes_at')::time,(v_item->>'interval_minutes')::integer,(v_item->>'is_active')::boolean)
   on conflict(id) do update set name=excluded.name,weekdays=excluded.weekdays,opens_at=excluded.opens_at,
     closes_at=excluded.closes_at,interval_minutes=excluded.interval_minutes,is_active=excluded.is_active;
 end loop;
 insert into public.booking_audit_events(spot_id,actor_id,action) values(p_spot_id,auth.uid(),'setup_saved');
 return v_revision+1;
end;
$$;

-- Explicit manage authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_save_layout_v1(p_spot_id uuid,p_revision bigint,p_entries jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_revision bigint; v_item jsonb; v_table public.booking_restaurant_tables%rowtype; v_changed boolean:=false;
begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
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

-- Explicit manage authorization; the legacy Owner helper stays Owner-only.
create or replace function public.booking_console_save_closure_v1(p_spot_id uuid,p_revision bigint,p_id uuid,p_date date,
 p_start_time time default null,p_end_time time default null,p_service_id uuid default null,p_area_id uuid default null,
 p_note text default null,p_keep_existing boolean default false,p_remove boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.booking_restaurant_closures%rowtype; v_revision bigint; v_start timestamptz; v_end timestamptz; n bigint; v_after jsonb; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
 if p_id is null or p_revision is null or p_revision<0 or p_remove is null or p_keep_existing is null then raise exception 'invalid_booking_closure' using errcode='22023'; end if;
 select revision into v_revision from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 select * into c from public.booking_restaurant_closures where id=p_id and spot_id=p_spot_id;
 if p_remove then
  if c.id is null then return jsonb_build_object('revision',v_revision,'existing_reservations',0); end if;
  if v_revision<>p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
  delete from public.booking_restaurant_closures where id=c.id;
  insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),'closure_removed',jsonb_build_object('before',to_jsonb(c)));
 else
  if p_date is null or not isfinite(p_date) or p_date<date '0001-01-01' or p_date>date '9999-12-30'
   or (p_start_time is null)<>(p_end_time is null) or (p_start_time is not null and (p_end_time<=p_start_time or p_end_time>time '24:00' or extract(second from p_start_time)<>0 or extract(second from p_end_time)<>0))
   or length(p_note)>160 then raise exception 'invalid_booking_closure' using errcode='22023'; end if;
  if (p_service_id is not null and not exists(select 1 from public.booking_restaurant_services where spot_id=p_spot_id and id=p_service_id))
   or (p_area_id is not null and not exists(select 1 from public.booking_restaurant_areas where spot_id=p_spot_id and id=p_area_id)) then
   raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
  v_start:=booking_private.civil_boundary_v1(p_date,coalesce(p_start_time,time '00:00'),false);
  v_end:=booking_private.civil_boundary_v1(p_date+case when p_start_time is null then 1 else 0 end,coalesce(p_end_time,time '00:00'),true);
  if v_start is null or v_end is null or v_end<=v_start then raise exception 'invalid_booking_closure_time' using errcode='22023'; end if;
  n:=booking_private.closure_affected_v1(p_spot_id,v_start,v_end,p_service_id,p_area_id);
  if c.id is not null and c.book_date=p_date and c.starts_at=v_start and c.ends_at=v_end and c.service_id is not distinct from p_service_id
    and c.area_id is not distinct from p_area_id and c.note is not distinct from nullif(trim(p_note),'') then
   return jsonb_build_object('revision',v_revision,'existing_reservations',n); end if;
  if p_date<(now() at time zone 'Europe/Zurich')::date or p_date>(now() at time zone 'Europe/Zurich')::date+365 then raise exception 'invalid_booking_closure' using errcode='22023'; end if;
  if v_revision<>p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
  if n>0 and not p_keep_existing then raise exception 'booking_closure_has_reservations' using errcode='22023',detail=n::text; end if;
  insert into public.booking_restaurant_closures(id,spot_id,book_date,start_time,end_time,starts_at,ends_at,service_id,area_id,note)
   values(p_id,p_spot_id,p_date,p_start_time,p_end_time,v_start,v_end,p_service_id,p_area_id,nullif(trim(p_note),''))
   on conflict(id) do update set book_date=excluded.book_date,start_time=excluded.start_time,end_time=excluded.end_time,
    starts_at=excluded.starts_at,ends_at=excluded.ends_at,service_id=excluded.service_id,area_id=excluded.area_id,note=excluded.note,updated_at=now()
    where public.booking_restaurant_closures.spot_id=p_spot_id;
  if not found then raise exception 'booking_resource_spot_mismatch' using errcode='42501'; end if;
  select to_jsonb(x) into v_after from public.booking_restaurant_closures x where id=p_id;
  insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),'closure_saved',jsonb_build_object('before',to_jsonb(c),'after',v_after,'existing_reservations',n));
 end if;
 update public.booking_restaurant_settings set revision=revision+1,updated_at=now() where spot_id=p_spot_id;
 return jsonb_build_object('revision',v_revision+1,'existing_reservations',coalesce(n,0));
end $$;
