create table world_knowledge_private.spot_source_settings_v1 (
  source_key text primary key,
  enabled boolean not null default true,
  cadence text not null default 'WEEKLY' check (cadence in ('DAILY','WEEKLY','MANUAL')),
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table world_knowledge_private.spot_source_settings_v1 enable row level security;
revoke all on world_knowledge_private.spot_source_settings_v1 from public, anon, authenticated;

insert into world_knowledge_private.spot_source_settings_v1(source_key) values ('BASEL_PLAYGROUNDS');

-- A null timestamp means an explicit request. The cron trigger supplies its
-- execution time. Both paths share the lock used by the existing importer.
create function world_knowledge_private.basel_spot_source_dispatch_v1(p_scheduled_at timestamptz default null)
returns bigint language plpgsql set search_path='' as $$
declare v_settings world_knowledge_private.spot_source_settings_v1;
begin
  perform pg_catalog.pg_advisory_xact_lock(14078531,1);
  select * into strict v_settings from world_knowledge_private.spot_source_settings_v1
    where source_key='BASEL_PLAYGROUNDS';

  if not v_settings.enabled then
    if p_scheduled_at is null then
      raise exception 'spot_source_disabled' using errcode='55000';
    end if;
    return null;
  end if;

  if p_scheduled_at is not null and (
    v_settings.cadence='MANUAL' or
    (v_settings.cadence='WEEKLY' and extract(isodow from p_scheduled_at at time zone 'UTC')<>1)
  ) then
    return null;
  end if;

  return world_knowledge_private.basel_spot_source_start_v1();
end;
$$;

create or replace function public.admin_basel_spot_source_start_v1()
returns bigint language plpgsql security definer set search_path='' as $$
begin
  if (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return world_knowledge_private.basel_spot_source_dispatch_v1();
end;
$$;

create function public.admin_basel_spot_source_preview_v3(p_source_id integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_preview jsonb;
begin
  v_preview:=public.admin_basel_spot_source_preview_v2(p_source_id);
  return v_preview || jsonb_build_object('source',(
    select jsonb_build_object(
      'key',source_key,'enabled',enabled,'cadence',cadence,'revision',revision::text,
      'schedule_time_utc','03:15')
    from world_knowledge_private.spot_source_settings_v1 where source_key='BASEL_PLAYGROUNDS'
  ));
end;
$$;

create function public.admin_basel_spot_source_settings_v1(
  p_source_key text, p_enabled boolean, p_cadence text, p_revision text
)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_settings world_knowledge_private.spot_source_settings_v1;
begin
  if v_actor is null or (select public.admin_is_admin_v1()) is not true then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_source_key is distinct from 'BASEL_PLAYGROUNDS' or p_enabled is null
    or p_cadence is null or p_cadence not in ('DAILY','WEEKLY','MANUAL') then
    raise exception 'invalid_spot_source_settings' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(14078531,1);
  select * into strict v_settings from world_knowledge_private.spot_source_settings_v1 where source_key=p_source_key;
  if v_settings.revision::text is distinct from p_revision then
    raise exception 'spot_source_settings_stale' using errcode='40001';
  end if;
  if v_settings.enabled=p_enabled and v_settings.cadence=p_cadence then return; end if;

  update world_knowledge_private.spot_source_settings_v1
    set enabled=p_enabled,cadence=p_cadence,revision=revision+1,updated_at=now(),updated_by=v_actor
    where source_key=p_source_key;
end;
$$;

revoke all on function world_knowledge_private.basel_spot_source_dispatch_v1(timestamptz),
  public.admin_basel_spot_source_preview_v3(integer),
  public.admin_basel_spot_source_settings_v1(text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.admin_basel_spot_source_preview_v3(integer),
  public.admin_basel_spot_source_settings_v1(text,boolean,text,text) to authenticated;

-- The existing collector still finishes a fetch that had already begun.
select cron.unschedule(jobid) from cron.job where jobname='backyrd-basel-spot-source-weekly-v1';
select cron.schedule('backyrd-basel-spot-source-schedule-v1','15 3 * * *',
  'select world_knowledge_private.basel_spot_source_dispatch_v1(now())');
