begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Same lock order as Booking writers. Exclusive table lock also waits for
-- existing FOR SHARE/UPDATE readers before the one-time epoch initialization.
lock table public.booking_restaurant_settings in exclusive mode;
lock table public.booking_public_settings in share row exclusive mode;

-- This counter contains no owner/contact data and survives removal of an old
-- owner's configuration. A recreated policy must never reuse old guest terms.
create table booking_private.public_policy_epochs_v1 (
 spot_id uuid primary key references public.booking_restaurant_settings(spot_id) on delete cascade,
 last_revision bigint not null check (last_revision>0)
);
alter table booking_private.public_policy_epochs_v1 enable row level security;
revoke all on booking_private.public_policy_epochs_v1 from public,anon,authenticated;
grant all on booking_private.public_policy_epochs_v1 to service_role;
insert into booking_private.public_policy_epochs_v1(spot_id,last_revision) select spot_id,revision from public.booking_public_settings;

-- The explicit Auth account-deletion path removes only this owner's opt-in
-- configuration. Guest reservations, access, audits and delivery intents stay.
alter table public.booking_public_settings drop constraint booking_public_settings_owner_id_fkey;
alter table public.booking_public_settings add constraint booking_public_settings_owner_id_fkey
 foreign key(owner_id) references auth.users(id) on delete cascade;

create or replace function public.booking_console_save_public_settings_v1(p_spot_id uuid,p_revision bigint,p_enabled boolean,p_service_ids uuid[],p_notice_minutes integer,p_horizon_days integer,p_cancellation_minutes integer,p_confirmation_status text,p_privacy_contact text,p_guest_notice text default '') returns bigint
language plpgsql security definer set search_path='' as $$
declare rev bigint; next_policy_revision bigint; ids uuid[]; owner uuid; before_row public.booking_public_settings%rowtype; begin
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
 insert into booking_private.public_policy_epochs_v1(spot_id,last_revision) values(p_spot_id,coalesce(before_row.revision,0)+1)
 on conflict(spot_id) do update set last_revision=greatest(booking_private.public_policy_epochs_v1.last_revision,coalesce(before_row.revision,0))+1
 returning last_revision into next_policy_revision;
 insert into public.booking_public_settings(spot_id,owner_id,revision,enabled,service_ids,notice_minutes,horizon_days,cancellation_minutes,confirmation_status,privacy_contact,guest_notice)
 values(p_spot_id,owner,next_policy_revision,p_enabled,ids,p_notice_minutes,p_horizon_days,p_cancellation_minutes,p_confirmation_status,trim(p_privacy_contact),trim(p_guest_notice))
 on conflict(spot_id) do update set owner_id=excluded.owner_id,enabled=excluded.enabled,service_ids=excluded.service_ids,notice_minutes=excluded.notice_minutes,horizon_days=excluded.horizon_days,cancellation_minutes=excluded.cancellation_minutes,confirmation_status=excluded.confirmation_status,privacy_contact=excluded.privacy_contact,guest_notice=excluded.guest_notice,revision=excluded.revision,updated_at=clock_timestamp();
 update public.booking_restaurant_settings set revision=revision+1,updated_at=clock_timestamp() where spot_id=p_spot_id;
 insert into public.booking_audit_events(spot_id,actor_id,action,details) values(p_spot_id,auth.uid(),'public_booking_settings_saved',jsonb_build_object('enabled',p_enabled,'service_ids',ids,'notice_minutes',p_notice_minutes,'horizon_days',p_horizon_days,'cancellation_minutes',p_cancellation_minutes,'confirmation_status',p_confirmation_status));
 return rev+1;
end $$;

commit;
