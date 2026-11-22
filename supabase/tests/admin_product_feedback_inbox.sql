\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.feedback_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'feedback inbox: %',label; end if; end $$;
create function pg_temp.feedback_actor(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('12000000-0000-4000-8000-000000000001','authenticated','authenticated','feedback-inbox-admin@invalid','',now(),now()),
 ('12000000-0000-4000-8000-000000000002','authenticated','authenticated','feedback-inbox-user@invalid','',now(),now());
update public.profiles set is_admin=true where id='12000000-0000-4000-8000-000000000001';
insert into public.admin_users(user_id,role) values('12000000-0000-4000-8000-000000000001','super_admin');

insert into decision_vnext_private.product_idempotency_records_v1(
 scope_version,purpose,auth_user_id,subject_digest,idempotency_key_digest,payload_hash,
 response_contract_version,release_hash,artifact_hash,source_set_hash,generation,
 response_envelope_bytes,response_hash,expires_at
) values(
 'backyrd.decision-vnext.product-idempotency-scope@1.0','PRODUCT_DECISION_VNEXT_EVALUATION',
 '12000000-0000-4000-8000-000000000002',repeat('1',64),repeat('2',64),repeat('3',64),
 'backyrd.decision-vnext.product-response@1.0',repeat('4',64),repeat('5',64),repeat('6',64),1,
 '{"response":{"decisionId":"decision-inbox-test","status":"AVAILABLE","interpretation":{"targetCity":"Basel","primaryIntent":"COFFEE","dateTime":{"dayPhase":"AFTERNOON"},"group":{"minimumAge":4},"naturalLanguage":"private-original"},"candidates":[{"rank":1,"contextualReject":false,"presentation":{"name":"Testcafé"},"tier":"ELIGIBLE_CONFIRMED","actualAvailability":"unknown"},{"rank":null,"contextualReject":false,"presentation":{"name":"Hidden candidate"}}],"rankingPolicyVersion":"policy-test"}}',
 repeat('7',64),clock_timestamp()+interval '1 hour'
);
insert into public.product_feedback_v1(id,user_id,surface,sentiment,message,product_decision_id,client_context,created_at) values
 ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','decision','helpful','__feedback_inbox_fixture__ <script>text</script>','decision-inbox-test','{"platform":"ios","app_version":"1.1.1","extra_secret":"not-for-admin"}',now()),
 ('22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','decision','almost','__feedback_inbox_fixture__',null,'{}',now()),
 ('22000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000002','decision','not_helpful','__feedback_inbox_fixture__',null,'{}',now());
select pg_temp.feedback_assert(not has_table_privilege('authenticated','public.product_feedback_review_events_v1','INSERT,UPDATE,DELETE,SELECT'),'direct audit access');
select pg_temp.feedback_assert(not has_function_privilege('anon','public.admin_product_feedback_detail_v1(uuid)','EXECUTE'),'anonymous detail grant');
select pg_temp.feedback_assert(not has_function_privilege('service_role','public.admin_review_product_feedback_v1(uuid,integer,text,text,text,text)','EXECUTE'),'service role new admin grant');

set local role authenticated;
select pg_temp.feedback_actor('12000000-0000-4000-8000-000000000002');
do $$ begin
  begin perform public.admin_list_product_feedback_v2(); raise exception 'ordinary user list accepted'; exception when insufficient_privilege then null; end;
  begin perform public.admin_product_feedback_detail_v1('22000000-0000-4000-8000-000000000001'); raise exception 'ordinary user detail accepted'; exception when insufficient_privilege then null; end;
  begin perform public.admin_review_product_feedback_v1('22000000-0000-4000-8000-000000000001',0,'done','other','denied',''); raise exception 'ordinary user review accepted'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.feedback_actor('12000000-0000-4000-8000-000000000001');
do $$ declare page jsonb; detail jsonb; revision integer; cursor_at timestamptz; cursor_id uuid; begin
  page:=public.admin_list_product_feedback_v2(p_search=>'__feedback_inbox_fixture__',p_limit=>1);
  perform pg_temp.feedback_assert((page#>>'{summary,total}')::integer=3,'exact total before pagination');
  perform pg_temp.feedback_assert(jsonb_array_length(page->'rows')=2,'one extra row for pagination');
  cursor_at:=(page#>>'{rows,0,created_at}')::timestamptz; cursor_id:=(page#>>'{rows,0,id}')::uuid;
  page:=public.admin_list_product_feedback_v2(p_search=>'__feedback_inbox_fixture__',p_before=>cursor_at,p_before_id=>cursor_id,p_limit=>1);
  perform pg_temp.feedback_assert((page#>>'{rows,0,id}')::uuid<>cursor_id,'equal timestamp keyset does not repeat row');
  page:=public.admin_list_product_feedback_v2(p_sentiment=>'almost',p_search=>'__feedback_inbox_fixture__');
  perform pg_temp.feedback_assert((page#>>'{summary,total}')::integer=1,'sentiment filter');
  detail:=public.admin_product_feedback_detail_v1('22000000-0000-4000-8000-000000000001');
  perform pg_temp.feedback_assert(detail#>>'{feedback,decision_context,city}'='Basel','captured city');
  perform pg_temp.feedback_assert(jsonb_array_length(detail#>'{feedback,decision_context,ranked_candidates}')=1,'hidden unranked candidate omitted');
  perform pg_temp.feedback_assert(not (detail->'feedback' ? 'user_id'),'account ID minimized');
  perform pg_temp.feedback_assert(not ((detail#>'{feedback,client_context}') ? 'extra_secret'),'client context whitelisted');
  perform pg_temp.feedback_assert(strpos(detail::text,'private-original')=0 and strpos(detail::text,'minimumAge')=0,'raw wish and participant details omitted');
  perform pg_temp.feedback_assert(public.admin_product_feedback_detail_v1('22000000-0000-4000-8000-000000000002')#>'{feedback,decision_context}'='null'::jsonb,'missing old context remains honest');
  begin perform public.admin_review_product_feedback_v1('22000000-0000-4000-8000-000000000001',0,'done','other','',''); raise exception 'empty resolution accepted'; exception when invalid_parameter_value then null; end;
  revision:=public.admin_review_product_feedback_v1('22000000-0000-4000-8000-000000000001',0,'reviewing','spot_data','Opening hours checked','BACK-42');
  perform pg_temp.feedback_assert(revision=1,'review revision advances');
  perform pg_temp.feedback_assert(public.admin_review_product_feedback_v1('22000000-0000-4000-8000-000000000001',1,'reviewing','spot_data','Opening hours checked','BACK-42')=1,'no-op does not duplicate audit');
  begin perform public.admin_review_product_feedback_v1('22000000-0000-4000-8000-000000000001',0,'done','spot_data','stale','BACK-42'); raise exception 'stale editor accepted'; exception when serialization_failure then null; end;
  perform public.admin_review_product_feedback_v1('22000000-0000-4000-8000-000000000001',1,'done','spot_data','Fixed, regression added','BACK-42');
  detail:=public.admin_product_feedback_detail_v1('22000000-0000-4000-8000-000000000001');
  perform pg_temp.feedback_assert(jsonb_array_length(detail->'history')=2,'append-only audit of each change');
  perform pg_temp.feedback_assert(detail#>>'{history,0,actor_id}'='12000000-0000-4000-8000-000000000001','actor recorded');
  page:=public.admin_list_product_feedback_v2(p_status=>'done',p_kind=>'spot_data',p_search=>'BACK-42');
  perform pg_temp.feedback_assert((page#>>'{summary,total}')::integer=1,'status/category/ticket filtering');
  perform public.admin_review_product_feedback_v1('22000000-0000-4000-8000-000000000001',2,'reviewing','spot_data','Reopened after beta test','BACK-42');
  perform pg_temp.feedback_assert(public.admin_product_feedback_detail_v1('22000000-0000-4000-8000-000000000001')#>>'{feedback,review_status}'='reviewing','reversible review');
  begin perform public.admin_list_product_feedback_v2(p_status=>'invalid'); raise exception 'invalid filter accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
select pg_temp.feedback_assert((select message='__feedback_inbox_fixture__ <script>text</script>' and sentiment='helpful' from public.product_feedback_v1 where id='22000000-0000-4000-8000-000000000001'),'original feedback unchanged');
rollback;
