-- Canonical spot-linked events. Owners submit; only admins publish.
alter table public.event_sources_v1 drop constraint event_sources_v1_rights_status_check;
alter table public.event_sources_v1 add constraint event_sources_v1_rights_status_check
 check (rights_status in ('PUBLIC_API_TERMS','OPEN_DATA_LICENSE','CONTRACT_PENDING','MANUAL_ADMIN','VERIFIED_OWNER'));
insert into public.event_sources_v1(id,display_name,adapter_kind,ingestion_enabled,rights_status,image_ingestion_allowed,requires_image_credit,source_url,configuration)
values ('manual_owner','Backyrd Owner','API',false,'VERIFIED_OWNER',false,false,'https://www.backyrd.ch/events','{"no_external_ingest":true}'::jsonb);
alter table public.events_v1 add column authoring_spot_id uuid references public.spots(id) on delete restrict;
create index events_v1_authoring_spot_idx on public.events_v1(authoring_spot_id) where authoring_spot_id is not null;

create schema if not exists event_authoring_private;
revoke all on schema event_authoring_private from public,anon,authenticated;
create table event_authoring_private.audit (
 id bigint generated always as identity primary key, event_id uuid not null references public.events_v1(id),
 spot_id uuid not null references public.spots(id), actor_id uuid not null, action text not null,
 previous_status text, resulting_status text not null, recorded_at timestamptz not null default clock_timestamp()
);
alter table event_authoring_private.audit enable row level security;

