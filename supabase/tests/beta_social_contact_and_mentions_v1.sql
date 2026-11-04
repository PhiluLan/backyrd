-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('73000000-0000-0000-0000-00000000000'||n)::uuid,'authenticated','authenticated','p3-'||n||'@example.invalid','',now(),'{}','{}',now(),now() from generate_series(1,4) n;
update public.profiles set display_name='P3 public',username='p3public',is_private=false where id='73000000-0000-0000-0000-000000000002';
update public.profiles set display_name='P3 private',username='p3private',is_private=true where id='73000000-0000-0000-0000-000000000003';
update public.profiles set display_name='P3 actor',username='p3actor',is_private=true where id='73000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare v_chat uuid; v_same uuid; v_post uuid; n integer;
begin
 v_chat := public.get_or_create_direct_chat_v2('73000000-0000-0000-0000-000000000003');
 perform set_config('test.p3_chat',v_chat::text,true);
 v_same := public.get_or_create_direct_chat_v2('73000000-0000-0000-0000-000000000003');
 if v_chat is distinct from v_same then raise exception 'chat retry created another conversation'; end if;
 perform public.send_message_v2(v_chat,'Private does not mean unmessageable',null,'74000000-0000-0000-0000-000000000001');
 if not exists(select 1 from public.search_message_recipients_v1('p3private',20)) then raise exception 'private recipient missing'; end if;
 if exists(select 1 from public.search_message_recipients_v1('P3 private',20)) or exists(select 1 from public.search_message_recipients_v1('p3priv',20)) then raise exception 'private account exposed by partial name lookup'; end if;
 if exists(select 1 from public.search_message_recipients_v1('%%',20)) then raise exception 'wildcard enumerated private accounts'; end if;
 if exists(select 1 from public.search_social_users_v1('p3private',20)) then raise exception 'private target appears in public tag directory'; end if;
 if exists(select 1 from public.get_social_profile_v2('73000000-0000-0000-0000-000000000003')) then raise exception 'private biography exposed'; end if;
 select post_id into v_post from public.create_social_post_v3(null,'Test moment','public',array['Gemütlich'],'{}','[]','74000000-0000-0000-0000-000000000002',array['73000000-0000-0000-0000-000000000002'::uuid]);
 perform public.create_social_post_v3(null,'Test moment','public',array['Gemütlich'],'{}','[]','74000000-0000-0000-0000-000000000002',array['73000000-0000-0000-0000-000000000002'::uuid]);
 perform set_config('test.p3_post',v_post::text,true);
 select count(*) into n from public.social_post_mentions where post_id=v_post;
 if n<>1 then raise exception 'retry tags duplicated or missing'; end if;
 if not exists(select 1 from public.get_social_post_mentions_v1(array[v_post])) then raise exception 'author cannot read own tag'; end if;
 if public.get_social_post_v1(v_post)->>'post_id' is distinct from v_post::text then raise exception 'own protected link missing'; end if;
 begin
   perform public.create_social_post_v3(null,'Test moment','public',array['Laut'],'{}','[]','74000000-0000-0000-0000-000000000002',array['73000000-0000-0000-0000-000000000002'::uuid]);
   raise exception 'mutated retry accepted';
 exception when raise_exception then if sqlerrm <> 'idempotency_key_reused' then raise; end if; end;
 begin
   perform public.create_social_post_v3(null,'Private target','public','{}','{}','[]','74000000-0000-0000-0000-000000000003',array['73000000-0000-0000-0000-000000000003'::uuid]);
   raise exception 'private tag accepted';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.social_post_mentions(post_id,user_id) values(v_post,'73000000-0000-0000-0000-000000000003');
   raise exception 'direct tag bypass accepted';
 exception when insufficient_privilege then null; end;
 begin
   perform public.create_social_post_v3(null,'wrong actor','public','{}','{}','[]','74000000-0000-0000-0000-000000000007','{}','73000000-0000-0000-0000-000000000004');
   raise exception 'account switch accepted';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from public.reviews where user_id='73000000-0000-0000-0000-000000000001') then raise exception 'manual moment created an implicit review'; end if;
 perform public.block_user_v1('73000000-0000-0000-0000-000000000003');
 begin
   perform public.send_message_v2(v_chat,'blocked',null,'74000000-0000-0000-0000-000000000004');
   raise exception 'blocked message accepted';
 exception when insufficient_privilege then null; end;
 begin
   perform public.get_or_create_direct_chat_v2('73000000-0000-0000-0000-000000000003');
   raise exception 'blocked chat accepted';
 exception when raise_exception then if sqlerrm <> 'interaction_blocked' then raise; end if; end;
 if exists(select 1 from public.search_message_recipients_v1('p3private',20)) then raise exception 'blocked recipient exposed'; end if;
