\set ON_ERROR_STOP on

-- backyrd:authorization-positive
-- backyrd:authorization-negative

begin;

create function pg_temp.review_capture_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'Review capture trust v2 failed: %', p_message;
  end if;
end
$$;

do $$
declare
  u1 uuid := '92000000-0000-4000-8000-000000000001';
  u2 uuid := '92000000-0000-4000-8000-000000000002';
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',u1,'authenticated','authenticated','review-capture-1@test.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',u2,'authenticated','authenticated','review-capture-2@test.invalid','','{}','{}',now(),now());
  insert into public.profiles(id) values(u1),(u2) on conflict do nothing;
  insert into public.spots(id,name,lat,lng,status,city,data_origin) values
    ('92000000-0000-4000-8000-000000000010','Capture Media',47.0,7.0,'approved','Basel','LEGACY'),
    ('92000000-0000-4000-8000-000000000011','Capture No Media',47.1,7.1,'approved','Basel','LEGACY'),
    ('92000000-0000-4000-8000-000000000012','Capture Failure',47.2,7.2,'approved','Basel','LEGACY'),
    ('92000000-0000-4000-8000-000000000013','Capture Cancel',47.3,7.3,'approved','Basel','LEGACY');
end
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select public.reserve_review_media_upload_v2(
  '92000000-0000-4000-8000-000000000020',
  '92000000-0000-4000-8000-000000000010',
  array['92000000-0000-4000-8000-000000000020/0.jpg'],
  array['image/jpeg'], array[4::bigint],
  array[repeat('a',64)], true
);

-- Exact production regression: Storage preflight has contentLength but not
-- final metadata.size. A valid reservation must pass before the object exists.
select pg_temp.review_capture_assert(
  public.review_media_upload_is_reserved_v2(
    'review-photos','92000000-0000-4000-8000-000000000020/0.jpg',
    '92000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","contentLength":4}'::jsonb,
    jsonb_build_object('review_content_sha256',repeat('a',64))
  ),
  'valid Storage preflight without metadata.size was denied'
);

select pg_temp.review_capture_assert(
  not public.review_media_upload_is_reserved_v2(
    'spot-photos','92000000-0000-4000-8000-000000000020/0.jpg',
    '92000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg"}'::jsonb,
    jsonb_build_object('review_content_sha256',repeat('a',64))
  )
  and not public.review_media_upload_is_reserved_v2(
    'review-photos','92000000-0000-4000-8000-000000000099/0.jpg',
    '92000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg"}'::jsonb,
    jsonb_build_object('review_content_sha256',repeat('a',64))
  )
  and not public.review_media_upload_is_reserved_v2(
    'review-photos','92000000-0000-4000-8000-000000000020/0.jpg',
    '92000000-0000-4000-8000-000000000002',
    '{"mimetype":"image/jpeg"}'::jsonb,
    jsonb_build_object('review_content_sha256',repeat('a',64))
  )
  and not public.review_media_upload_is_reserved_v2(
    'review-photos','92000000-0000-4000-8000-000000000020/0.jpg',
    '92000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/png"}'::jsonb,
    jsonb_build_object('review_content_sha256',repeat('a',64))
  )
  and not public.review_media_upload_is_reserved_v2(
    'review-photos','92000000-0000-4000-8000-000000000020/0.jpg',
    '92000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg"}'::jsonb,
    jsonb_build_object('review_content_sha256',repeat('b',64))
  ),
  'foreign bucket, path, owner, MIME or fingerprint passed preflight'
);

insert into storage.objects(bucket_id,name,owner,owner_id,metadata,user_metadata)
values(
  'review-photos','92000000-0000-4000-8000-000000000020/0.jpg',
  '92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
  '{"mimetype":"image/jpeg","contentLength":4}'::jsonb,
  jsonb_build_object('review_content_sha256',repeat('a',64))
);

-- Storage writes final object metadata only after its RLS preflight succeeds.
reset role;
update storage.objects
set metadata='{"mimetype":"image/jpeg","size":4}'::jsonb
where bucket_id='review-photos' and name='92000000-0000-4000-8000-000000000020/0.jpg';
set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select public.finalize_review_with_media_v2(
  '92000000-0000-4000-8000-000000000020','92000000-0000-4000-8000-000000000010',
  'atomic smart review','cozy',null,
  array['92000000-0000-4000-8000-000000000020/0.jpg'],
  array['https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/review-photos/92000000-0000-4000-8000-000000000020/0.jpg'],true
);
select public.finalize_review_with_media_v2(
  '92000000-0000-4000-8000-000000000020','92000000-0000-4000-8000-000000000010',
  'atomic smart review','cozy',null,
  array['92000000-0000-4000-8000-000000000020/0.jpg'],
  array['https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/review-photos/92000000-0000-4000-8000-000000000020/0.jpg'],true
);
select pg_temp.review_capture_assert(
  (select count(*)=1 from public.reviews where id='92000000-0000-4000-8000-000000000020')
  and (select count(*)=1 from public.review_photos where review_id='92000000-0000-4000-8000-000000000020'),
  'media finalization or exact retry was not atomic and idempotent'
);

