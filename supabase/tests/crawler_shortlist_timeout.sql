\set ON_ERROR_STOP on
begin;
set local statement_timeout = '5s';
do $$
declare
  v_snapshot bigint;
  v_run bigint;
  v_list jsonb;
  v_known jsonb := '{"name":"Quellenprobe 1","category":"CAFE","address":"Prüfweg 1","lat":47.57,"lng":7.59,"website":"https://test.example/","source_url":"https://test.example/"}';
begin
-- backyrd:authorization-negative
  if has_function_privilege('authenticated','public.backyrd_crawler_shortlist_v1(bigint,jsonb)','execute')
    then raise exception 'crawler shortlist is accessible to authenticated'; end if;
-- backyrd:authorization-positive
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into world_knowledge_private.basel_spot_source_runs_v1(source_key,request_id,status,finished_at)
    values('BASEL_OVERTURE',-88995,'COMPLETE',now()) returning id into v_snapshot;
  update world_knowledge_private.spot_source_settings_v1 set enabled=true where source_key='BASEL_OVERTURE';
  insert into world_knowledge_private.basel_spot_source_rows_v1(source_key,source_id,facts,last_seen_run_id,changed_at)
    select 'BASEL_OVERTURE',900000+i,
      v_known || jsonb_build_object('external_id','test-'||i,'name','Quellenprobe '||i,'address','Prüfweg '||i),
      v_snapshot,now()
    from generate_series(1,1100) i;
  insert into world_knowledge_private.basel_spot_source_runs_v1(source_key,request_id,crawler_settings)
    values('BASEL_WEB',-88996,'{"districts":["Basel"],"categories":["CAFE"],"limit":10}')
    returning id into v_run;
  v_list:=public.backyrd_crawler_shortlist_v1(v_run,jsonb_build_array(v_known||jsonb_build_object('external_id',repeat('a',64))));
  if jsonb_array_length(v_list)<>10 or v_list#>>'{0,external_id}'<>repeat('a',64)
    or (select count(*) from jsonb_array_elements(v_list) item where item->>'name'='Quellenprobe 1')<>1
    then raise exception 'mixed shortlist lost candidates or admitted a duplicate: %',v_list; end if;
end
$$;
rollback;
