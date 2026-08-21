\set ON_ERROR_STOP on
begin;

create function pg_temp.uuid(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$ begin if p_ok is not true then raise exception 'n4 adapter test failed: %',p_message; end if; end $$;

do $$
declare u uuid:=pg_temp.uuid('n4-adapter-user'); a uuid:=pg_temp.uuid('n4-adapter-a'); b uuid:=pg_temp.uuid('n4-adapter-b'); c uuid:=pg_temp.uuid('n4-adapter-c');
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','n4-adapter@fixture.invalid','','{}','{}',now(),now());
  insert into public.profiles(id) values(u) on conflict do nothing;
  insert into public.spots(id,name,lat,lng,status) values(a,'N4 A',47,7,'approved'),(b,'N4 B',47.1,7.1,'approved'),(c,'N4 C',47.2,7.2,'approved');
  insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active)
  values('personalized_recommendations','P','P','personalization','consent',true,false,false,1,true) on conflict do nothing;
  insert into public.user_consents(user_id,purpose_key,status,granted_at,source) values(u,'personalized_recommendations','granted',now(),'system_migration');
  insert into public.backyrd_internal_live_users_v1(user_id,enabled,activated_at) values(u,true,now());
  update public.backyrd_user_intelligence_runtime_settings_v1 set enabled=true;
  insert into public.reviews(id,spot_id,user_id,product_evidence_origin,text) values
    (pg_temp.uuid('n4-r-a1'),a,u,'smart_review_v1','Super, komme wieder.'),
    (pg_temp.uuid('n4-r-a2'),a,u,'smart_review_v1','Toll, komme wieder.'),
    (pg_temp.uuid('n4-r-b1'),b,u,'smart_review_v1','Viel zu laut, komme nicht wieder.'),
    (pg_temp.uuid('n4-r-b2'),b,u,'smart_review_v1','Katastrophal laut, komme nicht wieder.'),
    (pg_temp.uuid('n4-r-c'),c,u,'smart_review_v1','Super, komme wieder.');
  insert into public.review_photos(review_id,url,uploaded_by) select id,'https://fixture.invalid/'||id,u from public.reviews where user_id=u;
  -- These are canonical service-qualified N4 rows; no owner claim/tier is read by the adapter.
  insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance) values
    (a,'character.authentic_character','INTERPRETATION','0.90','backyrd_derived','fixture:a:authentic',.90,now(),now(),'{"fixture":true}'),
    (b,'vibe.lively','INTERPRETATION','0.92','backyrd_derived','fixture:b:lively',.92,now(),now(),'{"fixture":true}');
end $$;

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true); select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert((select available and jsonb_array_length(concepts)=1 from public.backyrd_read_n4_for_user_intelligence_v1(array[pg_temp.uuid('n4-adapter-a')])),'canonical N4 concept is available with confidence');
select pg_temp.assert((select not available and concepts='[]'::jsonb from public.backyrd_read_n4_for_user_intelligence_v1(array[pg_temp.uuid('n4-adapter-c')])),'missing N4 is explicit UNKNOWN');

-- Each source event is distinct; replay is covered by the Sprint-1/2 suites.
select public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',pg_temp.uuid('n4-adapter-user'),'idempotencyKey','n4:a1','eventType','verified_visit','contractVersion','backyrd-memory-event-contract-v1','occurredAt',now()-interval '4 days','observedAt',now()-interval '4 days','spotId',pg_temp.uuid('n4-adapter-a'),'sessionId','n4-a1','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId','smart_review:'||pg_temp.uuid('n4-r-a1'),'sourceVersion','backyrd-product-memory-bridge-v1'),'consentPurpose','personalized_recommendations','consentState','granted'));
select public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',pg_temp.uuid('n4-adapter-user'),'idempotencyKey','n4:a2','eventType','verified_visit','contractVersion','backyrd-memory-event-contract-v1','occurredAt',now()-interval '3 days','observedAt',now()-interval '3 days','spotId',pg_temp.uuid('n4-adapter-a'),'sessionId','n4-a2','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId','smart_review:'||pg_temp.uuid('n4-r-a2'),'sourceVersion','backyrd-product-memory-bridge-v1'),'consentPurpose','personalized_recommendations','consentState','granted'));
select public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',pg_temp.uuid('n4-adapter-user'),'idempotencyKey','n4:b1','eventType','verified_visit','contractVersion','backyrd-memory-event-contract-v1','occurredAt',now()-interval '2 days','observedAt',now()-interval '2 days','spotId',pg_temp.uuid('n4-adapter-b'),'sessionId','n4-b1','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId','smart_review:'||pg_temp.uuid('n4-r-b1'),'sourceVersion','backyrd-product-memory-bridge-v1'),'consentPurpose','personalized_recommendations','consentState','granted'));
select public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',pg_temp.uuid('n4-adapter-user'),'idempotencyKey','n4:b2','eventType','verified_visit','contractVersion','backyrd-memory-event-contract-v1','occurredAt',now()-interval '1 day','observedAt',now()-interval '1 day','spotId',pg_temp.uuid('n4-adapter-b'),'sessionId','n4-b2','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId','smart_review:'||pg_temp.uuid('n4-r-b2'),'sourceVersion','backyrd-product-memory-bridge-v1'),'consentPurpose','personalized_recommendations','consentState','granted'));
select public.backyrd_ingest_memory_event_v1(jsonb_build_object('userId',pg_temp.uuid('n4-adapter-user'),'idempotencyKey','n4:c','eventType','verified_visit','contractVersion','backyrd-memory-event-contract-v1','occurredAt',now(),'observedAt',now(),'spotId',pg_temp.uuid('n4-adapter-c'),'sessionId','n4-c','momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId','smart_review:'||pg_temp.uuid('n4-r-c'),'sourceVersion','backyrd-product-memory-bridge-v1'),'consentPurpose','personalized_recommendations','consentState','granted'));
select pg_temp.assert((select count(*)=5 from public.backyrd_user_intelligence_work_v1 where user_id=pg_temp.uuid('n4-adapter-user') and state='PENDING'),'all canonical memories are queued for the shared server runner');
do $$ begin begin perform public.backyrd_process_user_intelligence_work_v1(10); raise exception 'old sql worker activated'; exception when feature_not_supported then null; end; end $$;
select pg_temp.assert((select count(*)=0 from public.backyrd_user_intelligence_nodes_v2 where user_id=pg_temp.uuid('n4-adapter-user')),'disabled SQL worker cannot create derived nodes');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated')::text,true); select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin begin perform public.backyrd_read_n4_for_user_intelligence_v1(array[pg_temp.uuid('n4-adapter-a')]); raise exception 'client adapter access'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