-- Deliberate authenticated boundary: no direct Owner table writes, source spoofing,
-- venue reassignment, publication authority, or client-coordinated transactions.
create function event_authoring_private.save_spot_event_v1(p_spot_id uuid,p_event_id uuid,p_expected_updated_at timestamptz,p_action text,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_admin boolean; v_spot public.spots%rowtype; v_event public.events_v1%rowtype;
 v_id uuid:=coalesce(p_event_id,nullif(p_input->>'requestId','')::uuid,gen_random_uuid()); v_source text; v_status text; v_venue uuid;
 v_categories text[]; v_activities text[]; v_tags text[]; v_rule jsonb; v_start date; v_end date;
 v_time time; v_end_time time; v_price numeric; v_free boolean; v_age integer; v_url text;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 v_admin:=public.admin_is_admin_v1();
 select * into v_spot from public.spots where id=p_spot_id for share;
 if not found or (not v_admin and v_spot.owner_id is distinct from v_actor) then
  raise exception 'spot_event_forbidden' using errcode='42501';
 end if;
 if p_action not in ('DRAFT','SUBMIT','PUBLISH','CANCEL') or p_action is null or (not v_admin and p_action='PUBLISH') then
  raise exception 'spot_event_action_forbidden' using errcode='42501';
 end if;
 if p_event_id is not null then
  select * into v_event from public.events_v1 where id=p_event_id for update;
  if not found or coalesce(v_event.authoring_spot_id,(select matched_spot_id from public.event_venues_v1 where id=v_event.primary_venue_id)) is distinct from p_spot_id
   or v_event.authoring_spot_id is null
   or v_event.primary_source_id not in ('manual_owner','manual_admin')
   or (not v_admin and v_event.primary_source_id<>'manual_owner') then
   raise exception 'spot_event_forbidden' using errcode='42501';
  end if;
  if p_expected_updated_at is distinct from v_event.updated_at then
   raise exception 'spot_event_changed' using errcode='40001';
  end if;
 elsif exists(select 1 from public.events_v1 where id=v_id) then
  raise exception 'spot_event_changed' using errcode='40001';
 elsif p_action='CANCEL' then raise exception 'spot_event_missing' using errcode='22023';
 end if;
 v_source:=coalesce(v_event.primary_source_id,case when v_admin then 'manual_admin' else 'manual_owner' end);
 v_status:=case when p_action='PUBLISH' then 'PUBLISHED' when p_action='CANCEL' then 'CANCELLED' else 'DRAFT' end;
 if p_action='CANCEL' then
  update public.events_v1 set status='CANCELLED',
   provenance=provenance||jsonb_build_object('lastEditedBy',v_actor,'submissionStatus','CANCELLED') where id=v_id;
  update public.event_occurrences_v1 set status='CANCELLED' where event_id=v_id;
 else
  if jsonb_typeof(p_input) is distinct from 'object' or length(btrim(coalesce(p_input->>'title',''))) not between 1 and 300
   or length(coalesce(p_input->>'description',''))>600 then raise exception 'spot_event_text_invalid' using errcode='22023'; end if;
  select array_agg(value) into v_categories from jsonb_array_elements_text(p_input->'categories');
  select coalesce(array_agg(btrim(value)),array[]::text[]) into v_activities from jsonb_array_elements_text(coalesce(p_input->'activities','[]'));
  select coalesce(array_agg(value),array[]::text[]) into v_tags from jsonb_array_elements_text(coalesce(p_input->'tags','[]'));
  if cardinality(v_categories) is null or cardinality(v_categories) not between 1 and 12 or not public.backyrd_event_activities_valid_v1(v_activities) then
   raise exception 'spot_event_categories_or_activities_invalid' using errcode='22023'; end if;
  v_rule:=p_input->'recurrence';
  v_start:=(v_rule->>'startDate')::date; v_time:=(v_rule->>'startTime')::time; v_end_time:=(v_rule->>'endTime')::time;
  v_end:=nullif(v_rule->>'until','')::date;
  if v_start is null or v_time is null or v_end_time is null or v_time=v_end_time
   or (v_start<current_date and (v_event.id is null or v_start is distinct from (v_event.recurrence_rule->>'startDate')::date)) or v_start>current_date+366 or (v_end is not null and (v_end<v_start or v_end>v_start+366))
   or coalesce(v_rule->>'frequency','') not in ('ONCE','WEEKLY','MONTHLY')
   or coalesce((v_rule->>'interval')::integer,0) not between 1 and 52 then
   raise exception 'spot_event_schedule_invalid' using errcode='22023'; end if;
  -- Accept only the selected start weekday. Client JSON cannot inject other rules.
  v_rule:=jsonb_build_object('frequency',v_rule->>'frequency','interval',(v_rule->>'interval')::integer,
   'startDate',v_start,'startTime',v_time,'endTime',v_end_time,'until',v_end,
   'weekdays',jsonb_build_array(extract(isodow from v_start)::integer));
  v_free:=nullif(p_input->>'free','')::boolean; v_price:=nullif(p_input->>'price','')::numeric;
  if v_price<0 or v_price>100000 or (v_free is true and v_price>0) then raise exception 'spot_event_price_invalid' using errcode='22023'; end if;
  if v_free is true then v_price:=0; end if;
  if v_price=0 then v_free:=true; end if;
  v_age:=nullif(p_input->>'minimumAge','')::integer;
  if v_age<0 or v_age>99 then raise exception 'spot_event_age_invalid' using errcode='22023'; end if;
  v_url:=nullif(btrim(p_input->>'externalUrl'),'');
  if v_url is not null and (length(v_url)>2000 or v_url !~ '^https://[^[:space:]]+$') then raise exception 'spot_event_url_invalid' using errcode='22023'; end if;
  insert into public.event_venues_v1(source_id,source_venue_id,name,normalized_name,address_line,city,country_code,latitude,longitude,matched_spot_id,match_method,match_confidence,last_seen_at)
  values(v_source,'spot:'||p_spot_id,v_spot.name,lower(v_spot.name),v_spot.address,v_spot.city,'CH',v_spot.lat,v_spot.lng,p_spot_id,'SOURCE_ID',1,now())
  on conflict(source_id,source_venue_id) do update set name=excluded.name,address_line=excluded.address_line,city=excluded.city,latitude=excluded.latitude,longitude=excluded.longitude,last_seen_at=now()
  returning id into v_venue;
  insert into public.events_v1(id,primary_source_id,primary_source_event_id,title,short_description,category,categories,status,
   decision_activities,decision_tags,is_free,price_min,price_currency,source_url,external_url,dedupe_key,provenance,last_seen_at,published_at,
   minimum_age,family_friendly,organizer,is_recurring,recurrence_rule,recurrence_summary,manual_address,primary_venue_id,created_by,authoring_spot_id)
  values(v_id,v_source,v_id::text,btrim(p_input->>'title'),nullif(btrim(p_input->>'description'),''),v_categories[1],v_categories,v_status,
   v_activities,v_tags,v_free,v_price,case when v_price is not null then 'CHF' else null end,coalesce(v_url,'https://www.backyrd.ch/events/'||v_id),v_url,
   'manual:'||v_id,coalesce(v_event.provenance,'{}')||jsonb_build_object('source',v_source,'lastEditedBy',v_actor,'submissionStatus',case when p_action='SUBMIT' then 'PENDING_REVIEW' when p_action='PUBLISH' then 'APPROVED' else 'DRAFT' end),now(),case when v_status='PUBLISHED' then now() else null end,
   v_age,nullif(p_input->>'familyFriendly','')::boolean,nullif(btrim(p_input->>'organizer'),''),v_rule->>'frequency'<>'ONCE',v_rule,null,
   v_spot.address,v_venue,coalesce(v_event.created_by,v_actor),p_spot_id)
  on conflict(id) do update set title=excluded.title,short_description=excluded.short_description,category=excluded.category,categories=excluded.categories,status=excluded.status,
   decision_activities=excluded.decision_activities,decision_tags=excluded.decision_tags,is_free=excluded.is_free,price_min=excluded.price_min,price_currency=excluded.price_currency,
   source_url=excluded.source_url,external_url=excluded.external_url,provenance=excluded.provenance,last_seen_at=now(),published_at=excluded.published_at,
   minimum_age=excluded.minimum_age,family_friendly=excluded.family_friendly,organizer=excluded.organizer,is_recurring=excluded.is_recurring,recurrence_rule=excluded.recurrence_rule,
   manual_address=excluded.manual_address,primary_venue_id=excluded.primary_venue_id,authoring_spot_id=excluded.authoring_spot_id
   where public.events_v1.id=p_event_id;
  if not found then raise exception 'spot_event_changed' using errcode='40001'; end if;
  perform public.regenerate_manual_event_occurrences_v1(v_id);
 end if;
 insert into event_authoring_private.audit(event_id,spot_id,actor_id,action,previous_status,resulting_status)
 values(v_id,p_spot_id,v_actor,p_action,v_event.status,v_status);
 return v_id;
end $$;
revoke all on function event_authoring_private.save_spot_event_v1(uuid,uuid,timestamptz,text,jsonb) from public,anon;
grant execute on function event_authoring_private.save_spot_event_v1(uuid,uuid,timestamptz,text,jsonb) to authenticated;

create function event_authoring_private.list_spot_events_v1(p_spot_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_admin boolean; v_result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 v_admin:=public.admin_is_admin_v1();
 if not v_admin then perform public.backyrd_owner_assert_spot_v1(p_spot_id); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'description',e.short_description,
  'status',e.status,'submitted',e.provenance->>'submissionStatus'='PENDING_REVIEW','updatedAt',e.updated_at,
  'editable',(v_admin or e.primary_source_id='manual_owner') and e.authoring_spot_id is not null,'categories',e.categories,'activities',e.decision_activities,
  'tags',e.decision_tags,'free',e.is_free,'price',e.price_min,'minimumAge',e.minimum_age,'familyFriendly',e.family_friendly,
  'organizer',e.organizer,'externalUrl',e.external_url,'recurrence',e.recurrence_rule) order by e.updated_at desc),'[]') into v_result
 from public.events_v1 e left join public.event_venues_v1 v on v.id=e.primary_venue_id
 where coalesce(e.authoring_spot_id,v.matched_spot_id)=p_spot_id and e.primary_source_id in ('manual_admin','manual_owner') and e.status<>'DELETED';
 return v_result;
