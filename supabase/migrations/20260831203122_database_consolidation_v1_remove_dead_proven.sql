-- Database Consolidation v1.
--
-- `audit` was created by scripts/supabase_inventory_and_archive.sql as a
-- point-in-time engineering inventory. It is not an application audit trail.
-- `drizzle` is an orphaned, one-row migration ledger; Supabase migrations are
-- Backyrd's only canonical migration mechanism.
--
-- The preconditions deliberately fail closed if either schema changed after
-- the read-only Production proof. Drops use RESTRICT (the PostgreSQL default),
-- so an unexpected dependency also prevents removal.

do $consolidation$
declare
  v_unexpected text;
begin
  if to_regnamespace('audit') is not null then
    select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by c.relname)
      into v_unexpected
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'audit'
       and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
       and c.relname not in ('app_schemas', 'inventory_columns', 'inventory_tables');

    if v_unexpected is not null then
      raise exception 'database_consolidation_audit_schema_changed:%', v_unexpected
        using errcode = '55000';
    end if;

    if (select count(*) from audit.app_schemas) <> 6
       or (select count(*) from audit.inventory_tables) <> 86
       or (select count(*) from audit.inventory_columns) <> 648 then
      raise exception 'database_consolidation_audit_snapshot_changed'
        using errcode = '55000';
    end if;
  end if;

  if to_regnamespace('drizzle') is not null then
    select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by c.relname)
      into v_unexpected
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'drizzle'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and c.relname <> '__drizzle_migrations';

    if v_unexpected is not null then
      raise exception 'database_consolidation_drizzle_schema_changed:%', v_unexpected
        using errcode = '55000';
    end if;

    if not exists (
      select 1
        from drizzle.__drizzle_migrations
       group by id, hash, created_at
      having count(*) = 1
         and id = 1
         and hash = '023e1333b03cc736686bb6f9cbe8251fab068816d2b7acf3138a39f4239dd770'
         and created_at = 1758530467381
    ) or (select count(*) from drizzle.__drizzle_migrations) <> 1 then
      raise exception 'database_consolidation_drizzle_ledger_changed'
        using errcode = '55000';
    end if;
  end if;
end
$consolidation$;

drop table if exists audit.inventory_columns;
drop table if exists audit.inventory_tables;
drop table if exists audit.app_schemas;
drop schema if exists audit;

drop table if exists drizzle.__drizzle_migrations;
drop schema if exists drizzle;
