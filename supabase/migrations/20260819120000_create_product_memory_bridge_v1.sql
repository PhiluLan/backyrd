-- Production Sprint 1: additive bridge from existing Product source rows to N2.
-- This migration intentionally does not calculate user intelligence or change Decisions.

create table if not exists public.backyrd_memory_bridge_settings_v1 (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.backyrd_memory_bridge_settings_v1(singleton,enabled)
values (true,false) on conflict (singleton) do nothing;

create table if not exists public.backyrd_memory_bridge_outbox_v1 (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('decision_session','decision_impression','analytics_event','product_action','favorite','reservation','smart_review')),
  source_id text not null,
  semantic_version text not null default 'backyrd-product-memory-bridge-v1',
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_event_type text not null references public.backyrd_memory_event_types_v1(event_type),
  occurred_at timestamptz not null,
  session_id text,
  decision_id uuid,
  spot_id uuid,
  exposure_rank integer check (exposure_rank is null or exposure_rank between 1 and 50),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  state text not null default 'PENDING' check (state in ('PENDING','PROCESSING','RETRYABLE','COMMITTED','FAILED','INVALID')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 8),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  committed_at timestamptz,
  canonical_event_id uuid,
  canonical_event_hash text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type,source_id,semantic_version,canonical_event_type)
);
create index if not exists backyrd_memory_bridge_outbox_ready_v1
  on public.backyrd_memory_bridge_outbox_v1(state,available_at,created_at);
create index if not exists backyrd_memory_bridge_outbox_user_v1
  on public.backyrd_memory_bridge_outbox_v1(user_id,created_at);

create table if not exists public.backyrd_memory_bridge_product_actions_v1 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_event_id uuid not null,
  action_type text not null check (action_type in ('spot_opened','navigation_intent')),
  spot_id uuid not null references public.spots(id),
  decision_id uuid,
  entry_surface text not null check (entry_surface in ('decision','home','search','map','profile','favorite','deep_link','nearby','generic')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id,client_event_id)
);

-- Explicitly tag Smart Reviews at their existing source row. Generic reviews are not upgraded.
alter table public.reviews add column if not exists product_evidence_origin text;
alter table public.reviews drop constraint if exists reviews_product_evidence_origin_check;
alter table public.reviews add constraint reviews_product_evidence_origin_check
  check (product_evidence_origin is null or product_evidence_origin in ('smart_review_v1'));

create or replace function public.backyrd_memory_bridge_enabled_v1()
returns boolean language sql stable security definer set search_path=public,pg_catalog as $$
  select coalesce((select enabled from public.backyrd_memory_bridge_settings_v1 where singleton),false)
$$;