end $$;
revoke all on function event_authoring_private.list_spot_events_v1(uuid) from public,anon;
grant execute on function event_authoring_private.list_spot_events_v1(uuid) to authenticated;

create or replace function public.regenerate_manual_event_occurrences_v1(p_event_id uuid)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_event public.events_v1%rowtype;
  v_frequency text;
  v_interval integer;
  v_rule_start date;
  v_rule_until date;
  v_horizon_start date := timezone('Europe/Zurich', now())::date;
  v_horizon_end date := (timezone('Europe/Zurich', now())::date + interval '12 months')::date;
  v_count_limit integer;
  v_date date;
  v_start_time time;
  v_end_time time;
  v_start timestamptz;
  v_end timestamptz;
  v_materialized integer := 0;
  v_series_index integer := 0;
  v_scanned_days integer := 0;
  v_is_occurrence boolean;
  v_weekdays integer[];
  v_desired_indices integer[] := array[]::integer[];
begin
  select *
    into v_event
    from public.events_v1
   where id = p_event_id
     and primary_source_id in ('manual_admin','manual_owner');

  if not found then
    raise exception 'manual_event_not_found';
  end if;

  if v_event.recurrence_rule is null then
    raise exception 'manual_event_recurrence_rule_missing';
  end if;

  v_frequency := upper(coalesce(v_event.recurrence_rule->>'frequency', 'ONCE'));
  if v_frequency not in ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY') then
    raise exception 'manual_event_recurrence_frequency_invalid';
  end if;

  v_interval := greatest(1, coalesce((v_event.recurrence_rule->>'interval')::integer, 1));
  v_rule_start := (v_event.recurrence_rule->>'startDate')::date;
  v_rule_until := nullif(v_event.recurrence_rule->>'until', '')::date;
  v_count_limit := nullif(v_event.recurrence_rule->>'count', '')::integer;
  v_start_time := (v_event.recurrence_rule->>'startTime')::time;
  v_end_time := (v_event.recurrence_rule->>'endTime')::time;

  if v_count_limit is not null and v_count_limit < 1 then
    raise exception 'manual_event_recurrence_count_invalid';
  end if;

  select coalesce(array_agg(value::integer), array[]::integer[])
    into v_weekdays
    from jsonb_array_elements_text(coalesce(v_event.recurrence_rule->'weekdays', '[]'::jsonb));

  if v_frequency = 'WEEKLY' and cardinality(v_weekdays) = 0 then
    v_weekdays := array[extract(isodow from v_rule_start)::integer];
  end if;

  update public.event_occurrences_v1
     set status = 'ENDED',
         updated_at = now()
   where event_id = p_event_id
     and status = 'SCHEDULED'
     and end_at < now();

  v_date := v_rule_start;

  while v_date <= v_horizon_end
    and (v_rule_until is null or v_date <= v_rule_until)
    and (v_count_limit is null or v_series_index < v_count_limit)
  loop
    v_scanned_days := v_scanned_days + 1;
    if v_scanned_days > 36600 then
      raise exception 'manual_event_recurrence_range_too_large';
    end if;

    v_is_occurrence :=
      v_frequency = 'ONCE'
      or v_frequency = 'DAILY'
      or (
        v_frequency = 'WEEKLY'
        and extract(isodow from v_date)::integer = any(v_weekdays)
        and ((v_date - v_rule_start) / 7) % v_interval = 0
      )
      or (
        v_frequency = 'MONTHLY'
        and extract(day from v_date) = extract(day from v_rule_start)
        and (
          extract(year from v_date)::integer * 12
          + extract(month from v_date)::integer
          - extract(year from v_rule_start)::integer * 12
          - extract(month from v_rule_start)::integer
        ) % v_interval = 0
      );

    if v_is_occurrence then
      if v_date >= v_horizon_start then
        v_start := (v_date + v_start_time) at time zone 'Europe/Zurich';
        v_end := (
          (case when v_end_time < v_start_time then v_date + 1 else v_date end) + v_end_time
        ) at time zone 'Europe/Zurich';

        if not exists (
          select 1
            from public.event_occurrences_v1 exception_occurrence
           where exception_occurrence.event_id = p_event_id
             and exception_occurrence.is_recurrence_exception
             and (
               exception_occurrence.recurrence_index = v_series_index
               or exception_occurrence.original_start_at = v_start
             )
        ) then
          v_desired_indices := array_append(v_desired_indices, v_series_index);

          insert into public.event_occurrences_v1 (
            event_id,
            venue_id,
            start_at,
            end_at,
            status,
            source_url,
            ticket_url,
            dedupe_key,
            last_seen_at,
            published_at,
            recurrence_index,
            original_start_at
          ) values (
            v_event.id,
            v_event.primary_venue_id,
            v_start,
            v_end,
            case when v_event.status = 'CANCELLED' then 'CANCELLED' else 'SCHEDULED' end,
            coalesce(v_event.external_url, v_event.source_url),
            null,
            md5(v_event.id::text || ':' || v_start::text),
            now(),
            case when v_event.status in ('PUBLISHED', 'SCHEDULED', 'CANCELLED') then now() else null end,
            v_series_index,
            v_start
          )
          on conflict (event_id, recurrence_index)
            where recurrence_index is not null and not is_recurrence_exception
          do update set
            venue_id = excluded.venue_id,
            start_at = excluded.start_at,
            end_at = excluded.end_at,
            status = excluded.status,
            source_url = excluded.source_url,
            ticket_url = excluded.ticket_url,
            dedupe_key = excluded.dedupe_key,
            last_seen_at = excluded.last_seen_at,
            published_at = excluded.published_at,
            original_start_at = excluded.original_start_at,
            updated_at = now();

          v_materialized := v_materialized + 1;
        end if;
      end if;

      v_series_index := v_series_index + 1;
      if v_frequency = 'ONCE' then
        exit;
      end if;
    end if;

    v_date := v_date + 1;
  end loop;

  -- Remove only generated projection rows that are no longer part of the
  -- current rolling window. Historical rows and every exception survive.
  delete from public.event_occurrences_v1
   where event_id = p_event_id
     and recurrence_index is not null
     and not is_recurrence_exception
     and start_at >= (v_horizon_start::timestamp at time zone 'Europe/Zurich')
     and not (recurrence_index = any(v_desired_indices));

  return v_materialized;
