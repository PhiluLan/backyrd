-- Synthetic, isolated database only. Never run against the production database.
create schema auth;
create schema world_knowledge_private;
grant usage on schema public,auth to authenticated,anon,service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.admin_is_admin_v1() returns boolean language sql stable as $$select auth.uid()='00000000-0000-4000-8000-000000000001'::uuid$$;
create table public.spots(id uuid primary key,name text,city text,status text,owner_id uuid,data_origin text,category_id uuid);
create table public.analytics_events(id uuid,spot_id uuid,user_id uuid,occurred_at timestamptz,event_name text);
create table public.reviews(id uuid,spot_id uuid,created_at timestamptz);
create table public.favorites(spot_id uuid,user_id uuid);
create table world_knowledge_private.attribute_definitions(registry_version text,attribute_key text,allowed_values jsonb,primary key(registry_version,attribute_key));
create table world_knowledge_private.claims(id uuid,spot_id uuid,attribute_key text,scope text,knowledge_state text,value jsonb,visibility text,stance text,valid_from timestamptz,valid_until timestamptz,registry_version text,last_changed_at timestamptz);
create index world_claims_resolve_idx on world_knowledge_private.claims(spot_id,attribute_key,scope,last_changed_at desc,id);
insert into world_knowledge_private.attribute_definitions values ('fixture','classification.primary_category','["EAT","STAY"]');
insert into public.spots select md5(i::text)::uuid,'Testort '||lpad(i::text,2,'0'),'Basel','approved',null,'IMPORT',null from generate_series(1,32) i;
insert into world_knowledge_private.claims select md5(('claim'||i)::text)::uuid,md5(i::text)::uuid,'classification.primary_category','SPOT','KNOWN_VALUE',to_jsonb(case when i<=26 then 'EAT'::text else 'STAY'::text end),'PUBLIC','SUPPORTS',null,null,'fixture',now()-interval '1 day' from generate_series(1,32) i;
-- Unknown, held, expired, private, invalid and future successors must not revive old categories.
insert into world_knowledge_private.claims select md5(('new'||i)::text)::uuid,md5(i::text)::uuid,'classification.primary_category','SPOT',case when i=1 then 'UNKNOWN' else 'KNOWN_VALUE' end,case when i=1 then null when i=5 then '"INVALID"'::jsonb else '"STAY"'::jsonb end,case when i=2 then 'SHADOW_HELD' when i=4 then 'PRIVATE' else 'PUBLIC' end,'SUPPORTS',case when i=6 then '2999-01-01'::timestamptz else null end,case when i=3 then '2000-01-01'::timestamptz else null end,'fixture',now() from generate_series(1,6) i;
insert into public.analytics_events values ('00000000-0000-4000-8000-000000000111',md5('32')::uuid,null,'2026-10-15','spot_opened');
insert into public.reviews values ('00000000-0000-4000-8000-000000000222',md5('32')::uuid,'2026-10-15');
insert into public.favorites values(md5('32')::uuid,'00000000-0000-4000-8000-000000000333');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
