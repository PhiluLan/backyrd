\set ON_ERROR_STOP on

begin;

create function pg_temp.s9_assert(p_ok boolean,p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'Sprint 9 final integration failed: %',p_message; end if;
end;
$$;

do $$
declare v_dimensions text[];v_user uuid:=gen_random_uuid();v_signal uuid;v_events integer;
  v_before numeric;v_after numeric;
begin
  select array_agg(dimension order by dimension) into v_dimensions
  from public.account_trust_dimension_config
  where engine_version=(select version from public.account_trust_engine_versions where status='active');
  perform pg_temp.s9_assert(v_dimensions=array['behaviour','identity','network','owner','reputation','security'],
    'all six dimensions exist exactly once');
  perform pg_temp.s9_assert((select sum(weight)=1 from public.account_trust_dimension_config
    where engine_version=(select version from public.account_trust_engine_versions where status='active')),
    'dimension weights sum to 100 percent');
  perform pg_temp.s9_assert((select count(distinct dimension)=6 from public.account_trust_signal_registry),
    'all detectors route through the central signal registry');
  perform pg_temp.s9_assert((select weighted_average_share+weakest_dimension_share=1
    and weakest_dimension_share>0 from public.account_trust_engine_versions where status='active'),
    'weakest-dimension aggregation remains active');
  perform pg_temp.s9_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'account_trust_evaluate_%'
      and p.proname<>'account_trust_evaluate_reputation_due_v1'
      and p.prosrc ~* '(insert|update|delete)[[:space:]]+(into[[:space:]]+)?public\\.account_trust_scores'),
    'detectors do not own aggregate score persistence');

  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,
    raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  values('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated',
    's9-final@sprint.invalid','','{}','{}',now()-interval '400 days',now(),'','','','');
  perform public.account_trust_emit_signal_v1(v_user,'reputation_account_tenure',
    'backyrd.reputation.account_tenure','1.0.0',0.5,1,now(),null,'integration','{}','{}');
  select id into v_signal from public.account_trust_signals where user_id=v_user and signal_key='reputation_account_tenure';
  perform public.account_trust_resolve_signal_v1(v_signal,'integration_audit','resolved');
  perform pg_temp.s9_assert((select count(*)>=2 from public.account_trust_signal_events where signal_id=v_signal),
    'resolved signals remain auditable');

  -- Generic Founder/Admin detail is dimension-driven and includes Reputation.
  update public.profiles set is_admin=true where id=v_user;
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  perform pg_temp.s9_assert((public.account_trust_admin_detail_v1(v_user)->'score'->'dimension_scores') ? 'reputation',
    'generic Admin contract exposes Reputation');
  perform set_config('request.jwt.claim.sub','',true);

  -- Central aggregation still prevents strong Reputation from masking a weak dimension.
  perform public.account_trust_emit_signal_v1(v_user,'reputation_reliable_community_member',
    'backyrd.reputation.reliable_community_member','1.0.0',1,1,now(),now()+interval '365 days','strong-reputation','{}','{}');
  perform public.account_trust_emit_signal_v1(v_user,'network_engagement_ring',
    'backyrd.network.engagement_ring','1.0.0',1,1,now(),now()+interval '180 days','weak-network','{}','{}');
  select (dimension_scores->>'reputation')::numeric,trust_score into v_before,v_after
  from public.account_trust_scores where user_id=v_user;
  perform pg_temp.s9_assert(v_after<v_before,
    'weakest risk dimension constrains the aggregate despite strong Reputation');

  perform pg_temp.s9_assert(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'account_trust_evaluate_%'
      and p.prosrc ~* '(ranking|distribution|suspend|ban[[:space:]_(]|visibility[[:space:]]*=)'),
    'Sprint 9 evaluators contain no direct enforcement or Distribution Trust side effects');
end;
$$;

rollback;

\echo 'Sprint 9 final Account Trust integration passed.'
