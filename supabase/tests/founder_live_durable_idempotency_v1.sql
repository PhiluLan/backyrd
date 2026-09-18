\set ON_ERROR_STOP on
begin;

-- backyrd:authorization-positive
-- backyrd:authorization-negative

create function pg_temp.founder_idem_assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'founder live idempotency failed: %', p_message; end if;
end;
$$;

select pg_temp.founder_idem_assert(
  not has_schema_privilege('anon', 'founder_live_private', 'USAGE')
  and not has_schema_privilege('authenticated', 'founder_live_private', 'USAGE')
  and not has_schema_privilege('service_role', 'founder_live_private', 'USAGE'),
  'private schema must not be directly exposed'
);
select pg_temp.founder_idem_assert(
  not has_table_privilege('service_role', 'founder_live_private.idempotency_records_v1', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'founder_live_private.idempotency_records_v1', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'founder_live_private.idempotency_records_v1', 'SELECT,INSERT,UPDATE,DELETE'),
  'no application role may access the table directly'
);
select pg_temp.founder_idem_assert(
  has_function_privilege('service_role', 'public.backyrd_founder_live_idempotency_commit_v1(text,text,text,text,text,text,text,text,text,text,text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.backyrd_founder_live_idempotency_commit_v1(text,text,text,text,text,text,text,text,text,text,text,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.backyrd_founder_live_idempotency_commit_v1(text,text,text,text,text,text,text,text,text,text,text,integer)', 'EXECUTE'),
  'only service role may execute commit RPC'
);

set local request.jwt.claims = '{"role":"service_role"}';

create temporary table founder_idem_values as
select repeat('7',64)::text subject_digest, repeat('8',64)::text key_digest,
       repeat('9',64)::text payload_hash, repeat('d',64)::text release_hash,
       repeat('e',64)::text artifact_hash, repeat('f',64)::text source_set_hash,
       '{"response":{"status":"EVALUATION_ONLY"}}'::text envelope;

create temporary table founder_idem_created as
select public.backyrd_founder_live_idempotency_commit_v1(
  'backyrd.founder-live.idempotency-scope@1.0', 'FOUNDER_LIVE_READ_ONLY_EVALUATION',
  subject_digest, key_digest, payload_hash, 'backyrd.decision-vnext.founder-live-execution@1.0',
  release_hash, artifact_hash, source_set_hash, envelope,
  encode(extensions.digest(convert_to(envelope,'UTF8'),'sha256'),'hex'), 86400
) value from founder_idem_values;
select pg_temp.founder_idem_assert((select value->>'status'='CREATED' from founder_idem_created), 'first commit must create');

create temporary table founder_idem_replayed as
select public.backyrd_founder_live_idempotency_commit_v1(
  'backyrd.founder-live.idempotency-scope@1.0', 'FOUNDER_LIVE_READ_ONLY_EVALUATION',
  subject_digest, key_digest, payload_hash, 'backyrd.decision-vnext.founder-live-execution@1.0',
  release_hash, artifact_hash, source_set_hash, '{"ignored":"new-response"}',
  encode(extensions.digest(convert_to('{"ignored":"new-response"}','UTF8'),'sha256'),'hex'), 1
) value from founder_idem_values;
select pg_temp.founder_idem_assert(
  (select value->>'status'='REPLAYED' and value->>'responseEnvelopeBytes'=envelope from founder_idem_replayed cross join founder_idem_values),
  'same payload must replay byte-identical first response'
);

create temporary table founder_idem_conflict as
select public.backyrd_founder_live_idempotency_commit_v1(
  'backyrd.founder-live.idempotency-scope@1.0', 'FOUNDER_LIVE_READ_ONLY_EVALUATION',
  subject_digest, key_digest, repeat('0',64), 'backyrd.decision-vnext.founder-live-execution@1.0',
  release_hash, artifact_hash, source_set_hash, envelope,
  encode(extensions.digest(convert_to(envelope,'UTF8'),'sha256'),'hex'), 60
) value from founder_idem_values;
select pg_temp.founder_idem_assert((select value->>'status'='CONFLICT' from founder_idem_conflict), 'changed payload must conflict');
select pg_temp.founder_idem_assert((select count(*)=1 from founder_live_private.idempotency_records_v1 where subject_digest=repeat('7',64) and idempotency_key_digest=repeat('8',64)), 'replay/conflict must not overwrite or duplicate');

