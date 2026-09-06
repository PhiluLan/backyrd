-- Manual Admin authoring for Events V1. No Decision/Gate contracts are touched.

alter table public.event_sources_v1 drop constraint event_sources_v1_rights_status_check;
alter table public.event_sources_v1 add constraint event_sources_v1_rights_status_check
  check (rights_status in ('PUBLIC_API_TERMS','OPEN_DATA_LICENSE','CONTRACT_PENDING','MANUAL_ADMIN'));

insert into public.event_sources_v1(id,display_name,adapter_kind,ingestion_enabled,rights_status,image_ingestion_allowed,requires_image_credit,source_url,configuration)
values ('manual_admin','Backyrd Admin','API',false,'MANUAL_ADMIN',true,false,'https://backyrd.com/events','{"no_external_ingest":true}'::jsonb)
on conflict (id) do nothing;

alter table public.events_v1 drop constraint events_v1_status_check;
alter table public.events_v1 drop constraint events_v1_category_check;
alter table public.events_v1 add constraint events_v1_category_check check (category in (
  'MUSIC','NIGHTLIFE','ART','THEATRE','FILM','FOOD_DRINK','FAMILY','SPORT','ACTIVITY','LEISURE','MARKET','WORKSHOP','COMMUNITY','OTHER'));
alter table public.events_v1 add constraint events_v1_status_check
  check (status in ('DRAFT','PUBLISHED','SCHEDULED','POSTPONED','CANCELLED','ENDED','DELETED'));
alter table public.event_occurrences_v1 drop constraint event_occurrences_v1_status_check;
alter table public.event_occurrences_v1 add constraint event_occurrences_v1_status_check
  check (status in ('SCHEDULED','POSTPONED','CANCELLED','ENDED','DELETED'));

alter table public.events_v1
  add column categories text[] not null default array['OTHER']::text[],
  add column minimum_age smallint check (minimum_age between 0 and 99),
  add column family_friendly boolean,
  add column organizer text,
  add column external_url text,
  add column is_recurring boolean not null default false,
  add column recurrence_rule jsonb,
  add column recurrence_summary text,
  add column manual_address text,
  add column primary_venue_id uuid references public.event_venues_v1(id) on delete set null,
  add column created_by uuid references auth.users(id) on delete set null;

alter table public.events_v1 add constraint events_v1_categories_check check (
  cardinality(categories) between 1 and 12 and categories <@ array[
    'MUSIC','NIGHTLIFE','ART','THEATRE','FILM','FOOD_DRINK','FAMILY','SPORT',
    'ACTIVITY','LEISURE','MARKET','WORKSHOP','COMMUNITY','OTHER'
  ]::text[]
);

alter table public.event_occurrences_v1
  add column recurrence_index integer,
  add column original_start_at timestamptz,
  add column is_recurrence_exception boolean not null default false,
  add column exception_note text;

