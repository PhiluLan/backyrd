\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Owner Pro billing: %', p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;

select pg_temp.assert(
  (select relrowsecurity from pg_class where oid='public.owner_pro_billing_v1'::regclass)
  and (select relrowsecurity from pg_class where oid='public.owner_pro_billing_events_v1'::regclass)
  and not has_table_privilege('anon','public.owner_pro_billing_v1','select,insert,update,delete')
  and not has_table_privilege('authenticated','public.owner_pro_billing_v1','select,insert,update,delete')
  and not has_table_privilege('authenticated','public.owner_pro_billing_events_v1','select,insert,update,delete')
  and has_table_privilege('service_role','public.owner_pro_billing_v1','select,insert,update,delete')
  and not has_function_privilege('anon','public.owner_pro_billing_reserve_checkout_v1(uuid,uuid,uuid)','execute')
  and not has_function_privilege('authenticated','public.owner_pro_billing_apply_stripe_v1(text,text,uuid,uuid,uuid,text,text,text,text,timestamptz,boolean)','execute')
  and has_function_privilege('service_role','public.owner_pro_billing_apply_stripe_v1(text,text,uuid,uuid,uuid,text,text,text,text,timestamptz,boolean)','execute'),
  'private grants or RLS missing');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000',pg_temp.id('billing-owner'),'authenticated','authenticated',
  'billing-owner@fixture.invalid','','{}','{}',now(),now());
insert into public.profiles(id,is_admin) values (pg_temp.id('billing-owner'),false) on conflict(id) do nothing;
insert into public.spots(id,name,lat,lng,status,city,owner_id,data_origin)
values (pg_temp.id('billing-spot'),'Synthetic Billing Café',47.3,8.5,'approved','Basel',pg_temp.id('billing-owner'),'REAL');

set local role service_role;
select pg_temp.assert(public.owner_pro_billing_reserve_checkout_v1(pg_temp.id('billing-spot'),pg_temp.id('billing-owner'),pg_temp.id('billing-nonce')), 'valid owner cannot reserve');
select pg_temp.assert(not public.owner_pro_billing_reserve_checkout_v1(pg_temp.id('billing-spot'),pg_temp.id('billing-owner'),pg_temp.id('billing-other-nonce')), 'duplicate checkout accepted');
select pg_temp.assert(not public.owner_pro_billing_apply_stripe_v1('evt_bad','invoice.paid',pg_temp.id('billing-spot'),pg_temp.id('billing-owner'),pg_temp.id('billing-other-nonce'),'cus_fake','sub_fake','price_fake','ACTIVE',now()+interval '1 month',false), 'wrong checkout nonce accepted');
select pg_temp.assert(public.owner_pro_billing_apply_stripe_v1('evt_paid','invoice.paid',pg_temp.id('billing-spot'),pg_temp.id('billing-owner'),pg_temp.id('billing-nonce'),'cus_fixture','sub_fixture','price_fixture','ACTIVE',now()+interval '1 month',false), 'paid event rejected');
select pg_temp.assert((select tier='PREMIUM' and source='BILLING_VERIFIED' and valid_until>now()
  from public.backyrd_spot_owner_intelligence_entitlements_v1 where spot_id=pg_temp.id('billing-spot')), 'paid Owner Pro not granted');
select pg_temp.assert(public.owner_pro_billing_apply_stripe_v1('evt_paid','invoice.paid',pg_temp.id('billing-spot'),pg_temp.id('billing-owner'),pg_temp.id('billing-nonce'),'cus_fixture','sub_fixture','price_fixture','ACTIVE',now()+interval '1 month',false), 'duplicate event not idempotent');
select pg_temp.assert((select count(*)=1 from public.owner_pro_billing_events_v1 where spot_id=pg_temp.id('billing-spot')), 'duplicate event ledger entry');
select pg_temp.assert(not public.owner_pro_billing_reserve_checkout_v1(pg_temp.id('billing-spot'),pg_temp.id('billing-owner'),pg_temp.id('billing-other-nonce')), 'paid spot can open second checkout');
select pg_temp.assert(public.owner_pro_billing_apply_stripe_v1('evt_failed','invoice.payment_failed',pg_temp.id('billing-spot'),pg_temp.id('billing-owner'),pg_temp.id('billing-nonce'),'cus_fixture','sub_fixture','price_fixture','PAST_DUE',null,false), 'failed payment event rejected');
select pg_temp.assert(not exists(select 1 from public.backyrd_spot_owner_intelligence_entitlements_v1 where spot_id=pg_temp.id('billing-spot') and tier='PREMIUM' and source='BILLING_VERIFIED'), 'Pro remained after failed payment');
reset role;

rollback;
