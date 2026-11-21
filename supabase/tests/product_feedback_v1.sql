-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000041', 'authenticated', 'authenticated', 'feedback-v1@backyrd.test', '', now(), now());

insert into public.decision_sessions (id, user_id, city)
values ('20000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000041', 'Basel');

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

do $$
begin
  if not exists (
    select 1 from public.product_feedback_v1
    where user_id = '10000000-0000-4000-8000-000000000041'
      and surface = 'decision' and sentiment = 'helpful'
  ) then raise exception 'submitted feedback missing'; end if;
end $$;

rollback;
