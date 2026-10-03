-- Service-only, request-bound semantic cache. The model's copied evidence
-- spans and the original sentence are deliberately not stored here.
create table decision_vnext_private.product_query_cache_v1 (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  model_version text not null check (model_version ~ '^[A-Za-z0-9._-]{1,80}$'),
  catalog_hash text not null check (catalog_hash ~ '^[0-9a-f]{64}$'),
  release_hash text not null check (release_hash ~ '^[0-9a-f]{64}$'),
  artifact_hash text not null check (artifact_hash ~ '^[0-9a-f]{64}$'),
  source_set_hash text not null check (source_set_hash ~ '^[0-9a-f]{64}$'),
  generation bigint not null check (generation > 0),
  semantics jsonb not null check (
    jsonb_typeof(semantics) = 'object' and octet_length(semantics::text) <= 4096
    and semantics ?& array['primaryIntent','secondaryIntent','facets','indoorRequired']
    and case when jsonb_typeof(semantics->'facets') = 'array'
      then jsonb_array_length(semantics->'facets') <= 20 else false end
    and jsonb_typeof(semantics->'indoorRequired') = 'boolean'
  ),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  constraint product_query_cache_v1_identity primary key (
    auth_user_id,request_hash,model_version,catalog_hash,release_hash,
    artifact_hash,source_set_hash,generation
  ),
  constraint product_query_cache_v1_ttl check (
    expires_at > created_at and expires_at <= created_at + interval '24 hours'
  )
);
create index product_query_cache_v1_expiry_idx
  on decision_vnext_private.product_query_cache_v1(expires_at);
alter table decision_vnext_private.product_query_cache_v1 enable row level security;
revoke all on decision_vnext_private.product_query_cache_v1 from public, anon, authenticated, service_role;

create function public.backyrd_decision_vnext_product_query_cache_v1(
  p_auth_user_id uuid,p_request_hash text,p_model_version text,p_catalog_hash text,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint,
  p_write boolean,p_semantics jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_control jsonb;
  v_row decision_vnext_private.product_query_cache_v1%rowtype;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_control := public.backyrd_decision_vnext_product_control_v1(
    p_release_hash,p_artifact_hash,p_source_set_hash,p_generation
  );
  if coalesce((v_control->>'enabled')::boolean,false) is not true then
    raise exception 'decision_vnext_product_runtime_off' using errcode='55000';
  end if;
  if p_auth_user_id is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_model_version is null or p_model_version !~ '^[A-Za-z0-9._-]{1,80}$'
    or p_catalog_hash is null or p_catalog_hash !~ '^[0-9a-f]{64}$'
    or p_write is null or (not p_write and p_semantics is not null)
    or (p_write and (p_semantics is null or jsonb_typeof(p_semantics) <> 'object'
      or octet_length(p_semantics::text) > 4096
      or not (p_semantics ?& array['primaryIntent','secondaryIntent','facets','indoorRequired'])
      or not (case when jsonb_typeof(p_semantics->'facets') = 'array'
        then jsonb_array_length(p_semantics->'facets') <= 20 else false end)
      or jsonb_typeof(p_semantics->'indoorRequired') <> 'boolean')) then
    raise exception 'decision_vnext_query_cache_input_invalid' using errcode='22023';
  end if;
  if not exists(select 1 from auth.users u where u.id=p_auth_user_id and u.deleted_at is null) then
    raise exception 'decision_vnext_product_authenticated_user_required' using errcode='42501';
  end if;
  select * into v_row from decision_vnext_private.product_query_cache_v1
  where auth_user_id=p_auth_user_id and request_hash=p_request_hash
    and model_version=p_model_version and catalog_hash=p_catalog_hash
    and release_hash=p_release_hash and artifact_hash=p_artifact_hash
    and source_set_hash=p_source_set_hash and generation=p_generation and expires_at>v_now;
  if found then return jsonb_build_object('status','HIT','semantics',v_row.semantics); end if;
  if not p_write then return jsonb_build_object('status','MISS'); end if;

  delete from decision_vnext_private.product_query_cache_v1
  where auth_user_id=p_auth_user_id and request_hash=p_request_hash
    and model_version=p_model_version and catalog_hash=p_catalog_hash
    and release_hash=p_release_hash and artifact_hash=p_artifact_hash
    and source_set_hash=p_source_set_hash and generation=p_generation and expires_at<=v_now;
  delete from decision_vnext_private.product_query_cache_v1 c where c.ctid in (
    select expired.ctid from decision_vnext_private.product_query_cache_v1 expired
    where expired.expires_at<=v_now order by expired.expires_at limit 100
  );
  insert into decision_vnext_private.product_query_cache_v1(
    auth_user_id,request_hash,model_version,catalog_hash,release_hash,
    artifact_hash,source_set_hash,generation,semantics,created_at,expires_at
  ) values (
    p_auth_user_id,p_request_hash,p_model_version,p_catalog_hash,p_release_hash,
    p_artifact_hash,p_source_set_hash,p_generation,p_semantics,v_now,v_now+interval '24 hours'
  ) on conflict on constraint product_query_cache_v1_identity do nothing;
  select * into strict v_row from decision_vnext_private.product_query_cache_v1
  where auth_user_id=p_auth_user_id and request_hash=p_request_hash
    and model_version=p_model_version and catalog_hash=p_catalog_hash
    and release_hash=p_release_hash and artifact_hash=p_artifact_hash
    and source_set_hash=p_source_set_hash and generation=p_generation;
  if v_row.expires_at<=v_now then
    raise exception 'decision_vnext_query_cache_expired' using errcode='55000';
  end if;
  return jsonb_build_object('status','HIT','semantics',v_row.semantics);
end;
$$;
revoke all on function public.backyrd_decision_vnext_product_query_cache_v1(
  uuid,text,text,text,text,text,text,bigint,boolean,jsonb
) from public,anon,authenticated;
grant execute on function public.backyrd_decision_vnext_product_query_cache_v1(
  uuid,text,text,text,text,text,text,bigint,boolean,jsonb
) to service_role;
