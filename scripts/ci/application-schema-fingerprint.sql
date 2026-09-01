-- Stable semantic structural fingerprint for Backyrd-owned application schemas.
-- Managed provider schemas and extension-owned objects are intentionally
-- excluded. Effective client grants and default privileges remain included.
-- Physical attribute numbers are excluded because PostgreSQL retains invisible
-- attnum holes after DROP COLUMN. Function CRLFs and the six forensically
-- certified historical comment-only deltas are normalized before hashing.
with application_schemas(schema_name) as (
  values ('public'), ('decision_lab')
), client_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
), table_privileges(privilege_name) as (
  values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
), sequence_privileges(privilege_name) as (
  values ('USAGE'),('SELECT'),('UPDATE')
), normalized_functions(identity, owner_name, definition) as (
  select
    p.oid::regprocedure::text,
    pg_get_userbyid(p.proowner),
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(pg_get_functiondef(p.oid), E'\r\n', E'\n'),
                  E'\r', E'\n'
                ),
                E'-- optional: very lightweight text scoring (keeps it deterministic & cheap)\n', ''
              ),
              E'-- token counts per spot, then mapped to clusters via mood_token_clusters\n', ''
            ),
            E'-- filter to selected clusters (primary moods) if provided\n', ''
          ),
          E'-- ✅ PATCH: deterministic ordering by strength\n', ''
        ),
        E'-- factual evidence per ranked spot: top mood tokens (true from agg)\n', ''
      ),
      E'-- ✅ correct counts from reviews (one per review per mood)\n', ''
    )
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join application_schemas s on s.schema_name=n.nspname
   where p.prokind in ('f','p')
     and not exists (
       select 1 from pg_depend d
        where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
     )
), entries(entry) as (
  select format('SCHEMA|%I|owner=%I', n.nspname, pg_get_userbyid(n.nspowner))
    from pg_namespace n join application_schemas s on s.schema_name=n.nspname

  union all
  select format(
    'RELATION|%I.%I|kind=%s|owner=%I|rls=%s|force_rls=%s|options=%s',
    n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,
    coalesce(array_to_string(c.reloptions,','),'')
  )
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join application_schemas s on s.schema_name=n.nspname
   where c.relkind in ('r','p','v','m','S','f')
     and not exists (
       select 1 from pg_depend d
        where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e'
     )

  union all
  select format(
    'COLUMN|%I.%I|%I|type=%s|not_null=%s|identity=%s|generated=%s|collation=%s|default=%s',
    n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
    a.attidentity,a.attgenerated,coalesce(coll.collname,''),coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')
  )
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    join application_schemas s on s.schema_name=n.nspname
    left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
    left join pg_collation coll on coll.oid=a.attcollation and a.attcollation<>0
   where a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m','f')
     and not exists (
       select 1 from pg_depend d
        where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e'
     )

  union all
  select format('CONSTRAINT|%I.%I|%I|type=%s|%s',n.nspname,c.relname,con.conname,con.contype,pg_get_constraintdef(con.oid,true))
    from pg_constraint con join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    join application_schemas s on s.schema_name=n.nspname

  union all
  select format('INDEX|%I.%I|%s',n.nspname,c.relname,pg_get_indexdef(c.oid))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join application_schemas s on s.schema_name=n.nspname
   where c.relkind='i'
     and not exists (
       select 1 from pg_depend d
        where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e'
     )

  union all
  select format('VIEW|%I.%I|%s',n.nspname,c.relname,pg_get_viewdef(c.oid,true))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join application_schemas s on s.schema_name=n.nspname
   where c.relkind in ('v','m')

  union all
  select format('FUNCTION|%s|owner=%I|%s',identity,owner_name,definition)
    from normalized_functions

  union all
  select format('TRIGGER|%I.%I|%I|%s',n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid,true))
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join application_schemas s on s.schema_name=n.nspname
   where not t.tgisinternal

  union all
  select format(
    'POLICY|%I.%I|%I|permissive=%s|roles=%s|command=%s|using=%s|check=%s',
    n.nspname,c.relname,pol.polname,pol.polpermissive,
    coalesce((select string_agg(coalesce(r.rolname,'PUBLIC'),',' order by coalesce(r.rolname,'PUBLIC'))
                from unnest(pol.polroles) role_oid left join pg_roles r on r.oid=role_oid),''),
    pol.polcmd,coalesce(pg_get_expr(pol.polqual,pol.polrelid),''),coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'')
  )
    from pg_policy pol join pg_class c on c.oid=pol.polrelid
    join pg_namespace n on n.oid=c.relnamespace
    join application_schemas s on s.schema_name=n.nspname

  union all
  select format(
    'SEQUENCE|%I.%I|type=%s|start=%s|min=%s|max=%s|increment=%s|cycle=%s|cache=%s',
    n.nspname,c.relname,format_type(seq.seqtypid,null),seq.seqstart,seq.seqmin,seq.seqmax,seq.seqincrement,seq.seqcycle,seq.seqcache
  )
    from pg_sequence seq join pg_class c on c.oid=seq.seqrelid
    join pg_namespace n on n.oid=c.relnamespace
    join application_schemas s on s.schema_name=n.nspname

  union all
  select format(
    'TYPE|%I.%I|kind=%s|owner=%I|base=%s|not_null=%s|default=%s',
    n.nspname,t.typname,t.typtype,pg_get_userbyid(t.typowner),
    case when t.typbasetype=0 then '' else format_type(t.typbasetype,t.typtypmod) end,
    t.typnotnull,coalesce(t.typdefault,'')
  )
    from pg_type t join pg_namespace n on n.oid=t.typnamespace
    join application_schemas s on s.schema_name=n.nspname
   where t.typtype in ('d','e')
     and not exists (
       select 1 from pg_depend d
        where d.classid='pg_type'::regclass and d.objid=t.oid and d.deptype='e'
     )

  union all
  select format('ENUM|%I.%I|sort=%s|label=%s',n.nspname,t.typname,e.enumsortorder,e.enumlabel)
    from pg_enum e join pg_type t on t.oid=e.enumtypid
    join pg_namespace n on n.oid=t.typnamespace
    join application_schemas s on s.schema_name=n.nspname

  union all
  select format('EXTENSION|%I',ext.extname)
    from pg_extension ext
   where ext.extname in ('citext','pg_cron','pg_graphql','pg_net','pg_stat_statements','pg_trgm','pgcrypto','postgis','supabase_vault','unaccent','uuid-ossp','vector')

  union all
  select format('FUNCTION_GRANT|%s|%s|EXECUTE',p.oid::regprocedure::text,r.role_name)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join application_schemas s on s.schema_name=n.nspname cross join client_roles r
   where p.prokind in ('f','p') and has_function_privilege(r.role_name,p.oid,'EXECUTE')
     and not exists (
       select 1 from pg_depend d
        where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
     )

  union all
  select format('TABLE_GRANT|%I.%I|%s|%s',n.nspname,c.relname,r.role_name,v.privilege_name)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join application_schemas s on s.schema_name=n.nspname cross join client_roles r cross join table_privileges v
   where c.relkind in ('r','p','v','m','f') and has_table_privilege(r.role_name,c.oid,v.privilege_name)

  union all
  select format('SEQUENCE_GRANT|%I.%I|%s|%s',n.nspname,c.relname,r.role_name,v.privilege_name)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join application_schemas s on s.schema_name=n.nspname cross join client_roles r cross join sequence_privileges v
   where c.relkind='S' and has_sequence_privilege(r.role_name,c.oid,v.privilege_name)

  union all
  select format('SCHEMA_GRANT|%I|%s|USAGE',n.nspname,r.role_name)
    from pg_namespace n join application_schemas s on s.schema_name=n.nspname cross join client_roles r
   where has_schema_privilege(r.role_name,n.oid,'USAGE')

  union all
  select format(
    'DEFAULT_ACL|owner=%I|schema=%s|type=%s|grantee=%s|grantor=%I|privilege=%s|grantable=%s',
    owner.rolname,coalesce(n.nspname,''),d.defaclobjtype,coalesce(grantee.rolname,'PUBLIC'),grantor.rolname,
    acl.privilege_type,acl.is_grantable
  )
    from pg_default_acl d join pg_roles owner on owner.oid=d.defaclrole
    left join pg_namespace n on n.oid=d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) acl
    join pg_roles grantor on grantor.oid=acl.grantor
    left join pg_roles grantee on grantee.oid=acl.grantee
   where n.nspname in (select schema_name from application_schemas) or d.defaclnamespace=0
)
select count(*)::bigint as entry_count,
       encode(extensions.digest(convert_to(string_agg(entry,E'\n' order by entry)||E'\n','UTF8'),'sha256'),'hex') as fingerprint
  from entries;
