\set ON_ERROR_STOP on
begin;

do $$
declare
  v_admin uuid:=gen_random_uuid();
  v_run bigint;
  v_next bigint;
  v_row jsonb;
  v_settings jsonb;
  v_spot uuid;
  v_category uuid:=gen_random_uuid();
  v_facts jsonb:=jsonb_build_object(
    'external_id',repeat('a',64),'name','Crawler Prüfcafé','category','CAFE',
    'address','Prüfstrasse 123','lat',47.551,'lng',7.562,
    'website','https://fixture.example/','source_url','https://fixture.example/kontakt',
    'observed_at',now());
begin
-- backyrd:authorization-negative
  if has_function_privilege('anon','public.admin_backyrd_spot_crawler_preview_v1(integer)','execute')
    or has_function_privilege('authenticated','public.backyrd_spot_crawler_claim_v1(boolean)','execute')
    or has_function_privilege('authenticated','public.backyrd_spot_crawler_finish_v1(bigint,jsonb,text)','execute')
    or has_function_privilege('authenticated','public.backyrd_spot_crawler_settings_v1(jsonb,text)','execute')
  then raise exception 'crawler privileges leaked'; end if;
  begin
    perform public.backyrd_spot_crawler_claim_v1(false);
    raise exception 'non-service claim allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_backyrd_spot_crawler_preview_v1(0);
    raise exception 'non-admin preview allowed';
  exception when insufficient_privilege then null;
  end;

-- backyrd:authorization-positive
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  if public.backyrd_spot_crawler_claim_v1(true) is not null then
    raise exception 'manual schedule fired automatically';
  end if;
  v_run:=(public.backyrd_spot_crawler_claim_v1(false)->>'id')::bigint;
  if v_run is null or public.backyrd_spot_crawler_claim_v1(false)->>'reason' is distinct from 'RUN_ACTIVE'
    then raise exception 'overlapping run allowed'; end if;
  if public.backyrd_spot_crawler_finish_v1(v_run,jsonb_build_array(v_facts,v_facts))<>1
    or public.backyrd_spot_crawler_finish_v1(v_run,'[]')<>1
    then raise exception 'run did not finish idempotently'; end if;
  v_next:=(public.backyrd_spot_crawler_claim_v1(false)->>'id')::bigint;
  if public.backyrd_spot_crawler_finish_v1(v_next,jsonb_build_array(v_facts))<>0
    then raise exception 'same candidate staged twice'; end if;
  v_settings:=public.backyrd_spot_crawler_settings_v1();
  perform public.backyrd_spot_crawler_settings_v1((v_settings-'revision') || '{"monthBudgetCents":0}',v_settings->>'revision');
  if public.backyrd_spot_crawler_claim_v1(false)->>'reason' is distinct from 'BUDGET_REACHED'
    then raise exception 'zero budget did not block searches'; end if;

  insert into auth.users(id) values(v_admin);
  insert into public.profiles(id,is_admin) values(v_admin,true) on conflict(id) do update set is_admin=true;
  insert into public.categories(id,name) values(v_category,'Crawler Prüf-Kategorie');
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  v_row:=public.admin_backyrd_spot_crawler_preview_v1(0)#>'{rows,0}';
  if v_row->>'state' is distinct from 'NEW' or v_row->>'review_state' is distinct from 'OPEN'
    or v_row#>>'{facts,name}' is distinct from (v_facts->>'name')
    then raise exception 'staged candidate not visible'; end if;

  perform public.admin_basel_place_source_review_v1('BASEL_WEB',(v_row->>'source_id')::integer,
    v_row->>'review_fingerprint',v_row->>'review_revision','REVIEWED');
  v_row:=public.admin_backyrd_spot_crawler_preview_v1(0)#>'{rows,0}';
  if v_row->>'review_state' is distinct from 'REVIEWED' then raise exception 'hold not visible'; end if;
  v_spot:=public.admin_basel_place_source_create_spot_v1('BASEL_WEB',(v_row->>'source_id')::integer,
    v_row->>'review_fingerprint',v_row->>'review_revision',v_category);
  if not exists(select 1 from public.spots where id=v_spot and status='approved')
    or not exists(select 1 from public.spot_place_source_credit_v1(v_spot)
      where source_url='https://fixture.example/kontakt' and license_url is null)
    then raise exception 'handoff lost approved spot or source'; end if;
  if public.admin_backyrd_spot_crawler_preview_v1(0)#>>'{rows,0,imported_spot_id}' is distinct from v_spot::text
    then raise exception 'handoff is not linked in crawler'; end if;
end
$$;
rollback;
