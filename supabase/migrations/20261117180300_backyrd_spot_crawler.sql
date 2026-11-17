-- Active web discovery shares the reviewed spot-import staging tables.
insert into world_knowledge_private.spot_source_settings_v1(source_key,cadence)
values ('BASEL_WEB','MANUAL');

alter table world_knowledge_private.spot_source_settings_v1
  add constraint basel_web_manual_snapshot_v1 check (source_key<>'BASEL_WEB' or cadence='MANUAL');

create table world_knowledge_private.spot_crawler_settings_v1 (
  singleton boolean primary key default true check (singleton),
  settings jsonb not null default '{"categories":["RESTAURANT","CAFE","BAR","NIGHTCLUB"],"districts":["Basel"],"limit":20,"searches":12,"schedule":"MANUAL","time":"08:00","monthBudgetCents":1000}',
  revision bigint not null default 1
);
insert into world_knowledge_private.spot_crawler_settings_v1 default values;
alter table world_knowledge_private.spot_crawler_settings_v1 enable row level security;
revoke all on world_knowledge_private.spot_crawler_settings_v1 from public, anon, authenticated, service_role;

alter table world_knowledge_private.basel_spot_source_runs_v1
  add column crawler_settings jsonb,
  add column crawler_reserved integer,
  add column crawler_slot date;
create sequence world_knowledge_private.basel_web_crawler_id_v1 as integer;
revoke all on sequence world_knowledge_private.basel_web_crawler_id_v1 from public,anon,authenticated,service_role;
create unique index basel_web_crawler_slot_v1
  on world_knowledge_private.basel_spot_source_runs_v1(crawler_slot)
  where source_key='BASEL_WEB' and crawler_slot is not null;
create unique index basel_web_crawler_identity_v1
  on world_knowledge_private.basel_spot_source_rows_v1((facts->>'external_id'))
  where source_key='BASEL_WEB';

