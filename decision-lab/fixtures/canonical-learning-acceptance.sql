\set ON_ERROR_STOP on
begin;

create function pg_temp.d1_uuid(p_label text) returns uuid language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||substr(md5(p_label),21,12))::uuid;
$$;

do $$
declare
  v_cold uuid := pg_temp.d1_uuid('user:cold');
  v_sparse uuid := pg_temp.d1_uuid('user:sparse');
  v_cafe uuid := pg_temp.d1_uuid('spot:hearth-cafe');
  v_culture uuid := pg_temp.d1_uuid('spot:cabinet-curiosities');
  i integer;
  cold_features jsonb;
  sparse_features jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_cold,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_cold::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  for i in 1..6 loop
    perform public.backyrd_ml_log_event_v1('decision_like',v_cafe,null,i,'Basel','cozy','quiet','{"synthetic":true,"context_key":"cozy+quiet"}'::jsonb,1);
  end loop;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_sparse,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_sparse::text, true);
  for i in 1..6 loop
    perform public.backyrd_ml_log_event_v1('decision_like',v_culture,null,i,'Sparseville','unusual','indoor','{"synthetic":true,"context_key":"unusual+indoor"}'::jsonb,1);
  end loop;

  select jsonb_agg(jsonb_build_array(feature_type,feature_key,weight) order by feature_type,feature_key)
  into cold_features from public.backyrd_user_feature_weights_v1 where user_id=v_cold;
  select jsonb_agg(jsonb_build_array(feature_type,feature_key,weight) order by feature_type,feature_key)
  into sparse_features from public.backyrd_user_feature_weights_v1 where user_id=v_sparse;
  if cold_features is null or sparse_features is null then raise exception 'canonical learning produced no observable feature state'; end if;
  if cold_features = sparse_features then raise exception 'distinct synthetic histories produced identical observable feature state'; end if;
end
$$;

commit;
\echo Canonical learning acceptance passed: distinct synthetic histories produced distinct observable Backyrd states.
