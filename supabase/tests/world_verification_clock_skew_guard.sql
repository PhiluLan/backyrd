\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$ begin if p_ok is not true then raise exception 'scoped knowledge failed: %',p_message;end if;end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$ select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.expect_error(p_sql text,p_state text,p_message text) returns void language plpgsql as $$ declare code text;begin begin execute p_sql;exception when others then get stacked diagnostics code=returned_sqlstate;if code=p_state then return;end if;raise exception '%: received %',p_message,code;end;raise exception '%: unexpected success',p_message;end $$;
select set_config('app.world_knowledge_founder_authoring_enabled','on',true);
do $$ declare actor text;begin
 foreach actor in array array['experience-owner','experience-admin','experience-stranger'] loop
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000',pg_temp.id(actor),'authenticated','authenticated',actor||'@test.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
  insert into public.profiles(id,is_admin) values(pg_temp.id(actor),actor='experience-admin') on conflict(id) do update set is_admin=excluded.is_admin;
 end loop;
 insert into public.spots(id,name,lat,lng,status,city,owner_id,data_origin) values(pg_temp.id('experience-restaurant'),'Synthetic scoped restaurant',47.1,8.1,'approved','Basel',pg_temp.id('experience-owner'),'TEST');
end $$;

insert into world_knowledge_private.product_admin_authoring_control_events_v1(generation,state,reason_code)
select max(generation)+1,'ON','SYNTHETIC_CLOCK_TEST' from world_knowledge_private.product_admin_authoring_control_events_v1;
create temporary table clock_fixture as select clock_timestamp()+interval '3 seconds' as observed_at;
grant select on clock_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('experience-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_product_admin_submit_claim_v1(pg_temp.id('experience-restaurant'),'identity.name','KNOWN_VALUE','"Synthetic clock test"',(select observed_at from clock_fixture),null,null,'PUBLIC',null,'clock-admin-write')->>'created')='true','device clock ahead must save through actual Product Admin RPC');
select pg_temp.assert((public.world_product_admin_submit_claim_v1(pg_temp.id('experience-restaurant'),'identity.name','KNOWN_VALUE','"Synthetic clock test"',(select observed_at from clock_fixture),null,null,'PUBLIC',null,'clock-admin-write')->>'created')='false','same request must replay unchanged');
select pg_temp.expect_error(format('select public.world_product_admin_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp()+interval %L,null,null,%L,null,%L)',pg_temp.id('experience-restaurant'),'identity.name','KNOWN_VALUE','"Too far ahead"','61 seconds','PUBLIC','clock-too-far'),'22023','future tolerance must remain bounded');
select set_config('request.jwt.claim.sub',pg_temp.id('experience-owner')::text,true);
select pg_temp.assert((public.world_owner_submit_claim_v1(pg_temp.id('experience-restaurant'),'contact.website','KNOWN_VALUE','"https://example.com"',clock_timestamp()+interval '2 seconds',null,null,'PUBLIC',null,'clock-owner-write')->>'created')='true','owner clock skew must save');
select set_config('request.jwt.claim.sub',pg_temp.id('experience-stranger')::text,true);
select pg_temp.expect_error(format('select public.world_owner_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',pg_temp.id('experience-restaurant'),'identity.name','KNOWN_VALUE','"Foreign owner"','PUBLIC','clock-foreign'),'42501','foreign owner remains denied');
select pg_temp.expect_error(format('select public.world_product_admin_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',pg_temp.id('experience-restaurant'),'identity.name','KNOWN_VALUE','"Non-admin"','PUBLIC','clock-non-admin'),'42501','non-admin remains denied');
reset role;
select pg_temp.assert((select count(*)=1 from world_knowledge_private.claims where idempotency_key='clock-admin-write'),'replay duplicated claim');
select pg_temp.assert((select c.observed_at=f.observed_at and v.checked_at>=c.created_at and v.checked_at<c.observed_at from world_knowledge_private.claims c join world_knowledge_private.verification_records v on v.claim_id=c.id cross join clock_fixture f where c.idempotency_key='clock-admin-write'),'timestamps were fabricated or observation changed');
do $$ declare code text;begin
 begin
 insert into world_knowledge_private.verification_records(claim_id,claim_hash,spot_id,attribute_key,scope,policy_version,verification_method,execution_authority,verifier_binding_id,result,checked_at,reverification_policy_ref,reason_codes,result_hash)
 select v.claim_id,v.claim_hash,v.spot_id,v.attribute_key,v.scope,v.policy_version,v.verification_method,v.execution_authority,v.verifier_binding_id,v.result,c.created_at-interval '1 second',v.reverification_policy_ref,v.reason_codes,v.result_hash
 from world_knowledge_private.verification_records v join world_knowledge_private.claims c on c.id=v.claim_id where c.idempotency_key='clock-admin-write';
 exception when sqlstate '22023' then if sqlerrm='verification_binding_invalid' then return;end if;raise;end;
 raise exception 'verification before server receipt was accepted';
end $$;
select pg_temp.assert(not has_function_privilege('authenticated','world_knowledge_private.validate_verification_insert_v1()','execute'),'private verification validator exposed');
select pg_temp.assert(not has_function_privilege('anon','public.world_product_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)','execute'),'anonymous write exposed');
rollback;