end;
$$;

revoke all on function public.regenerate_manual_event_occurrences_v1(uuid) from public, anon;
grant execute on function public.regenerate_manual_event_occurrences_v1(uuid) to authenticated, service_role;

create or replace function public.reconcile_manual_event_occurrences_v1()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_event record;
  v_refreshed integer := 0;
begin
  for v_event in
    select id
      from public.events_v1
     where primary_source_id in ('manual_admin','manual_owner')
       and recurrence_rule is not null
       and status not in ('ENDED', 'DELETED')
     order by id
  loop
    perform public.regenerate_manual_event_occurrences_v1(v_event.id);
    v_refreshed := v_refreshed + 1;
  end loop;

  return v_refreshed;
end;
$$;

revoke all on function public.reconcile_manual_event_occurrences_v1() from public, anon;
grant execute on function public.reconcile_manual_event_occurrences_v1() to authenticated, service_role;

create or replace function public.backyrd_decision_vnext_product_context_v6(
  p_auth_user_id uuid,p_subject_binding_hash text,p_target_city text,p_primary_intent text,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_events jsonb; v_world jsonb; v_count integer; v_now timestamptz:=clock_timestamp();
  v_control jsonb; v_consent public.user_consents%rowtype; v_snapshot jsonb;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_control:=public.backyrd_decision_vnext_product_control_v1(p_release_hash,p_artifact_hash,p_source_set_hash,p_generation);
  if coalesce((v_control->>'enabled')::boolean,false) is not true then
    raise exception 'decision_vnext_product_runtime_off' using errcode='55000';
  end if;
  if p_auth_user_id is null or p_subject_binding_hash is null or p_subject_binding_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_target_city),'') is null or length(p_target_city)>120
     or (p_primary_intent is not null and p_primary_intent not in
       ('EAT','COFFEE','DRINKS','SPORT_MOVEMENT','NATURE_ANIMAL_EXPERIENCE','CULTURE_ART','ACTIVITY_EXPERIENCE','NIGHTLIFE'))
     or not exists(select 1 from auth.users u where u.id=p_auth_user_id and u.deleted_at is null) then
    raise exception 'decision_vnext_product_context_authority_denied' using errcode='42501';
  end if;
  with verified as materialized (
    select s.id spot_id,m.manifest_hash,m.world_snapshot
    from public.spots s
    join world_knowledge_private.current_projection_pointers p on p.spot_id=s.id
    join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id and m.manifest_hash=p.manifest_hash
    where s.status='approved'
      and ((m.registry_version='backyrd.world-knowledge.registry@2.5' and m.policy_version='backyrd.world-knowledge.source-policy@4f.1') or (m.registry_version='backyrd.world-knowledge.registry@2.1' and m.policy_version='backyrd.world-knowledge.source-policy@4b.1') or (m.registry_version='backyrd.world-knowledge.registry@2.3' and m.policy_version='backyrd.world-knowledge.source-policy@4d.1') or (m.registry_version='backyrd.world-knowledge.registry@2.4' and m.policy_version='backyrd.world-knowledge.source-policy@4e.1'))
      and (world_knowledge_private.validate_resolution_manifest_v1(m.id)->>'manifestHash')=m.manifest_hash
      and exists (
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'key'='location.locality' and f->>'resolution'='KNOWN_VALUE'
          and f->>'trust'='VERIFIED' and f->>'freshness'='CURRENT'
          and lower(translate(f->>'value','äöüÄÖÜ','aouAOU'))=
              lower(translate(btrim(p_target_city),'äöüÄÖÜ','aouAOU'))
      )
      and exists (
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'key'='identity.name' and f->>'resolution'='KNOWN_VALUE'
          and f->>'trust'='VERIFIED' and f->>'freshness'='CURRENT'
          and nullif(btrim(f->>'value'),'') is not null
      )
      and not exists (
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'conflicts','[]'::jsonb)) conflict
        where conflict->>'key'='location.locality'
      )
    order by s.id
    limit 1001
  )
  select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.product-resolver-binding@1.0',
    'manifestHash',v.manifest_hash,'registryHash',v.world_snapshot->>'registryHash',
    'resolvedAt',v.world_snapshot->>'resolvedAt',
    'decisionProjection',world_knowledge_private.product_decision_projection_v1(v.world_snapshot)
  ) order by v.spot_id),'[]'::jsonb) into v_count,v_world from verified v;
  if v_count>1000 then raise exception 'decision_vnext_product_world_cohort_unavailable' using errcode='55000'; end if;
  with upcoming as materialized (
    select e.id event_id, o.id occurrence_id, e.primary_source_id, e.title, e.categories, e.decision_tags, e.decision_activities, o.ticket_status,
      case when e.image_rights_verified then e.image_storage_path else null end image_storage_path,
      d.city, d.venue_name, d.address_line, d.matched_spot_id,
      o.start_at,o.end_at,e.status event_status,o.status occurrence_status,
      e.published_at,o.published_at occurrence_published_at,greatest(e.updated_at,o.updated_at) updated_at,
      e.is_free,e.price_min,e.price_currency,e.minimum_age,e.family_friendly,
      coalesce(o.source_url,e.source_url) source_url,coalesce(o.ticket_url,e.ticket_url) ticket_url
    from public.events_v1 e
    join public.event_occurrences_v1 o on o.event_id=e.id
    join public.event_discovery_v1 d on d.occurrence_id=o.id
    where e.primary_source_id in ('manual_admin','manual_owner')
      and e.published_at<=v_now and o.published_at<=v_now
      and e.status not in ('DRAFT','DELETED') and o.status<>'DELETED'
      and lower(translate(btrim(d.city),'äöüÄÖÜ','aouAOU'))=lower(translate(btrim(p_target_city),'äöüÄÖÜ','aouAOU'))
      and o.start_at < v_now + interval '366 days'
      and (o.end_at > v_now or (o.end_at is null and o.start_at >= date_trunc('day',v_now at time zone 'Europe/Zurich') at time zone 'Europe/Zurich'))
    order by o.start_at,o.id limit 501
  )
  select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'activities',decision_activities,'tags',decision_tags,'ticketStatus',ticket_status,'imageStoragePath',image_storage_path,
    'eventId',event_id,'occurrenceId',occurrence_id,'source',primary_source_id,'title',title,'categories',categories,
    'city',city,'venueName',venue_name,'address',address_line,'matchedSpotId',matched_spot_id,
    'startAt',start_at,'endAt',end_at,'eventStatus',event_status,'occurrenceStatus',occurrence_status,
    'publishedAt',published_at,'occurrencePublishedAt',occurrence_published_at,'updatedAt',updated_at,
    'isFree',is_free,'priceMin',price_min,'currency',price_currency,'minimumAge',minimum_age,'familyFriendly',family_friendly,
    'sourceUrl',source_url,'ticketUrl',ticket_url,'imageUrl',null
  ) order by start_at,occurrence_id),'[]'::jsonb) into v_count,v_events from upcoming;
  if v_count>500 then raise exception 'decision_event_cohort_limit' using errcode='55000'; end if;
  if jsonb_array_length(v_world)=0 and v_count=0 then raise exception 'decision_vnext_product_world_cohort_unavailable' using errcode='55000'; end if;
  select * into v_consent from public.user_consents c
    where c.user_id=p_auth_user_id and c.purpose_key='personalized_recommendations';
  if not found or v_consent.status<>'granted' then
    return jsonb_build_object('contractVersion','backyrd.decision-vnext.product-runtime-context@1.0',
      'authorizedCity',btrim(p_target_city),'serverTime',v_now,'worldSnapshots',v_world,'eventOccurrences',v_events,
      'status','NO_CONSENT','consent',null,'snapshot',null);
  end if;
  select jsonb_build_object('snapshotId',s.snapshot_id,'snapshotHash',s.snapshot_hash,
      'runtimeVersion',s.runtime_version,'sourceHash',s.source_hash,
      'nodes',coalesce((select jsonb_agg(n.node order by n.node_key)
        from public.backyrd_user_intelligence_snapshot_nodes_v1 n where n.snapshot_id=s.snapshot_id),'[]'::jsonb))
    into v_snapshot
  from public.backyrd_user_intelligence_latest_v1 l
  join public.backyrd_user_intelligence_snapshots_v2 s on s.snapshot_id=l.snapshot_id and s.user_id=l.user_id
  where l.user_id=p_auth_user_id and s.status='COMMITTED';
  return jsonb_build_object('contractVersion','backyrd.decision-vnext.product-runtime-context@1.0',
    'authorizedCity',btrim(p_target_city),'serverTime',v_now,'worldSnapshots',v_world,'eventOccurrences',v_events,
    'status',case when v_snapshot is null then 'MISSING_SNAPSHOT' else 'ACTIVE' end,
    'consent',jsonb_build_object(
      'contractVersion','backyrd.user-intelligence.consent-envelope@1.0',
      'purpose','PERSONALIZED_RECOMMENDATIONS','state','GRANTED',
      'consentVersion',coalesce(v_consent.document_id::text,'personalized-recommendations-v1'),
      'policyVersion',coalesce(v_consent.document_id::text,'personalized-recommendations-v1'),
      'uxVersion','canonical-consent-ledger-v1','effectiveAt',v_consent.granted_at,
      'captureContext',case when v_consent.source='mobile' then 'ONBOARDING' when v_consent.source='web' then 'SETTINGS' else 'MIGRATION_VERIFIED' end,
      'allowedProcessing',jsonb_build_array('PERSONALIZATION_EVIDENCE','TRANSPARENCY','EXPORT','ERASURE'),
      'lifecycleEffect','ALLOW'),'snapshot',v_snapshot);
end;
$$;

grant usage on schema event_authoring_private to authenticated;
create function public.save_spot_event_v1(p_spot_id uuid,p_event_id uuid,p_expected_updated_at timestamptz,p_action text,p_input jsonb)
returns uuid language sql security invoker set search_path='' as $$
 select event_authoring_private.save_spot_event_v1(p_spot_id,p_event_id,p_expected_updated_at,p_action,p_input)
$$;
revoke all on function public.save_spot_event_v1(uuid,uuid,timestamptz,text,jsonb) from public,anon;
grant execute on function public.save_spot_event_v1(uuid,uuid,timestamptz,text,jsonb) to authenticated;
create function public.list_spot_events_v1(p_spot_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select event_authoring_private.list_spot_events_v1(p_spot_id) $$;
revoke all on function public.list_spot_events_v1(uuid) from public,anon;
grant execute on function public.list_spot_events_v1(uuid) to authenticated;
