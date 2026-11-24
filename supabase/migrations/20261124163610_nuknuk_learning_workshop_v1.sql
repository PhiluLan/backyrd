-- Internal curation, independent of Product ranking, moderation and online learning.
create schema nuknuk_learning_private;
revoke all on schema nuknuk_learning_private from public,anon,authenticated,service_role;

create table nuknuk_learning_private.families (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 160),
 topic text not null check(topic in ('everyday','family','food','budget','time','access','logic','dialogue')),
 split text not null check(split in ('TRAIN','DEV','TEST')), test_opened_at timestamptz, created_at timestamptz not null default clock_timestamp()
);
create table nuknuk_learning_private.cases (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references nuknuk_learning_private.families(id),
 parent_id uuid references nuknuk_learning_private.cases(id), revision integer not null default 1 check(revision>0),
 state text not null default 'draft' check(state in ('draft','review','approved','blocked','rejected')),
 document jsonb not null, target jsonb, target_policy text, approval_hash text,
 approved_by uuid references auth.users(id) on delete set null,
 created_by uuid references auth.users(id) on delete set null,
 feedback_id uuid references public.product_feedback_v1(id) on delete set null,
 updated_at timestamptz not null default clock_timestamp(),
 query_key text generated always as (md5(lower(regexp_replace(btrim(document->>'query'),'\s+',' ','g')))) stored unique,
 check(pg_column_size(document)<=30000), check(target is null or pg_column_size(target)<=150000),
 check((state='approved')=(approval_hash is not null)),
 check(state not in ('approved','review') or (target is not null and target_policy is not null))
);
create index nuknuk_learning_cases_family on nuknuk_learning_private.cases(family_id,state);
create index nuknuk_learning_cases_updated on nuknuk_learning_private.cases(updated_at desc,id);
create table nuknuk_learning_private.events (
 id bigint generated always as identity primary key, case_id uuid not null references nuknuk_learning_private.cases(id),
 actor_id uuid references auth.users(id) on delete set null, event text not null, revision integer not null,
 note text not null check(length(note)<=2000), snapshot jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create index nuknuk_learning_events_case on nuknuk_learning_private.events(case_id,id desc);
create table nuknuk_learning_private.runs (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 160),
 kind text not null check(kind in ('TRAIN_DEV','TEST')), state text not null default 'prepared' check(state in ('prepared','exported','reported')),
 manifest_bytes text not null, manifest_hash text not null, adapter_hash text,
 report jsonb, case_count integer not null check(case_count between 1 and 2000),
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default clock_timestamp(),
 check(adapter_hash is null or adapter_hash ~ '^[a-f0-9]{64}$'), check(report is null or pg_column_size(report)<=1000000)
);
create table nuknuk_learning_private.provider_attempts (
 id uuid primary key, actor_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default clock_timestamp()
);
create index nuknuk_learning_attempts_time on nuknuk_learning_private.provider_attempts(created_at,actor_id);
alter table nuknuk_learning_private.families enable row level security;
alter table nuknuk_learning_private.cases enable row level security;
alter table nuknuk_learning_private.events enable row level security;
alter table nuknuk_learning_private.runs enable row level security;
alter table nuknuk_learning_private.provider_attempts enable row level security;
revoke all on all tables in schema nuknuk_learning_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema nuknuk_learning_private from public,anon,authenticated,service_role;

