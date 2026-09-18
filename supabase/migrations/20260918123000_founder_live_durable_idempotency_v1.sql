-- Founder Live durable idempotency store. Source-only: this migration is not
-- authorized for Production application by its inclusion in the repository.
-- The store contains only purpose-bound pseudonymous digests and a minimized,
-- immutable response envelope. It is not a Product, learning, or writeback path.

create schema if not exists founder_live_private;
revoke all on schema founder_live_private from public, anon, authenticated, service_role;

create table founder_live_private.idempotency_records_v1 (
  scope_version text not null check (scope_version = 'backyrd.founder-live.idempotency-scope@1.0'),
  purpose text not null check (purpose = 'FOUNDER_LIVE_READ_ONLY_EVALUATION'),
  subject_digest text not null check (subject_digest ~ '^[0-9a-f]{64}$'),
  idempotency_key_digest text not null check (idempotency_key_digest ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  response_contract_version text not null check (response_contract_version ~ '^backyrd\.[a-z0-9._-]+@[0-9]+\.[0-9]+$'),
  release_hash text not null check (release_hash ~ '^[0-9a-f]{64}$'),
  artifact_hash text not null check (artifact_hash ~ '^[0-9a-f]{64}$'),
  source_set_hash text not null check (source_set_hash ~ '^[0-9a-f]{64}$'),
  response_envelope_bytes text not null check (octet_length(response_envelope_bytes) between 2 and 65536),
  response_hash text not null check (response_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  constraint founder_live_idempotency_v1_identity primary key (
    scope_version, purpose, release_hash, artifact_hash, source_set_hash,
    response_contract_version, subject_digest, idempotency_key_digest
  ),
  constraint founder_live_idempotency_v1_ttl check (
    expires_at > created_at and expires_at <= created_at + interval '24 hours'
  )
);

alter table founder_live_private.idempotency_records_v1 enable row level security;
revoke all on table founder_live_private.idempotency_records_v1 from public, anon, authenticated, service_role;

create index founder_live_idempotency_v1_expires_idx
  on founder_live_private.idempotency_records_v1 (expires_at);

create function founder_live_private.assert_service_authority_v1()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'founder_live_service_authority_required' using errcode = '42501';
  end if;
end;
$$;

create function founder_live_private.reject_record_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('backyrd.founder_live_expired_purge', true) = 'v1'
     and old.expires_at <= clock_timestamp() then
    return old;
  end if;
  raise exception 'founder_live_idempotency_record_immutable' using errcode = '55000';
end;
$$;

create trigger founder_live_idempotency_v1_immutable
before update or delete on founder_live_private.idempotency_records_v1
for each row execute function founder_live_private.reject_record_mutation_v1();

revoke all on function founder_live_private.assert_service_authority_v1() from public, anon, authenticated, service_role;
revoke all on function founder_live_private.reject_record_mutation_v1() from public, anon, authenticated, service_role;

create function public.backyrd_founder_live_idempotency_commit_v1(
  p_scope_version text,
  p_purpose text,
  p_subject_digest text,
  p_idempotency_key_digest text,
  p_payload_hash text,
  p_response_contract_version text,
  p_release_hash text,
  p_artifact_hash text,
  p_source_set_hash text,
  p_response_envelope_bytes text,
  p_response_hash text,
  p_ttl_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_envelope jsonb;
  v_row founder_live_private.idempotency_records_v1%rowtype;
begin
  perform founder_live_private.assert_service_authority_v1();

  if p_scope_version is distinct from 'backyrd.founder-live.idempotency-scope@1.0'
     or p_purpose is distinct from 'FOUNDER_LIVE_READ_ONLY_EVALUATION'
     or p_subject_digest is null or p_subject_digest !~ '^[0-9a-f]{64}$'
     or p_idempotency_key_digest is null or p_idempotency_key_digest !~ '^[0-9a-f]{64}$'
     or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_response_contract_version is null or p_response_contract_version !~ '^backyrd\.[a-z0-9._-]+@[0-9]+\.[0-9]+$'
     or p_release_hash is null or p_release_hash !~ '^[0-9a-f]{64}$'
     or p_artifact_hash is null or p_artifact_hash !~ '^[0-9a-f]{64}$'
     or p_source_set_hash is null or p_source_set_hash !~ '^[0-9a-f]{64}$'
     or p_response_envelope_bytes is null or octet_length(p_response_envelope_bytes) not between 2 and 65536
     or p_response_hash is null or p_response_hash !~ '^[0-9a-f]{64}$'
     or p_ttl_seconds is null or p_ttl_seconds not between 1 and 86400 then
    raise exception 'founder_live_idempotency_input_invalid' using errcode = '22023';
  end if;

  begin
    v_envelope := p_response_envelope_bytes::jsonb;
  exception when others then
    raise exception 'founder_live_idempotency_response_invalid' using errcode = '22023';
  end;
  if jsonb_typeof(v_envelope) <> 'object'
     or p_response_envelope_bytes ~* '"(email|userId|authUserId|rawAuthUuid|token|jwt|authorization|requestText|naturalLanguage|ip|ipAddress|userAgent)"[[:space:]]*:' then
    raise exception 'founder_live_idempotency_response_forbidden' using errcode = '22023';
  end if;
  if encode(extensions.digest(convert_to(p_response_envelope_bytes, 'UTF8'), 'sha256'), 'hex') <> p_response_hash then
    raise exception 'founder_live_idempotency_response_hash_mismatch' using errcode = '22023';
  end if;

  insert into founder_live_private.idempotency_records_v1 (
    scope_version, purpose, subject_digest, idempotency_key_digest, payload_hash,
    response_contract_version, release_hash, artifact_hash, source_set_hash,
    response_envelope_bytes, response_hash, created_at, expires_at
  ) values (
    p_scope_version, p_purpose, p_subject_digest, p_idempotency_key_digest, p_payload_hash,
    p_response_contract_version, p_release_hash, p_artifact_hash, p_source_set_hash,
    p_response_envelope_bytes, p_response_hash, v_now, v_now + make_interval(secs => p_ttl_seconds)
  )
  on conflict on constraint founder_live_idempotency_v1_identity do nothing
  returning * into v_row;

  if found then
    return jsonb_build_object(
      'status', 'CREATED', 'responseHash', v_row.response_hash,
      'createdAt', v_row.created_at, 'expiresAt', v_row.expires_at
    );
  end if;

  select * into strict v_row
  from founder_live_private.idempotency_records_v1
  where scope_version = p_scope_version and purpose = p_purpose
    and release_hash = p_release_hash and artifact_hash = p_artifact_hash
    and source_set_hash = p_source_set_hash and response_contract_version = p_response_contract_version
    and subject_digest = p_subject_digest and idempotency_key_digest = p_idempotency_key_digest
  for update;

  if v_row.expires_at <= v_now then
    return jsonb_build_object('status', 'EXPIRED', 'createdAt', v_row.created_at, 'expiresAt', v_row.expires_at);
  end if;
  if v_row.payload_hash <> p_payload_hash then
    return jsonb_build_object('status', 'CONFLICT', 'createdAt', v_row.created_at, 'expiresAt', v_row.expires_at);
  end if;
  return jsonb_build_object(
    'status', 'REPLAYED', 'responseEnvelopeBytes', v_row.response_envelope_bytes,
    'responseHash', v_row.response_hash, 'createdAt', v_row.created_at, 'expiresAt', v_row.expires_at
  );
end;
$$;

revoke all on function public.backyrd_founder_live_idempotency_commit_v1(text,text,text,text,text,text,text,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.backyrd_founder_live_idempotency_commit_v1(text,text,text,text,text,text,text,text,text,text,text,integer) to service_role;

create function public.backyrd_founder_live_idempotency_purge_expired_v1(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  perform founder_live_private.assert_service_authority_v1();
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'founder_live_idempotency_purge_limit_invalid' using errcode = '22023';
  end if;
  perform set_config('backyrd.founder_live_expired_purge', 'v1', true);
  with expired_keys as materialized (
    select scope_version, purpose, release_hash, artifact_hash, source_set_hash,
      response_contract_version, subject_digest, idempotency_key_digest
    from founder_live_private.idempotency_records_v1
    where expires_at <= clock_timestamp()
    order by expires_at
    limit p_limit
    for update skip locked
  )
  delete from founder_live_private.idempotency_records_v1 as target
  using expired_keys
  where target.scope_version = expired_keys.scope_version
    and target.purpose = expired_keys.purpose
    and target.release_hash = expired_keys.release_hash
    and target.artifact_hash = expired_keys.artifact_hash
    and target.source_set_hash = expired_keys.source_set_hash
    and target.response_contract_version = expired_keys.response_contract_version
    and target.subject_digest = expired_keys.subject_digest
    and target.idempotency_key_digest = expired_keys.idempotency_key_digest;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.backyrd_founder_live_idempotency_purge_expired_v1(integer) from public, anon, authenticated;
grant execute on function public.backyrd_founder_live_idempotency_purge_expired_v1(integer) to service_role;

comment on schema founder_live_private is 'Private, non-exposed Founder Live operational state; never a Product or learning store.';
comment on table founder_live_private.idempotency_records_v1 is 'Immutable, <=24h, purpose- and release-bound HMAC pseudonym idempotency records. No raw user/auth/request/network data.';
comment on function public.backyrd_founder_live_idempotency_commit_v1(text,text,text,text,text,text,text,text,text,text,text,integer) is 'Service-only atomic create/replay/conflict boundary for Founder Live read-only evaluations.';
comment on function public.backyrd_founder_live_idempotency_purge_expired_v1(integer) is 'Service-only bounded cleanup; only already-expired records can be deleted.';