create or replace function public.backyrd_memory_bridge_enqueue_v1(
  p_source_type text,p_source_id text,p_user_id uuid,p_event_type text,p_occurred_at timestamptz,
  p_session_id text default null,p_decision_id uuid default null,p_spot_id uuid default null,
  p_exposure_rank integer default null,p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.backyrd_memory_bridge_enabled_v1() then return; end if;
  if p_source_type not in ('decision_session','decision_impression','analytics_event','product_action','favorite','reservation','smart_review')
     or p_event_type not in ('decision_request','candidate_exposed','spot_opened','saved','save_removed','navigation_intent','reservation_intent','verified_visit')
     or p_source_id is null or p_user_id is null or p_occurred_at is null then
    raise exception 'memory_bridge_invalid_source' using errcode='22023';
  end if;
  -- Do not build a personal queue before consent has been granted.
  if not public.user_has_active_consent_v1(p_user_id,'personalized_recommendations') then return; end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
     or p_metadata ?| array['text','moods','review_text','photo_url','token','secret','key'] then
    raise exception 'memory_bridge_invalid_metadata' using errcode='22023';
  end if;
  insert into public.backyrd_memory_bridge_outbox_v1(
    source_type,source_id,user_id,canonical_event_type,occurred_at,session_id,decision_id,spot_id,exposure_rank,source_metadata
  ) values (p_source_type,p_source_id,p_user_id,p_event_type,p_occurred_at,p_session_id,p_decision_id,p_spot_id,p_exposure_rank,p_metadata)
  on conflict (source_type,source_id,semantic_version,canonical_event_type) do nothing;
end;
$$;

create or replace function public.backyrd_memory_bridge_enqueue_decision_session_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform public.backyrd_memory_bridge_enqueue_v1('decision_session',new.id::text,new.user_id,'decision_request',new.created_at,new.id::text,new.id,null,null,jsonb_build_object('mapping','decision_session_v1'));
  return new;
end; $$;
create or replace function public.backyrd_memory_bridge_enqueue_impression_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid;
begin
  select user_id into v_user from public.decision_sessions where id=new.decision_id;
  if v_user is not null then
    perform public.backyrd_memory_bridge_enqueue_v1('decision_impression',new.id::text,v_user,'candidate_exposed',new.created_at,new.decision_id::text,new.decision_id,new.spot_id,new.rank,jsonb_build_object('mapping','decision_impression_v1'));
  end if;
  return new;
end; $$;
create or replace function public.backyrd_memory_bridge_enqueue_analytics_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_type text;
begin
  -- Analytics is intentionally optional-consent. It remains observability only;
  -- Product actions below are the personalization-consent source of truth.
  return new;
end; $$;
create or replace function public.backyrd_memory_bridge_enqueue_product_action_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform public.backyrd_memory_bridge_enqueue_v1('product_action',new.id::text,new.user_id,new.action_type,new.occurred_at,null,new.decision_id,new.spot_id,null,jsonb_build_object('mapping','product_action_v1','entrySurface',new.entry_surface));
  return new;
end; $$;
create or replace function public.backyrd_record_memory_product_action_v1(
  p_client_event_id uuid,p_action_type text,p_spot_id uuid,p_decision_id uuid default null,p_entry_surface text default 'generic',p_occurred_at timestamptz default now()
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_existing public.backyrd_memory_bridge_product_actions_v1%rowtype;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if p_client_event_id is null or p_action_type not in ('spot_opened','navigation_intent') or p_spot_id is null
     or p_entry_surface not in ('decision','home','search','map','profile','favorite','deep_link','nearby','generic')
     or p_occurred_at is null or p_occurred_at > now()+interval '5 minutes' then raise exception 'memory_bridge_invalid_action' using errcode='22023'; end if;
  if not public.user_has_active_consent_v1(v_user,'personalized_recommendations') then raise exception 'personalization_consent_required' using errcode='42501'; end if;
  if p_decision_id is not null and not exists(select 1 from public.decision_sessions where id=p_decision_id and user_id=v_user) then raise exception 'memory_bridge_decision_not_owned' using errcode='42501'; end if;
  select * into v_existing from public.backyrd_memory_bridge_product_actions_v1 where user_id=v_user and client_event_id=p_client_event_id;
  if found then
    if v_existing.action_type is distinct from p_action_type or v_existing.spot_id is distinct from p_spot_id or v_existing.decision_id is distinct from p_decision_id or v_existing.entry_surface is distinct from p_entry_surface then raise exception 'memory_bridge_idempotency_conflict' using errcode='23505'; end if;
    return v_existing.id;
  end if;
  insert into public.backyrd_memory_bridge_product_actions_v1(user_id,client_event_id,action_type,spot_id,decision_id,entry_surface,occurred_at)
  values(v_user,p_client_event_id,p_action_type,p_spot_id,p_decision_id,p_entry_surface,p_occurred_at) returning id into v_id;
  return v_id;
end; $$;
create or replace function public.backyrd_memory_bridge_enqueue_favorite_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if tg_op='INSERT' then
    perform public.backyrd_memory_bridge_enqueue_v1('favorite',new.id::text||':added',new.user_id,'saved',coalesce(new.created_at,now()),null,null,new.spot_id,null,jsonb_build_object('mapping','favorite_v1'));
    return new;
  end if;
  perform public.backyrd_memory_bridge_enqueue_v1('favorite',old.id::text||':removed',old.user_id,'save_removed',now(),null,null,old.spot_id,null,jsonb_build_object('mapping','favorite_v1'));
  return old;
end; $$;
create or replace function public.backyrd_memory_bridge_enqueue_reservation_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform public.backyrd_memory_bridge_enqueue_v1('reservation',new.id::text,new.user_id,'reservation_intent',coalesce(new.created_at,now()),null,null,new.spot_id,null,jsonb_build_object('mapping','reservation_v1'));
  return new;
end; $$;
create or replace function public.backyrd_memory_bridge_enqueue_smart_review_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_review record; v_decision uuid;
begin
  select r.id,r.user_id,r.spot_id,r.created_at into v_review from public.reviews r
  where r.id=new.review_id and r.product_evidence_origin='smart_review_v1' and r.user_id is not null;
  if v_review.id is null or new.uploaded_by is distinct from v_review.user_id then return new; end if;
  select decision_id into v_decision from public.backyrd_decision_review_links_v1
    where review_id=v_review.id and user_id=v_review.user_id and spot_id=v_review.spot_id limit 1;
  -- A spot-bound Smart Review plus its user-owned photo qualifies only as Experience.
  -- Moods and text stay in the source review; this sprint creates no satisfaction claim.
  perform public.backyrd_memory_bridge_enqueue_v1('smart_review',v_review.id::text,v_review.user_id,'verified_visit',coalesce(new.created_at,v_review.created_at),v_decision::text,v_decision,v_review.spot_id,null,jsonb_build_object('mapping','smart_review_experience_v1','photoBound',true,'decisionLinked',v_decision is not null));
  return new;
end; $$;

drop trigger if exists trg_backyrd_memory_bridge_decision_session_v1 on public.decision_sessions;
create trigger trg_backyrd_memory_bridge_decision_session_v1 after insert on public.decision_sessions for each row execute function public.backyrd_memory_bridge_enqueue_decision_session_v1();
drop trigger if exists trg_backyrd_memory_bridge_impression_v1 on public.decision_impressions;
create trigger trg_backyrd_memory_bridge_impression_v1 after insert on public.decision_impressions for each row execute function public.backyrd_memory_bridge_enqueue_impression_v1();
drop trigger if exists trg_backyrd_memory_bridge_analytics_v1 on public.analytics_events;
create trigger trg_backyrd_memory_bridge_analytics_v1 after insert on public.analytics_events for each row execute function public.backyrd_memory_bridge_enqueue_analytics_v1();
drop trigger if exists trg_backyrd_memory_bridge_product_action_v1 on public.backyrd_memory_bridge_product_actions_v1;
create trigger trg_backyrd_memory_bridge_product_action_v1 after insert on public.backyrd_memory_bridge_product_actions_v1 for each row execute function public.backyrd_memory_bridge_enqueue_product_action_v1();
drop trigger if exists trg_backyrd_memory_bridge_favorite_v1 on public.favorites;
create trigger trg_backyrd_memory_bridge_favorite_v1 after insert or delete on public.favorites for each row execute function public.backyrd_memory_bridge_enqueue_favorite_v1();
drop trigger if exists trg_backyrd_memory_bridge_reservation_v1 on public.reservations;
create trigger trg_backyrd_memory_bridge_reservation_v1 after insert on public.reservations for each row execute function public.backyrd_memory_bridge_enqueue_reservation_v1();
drop trigger if exists trg_backyrd_memory_bridge_smart_review_v1 on public.review_photos;
create trigger trg_backyrd_memory_bridge_smart_review_v1 after insert on public.review_photos for each row execute function public.backyrd_memory_bridge_enqueue_smart_review_v1();

create or replace function public.backyrd_memory_bridge_recover_stale_v1()
returns integer language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'memory_bridge_service_only' using errcode='42501'; end if;
  update public.backyrd_memory_bridge_outbox_v1 set state='RETRYABLE',locked_at=null,available_at=now(),updated_at=now(),failure_code='stale_processing_recovered'
  where state='PROCESSING' and locked_at < now()-interval '5 minutes';
  get diagnostics v_count=row_count; return v_count;
end; $$;

create or replace function public.backyrd_memory_bridge_process_v1(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_row public.backyrd_memory_bridge_outbox_v1%rowtype; v_result record;
  v_committed integer:=0; v_retryable integer:=0; v_failed integer:=0; v_suppressed integer:=0;
  v_event jsonb; v_code text;
begin
  if auth.role() <> 'service_role' then raise exception 'memory_bridge_service_only' using errcode='42501'; end if;
  perform public.backyrd_memory_bridge_recover_stale_v1();
  for v_i in 1..greatest(1,least(coalesce(p_limit,50),200)) loop
    with candidate as (
      select id from public.backyrd_memory_bridge_outbox_v1 where state in ('PENDING','RETRYABLE') and available_at<=now()
      order by created_at for update skip locked limit 1
    ) update public.backyrd_memory_bridge_outbox_v1 o set state='PROCESSING',locked_at=now(),attempts=o.attempts+1,updated_at=now()
      from candidate where o.id=candidate.id returning o.* into v_row;
    exit when not found;
    if not public.user_has_active_consent_v1(v_row.user_id,'personalized_recommendations') then
      delete from public.backyrd_memory_bridge_outbox_v1 where id=v_row.id; v_suppressed:=v_suppressed+1; continue;
    end if;
    v_event:=jsonb_build_object('userId',v_row.user_id,'idempotencyKey',v_row.source_type||':'||v_row.source_id||':'||v_row.semantic_version||':'||v_row.canonical_event_type,
      'eventType',v_row.canonical_event_type,'contractVersion','backyrd-memory-event-contract-v1','occurredAt',v_row.occurred_at,'observedAt',v_row.occurred_at,
      'sessionId',v_row.session_id,'decisionId',v_row.decision_id,'spotId',v_row.spot_id,'momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,
      'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId',v_row.source_type||':'||v_row.source_id,'sourceVersion',v_row.semantic_version),
      'consentPurpose','personalized_recommendations','consentState','granted','exposure',jsonb_build_object('rank',v_row.exposure_rank));
    begin
      select * into v_result from public.backyrd_ingest_memory_event_v1(v_event);
      update public.backyrd_memory_bridge_outbox_v1 set state='COMMITTED',locked_at=null,committed_at=now(),canonical_event_id=v_result.event_id,canonical_event_hash=v_result.event_hash,updated_at=now(),failure_code=null where id=v_row.id;
      v_committed:=v_committed+1;
    exception when others then
      get stacked diagnostics v_code = returned_sqlstate;
      if v_code in ('22023','23505') then
        update public.backyrd_memory_bridge_outbox_v1 set state='INVALID',locked_at=null,failure_code='ingestion_invalid:'||v_code,updated_at=now() where id=v_row.id; v_failed:=v_failed+1;
      elsif v_row.attempts >= 8 then
        update public.backyrd_memory_bridge_outbox_v1 set state='FAILED',locked_at=null,failure_code='ingestion_failed:'||v_code,updated_at=now() where id=v_row.id; v_failed:=v_failed+1;
      else
        update public.backyrd_memory_bridge_outbox_v1 set state='RETRYABLE',locked_at=null,available_at=now()+make_interval(secs=>least(3600,5*power(2,v_row.attempts)::integer)),failure_code='ingestion_retryable:'||v_code,updated_at=now() where id=v_row.id; v_retryable:=v_retryable+1;
      end if;
    end;
  end loop;
  return jsonb_build_object('committed',v_committed,'retryable',v_retryable,'failed',v_failed,'suppressedConsent',v_suppressed);
end; $$;

create or replace function public.backyrd_memory_bridge_metrics_v1()
returns jsonb language sql stable security definer set search_path=public,pg_catalog as $$
  with state_counts as (
    select state,count(*)::integer as count from public.backyrd_memory_bridge_outbox_v1 group by state
  ), ready as (
    select min(available_at) as oldest_ready_at,min(occurred_at) as oldest_occurred_at
    from public.backyrd_memory_bridge_outbox_v1 where state in ('PENDING','RETRYABLE')
  ) select jsonb_build_object(
    'byState',coalesce((select jsonb_object_agg(state,count) from state_counts),'{}'::jsonb),
    'oldestReadyAt',(select oldest_ready_at from ready),
    'sourceToN2LagSeconds',coalesce(extract(epoch from now()-(select oldest_occurred_at from ready)),0)
  )
$$;

create or replace function public.backyrd_memory_bridge_purge_withdrawn_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if new.purpose_key='personalized_recommendations' and new.status='withdrawn' and (tg_op='INSERT' or old.status is distinct from new.status) then
    delete from public.backyrd_memory_bridge_outbox_v1 where user_id=new.user_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_backyrd_memory_bridge_consent_purge_v1 on public.user_consents;
create trigger trg_backyrd_memory_bridge_consent_purge_v1 after insert or update of status on public.user_consents for each row execute function public.backyrd_memory_bridge_purge_withdrawn_v1();

alter table public.backyrd_memory_bridge_settings_v1 enable row level security;
alter table public.backyrd_memory_bridge_outbox_v1 enable row level security;
alter table public.backyrd_memory_bridge_product_actions_v1 enable row level security;
create policy backyrd_memory_bridge_settings_no_client_v1 on public.backyrd_memory_bridge_settings_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_memory_bridge_outbox_no_client_v1 on public.backyrd_memory_bridge_outbox_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_memory_bridge_product_actions_no_direct_client_v1 on public.backyrd_memory_bridge_product_actions_v1 for all to anon,authenticated using(false) with check(false);
revoke all on table public.backyrd_memory_bridge_settings_v1,public.backyrd_memory_bridge_outbox_v1,public.backyrd_memory_bridge_product_actions_v1 from public,anon,authenticated;
grant all on table public.backyrd_memory_bridge_settings_v1,public.backyrd_memory_bridge_outbox_v1,public.backyrd_memory_bridge_product_actions_v1 to service_role;
revoke all on function public.backyrd_memory_bridge_enabled_v1(),public.backyrd_memory_bridge_enqueue_v1(text,text,uuid,text,timestamptz,text,uuid,uuid,integer,jsonb),public.backyrd_memory_bridge_enqueue_decision_session_v1(),public.backyrd_memory_bridge_enqueue_impression_v1(),public.backyrd_memory_bridge_enqueue_analytics_v1(),public.backyrd_memory_bridge_enqueue_product_action_v1(),public.backyrd_record_memory_product_action_v1(uuid,text,uuid,uuid,text,timestamptz),public.backyrd_memory_bridge_enqueue_favorite_v1(),public.backyrd_memory_bridge_enqueue_reservation_v1(),public.backyrd_memory_bridge_enqueue_smart_review_v1(),public.backyrd_memory_bridge_recover_stale_v1(),public.backyrd_memory_bridge_process_v1(integer),public.backyrd_memory_bridge_metrics_v1(),public.backyrd_memory_bridge_purge_withdrawn_v1() from public,anon,authenticated;
grant execute on function public.backyrd_memory_bridge_recover_stale_v1(),public.backyrd_memory_bridge_process_v1(integer),public.backyrd_memory_bridge_metrics_v1() to service_role;
grant execute on function public.backyrd_record_memory_product_action_v1(uuid,text,uuid,uuid,text,timestamptz) to authenticated,service_role;
