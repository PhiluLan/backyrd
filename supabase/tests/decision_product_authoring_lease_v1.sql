\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'product authoring lease test failed: %',p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
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
  not has_function_privilege('anon','public.world_product_authoring_detail_v1(uuid)','execute')
  and not has_function_privilege('anon','public.world_product_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)','execute')
  and has_function_privilege('authenticated','public.world_product_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)','execute')
  and has_function_privilege('authenticated','public.world_product_authoring_detail_v1(uuid)','execute')
  and not has_function_privilege('authenticated','public.world_product_rebuild_spot_v1(uuid,uuid,timestamptz,text)','execute')
  and has_function_privilege('service_role','public.world_product_rebuild_spot_v1(uuid,uuid,timestamptz,text)','execute')
  and not has_function_privilege('service_role','public.backyrd_decision_vnext_product_activate_v1(bigint,text,text,text,text,timestamptz)','execute'),
  'ACL did not separate client, service and release operator'
);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000',pg_temp.id('product-world-admin'),'authenticated','authenticated','product-world-admin@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.profiles(id,is_admin) values(pg_temp.id('product-world-admin'),true)
  on conflict(id) do update set is_admin=true;
insert into public.spots(id,name,lat,lng,status,city,owner_id,data_origin)
values(pg_temp.id('product-world-spot'),'Synthetic Reader Spot',47.3,8.5,'approved','Zürich',null,'REAL');

select set_config('request.jwt.claim.sub',pg_temp.id('product-world-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('product-world-admin'))::text,true);
select set_config('app.world_knowledge_founder_authoring_enabled','off',true);
select pg_temp.assert(
  (public.world_product_admin_search_spots_v1('Synthetic Reader',20)->'spots') @>
    jsonb_build_array(jsonb_build_object('spotId',pg_temp.id('product-world-spot'))),
  'Admin could not discover the real approved spot before the correction flow'
);
select pg_temp.expect_state(format(
  'select public.world_product_admin_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',
  pg_temp.id('product-world-spot'),'identity.name','KNOWN_VALUE','"Before"','PUBLIC','off-claim'
),'42501');
select set_config('app.world_knowledge_founder_authoring_enabled','on',true);
select pg_temp.expect_state(format(
  'select public.world_product_admin_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',
  pg_temp.id('product-world-spot'),'identity.name','KNOWN_VALUE','"Before"','PUBLIC','founder-guc-replay'
),'42501');
select set_config('app.world_knowledge_founder_authoring_enabled','off',true);

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.expect_state(format(
  'select public.world_product_rebuild_spot_v1(%L,%L,clock_timestamp(),%L)',
  pg_temp.id('product-world-admin'),pg_temp.id('product-world-spot'),'off-rebuild'
),'42501');
select pg_temp.assert(
  (world_knowledge_private.set_product_admin_authoring_control_v1(
    0,'ON','ADMIN_WORLD_MAINTENANCE_TEST')->>'state')='ON',
  'separate Admin World authority did not activate'
);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('product-world-admin'))::text,true);
select pg_temp.assert(
  (public.world_product_admin_submit_claim_v1(
    pg_temp.id('product-world-spot'),'description.highlight','KNOWN_VALUE','"Administrative World correction"',
    clock_timestamp(),null,null,'PUBLIC',null,'admin-while-decision-off'
  )->>'created')::boolean,
  'Admin World correction was incorrectly gated by Decision OFF'
);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.assert(
  (public.world_product_rebuild_spot_v1(
    pg_temp.id('product-world-admin'),pg_temp.id('product-world-spot'),clock_timestamp(),
    'admin-world-rebuild-while-decision-off')->>'manifestHash') is not null,
  'Admin World rebuild was incorrectly gated by Decision OFF'
);
select pg_temp.expect_state(format(
  'select public.backyrd_decision_vnext_product_context_v2(%L,%L,%L,%L,%L,%L,%L,%s)',
  pg_temp.id('product-world-admin'),repeat('f',64),'Zürich','ACTIVITY_EXPERIENCE',
  repeat('a',64),repeat('b',64),repeat('c',64),1
),'55000');
select pg_temp.assert(
  (public.backyrd_decision_vnext_product_activate_v1(
    0,repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),
    clock_timestamp()+interval '1 hour'
  )->>'generation')::bigint=1,
  'operator ON transition failed'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('product-world-admin'))::text,true);
select pg_temp.assert(
  (public.world_product_admin_submit_claim_v1(
    pg_temp.id('product-world-spot'),'identity.name','KNOWN_VALUE','"Before"',
    clock_timestamp(),null,null,'PUBLIC',null,'product-before'
  )->>'created')::boolean,
  'append-only Admin claim failed'
);
select pg_temp.assert(
  (public.world_product_admin_submit_claim_v1(
    pg_temp.id('product-world-spot'),'location.locality','KNOWN_VALUE','"Zürich"',
    clock_timestamp(),null,null,'PUBLIC',null,'product-locality'
  )->>'created')::boolean,
  'authorized locality claim failed'
);
select pg_temp.assert(
  (public.world_product_authoring_detail_v1(pg_temp.id('product-world-spot'))#>>'{answers,identity.name,value}')='Before',
  'authorized Product detail did not read canonical claim'
);
select set_config('request.jwt.claim.sub',pg_temp.id('product-world-other')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('product-world-other'))::text,true);
select pg_temp.expect_state(format('select public.world_product_authoring_detail_v1(%L)',pg_temp.id('product-world-spot')),'42501');
select pg_temp.expect_state(format(
  'select public.world_product_admin_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',
  pg_temp.id('product-world-spot'),'identity.name','KNOWN_VALUE','"Unauthorized"','PUBLIC','nonadmin-claim'
),'42501');

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.expect_state(format(
  'select public.world_product_rebuild_spot_v1(%L,%L,clock_timestamp(),%L)',
  pg_temp.id('product-world-other'),pg_temp.id('product-world-spot'),'wrong-actor-rebuild'
),'42501');
create temporary table product_world_before as select public.world_product_rebuild_spot_v1(
  pg_temp.id('product-world-admin'),pg_temp.id('product-world-spot'),clock_timestamp(),'product-world-before-rebuild'
) result;
select pg_sleep(0.01);

