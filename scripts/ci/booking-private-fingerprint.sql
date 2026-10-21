-- Read-only, coherent catalog + migration-ledger observation. No guest rows.
begin isolation level repeatable read read only;
set local statement_timeout='15s';
set local search_path=pg_catalog,public;
set local backyrd.fingerprint_scope='booking-private-v1';
do $$ begin
 if not exists(select 1 from pg_namespace where nspname='booking_private') then
  raise exception 'booking_private_schema_missing';
 end if;
end $$;
select 'LEDGER',count(*),encode(extensions.digest(convert_to(string_agg(version,E'\n' order by version)||E'\n','UTF8'),'sha256'),'hex')
 from supabase_migrations.schema_migrations where version<>all(:'historical_versions'::text[]);
\ir application-schema-fingerprint.sql
rollback;
