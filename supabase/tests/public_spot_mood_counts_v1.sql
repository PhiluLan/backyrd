\set ON_ERROR_STOP on
begin;
-- Synthetic fixtures only; the full Product schema and migration must already be installed.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','88000000-0000-4000-8000-000000000090','authenticated','authenticated','mood-count@test.invalid','','{}','{}',now(),now());
insert into public.profiles(id) values('88000000-0000-4000-8000-000000000090') on conflict do nothing;
insert into public.spots(id,status,data_origin,name,lat,lng) values
 ('88000000-0000-4000-8000-000000000001','approved','REAL','Mood count fixture',47.55,7.59),
 ('88000000-0000-4000-8000-000000000002','approved','REAL','Mood count fixture',47.55,7.59),
 ('88000000-0000-4000-8000-000000000003','pending','REAL','Mood pending fixture',47.55,7.59),
 ('88000000-0000-4000-8000-000000000004','approved','FIXTURE','Mood non-product fixture',47.55,7.59),
 ('88000000-0000-4000-8000-000000000005','approved','REAL','Mood count fixture',47.55,7.59);
insert into public.reviews(id,spot_id,data_origin,user_id,text,mood_a,mood_b,created_at)
select ('88000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '88000000-0000-4000-8000-000000000001',case i when 16 then 'TEST' when 17 then 'FIXTURE' else 'REAL' end,'88000000-0000-4000-8000-000000000090','Synthetic count test',
 case when i in (19,21) then case when i=21 then 'mein-unbekannter-testmood' else null end else 'gemütlich' end,
 case when i=11 then 'urban' when i=20 then 'gemütlich' else null end,
 now()-make_interval(days=>i)
from generate_series(11,23) i;
-- Fixture provenance is a privileged internal write; Product clients cannot forge it.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
update public.reviews set data_origin=case right(id::text,2) when '16' then 'TEST' else 'FIXTURE' end
where id in ('88000000-0000-4000-8000-000000000016','88000000-0000-4000-8000-000000000017');
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.role','',true);
-- Synthetic moderation fixtures use the real canonical consumer eligibility functions.
insert into public.safety_content_items(content_type,entity_type,entity_id,lifecycle_status) values
 ('review','review','88000000-0000-4000-8000-000000000013','hidden'),
 ('review','review','88000000-0000-4000-8000-000000000014','removed'),
 ('review','review','88000000-0000-4000-8000-000000000015','deleted'),
 ('review','review','88000000-0000-4000-8000-000000000022','hidden')
on conflict (content_type,entity_type,entity_id) do update set lifecycle_status=excluded.lifecycle_status;
insert into public.safety_content_items(id,content_type,entity_type,entity_id) values
 ('88000000-0000-4000-8000-000000000051','spot_profile','spot','88000000-0000-4000-8000-000000000005'),
 ('88000000-0000-4000-8000-000000000052','review','review','88000000-0000-4000-8000-000000000018')
on conflict (content_type,entity_type,entity_id) do nothing;
insert into public.distribution_trust_states(content_item_id,engine_version,automatic_state,effective_state,evaluation_source)
select i.id,v.version,'quarantined','quarantined','automatic'
from public.safety_content_items i cross join public.distribution_trust_engine_versions v
where v.status='active' and (i.entity_type,i.entity_id) in (
 ('spot','88000000-0000-4000-8000-000000000005'::uuid),('review','88000000-0000-4000-8000-000000000018'::uuid))
on conflict (content_item_id) do update set automatic_state='quarantined',effective_state='quarantined';
-- backyrd:authorization-positive
set role anon;
do $$ declare n bigint; k int; begin
 select mood_count into n from public.backyrd_public_spot_mood_counts_v1(array['88000000-0000-4000-8000-000000000001']::uuid[]);
 if n is distinct from 5::bigint then raise exception 'published Mood count: %',n; end if;
 select mood_count into n from public.backyrd_public_spot_mood_counts_v1(array['88000000-0000-4000-8000-000000000002']::uuid[]);
 if n is distinct from 0::bigint then raise exception 'empty spot count: %',n; end if;
-- backyrd:authorization-negative
 select count(*) into k from public.backyrd_public_spot_mood_counts_v1(array['88000000-0000-4000-8000-000000000003','88000000-0000-4000-8000-000000000004','88000000-0000-4000-8000-000000000005','88000000-0000-4000-8000-000000000099']::uuid[]);
 if k<>0 then raise exception 'ineligible spot exposed'; end if;
 select count(*) into k from public.backyrd_public_spot_mood_counts_v1(null);
 if k<>0 then raise exception 'null became unbounded read'; end if;
 begin
  perform * from public.backyrd_public_spot_mood_counts_v1(array_fill('88000000-0000-4000-8000-000000000001'::uuid,array[201]));
  raise exception 'batch limit missing';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
set role authenticated;
do $$ declare n bigint; begin
 select mood_count into n from public.backyrd_public_spot_mood_counts_v1(array['88000000-0000-4000-8000-000000000001']::uuid[]);
 if n is distinct from 5::bigint then raise exception 'authenticated Mood count wrong'; end if;
end $$;
reset role;
select 'public Mood count full-schema acceptance: PASS';
rollback;