end;
$$;
-- A private author cannot accidentally make their moment public by tagging someone.
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000002',true);
do $$ begin
 if exists(select 1 from public.get_social_post_mentions_v1(array[current_setting('test.p3_post')::uuid])) then raise exception 'tag exposed private author moment'; end if;
 if public.get_social_post_v1(current_setting('test.p3_post')::uuid) is not null then raise exception 'shared URL exposed private author moment'; end if;
 begin
   perform public.send_message_v2(current_setting('test.p3_chat')::uuid,'not a participant',null,'74000000-0000-0000-0000-000000000005');
   raise exception 'foreign message accepted';
 exception when insufficient_privilege then null; end;
end; $$;
-- Become public, check read; target then becomes private between selection and publication.
reset role;
update public.profiles set is_private=false where id='73000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000002',true);
do $$ begin
 if not exists(select 1 from public.get_social_post_mentions_v1(array[current_setting('test.p3_post')::uuid])) then raise exception 'public tag missing'; end if;
end; $$;
reset role;
update public.profiles set is_private=true where id='73000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
do $$ begin
 if exists(select 1 from public.social_post_mentions where post_id=current_setting('test.p3_post')::uuid) then raise exception 'private target tag still visible'; end if;
 begin
   perform public.create_social_post_v3(null,'Selected before privacy change','public','{}','{}','[]','74000000-0000-0000-0000-000000000006',array['73000000-0000-0000-0000-000000000002'::uuid]);
   raise exception 'stale private selection accepted';
 exception when insufficient_privilege then null; end;
end; $$;
-- Editing is owner-only and detects a stale editor instead of overwriting newer work.
do $$
declare editor_row record; v_post uuid := current_setting('test.p3_post')::uuid;
begin
 select * into strict editor_row from public.get_my_moment_editor_v1(v_post);
 perform public.update_my_moment_v1(v_post,'Edited moment',array['Ruhig'],editor_row.caption,editor_row.mood_tags);
 begin
  perform public.update_my_moment_v1(v_post,'Stale edit',array['Ruhig'],editor_row.caption,editor_row.mood_tags);
  raise exception 'stale editor overwrote newer content';
 exception when raise_exception then if sqlerrm <> 'moment_changed' then raise; end if; end;
end; $$;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000004',true);
do $$ begin
 if exists(select 1 from public.get_my_moment_editor_v1(current_setting('test.p3_post')::uuid)) then raise exception 'foreign editor returned content'; end if;
 begin
  perform public.remove_my_moment_v1(current_setting('test.p3_post')::uuid);
  raise exception 'foreign removal accepted';
 exception when insufficient_privilege then null; end;
 if not exists(select 1 from public.get_social_feed_v1(100,null,null,'for_you') where post_id=current_setting('test.p3_post')::uuid) then raise exception 'public eligible moment missing'; end if;
 perform public.react_to_social_post_v1(current_setting('test.p3_post')::uuid,'save',true);
 if not exists(select 1 from public.get_my_saved_moments_v1(200) entry where entry->>'post_id'=current_setting('test.p3_post')) then raise exception 'saved moment not retrievable'; end if;
 declare
   item jsonb;
 begin
   item := public.safety_get_or_create_reportable_content_v1('moment','social_post',current_setting('test.p3_post')::uuid,'73000000-0000-0000-0000-000000000004',null,'forged evidence','{}','de-CH','{}');
   if (public.safety_submit_report_v1((item->>'content_item_id')::uuid,'spam_fraud',null,'p3-local','de-CH','{}')->>'report_id') is null then raise exception 'report receipt missing'; end if;
 end;

end; $$;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
select * from public.remove_my_moment_v1(current_setting('test.p3_post')::uuid);
select * from public.remove_my_moment_v1(current_setting('test.p3_post')::uuid);
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000004',true);
do $$ begin if exists(select 1 from public.get_my_saved_moments_v1(200) entry where entry->>'post_id'=current_setting('test.p3_post')) then raise exception 'removed moment still in saved collection'; end if; end; $$;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
do $$ begin
 if exists(select 1 from public.get_social_feed_v1(100,null,null,'for_you') where post_id=current_setting('test.p3_post')::uuid) then raise exception 'removed moment returned from old feed'; end if;
 if public.get_social_post_v1(current_setting('test.p3_post')::uuid) is not null then raise exception 'removed moment returned via shared URL'; end if;
 if exists(select 1 from public.get_social_user_posts_v1('73000000-0000-0000-0000-000000000001',100,null) where post_id=current_setting('test.p3_post')::uuid) then raise exception 'removed moment returned from profile'; end if;
end; $$;

