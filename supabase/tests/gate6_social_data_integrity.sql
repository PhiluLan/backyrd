begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','60000000-0000-0000-0000-000000000001','authenticated','authenticated','gate6-a@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','60000000-0000-0000-0000-000000000002','authenticated','authenticated','gate6-b@example.invalid','',now(),'{}','{}',now(),now());

update public.profiles set display_name='Gate 6 A', username='gate6a', is_private=false
where id='60000000-0000-0000-0000-000000000001';
update public.profiles set display_name='Gate 6 B', username='gate6b', is_private=false
where id='60000000-0000-0000-0000-000000000002';

insert into public.spots(id, name, lat, lng, status, data_origin)
values
  ('61000000-0000-0000-0000-000000000001','Gate 6 approved',47.55,7.59,'approved','REAL'),
  ('61000000-0000-0000-0000-000000000002','Gate 6 archived',47.55,7.59,'archived','REAL');

insert into public.social_posts(id,user_id,spot_id,caption,status,visibility)
values ('62000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','Gate 6 post','published','public');

insert into public.chats(id,user_a,user_b)
values ('63000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare v_count integer;
begin
  if not public.spot_accepts_consumer_interactions_v1('61000000-0000-0000-0000-000000000001') then raise exception 'approved spot rejected'; end if;
  if public.spot_accepts_consumer_interactions_v1('61000000-0000-0000-0000-000000000002') then raise exception 'archived spot accepted'; end if;

  perform * from public.create_social_comment_v2('62000000-0000-0000-0000-000000000001','same comment','64000000-0000-0000-0000-000000000001');
  perform * from public.create_social_comment_v2('62000000-0000-0000-0000-000000000001','same comment','64000000-0000-0000-0000-000000000001');
  select count(*) into v_count from public.social_comments where client_request_id='64000000-0000-0000-0000-000000000001';
  if v_count <> 1 then raise exception 'comment retry was not idempotent'; end if;

  perform * from public.create_social_post_v2('61000000-0000-0000-0000-000000000001','same moment','public','{}','{}','[]','64000000-0000-0000-0000-000000000002');
  perform * from public.create_social_post_v2('61000000-0000-0000-0000-000000000001','same moment','public','{}','{}','[]','64000000-0000-0000-0000-000000000002');
  select count(*) into v_count from public.social_posts where client_request_id='64000000-0000-0000-0000-000000000002';
  if v_count <> 1 then raise exception 'moment retry was not idempotent'; end if;

  perform * from public.send_message_v2('63000000-0000-0000-0000-000000000001','same message',null,'64000000-0000-0000-0000-000000000003');
  perform * from public.send_message_v2('63000000-0000-0000-0000-000000000001','same message',null,'64000000-0000-0000-0000-000000000003');
  select count(*) into v_count from public.messages where client_request_id='64000000-0000-0000-0000-000000000003';
  if v_count <> 1 then raise exception 'message retry was not idempotent'; end if;

  begin
    insert into public.favorites(user_id,spot_id) values ('60000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002');
    raise exception 'archived favorite accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform * from public.create_social_post_v2('61000000-0000-0000-0000-000000000002','bad','public','{}','{}','[]','64000000-0000-0000-0000-000000000004');
    raise exception 'archived moment accepted';
  exception when raise_exception then
    if sqlerrm = 'archived moment accepted' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000002',true);
select * from public.react_to_social_post_v1('62000000-0000-0000-0000-000000000001','like',true);
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',true);
select * from public.react_to_social_post_v1('62000000-0000-0000-0000-000000000001','like',true);

reset role;
do $$
declare v_relations integer; v_stored integer;
begin
  select count(*) into v_relations from public.social_post_reactions where post_id='62000000-0000-0000-0000-000000000001' and reaction_type='like';
  select like_count into v_stored from public.social_posts where id='62000000-0000-0000-0000-000000000001';
  if v_relations <> 2 or v_stored <> 2 then raise exception 'reaction aggregate drift: %/%',v_relations,v_stored; end if;
end;
$$;

rollback;
