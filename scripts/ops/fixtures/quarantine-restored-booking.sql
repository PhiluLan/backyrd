-- Isolated restore-drill operation. Production recovery requires its own reviewed
-- target and approval; keep intake/apps/workers stopped until reconciliation.
begin;
do $$ begin
 if current_setting('backyrd.booking_restore_fixture',true) is distinct from 'isolated' then
  raise exception 'isolated_restore_fixture_required';
 end if;
end $$;
lock table public.booking_restaurant_settings in exclusive mode;
with parked as (
 update booking_private.guest_mail_outbox_v1
 set state='review_required',last_error_code='restore_reconciliation_required',lease_id=null,lease_until=null,updated_at=clock_timestamp()
 where state in ('pending','leased','sending') returning spot_id,reservation_id
)
insert into public.booking_audit_events(spot_id,reservation_id,actor_id,action,details)
 select spot_id,reservation_id,null,'guest_mail_restore_quarantined',jsonb_build_object('schema','mail_restore_v1','messages',count(*))
 from parked group by spot_id,reservation_id;
commit;
