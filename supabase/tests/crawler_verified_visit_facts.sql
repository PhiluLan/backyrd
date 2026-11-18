\set ON_ERROR_STOP on
begin;
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_category uuid := gen_random_uuid();
  v_run bigint;
  v_snapshot bigint;
  v_spot uuid;
  v_row jsonb;
  v_list jsonb;
  v_web jsonb := jsonb_build_object('external_id',repeat('8',64),'name','Besuchsprobe Café',
    'category','CAFE','address','Belegweg 7','lat',47.57011,'lng',7.59411,
    'website','https://test-cafe.example/','source_url','https://test-cafe.example/');
  v_days jsonb;
  v_canonical boolean := to_regprocedure('world_knowledge_private.set_product_admin_authoring_control_v1(bigint,text,text)') is not null;
begin
-- backyrd:authorization-negative
  if has_function_privilege('authenticated','public.backyrd_crawler_shortlist_v1(bigint,jsonb)','execute')
    or has_function_privilege('authenticated','public.backyrd_crawler_finish_basics_v1(bigint,jsonb,jsonb)','execute')
    or has_function_privilege('anon','public.admin_backyrd_crawler_run_usage_v1()','execute')
    then raise exception 'crawler worker or admin privileges leaked'; end if;

-- backyrd:authorization-positive
  insert into auth.users(id) values(v_admin);
  insert into public.profiles(id,is_admin) values(v_admin,true) on conflict(id) do update set is_admin=true;
  select id into v_category from public.categories where name='Café';
  if v_category is null then insert into public.categories(name) values('Café') returning id into v_category; end if;
  insert into world_knowledge_private.basel_spot_source_runs_v1(source_key,request_id,status,finished_at)
    values('BASEL_OVERTURE',-88997,'COMPLETE',now()) returning id into v_snapshot;
  update world_knowledge_private.spot_source_settings_v1 set enabled=true where source_key='BASEL_OVERTURE';
  insert into world_knowledge_private.basel_spot_source_rows_v1(source_key,source_id,facts,last_seen_run_id,changed_at)
    values ('BASEL_OVERTURE',812399,jsonb_build_object('external_id','overture-probe','name','Besuchsprobe Bar',
      'category','BAR','address','Belegweg 9','lat',47.58013,'lng',7.61111,'attribution',jsonb_build_array('Fixture')),v_snapshot,now());
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_run := (public.backyrd_spot_crawler_claim_v1(false)->>'id')::bigint;
  v_list:=public.backyrd_crawler_shortlist_v1(v_run,jsonb_build_array(v_web));
  if jsonb_array_length(v_list)<>2 or v_list#>>'{0,name}'<>'Besuchsprobe Café' or v_list#>>'{1,origin}'<>'OVERTURE'
    then raise exception 'web and enabled Overture seeds not mixed: %',v_list; end if;
  select jsonb_agg(jsonb_build_object('day',day,'intervals',
    case when day='SUNDAY' then '[]'::jsonb else '[{"start":"08:00","end":"17:00"}]'::jsonb end))
    into v_days from unnest(array['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']) day;
  v_list:=jsonb_set(v_list,'{0,basics}',jsonb_build_object('email','hello@test-cafe.example','phone','+41615552233',
    'fullHours',v_days,'primaryCategory','COFFEE_DAYTIME','primaryVisitPurpose','EAT_DRINK',
    'specialHours','[{"date":"2026-12-03","status":"CLOSED","intervals":[]}]'::jsonb,
    'observedPrices','[{"purpose":"MEAL","min":42,"max":42,"minimumAge":14,"days":["SUNDAY"],"occasion":"Brunch","url":"https://test-cafe.example/brunch"},{"purpose":"DRINK","min":4.50,"max":17,"minimumAge":null,"url":"https://test-cafe.example/menu"}]'::jsonb,
    'proposals' ,jsonb_build_array(jsonb_build_object('attributeKey','contact.public_email','url','https://test-cafe.example/'))));
  if public.backyrd_crawler_finish_basics_v1(v_run,v_list,'{"estimatedUsd":0.02,"webSearches":4,"aiCalls":0}')<>2
    then raise exception 'enriched candidate save failed'; end if;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  if v_canonical then
    perform world_knowledge_private.set_product_admin_authoring_control_v1(0,'ON','CRAWLER_BASICS_TEST');
  end if;
  select item into strict v_row from jsonb_array_elements(public.admin_backyrd_spot_crawler_preview_v1(0)->'rows') item
    where item#>>'{facts,name}'='Besuchsprobe Café';
  v_spot:=public.admin_backyrd_crawler_approve_spot_v1((v_row->>'source_id')::integer,v_row->>'review_fingerprint',
    v_row->>'review_revision',v_category,false);
  if not exists(select 1 from public.spots where id=v_spot and status='approved' and email='hello@test-cafe.example' and phone='+41615552233')
    or (select count(*) from public.spot_hours where spot_id=v_spot)<>6
    or exists(select from public.spot_hours where spot_id=v_spot and day_of_week='Sonntag')
    then raise exception 'approval lost basics or inferred hours'; end if;
  if v_canonical then
    if not exists(select from world_knowledge_private.claims where spot_id=v_spot
      and attribute_key='operation.price_options'
        and (value#>>'{0,min}')::numeric=42 and value#>>'{0,minimumAge}'='14'
        and value#>>'{0,conditions,days,0}'='SUNDAY'
        and value#>>'{0,conditions,occasion}'='Brunch'
        and value#>>'{1,purposes,0}'='DRINK' and (value#>>'{1,max}')::numeric=17
        and value#>>'{1,allOfferingsCovered}'='false')
      or not exists(select from world_knowledge_private.claims where spot_id=v_spot
        and attribute_key='hours.special' and value#>>'{0,date}'='2026-12-03' and value#>>'{0,status}'='CLOSED')
      or not exists(select from world_knowledge_private.claims where spot_id=v_spot
        and attribute_key='classification.primary_category' and value#>>'{}'='COFFEE_DAYTIME')
      or not exists(select from world_knowledge_private.claims where spot_id=v_spot
        and attribute_key='purpose.primary_visit' and value#>>'{}'='EAT_DRINK')
      or not exists(select from world_knowledge_private.current_projection_pointers where spot_id=v_spot)
      then raise exception 'price and prepared details did not reach World Knowledge'; end if;
  end if;
  if public.admin_backyrd_crawler_approve_spot_v1((v_row->>'source_id')::integer,v_row->>'review_fingerprint',
    v_row->>'review_revision',v_category,false) is distinct from v_spot
    or (select count(*) from public.spot_hours where spot_id=v_spot)<>6
    then raise exception 'approval retry applied basics twice'; end if;
  if public.admin_backyrd_crawler_run_usage_v1()#>>array[v_run::text,'estimatedUsd'] is distinct from '0.02'
    then raise exception 'usage unavailable to admin'; end if;

end
$$;
rollback;