create function public.backyrd_spot_crawler_settings_v1(p_settings jsonb default null,p_revision text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  if p_settings is not null then
    update world_knowledge_private.spot_crawler_settings_v1
    set settings=p_settings,revision=revision+1 where revision::text=p_revision;
    if not found then raise exception 'crawler_settings_changed' using errcode='40001'; end if;
  end if;
  select settings || jsonb_build_object('revision',revision::text) into strict v_result
    from world_knowledge_private.spot_crawler_settings_v1;
  return v_result;
end
$$;

create function public.backyrd_spot_crawler_claim_v1(p_scheduled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_settings jsonb; v_run bigint; v_slot date;
  v_now timestamp := pg_catalog.clock_timestamp() at time zone 'Europe/Zurich';
  v_searches integer; v_reserved bigint;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('backyrd-spot-crawler',0));
  select settings into strict v_settings from world_knowledge_private.spot_crawler_settings_v1;
  update world_knowledge_private.basel_spot_source_runs_v1 set status='FAILED',outcome='RUN_TIMEOUT',finished_at=now()
    where source_key='BASEL_WEB' and status='FETCHING' and started_at<now()-interval '5 minutes';
  if p_scheduled then
    if v_settings->>'schedule'='MANUAL'
      or (v_settings->>'schedule'='WEEKLY' and extract(isodow from v_now)<>1)
      or v_now::time < (v_settings->>'time')::time then return null; end if;
    v_slot:=v_now::date;
    if exists(select 1 from world_knowledge_private.basel_spot_source_runs_v1
      where source_key='BASEL_WEB' and crawler_slot=v_slot) then return null; end if;
  end if;
  if exists(select 1 from world_knowledge_private.basel_spot_source_runs_v1
    where source_key='BASEL_WEB' and status='FETCHING') then
    return jsonb_build_object('reason','RUN_ACTIVE');
  end if;
  v_searches:=(v_settings->>'searches')::integer;
  select coalesce(sum(crawler_reserved),0) into v_reserved from world_knowledge_private.basel_spot_source_runs_v1
    where source_key='BASEL_WEB' and started_at>=date_trunc('month',v_now) at time zone 'Europe/Zurich';
  -- Each search reserves half a US cent. Failed and interrupted runs keep
  -- their reservation because provider billing may already have occurred.
  if v_reserved+v_searches>(v_settings->>'monthBudgetCents')::integer*2 then
    return jsonb_build_object('reason','BUDGET_REACHED');
  end if;
  insert into world_knowledge_private.basel_spot_source_runs_v1(source_key,request_id,crawler_settings,crawler_reserved,crawler_slot)
  values('BASEL_WEB',-(2000000000000+nextval('world_knowledge_private.basel_web_crawler_id_v1')),v_settings,v_searches,v_slot)
  returning id into v_run;
  return jsonb_build_object('id',v_run,'settings',v_settings);
end
$$;

create function public.backyrd_spot_crawler_finish_v1(p_run bigint,p_candidates jsonb,p_outcome text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare v_run world_knowledge_private.basel_spot_source_runs_v1; v_count integer;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('backyrd-spot-crawler',0));
  select * into v_run from world_knowledge_private.basel_spot_source_runs_v1
    where id=p_run and source_key='BASEL_WEB' for update;
  if not found then raise exception 'crawler_run_missing'; end if;
  if v_run.status='COMPLETE' then return v_run.source_count; end if;
  if v_run.status<>'FETCHING' then raise exception 'crawler_run_inactive'; end if;
  if p_outcome is not null then
    update world_knowledge_private.basel_spot_source_runs_v1
      set status='FAILED',finished_at=now(),outcome=left(p_outcome,80) where id=p_run;
    return 0;
  end if;
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>100
    or octet_length(p_candidates::text)>300000 then raise exception 'crawler_invalid_candidates'; end if;
  -- Each successful run adds to the reviewed source inventory. Absence in
  -- a search result is no evidence that a previously found spot disappeared.
  update world_knowledge_private.basel_spot_source_rows_v1
    set last_seen_run_id=p_run where source_key='BASEL_WEB';
  with valid as (
    select distinct on (candidate->>'external_id') candidate
    from jsonb_array_elements(p_candidates) candidate
    where candidate->>'external_id' ~ '^[0-9a-f]{64}$'
      and length(trim(candidate->>'name')) between 1 and 160
      and length(trim(candidate->>'address')) between 4 and 240
      and candidate->>'category' in ('RESTAURANT','CAFE','BAR','NIGHTCLUB')
      and candidate->>'website' ~ '^https://'
      and candidate->>'source_url' ~ '^https://'
      and case when jsonb_typeof(candidate->'lat')='number' and jsonb_typeof(candidate->'lng')='number'
        then (candidate->>'lat')::numeric between 47.519 and 47.599
          and (candidate->>'lng')::numeric between 7.554 and 7.635 else false end
    order by candidate->>'external_id'
  ), unseen as (
    select candidate from valid
    where not exists (select 1 from world_knowledge_private.basel_spot_source_rows_v1 row
      where row.source_key='BASEL_WEB' and row.facts->>'external_id'=candidate->>'external_id')
      and not exists (select 1 from public.spots spot
        where coalesce(spot.data_origin,'LEGACY') not in ('TEST','FIXTURE')
          and world_knowledge_private.basel_spot_source_name_v1(spot.name)=world_knowledge_private.basel_spot_source_name_v1(candidate->>'name')
          and (world_knowledge_private.basel_spot_source_name_v1(spot.address)=world_knowledge_private.basel_spot_source_name_v1(candidate->>'address')
            or (abs(spot.lat-(candidate->>'lat')::numeric)<0.0004 and abs(spot.lng-(candidate->>'lng')::numeric)<0.0006)))
    order by candidate->>'external_id' limit (v_run.crawler_settings->>'limit')::integer
  )
  insert into world_knowledge_private.basel_spot_source_rows_v1
    (source_key,source_id,facts,last_seen_run_id,changed_at)
  select 'BASEL_WEB',nextval('world_knowledge_private.basel_web_crawler_id_v1')::integer,
    candidate || '{"city":"Basel","equipment":[]}'::jsonb,p_run,now() from unseen;
  get diagnostics v_count=row_count;
  update world_knowledge_private.basel_spot_source_runs_v1
    set status='COMPLETE',finished_at=now(),source_count=v_count where id=p_run;
  return v_count;
end
$$;

create function public.admin_backyrd_spot_crawler_preview_v1(p_after integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_preview jsonb; v_next integer;
begin
  if auth.uid() is null or public.admin_is_admin_v1() is not true then raise exception 'admin_required' using errcode='42501'; end if;
  v_preview:=world_knowledge_private.basel_spot_source_raw_preview_v2('BASEL_WEB',null,greatest(p_after,0),50);
  v_preview:=jsonb_set(v_preview,'{runs}', coalesce((
    select jsonb_agg(case when item->>'status'='FETCHING'
        and (item->>'started_at')::timestamptz < now()-interval '5 minutes'
      then item || '{"status":"FAILED","outcome":"RUN_TIMEOUT"}'::jsonb else item end order by ordinal)
    from jsonb_array_elements(v_preview->'runs') with ordinality as runs(item,ordinal)
  ),'[]'::jsonb));
  select max((item->>'source_id')::integer) into v_next from jsonb_array_elements(v_preview->'rows') item;
  if not exists(select 1 from world_knowledge_private.basel_spot_source_rows_v1
    where source_key='BASEL_WEB' and source_id>v_next) then v_next:=null; end if;
  return jsonb_set(v_preview,'{rows}',coalesce((
    select jsonb_agg(item order by (item->>'source_id')::integer)
    from world_knowledge_private.basel_spot_review_rows_v2('BASEL_WEB',v_preview->'rows') item
  ),'[]'::jsonb)) || jsonb_build_object('next_after',v_next);
end
$$;

revoke all on function public.backyrd_spot_crawler_settings_v1(jsonb,text), public.backyrd_spot_crawler_claim_v1(boolean),
  public.backyrd_spot_crawler_finish_v1(bigint,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.backyrd_spot_crawler_settings_v1(jsonb,text), public.backyrd_spot_crawler_claim_v1(boolean),
  public.backyrd_spot_crawler_finish_v1(bigint,jsonb,text) to service_role;
revoke all on function public.admin_backyrd_spot_crawler_preview_v1(integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_backyrd_spot_crawler_preview_v1(integer) to authenticated;

create or replace function world_knowledge_private.basel_spot_source_collect_v1()
returns void language plpgsql set search_path='' as $$
declare
  v_run world_knowledge_private.basel_spot_source_runs_v1;
  v_response net._http_response;
begin
  for v_run in select * from world_knowledge_private.basel_spot_source_runs_v1
    where status='FETCHING' and request_id>0 order by id for update skip locked loop

    select * into v_response from net._http_response
      where id=v_run.request_id and created>=v_run.started_at order by created desc limit 1;
    if not found and now()-v_run.started_at<interval '10 minutes' then continue; end if;
    if v_response.id is null or v_response.status_code is distinct from 200
       or v_response.timed_out is true or v_response.error_msg is not null
       or v_response.content is null or octet_length(v_response.content)>524288 then
      update world_knowledge_private.basel_spot_source_runs_v1
        set status='FAILED',finished_at=now(),outcome='FETCH_FAILED' where id=v_run.id;
      continue;
    end if;

    begin
      perform world_knowledge_private.basel_spot_source_apply_v1(v_run.id,v_response.content::jsonb);
    exception when others then
      update world_knowledge_private.basel_spot_source_runs_v1
        set status='FAILED',finished_at=now(),outcome='SNAPSHOT_REJECTED' where id=v_run.id;
    end;
  end loop;
end;
$$;

create or replace function public.spot_place_source_credit_v1(p_spot_id uuid)
returns table(credit text, source_url text, license_url text)
language sql stable security definer set search_path='' as $$
  select
    case i.source_key
      when 'BASEL_PLAYGROUNDS' then 'Stadtgärtnerei Basel-Stadt via Open Data Basel-Stadt'
      when 'BASEL_OVERTURE' then concat_ws(' · ', 'Overture Maps Foundation',
        (select string_agg(item, ', ' order by item)
          from jsonb_array_elements_text(i.source_facts->'attribution') item))
      when 'BASEL_WEB' then concat_ws(' · ', 'Website des Orts', i.source_facts->>'coordinates_source')
      else 'Geodaten Kanton Basel-Stadt via Open Data Basel-Stadt'
    end,
    case i.source_key
      when 'BASEL_PLAYGROUNDS' then 'https://data.bs.ch/explore/dataset/100462/'
      when 'BASEL_POI' then 'https://data.bs.ch/explore/dataset/100015/'
      when 'BASEL_SPORT' then 'https://data.bs.ch/explore/dataset/100151/'
      when 'BASEL_OVERTURE' then 'https://docs.overturemaps.org/guides/places/'
      when 'BASEL_WEB' then i.source_facts->>'source_url'
    end,
    case when i.source_key='BASEL_OVERTURE' then 'https://docs.overturemaps.org/attribution/'
      when i.source_key='BASEL_WEB' then null
      else 'https://creativecommons.org/licenses/by/4.0/' end
  from world_knowledge_private.basel_spot_source_imports_v1 i
  join public.spots s on s.id=i.spot_id
  where i.spot_id=p_spot_id and s.status='approved'
$$;
revoke all on function public.spot_place_source_credit_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.spot_place_source_credit_v1(uuid) to anon,authenticated;

-- The scheduled HTTP call uses the same server-only token as the admin
-- deployment. Until Vault is configured or an admin selects a schedule,
-- the timer performs no HTTP requests.
select cron.schedule('backyrd-spot-crawler-tick-v1','*/15 * * * *',$job$
  select net.http_get(
    url:='https://intelligence.backyrd.ch/api/spot-crawler/tick',
    headers:=jsonb_build_object('Authorization','Bearer '||secret.decrypted_secret),
    timeout_milliseconds:=10000
  )
  from (
    select decrypted_secret from vault.decrypted_secrets
    where name='backyrd_spot_crawler_cron_secret' and length(decrypted_secret)>=32
    order by created_at desc limit 1
  ) secret
  where exists (
    select 1 from world_knowledge_private.spot_crawler_settings_v1
    where settings->>'schedule' in ('DAILY','WEEKLY')
  );
$job$);
