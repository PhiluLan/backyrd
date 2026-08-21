\set ON_ERROR_STOP on
begin;
create function pg_temp.uuid(p text) returns uuid language sql immutable as $$ select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.assert(p boolean,m text) returns void language plpgsql as $$ begin if p is not true then raise exception 'runtime test failed: %',m; end if; end $$;
do $$
declare u uuid:=pg_temp.uuid('runtime-user'); o uuid:=pg_temp.uuid('runtime-other'); a uuid:=pg_temp.uuid('runtime-a'); b uuid:=pg_temp.uuid('runtime-b'); c uuid:=pg_temp.uuid('runtime-c'); ra uuid:=pg_temp.uuid('runtime-ra'); rb uuid:=pg_temp.uuid('runtime-rb'); rc uuid:=pg_temp.uuid('runtime-rc');
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','runtime@fixture.invalid','','{}','{}',now(),now()),('00000000-0000-0000-0000-000000000000',o,'authenticated','authenticated','runtime-other@fixture.invalid','','{}','{}',now(),now());
 insert into public.profiles(id) values(u),(o) on conflict do nothing; insert into public.spots(id,name,lat,lng,status) values(a,'A',47,7,'approved'),(b,'B',47.1,7.1,'approved'),(c,'C',47.2,7.2,'approved');
 insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active) values('personalized_recommendations','P','P','personalization','consent',true,false,false,1,true) on conflict do nothing;
 insert into public.user_consents(user_id,purpose_key,status,granted_at,source) values(u,'personalized_recommendations','granted',now(),'system_migration');
 insert into public.backyrd_internal_live_users_v1(user_id,enabled,activated_at) values(u,true,now());
 update public.backyrd_user_intelligence_runtime_settings_v1 set enabled=true;
 insert into public.reviews(id,spot_id,user_id,product_evidence_origin,text,mood_a) values(ra,a,u,'smart_review_v1','Super gemütlich, komme wieder.','gemütlich'),(rb,b,u,'smart_review_v1','Super gemütlich, komme wieder.','gemütlich'),(rc,c,u,'smart_review_v1','Viel zu laut und hektisch, komme nicht wieder.','laut');
 insert into public.review_photos(review_id,url,uploaded_by) values(ra,'https://fixture/a',u),(rb,'https://fixture/b',u),(rc,'https://fixture/c',u);
end $$;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true); select set_config('request.jwt.claim.role','service_role',true);
select public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',pg_temp.uuid('runtime-user'),'idempotencyKey','runtime:a','eventType','verified_visit','contractVersion','backyrd-memory-event-contract-v1','occurredAt',now()-interval '3 days','observedAt',now()-interval '3 days','spotId',pg_temp.uuid('runtime-a'),'sessionId','s-a','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId','smart_review:'||pg_temp.uuid('runtime-ra'),'sourceVersion','backyrd-product-memory-bridge-v1'),'consentPurpose','personalized_recommendations','consentState','granted'));
select public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',pg_temp.uuid('runtime-user'),'idempotencyKey','runtime:b','eventType','verified_visit','contractVersion','backyrd-memory-event-contract-v1','occurredAt',now()-interval '2 days','observedAt',now()-interval '2 days','spotId',pg_temp.uuid('runtime-b'),'sessionId','s-b','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId','smart_review:'||pg_temp.uuid('runtime-rb'),'sourceVersion','backyrd-product-memory-bridge-v1'),'consentPurpose','personalized_recommendations','consentState','granted'));
select public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',pg_temp.uuid('runtime-user'),'idempotencyKey','runtime:c','eventType','verified_visit','contractVersion','backyrd-memory-event-contract-v1','occurredAt',now()-interval '1 day','observedAt',now()-interval '1 day','spotId',pg_temp.uuid('runtime-c'),'sessionId','s-c','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId','smart_review:'||pg_temp.uuid('runtime-rc'),'sourceVersion','backyrd-product-memory-bridge-v1'),'consentPurpose','personalized_recommendations','consentState','granted'));
select pg_temp.assert((select count(*)=3 from public.backyrd_user_intelligence_work_v1 where user_id=pg_temp.uuid('runtime-user') and state='PENDING'),'canonical memories queue the shared server runner');
do $$ begin begin perform public.backyrd_process_user_intelligence_work_v1(10); raise exception 'old sql worker activated'; exception when feature_not_supported then null; end; begin perform public.backyrd_rebuild_user_intelligence_v1(pg_temp.uuid('runtime-user')); raise exception 'old sql rebuild activated'; exception when feature_not_supported then null; end; end $$;
select pg_temp.assert((select count(*)=0 from public.backyrd_user_intelligence_nodes_v2 where user_id=pg_temp.uuid('runtime-user')),'SQL path remains nonauthoritative and disabled');
reset role;
update public.user_consents set status='withdrawn',granted_at=null,withdrawn_at=now() where user_id=pg_temp.uuid('runtime-user');
select pg_temp.assert((select count(*)=0 from public.backyrd_user_intelligence_work_v1 where user_id=pg_temp.uuid('runtime-user')),'withdrawal purges queued work');
select pg_temp.assert((select count(*)=0 from public.backyrd_user_intelligence_snapshots_v2 where user_id=pg_temp.uuid('runtime-user')),'withdrawal purges shared-runtime snapshots');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uuid('runtime-other'),'role','authenticated')::text,true); select set_config('request.jwt.claim.sub',pg_temp.uuid('runtime-other')::text,true); select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin begin perform public.backyrd_rebuild_user_intelligence_v1(pg_temp.uuid('runtime-user')); raise exception 'client rebuild'; exception when insufficient_privilege then null; end; begin select * from public.backyrd_user_evidence_chains_v1; raise exception 'client chains'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
