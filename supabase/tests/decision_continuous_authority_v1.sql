\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Decision continuity test failed: %',p_message; end if; end $$;
create function pg_temp.expect_state(p_sql text,p_expected text) returns void language plpgsql as $$
declare v_state text;
begin
  begin execute p_sql; exception when others then
    get stacked diagnostics v_state=returned_sqlstate;
    if v_state=p_expected then return; end if;
    raise exception 'expected SQLSTATE %, got %',p_expected,v_state;
  end;
  raise exception 'expected SQLSTATE %, call succeeded',p_expected;
end $$;

select pg_temp.assert(
  not has_table_privilege('anon','decision_vnext_private.product_continuity_authorizations_v1','select')
  and not has_table_privilege('authenticated','decision_vnext_private.product_continuity_renewals_v1','select')
  and not has_table_privilege('service_role','decision_vnext_private.product_continuity_authorizations_v1','insert')
  and not has_function_privilege('anon','decision_vnext_private.authorize_product_continuity_v1(bigint,text,text,text,text)','execute')
  and not has_function_privilege('authenticated','decision_vnext_private.renew_product_continuity_v1()','execute')
  and not has_function_privilege('service_role','decision_vnext_private.renew_product_continuity_v1()','execute'),
  'private renewal authority leaked to API roles'
);
select pg_temp.assert(
  (select relrowsecurity from pg_catalog.pg_class
   where oid='decision_vnext_private.product_continuity_authorizations_v1'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class
   where oid='decision_vnext_private.product_continuity_renewals_v1'::regclass),
  'continuity records require RLS'
);
select pg_temp.assert(
  (select count(*)=1 from cron.job where jobname='backyrd-decision-vnext-continuity-v1'
   and command='select decision_vnext_private.renew_product_continuity_v1()'),
  'bounded renewal job missing or duplicated'
);

select pg_temp.assert(
  (decision_vnext_private.renew_product_continuity_v1()->>'reason')='OFF',
  'unapproved OFF runtime must stay OFF'
);
select pg_temp.expect_state(format(
  'select decision_vnext_private.authorize_product_continuity_v1(%s,%L,%L,%L,%L)',
  0,repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64)
),'22023');

select pg_temp.assert(
  (public.backyrd_decision_vnext_product_activate_v1(
    0,repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),
    pg_catalog.clock_timestamp()+interval '2 hours'
  )->>'generation')::bigint=1,
  'manual activation fixture failed'
);
select pg_temp.assert(
  (decision_vnext_private.renew_product_continuity_v1()->>'reason')='NOT_AUTHORIZED',
  'scheduler must not authorize an ON generation itself'
);
select pg_temp.expect_state(format(
  'select decision_vnext_private.authorize_product_continuity_v1(%s,%L,%L,%L,%L)',
  1,repeat('f',64),repeat('b',64),repeat('c',64),repeat('e',64)
),'42501');

set local role authenticated;
select pg_temp.expect_state(
  'select * from decision_vnext_private.product_continuity_authorizations_v1',
  '42501'
);
select pg_temp.expect_state(format(
  'select decision_vnext_private.authorize_product_continuity_v1(%s,%L,%L,%L,%L)',
  1,repeat('a',64),repeat('b',64),repeat('c',64),repeat('e',64)
),'42501');
select pg_temp.expect_state('select decision_vnext_private.renew_product_continuity_v1()','42501');
reset role;

select pg_temp.assert(
  (decision_vnext_private.authorize_product_continuity_v1(
    1,repeat('a',64),repeat('b',64),repeat('c',64),repeat('e',64)
  )->>'authorized')::boolean,
  'postgres operator could not bind authorized generation'
);
select pg_temp.assert(
  (decision_vnext_private.renew_product_continuity_v1()->>'renewed')::boolean,
  'authorized short lease was not renewed'
);
select pg_temp.assert(
  decision_vnext_private.product_effective_authority_expiry_v1(1)
    > pg_catalog.clock_timestamp()+interval '17 hours',
  'effective expiry did not include the append-only renewal'
);
select pg_temp.assert(
  (decision_vnext_private.renew_product_continuity_v1()->>'reason')='NOT_DUE',
  'scheduler should not append duplicate early renewals'
);
select pg_temp.expect_state(
  'delete from decision_vnext_private.product_continuity_renewals_v1 where generation=1',
  '55000'
);

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.assert(
  (public.backyrd_decision_vnext_product_control_v1(
    repeat('a',64),repeat('b',64),repeat('c',64),1
  )->>'enabled')::boolean,
  'exact bound service reader did not accept the renewed lease'
);
select pg_temp.assert(
  (public.backyrd_decision_vnext_product_emergency_off_v1(
    1,repeat('a',64),repeat('b',64),repeat('c',64),'EMERGENCY_CONTINUITY_TEST',repeat('f',64)
  )->>'generation')::bigint=2,
  'Emergency-OFF failed'
);
select pg_temp.assert(
  not (public.backyrd_decision_vnext_product_control_v1(
    repeat('a',64),repeat('b',64),repeat('c',64),1
  )->>'enabled')::boolean,
  'renewal survived Emergency-OFF generation change'
);
select pg_temp.assert(
  (decision_vnext_private.renew_product_continuity_v1()->>'reason')='OFF',
  'scheduler must not reactivate after Emergency-OFF'
);

-- Even an explicitly seeded authorization cannot restart a release after its
-- lease expires; a fresh manual OFF -> ON generation is required.
insert into decision_vnext_private.product_runtime_control_events_v1(
  generation,state,release_hash,artifact_hash,source_set_hash,reason_code,
  authority_hash,authority_version,authority_expires_at
) values (
  3,'ON',repeat('a',64),repeat('b',64),repeat('c',64),'EXPIRED_TEST',
  repeat('d',64),'backyrd.decision-vnext.product-activation-authority@1.0',
  pg_catalog.clock_timestamp()-interval '1 hour'
);
insert into decision_vnext_private.product_continuity_authorizations_v1(
  generation,release_hash,artifact_hash,source_set_hash,authority_hash
) values (3,repeat('a',64),repeat('b',64),repeat('c',64),repeat('e',64));
select pg_temp.assert(
  (decision_vnext_private.renew_product_continuity_v1()->>'reason')='EXPIRED',
  'expired generation was resurrected by scheduler'
);
select pg_temp.assert(
  not (public.backyrd_decision_vnext_product_control_v1(
    repeat('a',64),repeat('b',64),repeat('c',64),3
  )->>'enabled')::boolean,
  'expired generation must stay denied to service reader'
);

rollback;
