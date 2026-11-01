begin;
select set_config('request.jwt.claims','{}',true);
create temporary table privacy_parent_fixture(id uuid primary key);
create temporary table privacy_event_fixture(
  id integer primary key,
  user_id uuid references privacy_parent_fixture(id) on delete set null,
  properties jsonb not null
);
insert into privacy_parent_fixture values
 ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into privacy_event_fixture values
 (1,'00000000-0000-4000-8000-000000000001','{"fixture":"keep"}'),
 (2,'00000000-0000-4000-8000-000000000002','{"fixture":"keep"}');
create trigger privacy_fixture_consent before insert or update on privacy_event_fixture
 for each row execute function public.enforce_optional_analytics_consent_v1();
-- backyrd:authorization-positive
-- A real FK action must remove only attribution even without optional consent.
delete from privacy_parent_fixture where id='00000000-0000-4000-8000-000000000001';
do $$ begin
 if not exists(select 1 from privacy_event_fixture where id=1 and user_id is null and properties='{"fixture":"keep"}'::jsonb) then
  raise exception 'privacy_reference_not_cleared_by_foreign_key';
 end if;
end $$;
-- backyrd:authorization-negative
-- Clearing identity must not authorize payload changes or new analytics.
update privacy_event_fixture set user_id=null,properties='{"fixture":"tampered"}' where id=2;
update privacy_event_fixture set properties='{"fixture":"tampered"}' where id=2;
insert into privacy_event_fixture values(3,'00000000-0000-4000-8000-000000000002','{"fixture":"new"}');
do $$ begin
 if not exists(select 1 from privacy_event_fixture where id=2 and user_id='00000000-0000-4000-8000-000000000002' and properties='{"fixture":"keep"}'::jsonb)
   or exists(select 1 from privacy_event_fixture where id=3) then
  raise exception 'optional_analytics_consent_was_weakened';
 end if;
end $$;
update privacy_event_fixture set user_id=null where id=2;
do $$ begin
 if (select count(*) from privacy_event_fixture where user_id is null and properties='{"fixture":"keep"}'::jsonb)<>2 then
  raise exception 'privacy_only_update_failed';
 end if;
end $$;
rollback;
