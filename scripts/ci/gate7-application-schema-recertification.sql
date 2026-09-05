\set ON_ERROR_STOP on

select
  (select count(*) = 7 from information_schema.columns
    where table_schema='public' and table_name='backyrd_launch_cost_counters_v1')
  and exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='backyrd_launch_cost_counters_v1'
      and c.relrowsecurity)
  and exists (select 1 from pg_constraint
    where conrelid='public.backyrd_launch_cost_counters_v1'::regclass
      and contype='p' and pg_get_constraintdef(oid)='PRIMARY KEY (operation, scope, bucket_key)')
  and exists (select 1 from pg_constraint
    where conrelid='public.backyrd_launch_cost_counters_v1'::regclass
      and contype='c' and pg_get_constraintdef(oid) like '%subject_minute%global_day%')
  and (select count(*) = 3 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('backyrd_consume_launch_cost_boundary_v1','backyrd_has_claimable_embedding_job_v1','backyrd_launch_operations_snapshot_v1')
      and p.prosecdef)
  and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='backyrd_consume_launch_cost_boundary_v1'
      and p.proconfig @> array['search_path=public, pg_catalog'])
  and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='backyrd_has_claimable_embedding_job_v1'
      and p.proconfig @> array['search_path=public, pg_catalog'])
  and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='backyrd_launch_operations_snapshot_v1'
      and p.proconfig @> array['search_path=public, pg_catalog, storage, cron'])
  as gate7_schema_is_exact
\gset
\if :gate7_schema_is_exact
  \echo 'Gate 7 operational schema and SECURITY DEFINER structure passed.'
\else
  select 1/0;
\endif

begin;
drop function public.backyrd_launch_operations_snapshot_v1();
drop function public.backyrd_has_claimable_embedding_job_v1();
drop function public.backyrd_consume_launch_cost_boundary_v1(text,text,integer,integer,integer,integer);
drop table public.backyrd_launch_cost_counters_v1;
\echo 'Gate 7 reconstructed prior application schema fingerprint follows:'
\ir application-schema-fingerprint.sql
rollback;