-- Smart Review without an image is still a Review created through the Smart
-- entry. It does not fabricate photo-bound evidence.
select public.finalize_review_without_media_v1(
  '92000000-0000-4000-8000-000000000021','92000000-0000-4000-8000-000000000011',
  'ohne Bild','ruhig',null,true
);
select public.finalize_review_without_media_v1(
  '92000000-0000-4000-8000-000000000021','92000000-0000-4000-8000-000000000011',
  'ohne Bild','ruhig',null,true
);
select pg_temp.review_capture_assert(
  (select count(*)=1 from public.reviews where id='92000000-0000-4000-8000-000000000021'
    and review_origin='SMART_REVIEW' and product_evidence_origin='smart_review_v1')
  and not exists(select 1 from public.review_photos where review_id='92000000-0000-4000-8000-000000000021'),
  'Smart Review without media was not created idempotently'
);

-- A mismatched final byte size cannot create Review, media reference or Smart
-- evidence. The client may keep the exact object for retry or remove it before
-- cancelling the reservation.
select public.reserve_review_media_upload_v2(
  '92000000-0000-4000-8000-000000000022','92000000-0000-4000-8000-000000000012',
  array['92000000-0000-4000-8000-000000000022/0.png'],array['image/png'],array[8::bigint],
  array[repeat('c',64)],true
);
insert into storage.objects(bucket_id,name,owner,owner_id,metadata,user_metadata)
values(
  'review-photos','92000000-0000-4000-8000-000000000022/0.png',
  '92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
  '{"mimetype":"image/png"}'::jsonb,jsonb_build_object('review_content_sha256',repeat('c',64))
);
reset role;
update storage.objects set metadata='{"mimetype":"image/png","size":7}'::jsonb
where bucket_id='review-photos' and name='92000000-0000-4000-8000-000000000022/0.png';
set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$begin
  begin
    perform public.finalize_review_with_media_v2(
      '92000000-0000-4000-8000-000000000022','92000000-0000-4000-8000-000000000012',
      null,'calm',null,array['92000000-0000-4000-8000-000000000022/0.png'],
      array['https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/review-photos/92000000-0000-4000-8000-000000000022/0.png'],true);
    raise exception 'mismatched final byte size was accepted';
  exception when insufficient_privilege then null; end;
end$$;
select pg_temp.review_capture_assert(
  not exists(select 1 from public.reviews where id='92000000-0000-4000-8000-000000000022')
  and not exists(select 1 from public.review_photos where review_id='92000000-0000-4000-8000-000000000022'),
  'failed finalization left partial Product state'
);

-- Cancellation is fail-closed until the object has been removed through the
-- Storage API. The SQL delete below represents that API's metadata result in
-- this transactional acceptance test only.
do $$begin
  begin
    perform public.cancel_review_media_upload_v2('92000000-0000-4000-8000-000000000022');
    raise exception 'reservation cancelled while object still existed';
  exception when object_not_in_prerequisite_state then null; end;
end$$;
reset role;
delete from storage.objects
where bucket_id='review-photos' and name='92000000-0000-4000-8000-000000000022/0.png';
set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cancel_review_media_upload_v2('92000000-0000-4000-8000-000000000022');

-- Another user cannot attach a different fingerprint or cancel this user's
-- reservation.
select public.reserve_review_media_upload_v2(
  '92000000-0000-4000-8000-000000000023','92000000-0000-4000-8000-000000000013',
  array['92000000-0000-4000-8000-000000000023/0.jpg'],array['image/jpeg'],array[4::bigint],
  array[repeat('d',64)],false
);
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000002',true);
do $$begin
  begin
    perform public.cancel_review_media_upload_v2('92000000-0000-4000-8000-000000000023');
    raise exception 'foreign user cancelled reservation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reserve_review_media_upload_v2(
      '92000000-0000-4000-8000-000000000023','92000000-0000-4000-8000-000000000013',
      array['92000000-0000-4000-8000-000000000023/0.jpg'],array['image/jpeg'],array[4::bigint],
      array[repeat('e',64)],false);
    raise exception 'foreign user replaced reservation fingerprint';
  exception when insufficient_privilege then null; end;
end$$;

reset role;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);
select pg_temp.review_capture_assert(
  not has_function_privilege('anon','public.reserve_review_media_upload_v2(uuid,uuid,text[],text[],bigint[],text[],boolean)','execute')
  and not has_function_privilege('anon','public.finalize_review_with_media_v2(uuid,uuid,text,text,text,text[],text[],boolean)','execute')
  and not has_function_privilege('anon','public.finalize_review_without_media_v1(uuid,uuid,text,text,text,boolean)','execute')
  and not has_function_privilege('anon','public.cancel_review_media_upload_v2(uuid)','execute'),
  'anonymous role can invoke Review capture V2 functions'
);

rollback;
