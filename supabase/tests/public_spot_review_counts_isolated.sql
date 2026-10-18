-- Standalone synthetic harness. Run ONLY in an empty, disposable database.
-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/public_spot_review_counts_isolated.sql.
create table public.spots (id uuid primary key, status text, data_origin text);
create table public.reviews (id uuid primary key, spot_id uuid, data_origin text);
create table public.safety_content_items(entity_type text,entity_id uuid,lifecycle_status text);
create table public.test_distribution_denied(entity_type text,entity_id uuid);
create function public.distribution_trust_entity_is_eligible_v1(kind text, entity uuid, surface text)
returns boolean language sql stable as $$
 select surface=case when kind='spot' then 'discovery' when kind='review' then 'feed' else '' end
 and not exists(select 1 from public.test_distribution_denied where entity_type=kind and entity_id=entity)
$$;
\ir ../migrations/20261018162100_public_spot_review_counts_v1.sql
insert into public.spots values
 ('00000000-0000-0000-0000-000000000001','approved','REAL'),
 ('00000000-0000-0000-0000-000000000002','approved','REAL'),
 ('00000000-0000-0000-0000-000000000003','pending','REAL'),
 ('00000000-0000-0000-0000-000000000004','approved','FIXTURE'),
 ('00000000-0000-0000-0000-000000000005','approved','REAL');
insert into public.test_distribution_denied values ('spot','00000000-0000-0000-0000-000000000005'),('review','00000000-0000-0000-0000-000000000018');
insert into public.reviews
select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000001',case i when 16 then 'TEST' when 17 then 'FIXTURE' else 'REAL' end
from generate_series(11,18) i;
insert into public.safety_content_items values
 ('review','00000000-0000-0000-0000-000000000013','hidden'),
 ('review','00000000-0000-0000-0000-000000000014','removed'),
 ('review','00000000-0000-0000-0000-000000000015','deleted');
set role anon;
do $$ declare n bigint; k int; begin
 select review_count into n from public.backyrd_public_spot_review_counts_v1(array['00000000-0000-0000-0000-000000000001']::uuid[]);
 if n is distinct from 2::bigint then raise exception 'visible review count: %',n; end if;
 select review_count into n from public.backyrd_public_spot_review_counts_v1(array['00000000-0000-0000-0000-000000000002']::uuid[]);
 if n is distinct from 0::bigint then raise exception 'empty spot count: %',n; end if;
 select count(*) into k from public.backyrd_public_spot_review_counts_v1(array['00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000099']::uuid[]);
 if k<>0 then raise exception 'ineligible spot exposed'; end if;
 select count(*) into k from public.backyrd_public_spot_review_counts_v1(null);
 if k<>0 then raise exception 'null became unbounded read'; end if;
 begin
  perform * from public.backyrd_public_spot_review_counts_v1(array_fill('00000000-0000-0000-0000-000000000001'::uuid,array[201]));
  raise exception 'batch limit missing';
 exception when invalid_parameter_value then null; end;
 begin perform * from public.reviews; raise exception 'review identities exposed'; exception when insufficient_privilege then null; end;
 begin insert into public.reviews values('00000000-0000-0000-0000-000000000099',null,'REAL'); raise exception 'write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
do $$ declare n bigint; begin
 select review_count into n from public.backyrd_public_spot_review_counts_v1(array['00000000-0000-0000-0000-000000000001']::uuid[]);
 if n is distinct from 2::bigint then raise exception 'authenticated count wrong'; end if;
end $$;
reset role;
select 'public review count synthetic isolation: PASS';
