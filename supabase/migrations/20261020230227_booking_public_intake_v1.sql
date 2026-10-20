begin;
-- Public intake is off by default. Clients cannot call service-only guest APIs
-- directly or read their private access, request and delivery records.
create table public.booking_public_settings (
 spot_id uuid primary key references public.booking_restaurant_settings(spot_id),
 owner_id uuid not null references auth.users(id),
 revision bigint not null default 1 check (revision>0),
 enabled boolean not null default false,
 service_ids uuid[] not null check (cardinality(service_ids) between 1 and 30),
 notice_minutes integer not null default 60 check (notice_minutes between 15 and 10080),
 horizon_days integer not null default 90 check (horizon_days between 1 and 365),
 cancellation_minutes integer not null default 120 check (cancellation_minutes between 0 and 10080),
 confirmation_status text not null default 'confirmed' check (confirmation_status in ('confirmed','pending')),
 privacy_contact text not null check (length(trim(privacy_contact)) between 3 and 254),
 guest_notice text not null default '' check (length(guest_notice)<=1000),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.booking_public_settings enable row level security;
revoke all on public.booking_public_settings from public,anon,authenticated;
grant select on public.booking_public_settings to authenticated;
grant all on public.booking_public_settings to service_role;
create policy booking_public_settings_owner on public.booking_public_settings for select to authenticated using (booking_private.is_operator(spot_id));

create table booking_private.guest_access_v1 (
 spot_id uuid not null,
 reservation_id uuid primary key,
 key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
 sealed_key text not null check (length(sealed_key) between 40 and 2048),
 policy_revision bigint not null,
 cancellation_minutes integer not null,
 cancellation_deadline timestamptz not null,
 expires_at timestamptz not null,
 revoked_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 foreign key (spot_id,reservation_id) references public.booking_reservations(spot_id,id)
);
create table booking_private.guest_mail_outbox_v1 (
 id uuid primary key default gen_random_uuid(),
 spot_id uuid not null,
 reservation_id uuid not null,
 reservation_revision bigint not null,
 event_kind text not null check (event_kind in ('created','cancelled','changed')),
 state text not null default 'pending' check (state in ('pending','leased','accepted','delivered','bounced','failed','suppressed','review_required')),
 attempts integer not null default 0 check (attempts>=0),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_id uuid,
 lease_until timestamptz,
 first_attempt_at timestamptz,
 provider_id text,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique (reservation_id,reservation_revision,event_kind),
 foreign key (spot_id,reservation_id) references public.booking_reservations(spot_id,id)
);
create index booking_guest_mail_pending on booking_private.guest_mail_outbox_v1(next_attempt_at,id) where state in ('pending','leased');
do $$ declare t text; begin
 foreach t in array array['guest_access_v1','guest_mail_outbox_v1'] loop
  execute format('alter table booking_private.%I enable row level security',t);
  execute format('revoke all on booking_private.%I from public,anon,authenticated',t);
  execute format('grant all on booking_private.%I to service_role',t);
 end loop;
end $$;
-- Extend the existing complete-operation registry rather than adding a second ledger.
alter table booking_private.reservation_requests_v2 drop constraint reservation_requests_v2_request_kind_check;
alter table booking_private.reservation_requests_v2 add constraint reservation_requests_v2_request_kind_check check (request_kind in ('create','amend','walk_in','transfer','guest_create','guest_cancel'));
alter table public.booking_reservations drop constraint booking_reservations_source_check;
alter table public.booking_reservations add constraint booking_reservations_source_check check (source in ('phone','walk_in','email','operator','website'));

create function public.booking_console_public_settings_v1(p_spot_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
 return (select to_jsonb(p)-'owner_id' from public.booking_public_settings p where p.spot_id=p_spot_id);
end $$;
create function public.booking_console_save_public_settings_v1(p_spot_id uuid,p_revision bigint,p_enabled boolean,p_service_ids uuid[],p_notice_minutes integer,p_horizon_days integer,p_cancellation_minutes integer,p_confirmation_status text,p_privacy_contact text,p_guest_notice text default '') returns bigint
language plpgsql security definer set search_path='' as $$
declare rev bigint; ids uuid[]; owner uuid; before_row public.booking_public_settings%rowtype; begin
 perform booking_private.assert_console_access_v1(p_spot_id,'manage');
 select revision into rev from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if not found then raise exception 'booking_setup_required' using errcode='22023'; end if;
 if p_revision is null or p_revision<0 or p_enabled is null or p_service_ids is null or cardinality(p_service_ids) not between 1 and 30 or array_ndims(p_service_ids)<>1 or array_position(p_service_ids,null) is not null
  or p_notice_minutes is null or p_notice_minutes not between 15 and 10080 or p_horizon_days is null or p_horizon_days not between 1 and 365
  or p_cancellation_minutes is null or p_cancellation_minutes not between 0 and 10080 or p_confirmation_status is null or p_confirmation_status not in ('confirmed','pending')
  or p_privacy_contact is null or length(trim(p_privacy_contact)) not between 3 and 254 or p_privacy_contact ~ '[[:cntrl:]]' or p_guest_notice is null or length(p_guest_notice)>1000 then
  raise exception 'invalid_booking_public_settings' using errcode='22023'; end if;
 select array_agg(distinct id order by id) into ids from unnest(p_service_ids) id;
 if cardinality(ids)<>cardinality(p_service_ids) or exists(select 1 from unnest(ids) requested(id) where not exists(select 1 from public.booking_restaurant_services s where s.spot_id=p_spot_id and s.id=requested.id and (s.is_active or not p_enabled))) then raise exception 'booking_resource_spot_mismatch' using errcode='22023'; end if;
 select owner_id into owner from public.spots where id=p_spot_id;
 select * into before_row from public.booking_public_settings where spot_id=p_spot_id;
 if before_row.owner_id=owner and before_row.enabled=p_enabled and before_row.service_ids=ids and before_row.notice_minutes=p_notice_minutes and before_row.horizon_days=p_horizon_days and before_row.cancellation_minutes=p_cancellation_minutes and before_row.confirmation_status=p_confirmation_status and before_row.privacy_contact=trim(p_privacy_contact) and before_row.guest_notice=trim(p_guest_notice) then return rev; end if;
 if rev<>p_revision then raise exception 'booking_setup_changed_reload' using errcode='40001'; end if;
 insert into public.booking_public_settings(spot_id,owner_id,enabled,service_ids,notice_minutes,horizon_days,cancellation_minutes,confirmation_status,privacy_contact,guest_notice)
 values(p_spot_id,owner,p_enabled,ids,p_notice_minutes,p_horizon_days,p_cancellation_minutes,p_confirmation_status,trim(p_privacy_contact),trim(p_guest_notice))
 on conflict(spot_id) do update set owner_id=excluded.owner_id,enabled=excluded.enabled,service_ids=excluded.service_ids,notice_minutes=excluded.notice_minutes,horizon_days=excluded.horizon_days,cancellation_minutes=excluded.cancellation_minutes,confirmation_status=excluded.confirmation_status,privacy_contact=excluded.privacy_contact,guest_notice=excluded.guest_notice,revision=public.booking_public_settings.revision+1,updated_at=clock_timestamp();
 update public.booking_restaurant_settings set revision=revision+1,updated_at=clock_timestamp() where spot_id=p_spot_id;
 insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),'public_booking_settings_saved',jsonb_build_object('enabled',p_enabled,'service_ids',ids,'notice_minutes',p_notice_minutes,'horizon_days',p_horizon_days,'cancellation_minutes',p_cancellation_minutes,'confirmation_status',p_confirmation_status));
 return rev+1;
