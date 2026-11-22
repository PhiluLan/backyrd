-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000041', 'authenticated', 'authenticated', 'feedback-v1@backyrd.test', '', now(), now());

insert into public.decision_sessions (id, user_id, city)
values ('20000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000041', 'Basel');

-- Match the active Product persistence shape, not a legacy UUID session.
insert into decision_vnext_private.product_idempotency_records_v1 (
  scope_version, purpose, auth_user_id, subject_digest, idempotency_key_digest,
  payload_hash, response_contract_version, release_hash, artifact_hash,
  source_set_hash, generation, response_envelope_bytes, response_hash, expires_at
) values (
  'backyrd.decision-vnext.product-idempotency-scope@1.0',
  'PRODUCT_DECISION_VNEXT_EVALUATION', '10000000-0000-4000-8000-000000000041',
  repeat('a',64), repeat('b',64), repeat('c',64),
  'backyrd.decision-vnext.product-response@1.0',
  repeat('d',64), repeat('e',64), repeat('f',64), 1,
  '{"response":{"decisionId":"decision-feedback-test","status":"AVAILABLE"}}',
  encode(extensions.digest(convert_to('{"response":{"decisionId":"decision-feedback-test","status":"AVAILABLE"}}','UTF8'),'sha256'),'hex'),
  clock_timestamp() + interval '1 hour'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000041', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare v_id uuid;
begin
  v_id := public.submit_product_feedback_v1(
    'decision', 'helpful', null, '20000000-0000-4000-8000-000000000041', '{"platform":"test"}'::jsonb
  );
  if v_id is null then raise exception 'feedback receipt missing'; end if;

  v_id := public.submit_product_feedback_v1('decision', 'helpful', null, 'decision-feedback-test');
  if v_id is null then raise exception 'Product feedback receipt missing'; end if;

  begin
    perform public.submit_product_feedback_v1('decision', 'helpful', null, 'decision-unknown');
    raise exception 'unknown Product decision unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.product_feedback_v1(user_id, surface, sentiment)
    values ('10000000-0000-4000-8000-000000000041', 'decision', 'helpful');
    raise exception 'direct feedback insert unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.submit_product_feedback_v1('invalid', 'helpful');
    raise exception 'invalid surface unexpectedly accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.submit_product_feedback_v1(
      'decision', 'helpful', null, '20000000-0000-4000-8000-000000000042'
    );
    raise exception 'foreign decision unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform * from public.admin_list_product_feedback_v1();
    raise exception 'ordinary user unexpectedly read admin feedback';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Another signed-in actor must not attach feedback to the first actor's result.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000042', true);
do $$
begin
  begin
    perform public.submit_product_feedback_v1('decision', 'helpful', null, 'decision-feedback-test');
    raise exception 'foreign Product decision unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform public.submit_product_feedback_v1('decision', 'helpful', null, 'decision-feedback-test');
    raise exception 'anonymous feedback unexpectedly accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.product_feedback_v1
    where product_decision_id = 'decision-feedback-test' and decision_id is null
  ) then raise exception 'Product feedback lost its decision identity'; end if;
  if not exists (
    select 1 from public.product_feedback_v1
    where user_id = '10000000-0000-4000-8000-000000000041'
      and surface = 'decision' and sentiment = 'helpful'
  ) then raise exception 'submitted feedback missing'; end if;
end $$;

rollback;