select set_config('request.jwt.claim.sub',pg_temp.id('product-world-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('product-world-admin'))::text,true);
select pg_temp.assert(
  (public.world_product_admin_submit_claim_v1(
    pg_temp.id('product-world-spot'),'identity.name','KNOWN_VALUE','"After"',
    clock_timestamp(),null,null,'PUBLIC',
    (select (public.world_product_authoring_detail_v1(pg_temp.id('product-world-spot'))#>>'{answers,identity.name,claimId}')::uuid),
    'product-after'
  )->>'created')::boolean,
  'append-only correction failed'
);

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create temporary table product_world_after as select public.world_product_rebuild_spot_v1(
  pg_temp.id('product-world-admin'),pg_temp.id('product-world-spot'),clock_timestamp()+interval '1 second','product-world-after-rebuild'
) result;
select pg_temp.assert(
  (select p.manifest_hash from world_knowledge_private.current_projection_pointers p
    where p.spot_id=pg_temp.id('product-world-spot'))
  = (select m.manifest_hash from world_knowledge_private.resolution_manifests m
    join world_knowledge_private.current_projection_pointers p on p.manifest_id=m.id
    where p.spot_id=pg_temp.id('product-world-spot')),
  'rebuild did not bind the canonical current pointer'
);
select pg_temp.assert(
  (select result->>'manifestHash' from product_world_after)
    is distinct from (select result->>'manifestHash' from product_world_before),
  'correction did not change canonical manifest'
);
select pg_temp.assert(
  (select public.backyrd_decision_vnext_product_context_v2(
    pg_temp.id('product-world-admin'),repeat('f',64),'Zürich','ACTIVITY_EXPERIENCE',
    repeat('a',64),repeat('b',64),repeat('c',64),1
  )->'worldSnapshots' @> jsonb_build_array(jsonb_build_object(
      'contractVersion','backyrd.world-knowledge.product-resolver-binding@1.0',
      'manifestHash',m.manifest_hash,'registryHash',m.world_snapshot->>'registryHash',
      'resolvedAt',m.world_snapshot->>'resolvedAt','decisionProjection',m.decision_projection))
  from world_knowledge_private.current_projection_pointers p
  join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id
  where p.spot_id=pg_temp.id('product-world-spot')),
  'the actual Product context did not consume the corrected canonical World pointer'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('product-world-admin'))::text,true);
select pg_temp.assert(
  (public.world_product_authoring_detail_v1(pg_temp.id('product-world-spot'))#>>'{answers,identity.name,value}')='After',
  'correction did not reach the authorized reader'
);

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.assert(
  (public.backyrd_decision_vnext_product_emergency_off_v1(
    1,repeat('a',64),repeat('b',64),repeat('c',64),'EMERGENCY_TEST',repeat('e',64)
  )->>'generation')::bigint=2,
  'Emergency-OFF transition failed'
);
select pg_temp.assert(
  (public.world_product_rebuild_spot_v1(
    pg_temp.id('product-world-admin'),pg_temp.id('product-world-spot'),clock_timestamp(),
    'after-decision-off-admin-rebuild')->>'manifestHash') is not null,
  'Decision Emergency-OFF incorrectly disabled independent Admin World maintenance'
);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('product-world-admin'))::text,true);
select pg_temp.assert(
  (public.world_product_admin_submit_claim_v1(
    pg_temp.id('product-world-spot'),'contact.website','KNOWN_VALUE','"https://example.invalid"',
    clock_timestamp(),null,null,'PUBLIC',null,'after-decision-off-admin-claim'
  )->>'created')::boolean,
  'Decision Emergency-OFF incorrectly disabled independent Admin World claims'
);
select pg_temp.assert(
  (world_knowledge_private.set_product_admin_authoring_control_v1(
    1,'OFF','ADMIN_WORLD_EMERGENCY_OFF_TEST')->>'killSwitch')::boolean,
  'World Admin emergency OFF did not engage'
);
select pg_temp.expect_state(format(
  'select public.world_product_admin_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',
  pg_temp.id('product-world-spot'),'identity.name','KNOWN_VALUE','"Forbidden"','PUBLIC','after-world-off-claim'
),'42501');
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.expect_state(format(
  'select public.world_product_rebuild_spot_v1(%L,%L,clock_timestamp(),%L)',
  pg_temp.id('product-world-admin'),pg_temp.id('product-world-spot'),'after-world-off-rebuild'
),'42501');
rollback;