-- A client snapshot cannot erase private media or replace the stored Mood/caption evidence.
do $$
declare v_post uuid; snapshot jsonb;
begin
 select post_id into v_post from public.create_social_post_v3(null,'Photo moment','public',array['Ruhig'],'{}',
   '[{"storage_path":"73000000-0000-0000-0000-000000000001/p3-photo.jpg","media_type":"image"}]'::jsonb,
   '74000000-0000-0000-0000-000000000008','{}');
 snapshot := public.safety_register_content_snapshot_v1('social_post',v_post,'moment','73000000-0000-0000-0000-000000000001',null,'forged client text','{}','p3-local','{}');
 if snapshot->>'analysis_required'<>'true' or (snapshot->>'media_count')::integer<>1 then raise exception 'private media lost from snapshot'; end if;
 perform set_config('test.p3_photo_post',v_post::text,true);
end; $$;
reset role;
do $$ begin
 if not exists(select 1 from public.safety_content_items where entity_type='social_post' and entity_id=current_setting('test.p3_photo_post')::uuid and image_urls=array['73000000-0000-0000-0000-000000000001/p3-photo.jpg'] and position('Ruhig' in text_content)>0 and position('forged' in text_content)=0) then raise exception 'canonical photo/Mood evidence missing'; end if;
end; $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000004',true);
do $$ begin
 if not public.social_media_object_is_visible_v1('73000000-0000-0000-0000-000000000001/p3-photo.jpg') then raise exception 'public author photo unavailable to another user'; end if;
end; $$;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
select public.remove_my_moment_v1(current_setting('test.p3_photo_post')::uuid);
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000004',true);
do $$ begin
 if public.social_media_object_is_visible_v1('73000000-0000-0000-0000-000000000001/p3-photo.jpg') then raise exception 'removed moment photo still readable'; end if;
end; $$;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
-- Editing a place impression changes its canonical review and its social representation together.
reset role;
do $$ begin
 if exists(select 1 from public.safety_content_items where entity_type='social_post' and entity_id=current_setting('test.p3_post')::uuid and (text_content='forged evidence' or actor_user_id<>'73000000-0000-0000-0000-000000000001')) then raise exception 'reporter changed canonical evidence'; end if;
end; $$;
insert into public.spots(id,name,lat,lng,status,data_origin)
values ('75000000-0000-0000-0000-000000000001','P3 local fixture',47.55,7.59,'approved','REAL');
set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
select * from public.follow_spot_v1('75000000-0000-0000-0000-000000000001');
select * from public.follow_spot_v1('75000000-0000-0000-0000-000000000001');
select public.finalize_review_without_media_v1('76000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000001','Original place impression','Gemütlich',null,false);
do $$
declare v_post uuid; editor_row record;
begin
 select id into strict v_post from public.social_posts where review_id='76000000-0000-0000-0000-000000000001';
 select * into strict editor_row from public.get_my_moment_editor_v1(v_post);
 perform public.update_my_moment_v1(v_post,'Updated place impression',array['Ruhig'],editor_row.caption,editor_row.mood_tags);
 if not exists(select 1 from public.reviews where id='76000000-0000-0000-0000-000000000001' and text='Updated place impression' and mood_a='Ruhig' and mood_b is null) then raise exception 'canonical review not updated'; end if;
 if not exists(select 1 from public.social_posts where id=v_post and caption='Updated place impression' and mood_tags=array['Ruhig']) then raise exception 'social moment not updated'; end if;
 perform public.remove_my_moment_v1(v_post);
 if not exists(select 1 from public.reviews where id='76000000-0000-0000-0000-000000000001') then raise exception 'feed removal silently deleted place impression'; end if;
end; $$;

reset role;
do $$ begin
 if exists(select 1 from public.social_posts where client_request_id in ('74000000-0000-0000-0000-000000000003','74000000-0000-0000-0000-000000000006')) then raise exception 'failed tagging left partial post'; end if;
 if has_function_privilege('anon','public.create_social_post_v3(uuid,text,text,text[],text[],jsonb,uuid,uuid[],uuid)','execute') then raise exception 'anonymous publish permitted'; end if;
 if has_table_privilege('authenticated','public.social_posts','insert') or has_table_privilege('authenticated','public.social_post_media','insert') or has_table_privilege('authenticated','public.social_posts','update') then raise exception 'direct post/media mutation permitted'; end if;
 if has_function_privilege('authenticated','public.create_social_post_v1(uuid,text,text,text[],text[],jsonb)','execute') then raise exception 'legacy unvalidated media writer permitted'; end if;
 if has_table_privilege('authenticated','public.social_post_mentions','insert') then raise exception 'direct tag write grant'; end if;
 if has_function_privilege('authenticated','public.safety_register_content_snapshot_internal_v1(text,uuid,text,uuid,uuid,text,text[],text,jsonb)','execute') then raise exception 'unguarded snapshot writer callable'; end if;
 if has_function_privilege('authenticated','public.account_person_mentions_export_v1(uuid)','execute') or has_function_privilege('anon','public.account_person_mentions_export_v1(uuid)','execute') then raise exception 'public personal-export access granted'; end if;
end; $$;
rollback;
