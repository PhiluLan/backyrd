\set ON_ERROR_STOP on

begin transaction read only;

do $$
declare
  fk record;
  orphan_count bigint;
begin
  for fk in
    select
      c.conname,
      c.conrelid::regclass child_table,
      c.confrelid::regclass parent_table,
      string_agg(format('child.%I = parent.%I',ca.attname,pa.attname),' and ' order by key.ordinality) join_sql,
      string_agg(format('child.%I is not null',ca.attname),' and ' order by key.ordinality) nonnull_sql,
      min(pa.attname) first_parent_column
    from pg_constraint c
    cross join lateral unnest(c.conkey,c.confkey) with ordinality key(child_attnum,parent_attnum,ordinality)
    join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=key.child_attnum
    join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=key.parent_attnum
    join pg_namespace n on n.oid=c.connamespace
    where c.contype='f' and n.nspname='public'
    group by c.oid,c.conname,c.conrelid,c.confrelid
  loop
    execute format(
      'select count(*) from %s child left join %s parent on %s where %s and parent.%I is null',
      fk.child_table,fk.parent_table,fk.join_sql,fk.nonnull_sql,fk.first_parent_column
    ) into orphan_count;
    if orphan_count<>0 then
      raise exception 'foreign_key_orphans: % = %',fk.conname,orphan_count;
    end if;
  end loop;
end;
$$;

do $$
begin
  if (select count(*) from public.backyrd_spot_intelligence_dimensions_v1)<>60 then
    raise exception 'n4_dimension_count_mismatch';
  end if;
  if exists(select field_key from public.backyrd_spot_accepted_facts_v1 where status in ('ACTIVE','UNKNOWN') group by spot_id,field_key having count(*)>1) then
    raise exception 'duplicate_current_accepted_fact';
  end if;
  if exists(select 1 from public.backyrd_spot_accepted_facts_v1 f left join public.spots s on s.id=f.spot_id where f.status in ('ACTIVE','UNKNOWN') and s.id is null) then
    raise exception 'accepted_fact_missing_spot';
  end if;
  if exists(select 1 from public.backyrd_spot_intelligence_evidence_v1 e left join public.backyrd_spot_intelligence_dimensions_v1 d on d.dimension_key=e.dimension_key where d.dimension_key is null) then
    raise exception 'n4_evidence_missing_dimension';
  end if;
  if exists(select 1 from public.spots where data_origin is null or data_origin not in ('REAL','LEGACY','TEST','FIXTURE')) then
    raise exception 'unknown_spot_origin';
  end if;
  if exists(select 1 from public.reviews where data_origin is null or review_origin is null or data_origin not in ('REAL','LEGACY','TEST','FIXTURE') or review_origin not in ('REAL','LEGACY','TEST','FIXTURE')) then
    raise exception 'unknown_review_origin';
  end if;
  if exists(select google_place_id from public.spots where status='approved' and data_origin not in ('TEST','FIXTURE') and google_place_id is not null group by google_place_id having count(*)>1) then
    raise exception 'active_google_place_identity_collision';
  end if;
  if exists(select 1 from public.profiles p left join auth.users u on u.id=p.id where u.id is null) then
    raise exception 'profile_without_auth_user';
  end if;
  if exists(select 1 from auth.users u left join public.profiles p on p.id=u.id where p.id is null) then
    raise exception 'auth_user_without_profile';
  end if;
  if exists(select 1 from public.decision_impressions i left join public.decision_sessions s on s.id=i.decision_id where s.id is null) then
    raise exception 'decision_impression_missing_session';
  end if;
  if exists(select 1 from public.backyrd_memory_events_v1 m left join public.profiles p on p.id=m.user_id where p.id is null) then
    raise exception 'memory_event_missing_profile';
  end if;
  if exists(select 1 from public.backyrd_memory_events_v1 where event_hash is not null group by event_hash having count(*)>1) then
    raise exception 'duplicate_memory_event_hash';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity) then
    raise exception 'public_table_without_rls';
  end if;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name='backyrd_user_intelligence_runtime_settings_v1' and grantee in ('PUBLIC','anon','authenticated')) then
    raise exception 'runtime_settings_client_grant';
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and coalesce(qual,'') like '%user_has_active_consent_v1%') then
    raise exception 'client_rls_calls_service_only_consent_helper';
  end if;
  if exists(select 1 from public.backyrd_spot_research_jobs_v1 where state='FAILED' and id<>'8f01596b-d427-488a-af5e-28be2ab61ffa'::uuid) then
    raise exception 'unexplained_failed_research_job';
  end if;
  if exists(select 1 from public.safety_image_evaluation_jobs where status in ('failed','dead_letter') and id not in ('8c8a5267-a45e-4b4b-9e51-f0c7c4c03b04'::uuid,'d8b80662-bbcd-4a68-b205-15ba801f2618'::uuid)) then
    raise exception 'unexplained_failed_safety_image_job';
  end if;
  if exists(select 1 from public.backyrd_user_intelligence_work_v1 where state='PROCESSING' and locked_at<now()-interval '30 minutes') then
    raise exception 'stuck_user_intelligence_work';
  end if;
end;
$$;

rollback;