create unique index event_occurrences_v1_recurrence_unique
  on public.event_occurrences_v1(event_id, recurrence_index)
  where recurrence_index is not null and not is_recurrence_exception;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('event-images','event-images',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy event_images_admin_insert on storage.objects for insert to authenticated
with check (bucket_id='event-images' and public.admin_is_admin_v1());
create policy event_images_admin_update on storage.objects for update to authenticated
using (bucket_id='event-images' and public.admin_is_admin_v1())
with check (bucket_id='event-images' and public.admin_is_admin_v1());
create policy event_images_admin_delete on storage.objects for delete to authenticated
using (bucket_id='event-images' and public.admin_is_admin_v1());

create policy events_v1_admin_all on public.events_v1 for all to authenticated
using (public.admin_is_admin_v1()) with check (public.admin_is_admin_v1());
create policy event_occurrences_v1_admin_all on public.event_occurrences_v1 for all to authenticated
using (public.admin_is_admin_v1()) with check (public.admin_is_admin_v1());
create policy event_venues_v1_admin_all on public.event_venues_v1 for all to authenticated
using (public.admin_is_admin_v1()) with check (public.admin_is_admin_v1());

grant insert,update,delete on public.events_v1,public.event_occurrences_v1,public.event_venues_v1 to authenticated;
grant select on public.events_v1,public.event_occurrences_v1,public.event_venues_v1 to authenticated;
grant select(categories,minimum_age,family_friendly,organizer,external_url,is_recurring,recurrence_rule,recurrence_summary,manual_address,primary_venue_id)
  on public.events_v1 to anon;
grant select(recurrence_index,original_start_at,is_recurrence_exception,exception_note)
  on public.event_occurrences_v1 to anon;

create or replace function public.regenerate_manual_event_occurrences_v1(p_event_id uuid)
returns integer language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  v_event public.events_v1%rowtype;
  v_frequency text;
  v_interval integer;
  v_until date;
  v_count integer;
  v_date date;
  v_start_time time;
  v_end_time time;
  v_start timestamptz;
  v_end timestamptz;
  v_created integer:=0;
  v_weekdays integer[];
begin
  select * into v_event from public.events_v1 where id=p_event_id and primary_source_id='manual_admin';
  if not found then raise exception 'manual_event_not_found'; end if;
  v_frequency:=coalesce(v_event.recurrence_rule->>'frequency','ONCE');
  v_interval:=greatest(1,coalesce((v_event.recurrence_rule->>'interval')::integer,1));
  v_until:=nullif(v_event.recurrence_rule->>'until','')::date;
  v_count:=least(500,coalesce((v_event.recurrence_rule->>'count')::integer,500));
  v_date:=(v_event.recurrence_rule->>'startDate')::date;
  v_start_time:=(v_event.recurrence_rule->>'startTime')::time;
  v_end_time:=(v_event.recurrence_rule->>'endTime')::time;
  select coalesce(array_agg(value::integer),array[]::integer[]) into v_weekdays
    from jsonb_array_elements_text(coalesce(v_event.recurrence_rule->'weekdays','[]'::jsonb));

  delete from public.event_occurrences_v1
   where event_id=p_event_id and recurrence_index is not null and not is_recurrence_exception;

  while v_created < v_count and (v_until is null or v_date<=v_until) loop
    if v_frequency='ONCE'
       or v_frequency='DAILY'
       or (v_frequency='WEEKLY' and extract(isodow from v_date)::integer=any(v_weekdays)
           and ((v_date-(v_event.recurrence_rule->>'startDate')::date)/7)%v_interval=0)
       or (v_frequency='MONTHLY' and extract(day from v_date)=extract(day from (v_event.recurrence_rule->>'startDate')::date)
           and ((extract(year from v_date)::integer*12+extract(month from v_date)::integer
             -extract(year from (v_event.recurrence_rule->>'startDate')::date)::integer*12
             -extract(month from (v_event.recurrence_rule->>'startDate')::date)::integer)%v_interval=0)) then
      v_start:=(v_date+v_start_time) at time zone 'Europe/Zurich';
      v_end:=((case when v_end_time<v_start_time then v_date+1 else v_date end)+v_end_time) at time zone 'Europe/Zurich';
      insert into public.event_occurrences_v1(event_id,venue_id,start_at,end_at,status,source_url,ticket_url,dedupe_key,last_seen_at,published_at,recurrence_index,original_start_at)
      select v_event.id,v.id,v_start,v_end,case when v_event.status='CANCELLED' then 'CANCELLED' else 'SCHEDULED' end,
        coalesce(v_event.external_url,v_event.source_url),null,md5(v_event.id::text||':'||v_start::text),now(),
        case when v_event.status in ('PUBLISHED','SCHEDULED','CANCELLED') then now() else null end,v_created,v_start
      from public.event_venues_v1 v where v.id=v_event.primary_venue_id
      on conflict (dedupe_key) do nothing;
      if not found then
        insert into public.event_occurrences_v1(event_id,start_at,end_at,status,source_url,dedupe_key,last_seen_at,published_at,recurrence_index,original_start_at)
        values(v_event.id,v_start,v_end,case when v_event.status='CANCELLED' then 'CANCELLED' else 'SCHEDULED' end,
          coalesce(v_event.external_url,v_event.source_url),md5(v_event.id::text||':'||v_start::text),now(),
          case when v_event.status in ('PUBLISHED','SCHEDULED','CANCELLED') then now() else null end,v_created,v_start)
        on conflict (dedupe_key) do nothing;
      end if;
      v_created:=v_created+1;
      if v_frequency='ONCE' then exit; end if;
    end if;
    v_date:=v_date+1;
    if v_until is null and v_date>(v_event.recurrence_rule->>'startDate')::date+interval '5 years' then exit; end if;
  end loop;
  return v_created;
end $$;

revoke all on function public.regenerate_manual_event_occurrences_v1(uuid) from public,anon;
grant execute on function public.regenerate_manual_event_occurrences_v1(uuid) to authenticated,service_role;

drop view public.event_discovery_v1;
create view public.event_discovery_v1 with(security_invoker=true) as
select e.id event_id,o.id occurrence_id,e.primary_source_id source,e.primary_source_event_id source_event_id,
 e.title,e.short_description,e.category,e.categories,e.status event_status,o.status occurrence_status,o.start_at,o.end_at,
 v.id venue_id,v.name venue_name,v.address_line,v.postal_code,v.city,v.country_code,v.latitude,v.longitude,v.matched_spot_id,
 e.is_free,e.price_min,e.price_currency,coalesce(o.source_url,e.source_url) source_url,coalesce(o.ticket_url,e.ticket_url) ticket_url,
 e.image_storage_path,e.image_credit,e.image_rights_verified,e.minimum_age,e.family_friendly,e.organizer,e.external_url,
 e.is_recurring,e.recurrence_rule,e.recurrence_summary,e.manual_address,o.recurrence_index,o.is_recurrence_exception,
 s.name matched_spot_name,s.address matched_spot_address,s.city matched_spot_city,s.header_photo_path matched_spot_photo,
 greatest(e.last_seen_at,o.last_seen_at) last_seen_at,greatest(e.updated_at,o.updated_at) updated_at
from public.events_v1 e join public.event_occurrences_v1 o on o.event_id=e.id
left join public.event_venues_v1 v on v.id=o.venue_id left join public.spots s on s.id=v.matched_spot_id
where e.published_at is not null and o.published_at is not null and e.status not in ('DRAFT','DELETED') and o.status<>'DELETED';
revoke all on public.event_discovery_v1 from public,anon,authenticated;
grant select on public.event_discovery_v1 to anon,authenticated;
