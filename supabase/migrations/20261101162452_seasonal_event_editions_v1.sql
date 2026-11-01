-- A series identifies an annual event; each edition remains an events_v1 row.
-- Daily occurrences at real venues are the only availability evidence.
create table public.event_series_v1 (
 id uuid primary key default gen_random_uuid(), slug text not null unique check(length(slug)<=160 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null check(length(btrim(name)) between 1 and 160), created_at timestamptz not null default now()
);
alter table public.event_series_v1 enable row level security;
alter table public.events_v1
 add column series_id uuid references public.event_series_v1(id) on delete restrict,
 add column edition_year integer check(edition_year between 1900 and 2100),
 add column edition_start_date date, add column edition_end_date date,
 add column admission_note text check(length(admission_note)<=500),
 add column seasonal_config jsonb;
alter table public.events_v1 add constraint seasonal_edition_complete_v1 check (
 (series_id is null and edition_year is null and edition_start_date is null and edition_end_date is null and seasonal_config is null)
 or (series_id is not null and edition_year is not null and edition_start_date is not null and edition_end_date is not null
 and edition_end_date>=edition_start_date and edition_end_date-edition_start_date<=90 and seasonal_config is not null
 and authoring_spot_id is null and primary_source_id='manual_admin' and not is_recurring and recurrence_rule is null)
);
create unique index events_v1_series_year_unique on public.events_v1(series_id,edition_year) where series_id is not null;
alter table public.event_occurrences_v1 add column seasonal_place_key text, add column seasonal_date date,
 add column place_environment text check(place_environment in ('INDOOR','OUTDOOR','UNKNOWN'));
alter table public.event_occurrences_v1 add constraint seasonal_occurrence_complete_v1 check(
 (seasonal_place_key is null and seasonal_date is null and place_environment is null)
 or (seasonal_place_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and seasonal_date is not null and place_environment is not null)
);
create unique index event_occurrences_v1_seasonal_unique on public.event_occurrences_v1(event_id,seasonal_place_key,seasonal_date) where seasonal_place_key is not null;
create policy event_series_admin_read on public.event_series_v1 for select to authenticated using(public.admin_is_admin_v1());
create policy event_series_public_read on public.event_series_v1 for select to anon,authenticated using(exists(
 select 1 from public.events_v1 e where e.series_id=event_series_v1.id and e.published_at<=now() and e.status in ('PUBLISHED','SCHEDULED','ENDED','CANCELLED')
));
revoke all on public.event_series_v1 from public,anon,authenticated;
grant select on public.event_series_v1 to anon,authenticated;
grant select(series_id,edition_year,edition_start_date,edition_end_date,admission_note) on public.events_v1 to anon;
grant select(seasonal_place_key,seasonal_date,place_environment) on public.event_occurrences_v1 to anon;

create table event_authoring_private.seasonal_audit_v1 (
 id bigint generated always as identity primary key,event_id uuid not null references public.events_v1(id),
 actor_id uuid not null,previous_status text,resulting_status text not null,previous_config jsonb,config_hash text not null,recorded_at timestamptz not null default clock_timestamp()
);
alter table event_authoring_private.seasonal_audit_v1 enable row level security;
revoke all on event_authoring_private.seasonal_audit_v1 from public,anon,authenticated,service_role;
create function event_authoring_private.reject_seasonal_audit_mutation_v1() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Seasonal audit records are immutable.' using errcode='55000'; end $$;
revoke all on function event_authoring_private.reject_seasonal_audit_mutation_v1() from public,anon,authenticated,service_role;
create trigger seasonal_audit_append_only_v1 before update or delete on event_authoring_private.seasonal_audit_v1 for each row execute function event_authoring_private.reject_seasonal_audit_mutation_v1();

-- Admin-only, atomic, optimistic concurrency protected; never grants Owner publication.
create function public.admin_save_seasonal_edition_v1(p_input jsonb,p_publish boolean,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_id uuid; v_series uuid; v_existing public.events_v1%rowtype; v_place jsonb; v_hour jsonb; v_exception jsonb;
 v_venue uuid; v_day date; v_from date; v_until date; v_open time; v_close time; v_start timestamptz; v_end timestamptz;
 v_first date; v_last date; v_count integer:=0; v_keys text[]:=array[]::text[]; v_dedupe text[]:=array[]::text[]; v_key text;
 v_now timestamptz:=clock_timestamp(); v_status text; v_url text; v_actor uuid:=auth.uid();
begin
 if v_actor is null or public.admin_is_admin_v1() is not true then raise exception 'Nur Admins können eine saisonale Veranstaltung speichern.' using errcode='42501'; end if;
 if jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>100000 or p_publish is null then raise exception 'Die Veranstaltungsangaben sind unvollständig.' using errcode='22023'; end if;
 v_id:=(p_input->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('seasonal-edition:'||v_id::text,0));
 select * into v_existing from public.events_v1 where id=v_id for update;
 if found and (v_existing.series_id is null or v_existing.primary_source_id<>'manual_admin' or p_expected_updated_at is distinct from v_existing.updated_at) then
  raise exception 'Die Ausgabe wurde inzwischen geändert. Bitte neu laden.' using errcode='40001';
 end if;
 if v_existing.id is not null and (v_existing.edition_year<>(p_input->>'year')::integer or v_existing.series_id is distinct from (select es.id from public.event_series_v1 es where es.slug=p_input->>'seriesKey')) then raise exception 'Bitte für ein anderes Jahr eine neue Ausgabe vorbereiten.' using errcode='22023'; end if;
 if p_input->>'seriesKey' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(btrim(p_input->>'seriesName')) not between 1 and 160
 or length(btrim(p_input->>'title')) not between 1 and 300 or length(btrim(p_input->>'description')) not between 1 and 600
 or length(btrim(p_input->>'city')) not between 1 and 160 or (p_input->>'year')::integer not between 1900 and 2100
 or jsonb_typeof(p_input->'places') is distinct from 'array' or jsonb_array_length(p_input->'places') not between 1 and 20
 or p_input->>'sourceUrl' !~ '^https://[^[:space:]]+$' or (p_input->>'checkedAt')::timestamptz>v_now
 or length(p_input->>'admissionNote')>500 then raise exception 'Bitte Name, Jahr, Quelle und Schauplätze vollständig prüfen.' using errcode='22023'; end if;
 if jsonb_typeof(p_input->'categories') is distinct from 'array' or jsonb_array_length(p_input->'categories') not between 1 and 12 then raise exception 'Bitte mindestens eine passende Kategorie wählen.' using errcode='22023'; end if;
 if jsonb_typeof(p_input->'activities') is distinct from 'array' or jsonb_array_length(p_input->'activities')>32 then raise exception 'Bitte höchstens 32 belegte Aktivitäten angeben.' using errcode='22023'; end if;
 if p_input->>'checkedAt' is null or (p_publish and (p_input->>'checkedAt')::timestamptz<v_now-interval '30 days') then
  raise exception 'Bitte die aktuellen offiziellen Angaben erneut prüfen.' using errcode='22023'; end if;
 insert into public.event_series_v1(slug,name) values(p_input->>'seriesKey',p_input->>'seriesName') on conflict(slug) do update set name=excluded.name returning id into v_series;
 if v_series is null then select id into strict v_series from public.event_series_v1 where slug=p_input->>'seriesKey'; end if;
 select min((p->>'startDate')::date),max((p->>'endDate')::date) into v_first,v_last from jsonb_array_elements(p_input->'places') p;
 if v_first is null or v_last is null or v_last<v_first or v_last-v_first>90 or extract(year from v_first)::integer<>(p_input->>'year')::integer then
  raise exception 'Die Ausgabe braucht einen gültigen, begrenzten Zeitraum.' using errcode='22023'; end if;
 v_status:=case when p_publish then 'PUBLISHED' else 'DRAFT' end;
 insert into public.events_v1(id,primary_source_id,primary_source_event_id,title,short_description,category,categories,status,is_free,price_min,price_currency,
 source_url,external_url,dedupe_key,provenance,last_seen_at,published_at,organizer,is_recurring,series_id,edition_year,edition_start_date,edition_end_date,admission_note,seasonal_config,created_by,family_friendly,decision_activities)
 values(v_id,'manual_admin',v_id::text,p_input->>'title',p_input->>'description',p_input->'categories'->>0,array(select jsonb_array_elements_text(p_input->'categories')),v_status,null,null,null,
 p_input->>'sourceUrl',p_input->>'sourceUrl','manual:'||v_id::text,jsonb_build_object('source','MANUAL_ADMIN','checkedAt',p_input->>'checkedAt','actorId',v_actor),v_now,
 case when p_publish then v_now else null end,p_input->>'organizer',false,v_series,(p_input->>'year')::integer,v_first,v_last,p_input->>'admissionNote',p_input,v_actor,(p_input->>'familyFriendly')::boolean,array(select jsonb_array_elements_text(p_input->'activities')))
 on conflict(id) do update set provenance=excluded.provenance,category=excluded.category,categories=excluded.categories,family_friendly=excluded.family_friendly,decision_activities=excluded.decision_activities,title=excluded.title,short_description=excluded.short_description,status=excluded.status,source_url=excluded.source_url,external_url=excluded.external_url,
 published_at=case when p_publish then coalesce(events_v1.published_at,v_now) else null end,organizer=excluded.organizer,series_id=excluded.series_id,edition_year=excluded.edition_year,
 edition_start_date=excluded.edition_start_date,edition_end_date=excluded.edition_end_date,admission_note=excluded.admission_note,seasonal_config=excluded.seasonal_config,last_seen_at=v_now,updated_at=v_now;
 for v_place in select * from jsonb_array_elements(p_input->'places') loop
  v_key:=v_place->>'key'; v_from:=(v_place->>'startDate')::date; v_until:=(v_place->>'endDate')::date; v_url:=v_place->>'sourceUrl';
  if v_key is null or v_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or v_key=any(v_keys) or v_from is null or v_until is null or v_until<v_from
   or v_from<v_first or v_until>v_last or length(btrim(v_place->>'name')) not between 1 and 160 or nullif(btrim(v_place->>'address'),'') is null
   or v_place->>'city' is distinct from p_input->>'city' or v_url is null or v_url !~ '^https://[^[:space:]]+$'
   or v_place->>'environment' is null or v_place->>'environment' not in ('INDOOR','OUTDOOR','UNKNOWN')
   or jsonb_typeof(v_place->'hours') is distinct from 'array' or jsonb_array_length(v_place->'hours') not between 1 and 7
   or jsonb_typeof(v_place->'exceptions') is distinct from 'array' or jsonb_array_length(v_place->'exceptions')>92
   or ((v_place->>'latitude') is null)<>((v_place->>'longitude') is null)
  then raise exception 'Bitte Zeitraum, Quelle und Öffnungszeiten jedes Schauplatzes prüfen.' using errcode='22023'; end if;
  for v_exception in select * from jsonb_array_elements(v_place->'exceptions') loop
   if nullif(v_exception->>'date','') is null or (v_exception->>'date')::date<v_from or (v_exception->>'date')::date>v_until then raise exception 'Ein abweichender Tag liegt ausserhalb des Zeitraums.' using errcode='22023'; end if;
  end loop;
  v_keys:=array_append(v_keys,v_key);
  insert into public.event_venues_v1(source_id,source_venue_id,name,normalized_name,address_line,city,country_code,latitude,longitude,last_seen_at)
  values('manual_admin','seasonal:'||v_id::text||':'||v_key,v_place->>'name',lower(v_place->>'name'),v_place->>'address',v_place->>'city','CH',(v_place->>'latitude')::double precision,(v_place->>'longitude')::double precision,v_now)
  on conflict(source_id,source_venue_id) do update set name=excluded.name,address_line=excluded.address_line,city=excluded.city,latitude=excluded.latitude,longitude=excluded.longitude,last_seen_at=v_now returning id into v_venue;
  for v_day in select generate_series(v_from,v_until,interval '1 day')::date loop
   if (select count(*) from jsonb_array_elements(v_place->'exceptions') x where x->>'date'=v_day::text)>1 then raise exception 'Ein Tag hat mehrere Ausnahmen.' using errcode='22023'; end if;
   select x into v_exception from jsonb_array_elements(v_place->'exceptions') x where x->>'date'=v_day::text;
   if coalesce((v_exception->>'closed')::boolean,false) then continue; end if;
   if v_exception is not null then v_open:=(v_exception->>'start')::time; v_close:=(v_exception->>'end')::time;
   else
    if (select count(*) from jsonb_array_elements(v_place->'hours') h where h->'weekdays' @> to_jsonb(extract(isodow from v_day)::integer))<>1 then
     raise exception 'Für jeden Tag muss genau eine Öffnungszeit oder eine Schliessung angegeben sein.' using errcode='22023'; end if;
    select h into v_hour from jsonb_array_elements(v_place->'hours') h where h->'weekdays' @> to_jsonb(extract(isodow from v_day)::integer);
    v_open:=(v_hour->>'start')::time;v_close:=(v_hour->>'end')::time;
   end if;
   if v_open is null or v_close is null or v_close<=v_open then raise exception 'Die Schliesszeit muss nach der Öffnungszeit liegen.' using errcode='22023'; end if;
   v_start:=(v_day+v_open) at time zone 'Europe/Zurich';v_end:=(v_day+v_close) at time zone 'Europe/Zurich';
   v_count:=v_count+1; if v_count>400 then raise exception 'Diese Ausgabe hat zu viele Einzeltermine. Bitte den Zeitraum eingrenzen.' using errcode='22023'; end if;
   v_dedupe:=array_append(v_dedupe,'seasonal:'||v_id::text||':'||v_key||':'||v_day::text);
   insert into public.event_occurrences_v1(event_id,venue_id,start_at,end_at,status,source_url,dedupe_key,last_seen_at,published_at,seasonal_place_key,seasonal_date,place_environment)
   values(v_id,v_venue,v_start,v_end,'SCHEDULED',v_url,v_dedupe[v_count],v_now,case when p_publish then v_now else null end,v_key,v_day,v_place->>'environment')
   on conflict(dedupe_key) do update set venue_id=excluded.venue_id,start_at=case when event_occurrences_v1.is_recurrence_exception then event_occurrences_v1.start_at else excluded.start_at end,
    end_at=case when event_occurrences_v1.is_recurrence_exception then event_occurrences_v1.end_at else excluded.end_at end,
    status=case when event_occurrences_v1.is_recurrence_exception then event_occurrences_v1.status else 'SCHEDULED' end,source_url=excluded.source_url,published_at=case when p_publish then coalesce(event_occurrences_v1.published_at,v_now) else null end,
    place_environment=excluded.place_environment,last_seen_at=v_now,updated_at=v_now;
  end loop;
 end loop;
 -- Keep history and explicit cancellation records; removed days cease to be public.
 update public.event_occurrences_v1 set status='DELETED',published_at=null,updated_at=v_now where event_id=v_id and seasonal_place_key is not null and not(dedupe_key=any(v_dedupe)) and not is_recurrence_exception;
 insert into event_authoring_private.seasonal_audit_v1(event_id,actor_id,previous_status,resulting_status,previous_config,config_hash) values(v_id,v_actor,v_existing.status,v_status,v_existing.seasonal_config,encode(extensions.digest(p_input::text,'sha256'),'hex'));
 return jsonb_build_object('id',v_id,'status',v_status,'places',cardinality(v_keys),'occurrences',v_count,'updatedAt',v_now);
end $$;
revoke all on function public.admin_save_seasonal_edition_v1(jsonb,boolean,timestamptz) from public,anon,service_role;
grant execute on function public.admin_save_seasonal_edition_v1(jsonb,boolean,timestamptz) to authenticated;

create or replace view public.event_discovery_v1 with(security_invoker=true) as
select e.id event_id,o.id occurrence_id,e.primary_source_id source,e.primary_source_event_id source_event_id,
 e.title,e.short_description,e.category,e.categories,e.status event_status,o.status occurrence_status,o.start_at,o.end_at,
 v.id venue_id,v.name venue_name,v.address_line,v.postal_code,v.city,v.country_code,v.latitude,v.longitude,v.matched_spot_id,
 e.is_free,e.price_min,e.price_currency,coalesce(o.source_url,e.source_url) source_url,coalesce(o.ticket_url,e.ticket_url) ticket_url,
 e.image_storage_path,e.image_credit,e.image_rights_verified,e.minimum_age,e.family_friendly,e.organizer,e.external_url,
 e.is_recurring,e.recurrence_rule,e.recurrence_summary,e.manual_address,o.recurrence_index,o.is_recurrence_exception,
 s.name matched_spot_name,s.address matched_spot_address,s.city matched_spot_city,s.header_photo_path matched_spot_photo,
 greatest(e.last_seen_at,o.last_seen_at) last_seen_at,greatest(e.updated_at,o.updated_at) updated_at,
 e.series_id,es.name series_name,e.edition_year,e.edition_start_date,e.edition_end_date,e.admission_note,o.place_environment
from public.events_v1 e join public.event_occurrences_v1 o on o.event_id=e.id
left join public.event_series_v1 es on es.id=e.series_id
left join public.event_venues_v1 v on v.id=o.venue_id left join public.spots s on s.id=v.matched_spot_id
where e.published_at is not null and o.published_at is not null and e.status not in ('DRAFT','DELETED') and o.status<>'DELETED';

-- Regional discovery preserves original localities, manifest validation, actor/release authority and consent.
create or replace function public.backyrd_decision_vnext_product_context_v7(
  p_auth_user_id uuid,p_subject_binding_hash text,p_target_city text,p_primary_intent text,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_events jsonb; v_world jsonb; v_count integer; v_now timestamptz:=clock_timestamp();
  v_localities text[]; v_control jsonb; v_consent public.user_consents%rowtype; v_snapshot jsonb;
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
  v_localities := case when lower(btrim(p_target_city))='basel' then array['Basel','Riehen','Bettingen','Birsfelden','Muttenz','Pratteln','Münchenstein','Arlesheim','Reinach','Bottmingen','Binningen','Allschwil','Oberwil','Therwil']::text[] else array[btrim(p_target_city)] end;
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
              any(select lower(translate(l,'äöüÄÖÜ','aouAOU')) from unnest(v_localities) l)
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
      o.place_environment, o.start_at,o.end_at,e.status event_status,o.status occurrence_status,
      e.published_at,o.published_at occurrence_published_at,greatest(e.updated_at,o.updated_at) updated_at,
      e.is_free,e.price_min,e.price_currency,e.minimum_age,e.family_friendly,
      coalesce(o.source_url,e.source_url) source_url,coalesce(o.ticket_url,e.ticket_url) ticket_url
    from public.events_v1 e
    join public.event_occurrences_v1 o on o.event_id=e.id
    join public.event_discovery_v1 d on d.occurrence_id=o.id
    where e.primary_source_id in ('manual_admin','manual_owner')
      and e.published_at<=v_now and o.published_at<=v_now
      and e.status not in ('DRAFT','DELETED') and o.status<>'DELETED'
      and lower(translate(btrim(d.city),'äöüÄÖÜ','aouAOU'))=any(select lower(translate(l,'äöüÄÖÜ','aouAOU')) from unnest(v_localities) l)
      and o.start_at < v_now + interval '366 days'
      and (o.end_at > v_now or (o.end_at is null and o.start_at >= date_trunc('day',v_now at time zone 'Europe/Zurich') at time zone 'Europe/Zurich'))
    order by o.start_at,o.id limit 501
  )
  select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'placeEnvironment',place_environment,'activities',decision_activities,'tags',decision_tags,'ticketStatus',ticket_status,'imageStoragePath',image_storage_path,
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
      'authorizedCity',btrim(p_target_city),'authorizedLocalities',to_jsonb(v_localities),'serverTime',v_now,'worldSnapshots',v_world,'eventOccurrences',v_events,
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
    'authorizedCity',btrim(p_target_city),'authorizedLocalities',to_jsonb(v_localities),'serverTime',v_now,'worldSnapshots',v_world,'eventOccurrences',v_events,
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
