-- Read only: snapshot application hooks and Storage policies that the provider
-- schema exclusion would otherwise omit. Cron/jobs and webhook targets are not enabled.
-- A single catalog SELECT gives one statement snapshot through the Management API.
with rules(ordinal,identity,ddl) as (
 select 10,n.nspname||'.'||c.relname||'.'||t.tgname,
 format('drop trigger if exists %I on %I.%I;%s%s;%salter table %I.%I %s trigger %I;',t.tgname,n.nspname,c.relname,E'\n',pg_get_triggerdef(t.oid,true),E'\n',n.nspname,c.relname,case t.tgenabled when 'D' then 'disable' when 'R' then 'enable replica' when 'A' then 'enable always' else 'enable' end,t.tgname)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 join pg_proc f on f.oid=t.tgfoid join pg_namespace fn on fn.oid=f.pronamespace
 where not t.tgisinternal and n.nspname='auth' and (fn.nspname in ('public','decision_lab') or fn.nspname like '%\_private' escape '\')
 union all
 select 20,n.nspname||'.'||c.relname,format('alter table %I.%I %s row level security;%salter table %I.%I %s row level security;',n.nspname,c.relname,case when c.relrowsecurity then 'enable' else 'disable' end,E'\n',n.nspname,c.relname,case when c.relforcerowsecurity then 'force' else 'no force' end)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname in ('objects','buckets')
 union all
 select 30,n.nspname||'.'||c.relname||'.'||p.polname,
 format('drop policy if exists %I on %I.%I;%screate policy %I on %I.%I as %s for %s to %s%s%s;',p.polname,n.nspname,c.relname,E'\n',p.polname,n.nspname,c.relname,case when p.polpermissive then 'permissive' else 'restrictive' end,case p.polcmd when '*' then 'all' when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' end,
 (select string_agg(case when x=0 then 'PUBLIC' else quote_ident(r.rolname) end,',' order by coalesce(r.rolname,'PUBLIC')) from unnest(p.polroles) x left join pg_roles r on r.oid=x),
 case when p.polqual is null then '' else ' using ('||pg_get_expr(p.polqual,p.polrelid)||')' end,
 case when p.polwithcheck is null then '' else ' with check ('||pg_get_expr(p.polwithcheck,p.polrelid)||')' end)
 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage'
 union all
 select 40,schemaname||'.'||tablename,format('do $recovery$ begin if not exists(select 1 from pg_publication_tables where pubname=''supabase_realtime'' and schemaname=%L and tablename=%L) then alter publication supabase_realtime add table %I.%I; end if; end $recovery$;',schemaname,tablename,schemaname,tablename)
 from pg_publication_tables where pubname='supabase_realtime'
)
select jsonb_build_object('version','backyrd-managed-recovery-controls-v1',
 'bookingTables',coalesce((select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='booking_private' and c.relkind='r'),'[]'::jsonb),
 'safeStorageRls',(select count(*)=2 and bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname in ('objects','buckets')),
 'ruleCount',count(*),'sql','set local search_path=pg_catalog,public;'||E'\n'||string_agg(ddl,E'\n' order by ordinal,identity)) as managed_backup from rules;