end $$;

create function booking_private.public_policy_v1(p_spot uuid) returns public.booking_public_settings
language plpgsql set search_path='' as $$
declare p public.booking_public_settings%rowtype; owner uuid; begin
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot for share;
 select s.owner_id into owner from public.spots s where s.id=p_spot and s.status='approved' and coalesce(s.data_origin,'LEGACY') not in ('TEST','FIXTURE') and public.distribution_trust_entity_is_eligible_v1('spot',s.id,'discovery');
 select * into p from public.booking_public_settings where spot_id=p_spot and enabled and owner_id=owner;
 if not found or owner is null or not exists(select 1 from auth.users where id=owner and email_confirmed_at is not null) then raise exception 'booking_public_unavailable' using errcode='P0002'; end if;
 perform public.safety_assert_user_can_perform_v2(owner,'can_edit_owner_content');
 return p;
end $$;
create function booking_private.public_choices_v1(p_spot uuid,p_date date,p_party integer,p_start timestamptz default null)
returns table(service_id uuid,starts_at timestamptz,ends_at timestamptz,table_id uuid,table_ids uuid[],combination_id uuid)
language plpgsql set search_path='' as $$
declare p public.booking_public_settings%rowtype; duration integer; maximum integer; observed timestamptz:=clock_timestamp(); begin
 p:=booking_private.public_policy_v1(p_spot);
 select duration_minutes,max_party_size into duration,maximum from public.booking_restaurant_settings where spot_id=p_spot;
 if p_date is null or not isfinite(p_date) or p_date<(observed at time zone 'Europe/Zurich')::date or p_date>(observed at time zone 'Europe/Zurich')::date+p.horizon_days or p_party is null or p_party not between 1 and maximum then raise exception 'invalid_booking_date_or_party' using errcode='22023'; end if;
 return query select distinct on (g.slot) w.service_id,g.slot,g.slot+make_interval(mins=>duration),c.table_id,c.table_ids,c.combination_id
 from (select p_date-1 d union all select p_date) days cross join lateral booking_private.service_windows_v1(p_spot,days.d) w
 cross join lateral generate_series(w.starts_at,w.ends_at-make_interval(mins=>duration),make_interval(mins=>w.interval_minutes)) g(slot)
 cross join lateral booking_private.allocation_choices_v2(p_spot) c
 where w.service_id=any(p.service_ids) and c.seats>=p_party and (g.slot at time zone 'Europe/Zurich')::date=p_date and g.slot>=observed+make_interval(mins=>p.notice_minutes)
  and (p_start is null or g.slot=p_start)
  and not booking_private.range_blocked_v1(p_spot,g.slot,g.slot+make_interval(mins=>duration),w.service_id,c.area_id)
  and not exists(select 1 from booking_private.reservation_allocations_v1 a where a.spot_id=p_spot and a.table_id=any(c.table_ids) and a.is_active and a.status in ('pending','confirmed','arrived','seated') and ((a.status='seated' and a.ends_at<=observed) or tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(g.slot,g.slot+make_interval(mins=>duration),'[)')))
 order by g.slot,(select sum(t.seats) from public.booking_restaurant_tables t where t.spot_id=p_spot and t.id=any(c.table_ids)),cardinality(c.table_ids),c.table_id,w.service_id;