create function nuknuk_learning_private.document_valid(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; a jsonb; item jsonb;
begin
 if v is null or jsonb_typeof(v)<>'object' then return false; end if;
 if not (v ?& array['query','notes','obligations','forbidden','tags','locale','reference','source','dataPolicy']) then return false; end if;
 for k in select jsonb_object_keys(v) loop
  if k not in ('query','notes','obligations','forbidden','tags','locale','reference','source','dataPolicy') then return false; end if;
 end loop;
 if jsonb_typeof(v->'query') is distinct from 'string' or length(btrim(v->>'query')) not between 3 and 2000
  or jsonb_typeof(v->'notes') is distinct from 'string' or length(v->>'notes')>2000
  or coalesce(v->>'locale','') not in ('de','de-CH') or coalesce(v->>'source','') not in ('authored','synthetic','feedback_redacted')
  or v->>'dataPolicy' is distinct from 'SYNTHETIC_OR_REDACTED' then return false; end if;
 foreach k in array array['obligations','forbidden','tags'] loop
  a:=v->k;
  if jsonb_typeof(a) is distinct from 'array' or jsonb_array_length(a)>(case when k='tags' then 12 else 30 end) then return false; end if;
  for item in select value from jsonb_array_elements(a) loop
   if jsonb_typeof(item) is distinct from 'string' or length(btrim(item#>>'{}')) not between 1 and 500 then return false; end if;
  end loop;
 end loop;
 if jsonb_typeof(v->'reference') is distinct from 'object' or v#>>'{reference,timezone}' is distinct from 'Europe/Zurich'
  or (select count(*) from jsonb_object_keys(v->'reference'))<>2
  or coalesce(v#>>'{reference,now}','') !~ '^\d{4}-\d{2}-\d{2}T' then return false; end if;
 perform (v#>>'{reference,now}')::timestamptz;
 return true;
exception when others then return false;
end $$;
alter table nuknuk_learning_private.cases add constraint learning_document_valid check(nuknuk_learning_private.document_valid(document));

create function nuknuk_learning_private.content_hash(c nuknuk_learning_private.cases) returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(jsonb_build_object('document',c.document,'target',c.target,'policy',c.target_policy,'family',c.family_id)::text,'UTF8'),'sha256'),'hex')
$$;
create function nuknuk_learning_private.record_event(p_id uuid,p_actor uuid,p_event text,p_note text)
returns void language sql set search_path='' as $$
 insert into nuknuk_learning_private.events(case_id,actor_id,event,revision,note,snapshot)
 select id,p_actor,p_event,revision,p_note,to_jsonb(c) from nuknuk_learning_private.cases c where id=p_id
$$;

-- All interactive writes are transactional and authorized using the verified caller.
create function public.admin_nuknuk_learning_v1(p_action text,p_id uuid default null,p_expected_revision integer default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); v_case nuknuk_learning_private.cases%rowtype;
 result jsonb; rows_json jsonb; fid uuid; cid uuid; newstate text; note text:=btrim(coalesce(p_payload->>'note',''));
 snapshot jsonb; bytes text; h text; n integer; v_run nuknuk_learning_private.runs%rowtype;
begin
 if actor is null or not coalesce(public.admin_is_admin_v1(),false) then raise exception 'admin_required' using errcode='42501'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>1050000 or length(note)>2000 then raise exception 'learning_input_invalid' using errcode='22023'; end if;
 if p_action='list' then
  if length(coalesce(p_payload->>'search',''))>120 then raise exception 'learning_filter_invalid' using errcode='22023'; end if;
  select coalesce(jsonb_agg(row order by updated_at desc,id),'[]') into rows_json from (
   select to_jsonb(c)||jsonb_build_object('family_title',f.title,'topic',f.topic,'split',f.split) as row,c.updated_at,c.id
   from nuknuk_learning_private.cases c join nuknuk_learning_private.families f on f.id=c.family_id
   where (coalesce(p_payload->>'state','')='' or c.state=p_payload->>'state')
    and (coalesce(p_payload->>'topic','')='' or f.topic=p_payload->>'topic')
    and (coalesce(p_payload->>'split','')='' or f.split=p_payload->>'split')
    and (coalesce(p_payload->>'search','')='' or strpos(lower(c.document->>'query'||' '||f.title),lower(p_payload->>'search'))>0)
    and (p_payload->>'before' is null or (c.updated_at,c.id)<((p_payload->>'before')::timestamptz,(p_payload->>'beforeId')::uuid))
   order by c.updated_at desc,c.id limit 51
  ) q;
  select coalesce(jsonb_agg(x),'[]') into result from (
   select f.topic,f.split,count(distinct f.id) as families,count(c.id) as situations,
    count(c.id) filter(where c.state='approved') as approved,count(c.id) filter(where c.state='review') as review,
    count(c.id) filter(where c.state='blocked') as blocked,count(c.id) filter(where c.document->>'source'='synthetic') as synthetic
   from nuknuk_learning_private.families f left join nuknuk_learning_private.cases c on c.family_id=f.id group by f.topic,f.split
  )x;
  return jsonb_build_object('version','backyrd.nuknuk-learning@1','rows',rows_json,'coverage',result,'pageSize',50);
 elsif p_action='detail' then
  select to_jsonb(c)||jsonb_build_object('family_title',f.title,'topic',f.topic,'split',f.split) into result
   from nuknuk_learning_private.cases c join nuknuk_learning_private.families f on f.id=c.family_id where c.id=p_id;
  if result is null then raise exception 'learning_not_found' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(to_jsonb(e)-'snapshot' order by id desc),'[]') into rows_json from (select * from nuknuk_learning_private.events where case_id=p_id order by id desc limit 50)e;
  return jsonb_build_object('case',result,'history',rows_json);
 elsif p_action='create' then
  if not nuknuk_learning_private.document_valid(p_payload->'document') then raise exception 'learning_document_invalid' using errcode='22023'; end if;
  if p_payload->>'parentId' is not null then
   select family_id into fid from nuknuk_learning_private.cases where id=(p_payload->>'parentId')::uuid;
   if fid is null then raise exception 'learning_parent_missing' using errcode='22023'; end if;
  else
   insert into nuknuk_learning_private.families(title,topic,split) values(btrim(p_payload->>'familyTitle'),p_payload->>'topic',p_payload->>'split') returning id into fid;
  end if;
  insert into nuknuk_learning_private.cases(id,family_id,parent_id,document,created_by,feedback_id)
   values(coalesce(p_id,gen_random_uuid()),fid,(p_payload->>'parentId')::uuid,p_payload->'document',actor,(p_payload->>'feedbackId')::uuid) returning id into cid;
  perform nuknuk_learning_private.record_event(cid,actor,'created',note);
  return jsonb_build_object('id',cid,'revision',1);
 elsif p_action in ('save','review','comment') then
  select * into v_case from nuknuk_learning_private.cases where id=p_id for update;
  if v_case.id is null then raise exception 'learning_not_found' using errcode='P0002'; end if;
  if p_expected_revision is distinct from v_case.revision then raise exception 'learning_revision_conflict' using errcode='40001'; end if;
  if p_action='save' then
   if not nuknuk_learning_private.document_valid(p_payload->'document') then raise exception 'learning_document_invalid' using errcode='22023'; end if;
   if v_case.document is distinct from p_payload->'document' then
    update nuknuk_learning_private.cases set document=p_payload->'document',revision=revision+1,state='draft',target=null,target_policy=null,approval_hash=null,approved_by=null,updated_at=clock_timestamp() where id=p_id;
   else return jsonb_build_object('id',v_case.id,'revision',v_case.revision); end if;
  elsif p_action='review' then
   newstate:=p_payload->>'state';
   if newstate is null or newstate not in ('approved','blocked','rejected','review') or length(note)<3 then raise exception 'learning_review_invalid' using errcode='22023'; end if;
   if newstate in ('approved','review') and (v_case.target is null or v_case.target_policy is null) then raise exception 'learning_translation_required' using errcode='22023'; end if;
   if newstate='approved' and (p_payload->'checks' is distinct from '{"meaning":true,"roles":true,"nothingInvented":true,"privacy":true}'::jsonb
    or jsonb_array_length(v_case.document->'obligations')=0) then raise exception 'learning_review_checks_required' using errcode='22023'; end if;
   update nuknuk_learning_private.cases set revision=revision+1,state=newstate,approval_hash=case when newstate='approved' then nuknuk_learning_private.content_hash(v_case) else null end,
    approved_by=case when newstate='approved' then actor else null end,updated_at=clock_timestamp() where id=p_id;
  else
   if length(note)<1 then raise exception 'learning_comment_required' using errcode='22023'; end if;
   update nuknuk_learning_private.cases set revision=revision+1,updated_at=clock_timestamp() where id=p_id;
  end if;
  perform nuknuk_learning_private.record_event(p_id,actor,p_action,note);
  return jsonb_build_object('id',p_id,'revision',(select revision from nuknuk_learning_private.cases where id=p_id));
 elsif p_action='runs' then
  select coalesce(jsonb_agg(to_jsonb(r)-'manifest_bytes' order by created_at desc),'[]') into result
   from (select * from nuknuk_learning_private.runs order by created_at desc limit 50)r;
  return result;
 elsif p_action='prepare' then
  -- Block edits/reviews until a complete, exact snapshot has been taken.
  lock table nuknuk_learning_private.families in share row exclusive mode;
  lock table nuknuk_learning_private.cases in share mode;
  if p_payload->>'kind' not in ('TRAIN_DEV','TEST') or length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 160 then raise exception 'learning_run_invalid' using errcode='22023'; end if;
  if p_payload->>'kind'='TEST' and coalesce(p_payload->>'adapterHash','')!~'^[a-f0-9]{64}$' then raise exception 'learning_test_candidate_required' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'familyId',f.id,'split',f.split,'approvalHash',c.approval_hash,
   'document',c.document,'target',c.target,'targetPolicy',c.target_policy) order by c.id),'[]') into snapshot
   from nuknuk_learning_private.cases c join nuknuk_learning_private.families f on f.id=c.family_id
   where c.state='approved' and c.approval_hash=nuknuk_learning_private.content_hash(c)
    and ((p_payload->>'kind'='TRAIN_DEV' and f.split in ('TRAIN','DEV')) or (p_payload->>'kind'='TEST' and f.split='TEST' and f.test_opened_at is null));
  n:=jsonb_array_length(snapshot);
  if n<1 or n>2000 then raise exception 'learning_run_empty_or_too_large' using errcode='22023'; end if;
  if p_payload->>'kind'='TRAIN_DEV' and (not exists(select 1 from jsonb_array_elements(snapshot)x where x->>'split'='TRAIN')
   or not exists(select 1 from jsonb_array_elements(snapshot)x where x->>'split'='DEV')) then raise exception 'learning_train_and_dev_required' using errcode='22023'; end if;
  if p_payload->>'kind'='TEST' and exists(select 1 from nuknuk_learning_private.runs where kind='TEST' and adapter_hash=p_payload->>'adapterHash') then raise exception 'learning_test_already_opened_for_candidate' using errcode='22023'; end if;
  if p_payload->>'kind'='TEST' then
   update nuknuk_learning_private.families set test_opened_at=clock_timestamp() where id in(select (x->>'familyId')::uuid from jsonb_array_elements(snapshot)x);
  end if;
  cid:=gen_random_uuid();
  bytes:=jsonb_build_object('version','backyrd.nuknuk-learning@1','id',cid,'kind',p_payload->>'kind','adapterHash',p_payload->>'adapterHash','rows',snapshot)::text;
  if octet_length(bytes)>20000000 then raise exception 'learning_export_too_large' using errcode='22023'; end if;
  h:=encode(extensions.digest(convert_to(bytes,'UTF8'),'sha256'),'hex');
  insert into nuknuk_learning_private.runs(id,title,kind,manifest_bytes,manifest_hash,case_count,created_by,adapter_hash)
   values(cid,btrim(p_payload->>'title'),p_payload->>'kind',bytes,h,n,actor,p_payload->>'adapterHash');
  return jsonb_build_object('id',cid,'manifestHash',h,'caseCount',n,'state','prepared');
 elsif p_action='export' then
  select * into v_run from nuknuk_learning_private.runs where id=p_id for update;
  if v_run.id is null then raise exception 'learning_run_not_found' using errcode='P0002'; end if;
  if exists(select 1 from jsonb_array_elements(v_run.manifest_bytes::jsonb->'rows') x left join nuknuk_learning_private.cases c on c.id=(x->>'id')::uuid where c.id is null or c.state<>'approved' or c.approval_hash is distinct from x->>'approvalHash') then raise exception 'learning_run_approval_withdrawn' using errcode='22023'; end if;
  update nuknuk_learning_private.runs set state=case when state='prepared' then 'exported' else state end where id=p_id;
  return jsonb_build_object('manifestBytes',v_run.manifest_bytes,'manifestHash',v_run.manifest_hash);
 elsif p_action='report' then
  select * into v_run from nuknuk_learning_private.runs where id=p_id for update;
  if v_run.id is null or v_run.manifest_hash is distinct from p_payload->>'manifestHash' or v_run.report is not null
   or jsonb_typeof(p_payload->'report') is distinct from 'object' or pg_column_size(p_payload->'report')>1000000
   or p_payload#>>'{report,version}' is distinct from 'backyrd.nuknuk-learning-report@1'
   or p_payload#>>'{report,manifestHash}' is distinct from v_run.manifest_hash
   or p_payload#>'{report,productionActivated}' is distinct from 'false'::jsonb
   or not(coalesce(p_payload#>>'{report,adapterHash}','')~'^[a-f0-9]{64}$' or coalesce(p_payload#>>'{report,kind}'='TRAINING_RECEIPT' and p_payload#>>'{report,trainingStatus}' in ('FAILED','TIMED_OUT') and p_payload#>'{report,adapterHash}'='null'::jsonb,false))
   or coalesce(p_payload#>>'{report,kind}','') not in ('TRAINING_RECEIPT','LOCAL_INFERENCE_COMPARISON')
   or jsonb_typeof(p_payload#>'{report,rows}') is distinct from 'array' then raise exception 'learning_report_invalid' using errcode='22023'; end if;
  if (v_run.kind='TEST' and p_payload#>>'{report,kind}'<>'LOCAL_INFERENCE_COMPARISON') or jsonb_array_length(p_payload#>'{report,rows}')>2000
   or (v_run.kind='TEST' and p_payload#>>'{report,adapterHash}' is distinct from v_run.adapter_hash) then raise exception 'learning_report_binding_invalid' using errcode='22023'; end if;
  -- Uploaded evidence is operator-reported, never an automatic production approval.
  update nuknuk_learning_private.runs set report=p_payload->'report',state='reported' where id=p_id;
  return jsonb_build_object('id',p_id,'state','reported','productionActivated',false);
 end if;
 raise exception 'learning_action_invalid' using errcode='22023';
end $$;
revoke all on function public.admin_nuknuk_learning_v1(text,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_nuknuk_learning_v1(text,uuid,integer,jsonb) to authenticated;

-- Only the authenticated Admin Edge composition may commit machine proposals.
-- p_actor is supplied only by the server after verifying the caller's JWT and Admin RPC.
create function public.admin_nuknuk_learning_proposal_v1(p_action text,p_id uuid,p_expected_revision integer,p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=p_actor; v_case nuknuk_learning_private.cases%rowtype; q jsonb; count_new integer:=0; cid uuid; fid uuid; doc jsonb;
begin
 if auth.role() is distinct from 'service_role' or actor is null then raise exception 'service_admin_required' using errcode='42501'; end if;
 -- Re-check current server-owned Admin membership; user-editable metadata is never authority.
 if not exists(select 1 from public.profiles where id=actor and is_admin=true) then raise exception 'admin_required' using errcode='42501'; end if;
 if p_action='reserve' then
  perform pg_advisory_xact_lock(hashtextextended('nuknuk-learning-provider-quota',0));
  if (select count(*) from nuknuk_learning_private.provider_attempts where actor_id=actor and created_at>clock_timestamp()-interval '1 hour')>=30
   or (select count(*) from nuknuk_learning_private.provider_attempts where created_at>clock_timestamp()-interval '1 day')>=200 then raise exception 'learning_provider_quota' using errcode='54000'; end if;
  insert into nuknuk_learning_private.provider_attempts(id,actor_id) values(p_id,actor);
  return jsonb_build_object('reserved',true);
 end if;
 if p_action='situations' then
  if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 5 then raise exception 'learning_situations_invalid' using errcode='22023'; end if;
  for q in select value from jsonb_array_elements(p_payload->'rows') loop
   doc:=jsonb_build_object('query',q->>'query','notes','','obligations',q->'obligations','forbidden',q->'forbidden','tags','[]'::jsonb,'locale','de-CH','reference',p_payload->'reference','source','synthetic','dataPolicy','SYNTHETIC_OR_REDACTED');
   if not nuknuk_learning_private.document_valid(doc) then raise exception 'learning_document_invalid' using errcode='22023'; end if;
   begin
    insert into nuknuk_learning_private.families(title,topic,split) values(q->>'title',p_payload->>'topic',p_payload->>'split') returning id into fid;
    insert into nuknuk_learning_private.cases(family_id,document,created_by) values(fid,doc,actor) returning id into cid;
    perform nuknuk_learning_private.record_event(cid,actor,'created','KI-Situationsvorschlag. Bedeutung, Verschiedenheit und Datenverwendung sind noch ungeprüft.');
    count_new:=count_new+1;
   exception when unique_violation then null;
   end;
  end loop;
  return jsonb_build_object('situationsCreated',count_new,'humanApproved',false);
 end if;
 select * into v_case from nuknuk_learning_private.cases where id=p_id for update;
 if v_case.id is null or v_case.revision is distinct from p_expected_revision or (p_action='translate' and v_case.state='approved') then raise exception 'learning_revision_conflict' using errcode='40001'; end if;
 if p_action='translate' then
  if jsonb_typeof(p_payload->'target')<>'object' or not(p_payload->'target'?'meaning') or length(coalesce(p_payload->>'policy','')) not between 1 and 200 then raise exception 'learning_target_invalid' using errcode='22023'; end if;
  update nuknuk_learning_private.cases set target=p_payload->'target',target_policy=p_payload->>'policy',state='review',revision=revision+1,approval_hash=null,approved_by=null,updated_at=clock_timestamp() where id=p_id;
  perform nuknuk_learning_private.record_event(p_id,actor,'translated','KI-Vorschlag; technische Prüfung bestanden, menschliche Prüfung ausstehend.');
 elsif p_action='variants' then
  if jsonb_typeof(p_payload->'queries')<>'array' or jsonb_array_length(p_payload->'queries') not between 1 and 5 then raise exception 'learning_variants_invalid' using errcode='22023'; end if;
  for q in select value from jsonb_array_elements(p_payload->'queries') loop
   if jsonb_typeof(q)<>'string' or length(btrim(q#>>'{}')) not between 3 and 2000 then raise exception 'learning_variant_invalid' using errcode='22023'; end if;
   cid:=null;
   insert into nuknuk_learning_private.cases(family_id,parent_id,document,created_by)
    values(v_case.family_id,v_case.id,jsonb_set(jsonb_set(v_case.document,'{query}',q),'{source}','"synthetic"'),actor)
    on conflict(query_key) do nothing returning id into cid;
   if cid is not null then count_new:=count_new+1; perform nuknuk_learning_private.record_event(cid,actor,'variant','KI-Variante; gleiche Familie und Prüftrennung, keine übernommene Freigabe.'); end if;
  end loop;
 else raise exception 'learning_action_invalid' using errcode='22023'; end if;
 return jsonb_build_object('id',p_id,'variantsCreated',count_new);
end $$;
revoke all on function public.admin_nuknuk_learning_proposal_v1(text,uuid,integer,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_nuknuk_learning_proposal_v1(text,uuid,integer,jsonb,uuid) to service_role;
revoke all on all functions in schema nuknuk_learning_private from public,anon,authenticated,service_role;