create temporary table founder_idem_short_lived as
select public.backyrd_founder_live_idempotency_commit_v1(
  'backyrd.founder-live.idempotency-scope@1.0', 'FOUNDER_LIVE_READ_ONLY_EVALUATION',
  repeat('1',64), repeat('2',64), repeat('3',64), 'backyrd.decision-vnext.founder-live-execution@1.0',
  repeat('4',64), repeat('5',64), repeat('6',64), '{}',
  encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex'), 1
) value;
select pg_temp.founder_idem_assert((select value->>'status'='CREATED' from founder_idem_short_lived), 'one-second lower TTL boundary must create');
select pg_sleep(1.05);
create temporary table founder_idem_expired as
select public.backyrd_founder_live_idempotency_commit_v1(
  'backyrd.founder-live.idempotency-scope@1.0', 'FOUNDER_LIVE_READ_ONLY_EVALUATION',
  repeat('1',64), repeat('2',64), repeat('3',64), 'backyrd.decision-vnext.founder-live-execution@1.0',
  repeat('4',64), repeat('5',64), repeat('6',64), '{}',
  encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex'), 86400
) value;
select pg_temp.founder_idem_assert((select value->>'status'='EXPIRED' and not (value ? 'responseEnvelopeBytes') from founder_idem_expired), 'expired response must never replay');
select pg_temp.founder_idem_assert(public.backyrd_founder_live_idempotency_purge_expired_v1(10)=1, 'purge must delete exactly the expired row');
select pg_temp.founder_idem_assert(
  not exists(select 1 from founder_live_private.idempotency_records_v1 where subject_digest=repeat('1',64) and idempotency_key_digest=repeat('2',64))
  and exists(select 1 from founder_live_private.idempotency_records_v1 where subject_digest=repeat('7',64) and idempotency_key_digest=repeat('8',64)),
  'purge must remove expired identity and preserve unexpired identity'
);

do $$
begin
  begin
    update founder_live_private.idempotency_records_v1 set response_hash=repeat('1',64);
    raise exception 'immutable update accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from founder_live_private.idempotency_records_v1;
    raise exception 'unscoped delete accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform public.backyrd_founder_live_idempotency_commit_v1(
      'backyrd.founder-live.idempotency-scope@1.0','FOUNDER_LIVE_READ_ONLY_EVALUATION',repeat('1',64),repeat('2',64),repeat('3',64),
      'backyrd.decision-vnext.founder-live-execution@1.0',repeat('4',64),repeat('5',64),repeat('6',64),'{}',repeat('7',64),86401);
    raise exception 'ttl above 24h accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.backyrd_founder_live_idempotency_commit_v1(
      'backyrd.founder-live.idempotency-scope@1.0','FOUNDER_LIVE_READ_ONLY_EVALUATION',repeat('1',64),repeat('2',64),repeat('3',64),
      'backyrd.decision-vnext.founder-live-execution@1.0',repeat('4',64),repeat('5',64),repeat('6',64),
      jsonb_build_object('email', 'founder' || chr(64) || 'example.invalid')::text,repeat('7',64),60);
    raise exception 'forbidden PII-shaped response accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform public.backyrd_founder_live_idempotency_commit_v1(
      'backyrd.founder-live.idempotency-scope@1.0','FOUNDER_LIVE_READ_ONLY_EVALUATION',repeat('1',64),repeat('2',64),repeat('3',64),
      'backyrd.decision-vnext.founder-live-execution@1.0',repeat('4',64),repeat('5',64),repeat('6',64),'{}',
      encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex'),60);
    raise exception 'anon claim accepted';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

rollback;
