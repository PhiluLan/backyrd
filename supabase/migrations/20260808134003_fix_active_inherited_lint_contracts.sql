-- Backyrd production reconciliation: fix active inherited function contracts.
-- All changes are forward-only, preserve application signatures in active use,
-- and retain or reduce existing privileges.

-- spot_claims.id is bigint. These UUID overloads can never address a claim and
-- make PostgREST overload resolution harder; active Admin code uses bigint.
drop function if exists public.admin_approve_spot_claim_v1(uuid, boolean);
drop function if exists public.admin_reject_spot_claim_v1(uuid);

revoke all on function public.admin_approve_spot_claim_v1(bigint, boolean)
  from public, anon;
grant execute on function public.admin_approve_spot_claim_v1(bigint, boolean)
  to authenticated, service_role;

revoke all on function public.admin_reject_spot_claim_v1(bigint)
  from public, anon;
grant execute on function public.admin_reject_spot_claim_v1(bigint)
  to authenticated, service_role;

create or replace function public.admin_publish_legal_document_v1(
  p_document_id uuid,
  p_effective_at timestamptz default now()
)
returns table(
  document_id uuid,
  document_type text,
  version text,
  locale text,
  status text,
  published_at timestamptz,
  effective_at timestamptz,
  supersedes_document_id uuid,
  requires_reacceptance boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid := auth.uid();
  v_document public.legal_documents%rowtype;
  v_previous_id uuid;
  v_now timestamptz := now();
begin
  if v_admin_id is null or not public.consent_is_admin_v1() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select ld.* into v_document
  from public.legal_documents ld
  where ld.id = p_document_id and ld.status = 'draft'
  for update;

  if not found then
    raise exception 'draft_not_found' using errcode = '22023';
  end if;

  select ld.id into v_previous_id
  from public.legal_documents ld
  where ld.document_type = v_document.document_type
    and ld.locale = v_document.locale
    and ld.status = 'published'
    and ld.retired_at is null
  order by ld.published_at desc
  limit 1
  for update;

  if v_previous_id is not null then
    update public.legal_documents ld
    set status = 'retired', retired_at = v_now, retired_by = v_admin_id
    where ld.id = v_previous_id;
  end if;

  update public.legal_documents ld
  set status = 'published',
      published_at = v_now,
      effective_at = greatest(coalesce(p_effective_at, v_now), v_now),
      published_by = v_admin_id,
      supersedes_document_id = v_previous_id,
      retired_at = null,
      retired_by = null
  where ld.id = p_document_id;

  return query
  select ld.id, ld.document_type, ld.version, ld.locale, ld.status,
         ld.published_at, ld.effective_at, ld.supersedes_document_id,
         ld.requires_reacceptance
  from public.legal_documents ld
  where ld.id = p_document_id;
end;
$$;

revoke all on function public.admin_publish_legal_document_v1(uuid, timestamptz)
  from public, anon;
grant execute on function public.admin_publish_legal_document_v1(uuid, timestamptz)
  to authenticated, service_role;

create or replace function public.admin_set_taxonomy_synonyms_v1(
  p_taxonomy_node_id uuid,
  p_synonyms jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer;
begin
  if coalesce(public.admin_is_admin_v1(), false) is not true then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  delete from public.taxonomy_synonyms ts
  where ts.taxonomy_node_id = p_taxonomy_node_id;

  insert into public.taxonomy_synonyms (
    taxonomy_node_id, locale, synonym, weight
  )
  select
    p_taxonomy_node_id,
    case when lower(coalesce(item->>'locale', 'de')) = 'en' then 'en' else 'de' end,
    trim(item->>'synonym'),
    greatest(0.1, least(5, coalesce((item->>'weight')::numeric, 1)))
  from jsonb_array_elements(coalesce(p_synonyms, '[]'::jsonb)) item
  where nullif(trim(item->>'synonym'), '') is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_set_taxonomy_synonyms_v1(uuid, jsonb)
  from public, anon;
grant execute on function public.admin_set_taxonomy_synonyms_v1(uuid, jsonb)
  to authenticated, service_role;

create or replace function public.backyrd_mark_spot_embedding_job_failed_v13(
  p_spot_id uuid,
  p_error text default null
)
returns table(ok boolean, spot_id uuid, message text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_attempts integer;
  v_max_attempts integer;
begin
  select job.attempts, job.max_attempts
  into v_attempts, v_max_attempts
  from public.backyrd_embedding_jobs_v1 job
  where job.spot_id = p_spot_id;

  update public.backyrd_embedding_jobs_v1 job
  set
    status = case
      when coalesce(v_attempts, 0) >= coalesce(v_max_attempts, 5)
      then 'failed'
      else 'pending'
    end,
    last_error = left(coalesce(p_error, 'unknown_error'), 2000),
    locked_at = null,
    updated_at = now()
  where job.spot_id = p_spot_id;

  ok := true;
  spot_id := p_spot_id;
  message := 'embedding_job_failed_recorded';
  return next;
end;
$$;

revoke all on function public.backyrd_mark_spot_embedding_job_failed_v13(uuid, text)
  from public, anon, authenticated;
grant execute on function public.backyrd_mark_spot_embedding_job_failed_v13(uuid, text)
  to service_role;