end $$;
create function public.booking_guest_availability_v1(p_spot_id uuid,p_date date,p_party_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.booking_public_settings%rowtype; choices jsonb; begin
 p:=booking_private.public_policy_v1(p_spot_id);
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',c.starts_at,'ends_at',c.ends_at) order by c.starts_at),'[]'::jsonb) into choices from booking_private.public_choices_v1(p_spot_id,p_date,p_party_size) c;
 return jsonb_build_object('spot_id',p_spot_id,'name',(select name from public.spots where id=p_spot_id),'date',p_date,'party_size',p_party_size,'policy_revision',p.revision,'notice_minutes',p.notice_minutes,'horizon_days',p.horizon_days,'cancellation_minutes',p.cancellation_minutes,'confirmation_status',p.confirmation_status,'privacy_contact',p.privacy_contact,'guest_notice',p.guest_notice,'slots',choices);
end $$;
create function booking_private.guest_receipt_v1(r public.booking_reservations) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'spot_id',r.spot_id,'name',(select name from public.spots where id=r.spot_id),'guest_name',r.guest_name,'party_size',r.party_size,'starts_at',r.starts_at,'ends_at',r.ends_at,'status',r.status,'revision',r.revision,'cancellation_deadline',a.cancellation_deadline) from booking_private.guest_access_v1 a where a.reservation_id=r.id;
$$;
create function public.booking_guest_create_v1(p_spot_id uuid,p_request_id uuid,p_policy_revision bigint,p_starts_at timestamptz,p_party_size integer,p_guest_name text,p_email text,p_key_hash text,p_sealed_key text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.booking_public_settings%rowtype; previous booking_private.reservation_requests_v2%rowtype; fingerprint text; choice record; r public.booking_reservations%rowtype; result jsonb; email text:=lower(trim(p_email)); begin
 perform 1 from public.booking_restaurant_settings where spot_id=p_spot_id for update;
 if p_request_id is null or p_policy_revision is null or p_starts_at is null or not isfinite(p_starts_at) or p_guest_name is null or length(trim(p_guest_name)) not between 1 and 120
  or email is null or length(email)>254 or email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' or email ~ '[[:cntrl:]]'
  or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' or p_sealed_key is null or length(p_sealed_key) not between 40 and 2048 or length(p_note)>1000 then raise exception 'invalid_booking_guest_request' using errcode='22023'; end if;
 fingerprint:=booking_private.request_fingerprint_v2(jsonb_build_object('kind','guest_create','policy_revision',p_policy_revision,'starts_at',to_char(p_starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),'party_size',p_party_size,'name',trim(p_guest_name),'email',email,'key_hash',p_key_hash,'note',nullif(trim(p_note),'')));
 select * into previous from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id;
 if found then if previous.fingerprint<>fingerprint then raise exception 'booking_request_reused' using errcode='22023'; end if; perform booking_private.authorize_guest_v1(previous.reservation_id,p_key_hash); return previous.outcome; end if;
 p:=booking_private.public_policy_v1(p_spot_id);
 if p.revision<>p_policy_revision then raise exception 'booking_public_policy_changed' using errcode='40001'; end if;
 if exists(select 1 from public.booking_reservations where spot_id=p_spot_id and (request_id=p_request_id or last_amend_request_id=p_request_id)) or exists(select 1 from booking_private.reservation_requests_v2 where spot_id=p_spot_id and request_id=p_request_id) then raise exception 'booking_request_reused' using errcode='22023'; end if;
 if (select count(*) from public.booking_reservations where spot_id=p_spot_id and source='website' and lower(guest_contact)=email and created_at>clock_timestamp()-interval '24 hours')>=3 then raise exception 'booking_guest_request_unavailable' using errcode='22023'; end if;
 select * into choice from booking_private.public_choices_v1(p_spot_id,(p_starts_at at time zone 'Europe/Zurich')::date,p_party_size,p_starts_at) limit 1;
 if not found then raise exception 'booking_slot_unavailable' using errcode='22023'; end if;
 insert into public.booking_reservations(spot_id,request_id,service_id,table_id,combination_id,starts_at,ends_at,party_size,guest_name,guest_contact,note,source,status,created_by,creation_fingerprint)
 values(p_spot_id,p_request_id,choice.service_id,choice.table_id,choice.combination_id,choice.starts_at,choice.ends_at,p_party_size,trim(p_guest_name),email,nullif(trim(p_note),''),'website',p.confirmation_status,null,fingerprint) returning * into r;
 perform booking_private.write_allocations_v2(r,choice.table_ids);
 insert into booking_private.guest_access_v1(spot_id,reservation_id,key_hash,sealed_key,policy_revision,cancellation_minutes,cancellation_deadline,expires_at)
 values(p_spot_id,r.id,p_key_hash,p_sealed_key,p.revision,p.cancellation_minutes,r.starts_at-make_interval(mins=>p.cancellation_minutes),r.ends_at+interval '30 days');
 insert into booking_private.guest_mail_outbox_v1(spot_id,reservation_id,reservation_revision,event_kind) values(p_spot_id,r.id,r.revision,'created');
 insert into public.booking_audit_events(spot_id,reservation_id,action,details) values(p_spot_id,r.id,'reservation_created',jsonb_set(booking_private.reservation_audit_v1(null,r),'{actor_role}','"guest"'));
 result:=booking_private.guest_receipt_v1(r);
 insert into booking_private.reservation_requests_v2(spot_id,request_id,reservation_id,request_kind,fingerprint,outcome) values(p_spot_id,p_request_id,r.id,'guest_create',fingerprint,result);
 return result;
end $$;

-- Guest links retain scoped access when intake is closed. They never confer
-- operator access or reveal internal notes, other guests, tables or contact.
create function booking_private.authorize_guest_v1(p_reservation uuid,p_hash text) returns public.booking_reservations
language plpgsql set search_path='' as $$
declare r public.booking_reservations%rowtype; owner uuid; begin
 select * into r from public.booking_reservations where id=p_reservation;
 if not found then raise exception 'booking_guest_link_unavailable' using errcode='P0002'; end if;
 perform 1 from public.booking_restaurant_settings where spot_id=r.spot_id for update;
 -- Refresh the row after waiting behind amendments/contact revocation.
 select * into r from public.booking_reservations where id=p_reservation;
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or not exists(select 1 from booking_private.guest_access_v1 a where a.reservation_id=r.id and a.key_hash=p_hash and a.revoked_at is null and a.expires_at>clock_timestamp()) then raise exception 'booking_guest_link_unavailable' using errcode='P0002'; end if;
 select owner_id into owner from public.spots where id=r.spot_id;
 perform public.safety_assert_user_can_perform_v2(owner,'can_edit_owner_content');
 return r;
end $$;
create function public.booking_guest_read_v1(p_reservation_id uuid,p_key_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare r public.booking_reservations%rowtype; begin
 r:=booking_private.authorize_guest_v1(p_reservation_id,p_key_hash); return booking_private.guest_receipt_v1(r);
end $$;
create function public.booking_guest_cancel_v1(p_reservation_id uuid,p_key_hash text,p_request_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.booking_reservations%rowtype; changed public.booking_reservations%rowtype; previous booking_private.reservation_requests_v2%rowtype; fingerprint text; result jsonb; begin
 r:=booking_private.authorize_guest_v1(p_reservation_id,p_key_hash);
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_booking_guest_request' using errcode='22023'; end if;
 fingerprint:=booking_private.request_fingerprint_v2(jsonb_build_object('kind','guest_cancel','reservation_id',r.id,'revision',p_expected_revision,'key_hash',p_key_hash));
 select * into previous from booking_private.reservation_requests_v2 where spot_id=r.spot_id and request_id=p_request_id;
 if found then if previous.fingerprint<>fingerprint then raise exception 'booking_request_reused' using errcode='22023'; end if; return previous.outcome; end if;
 if exists(select 1 from public.booking_reservations where spot_id=r.spot_id and (request_id=p_request_id or last_amend_request_id=p_request_id)) or exists(select 1 from booking_private.reservation_requests_v2 where spot_id=r.spot_id and request_id=p_request_id) then raise exception 'booking_request_reused' using errcode='22023'; end if;
 if r.revision<>p_expected_revision then raise exception 'booking_changed_reload' using errcode='40001'; end if;
 if r.status not in ('pending','confirmed') or not exists(select 1 from booking_private.guest_access_v1 where reservation_id=r.id and cancellation_deadline>=clock_timestamp()) then raise exception 'booking_guest_cancel_unavailable' using errcode='22023'; end if;
 update public.booking_reservations set status='cancelled',revision=revision+1,updated_at=clock_timestamp() where id=r.id returning * into changed;
 insert into booking_private.guest_mail_outbox_v1(spot_id,reservation_id,reservation_revision,event_kind) values(r.spot_id,r.id,changed.revision,'cancelled') on conflict(reservation_id,reservation_revision,event_kind) do nothing;
 insert into public.booking_audit_events(spot_id,reservation_id,action,details) values(r.spot_id,r.id,r.status||'_to_cancelled',jsonb_set(booking_private.reservation_audit_v1(r,changed),'{actor_role}','"guest"'));
 result:=booking_private.guest_receipt_v1(changed);
 insert into booking_private.reservation_requests_v2(spot_id,request_id,reservation_id,request_kind,fingerprint,outcome) values(r.spot_id,p_request_id,r.id,'guest_cancel',fingerprint,result);
 return result;
end $$;
create function booking_private.sync_guest_access_v1() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.guest_contact is distinct from old.guest_contact then
  update booking_private.guest_access_v1 set revoked_at=clock_timestamp() where reservation_id=new.id and revoked_at is null;
  update booking_private.guest_mail_outbox_v1 set state='suppressed',updated_at=clock_timestamp() where reservation_id=new.id and state in ('pending','leased');
 else
  update booking_private.guest_access_v1 set cancellation_deadline=new.starts_at-make_interval(mins=>cancellation_minutes),expires_at=new.ends_at+interval '30 days' where reservation_id=new.id;
  if exists(select 1 from booking_private.guest_access_v1 where reservation_id=new.id and revoked_at is null) and (
   (new.status in ('confirmed','declined','cancelled') and new.status is distinct from old.status) or
   (new.status in ('pending','confirmed') and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.party_size is distinct from old.party_size or new.guest_name is distinct from old.guest_name))) then
   update booking_private.guest_mail_outbox_v1 set state='suppressed',updated_at=clock_timestamp() where reservation_id=new.id and state in ('pending','leased');
   insert into booking_private.guest_mail_outbox_v1(spot_id,reservation_id,reservation_revision,event_kind) values(new.spot_id,new.id,new.revision,case when new.status='cancelled' then 'cancelled' else 'changed' end) on conflict(reservation_id,reservation_revision,event_kind) do nothing;
  end if;
 end if;
 return new;
end $$;
create trigger booking_guest_access_sync after update on public.booking_reservations for each row execute function booking_private.sync_guest_access_v1();

revoke all on function booking_private.public_policy_v1(uuid),booking_private.public_choices_v1(uuid,date,integer,timestamptz),booking_private.guest_receipt_v1(public.booking_reservations),booking_private.authorize_guest_v1(uuid,text),booking_private.sync_guest_access_v1() from public,anon,authenticated;
revoke all on function public.booking_console_public_settings_v1(uuid),public.booking_console_save_public_settings_v1(uuid,bigint,boolean,uuid[],integer,integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.booking_console_public_settings_v1(uuid),public.booking_console_save_public_settings_v1(uuid,bigint,boolean,uuid[],integer,integer,integer,text,text,text) to authenticated;
revoke all on function public.booking_guest_availability_v1(uuid,date,integer),public.booking_guest_create_v1(uuid,uuid,bigint,timestamptz,integer,text,text,text,text,text),public.booking_guest_read_v1(uuid,text),public.booking_guest_cancel_v1(uuid,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.booking_guest_availability_v1(uuid,date,integer),public.booking_guest_create_v1(uuid,uuid,bigint,timestamptz,integer,text,text,text,text,text),public.booking_guest_read_v1(uuid,text),public.booking_guest_cancel_v1(uuid,text,uuid,bigint) to service_role;
commit;
