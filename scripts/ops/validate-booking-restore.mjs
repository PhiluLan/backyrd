#!/usr/bin/env node
// Local, synthetic two-project drill. Never accepts a remote database.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBookingTsLoader } from '../../web/tests/helpers/booking-ts-runtime.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname);
const source=process.env.BACKYRD_RESTORE_SOURCE_DB_URL,target=process.env.BACKYRD_RESTORE_TARGET_DB_URL,artifacts=process.env.BACKYRD_RESTORE_ARTIFACTS;
if(process.env.BACKYRD_BACKUP_EPHEMERAL!=='1'||!source||!target||!artifacts)throw Error('isolated_restore_environment_required');
for(const db of [source,target])if(!['127.0.0.1','localhost','[::1]'].includes(new URL(db).hostname))throw Error('remote_restore_forbidden');
if(source===target||new URL(source).port===new URL(target).port)throw Error('independent_restore_target_required');
const admin=db=>{const u=new URL(db);u.username='supabase_admin';return u.href;};
function sql(db,body,label='sql',extra=[]) {
 const connection=new URL(db);
 const connectionEnv={PGHOST:connection.hostname,PGPORT:connection.port||'5432',PGUSER:decodeURIComponent(connection.username),PGPASSWORD:decodeURIComponent(connection.password),PGDATABASE:decodeURIComponent(connection.pathname.slice(1)),PGSSLMODE:connection.searchParams.get('sslmode')||'prefer',PGSERVICE:undefined,PGSERVICEFILE:undefined};
 try{return execFileSync('psql',['-X','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1',...extra],{encoding:'utf8',input:body,env:{...process.env,...connectionEnv,PGCONNECT_TIMEOUT:'10',PGOPTIONS:'-c backyrd.booking_restore_fixture=isolated'},stdio:['pipe','pipe','pipe'],timeout:120000}).trim();}
 catch(error){writeFileSync(resolve(artifacts,`${label}-error.log`),error.stderr??'execution failed',{mode:0o600});throw Error(`isolated_restore_phase_failed:${label}`);}
}
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const id=label=>`md5('booking-restore-fixture:${label}')::uuid`;
const load=createBookingTsLoader(new URL('../../web/tests/booking-mail-summary.test.mjs',import.meta.url));
const guest=load('../lib/booking-guest-contract.ts'),security=load('../lib/booking-guest-security.ts',{'./booking-guest-contract':guest});
const mail=load('../lib/booking-mail.ts',{'./booking-guest-contract':guest,'./booking-guest-security':security});
const keyring=()=>({active:'restore',keys:{restore:randomBytes(32).toString('base64')}});
const configFrom=keys=>({origin:'https://booking.invalid',from:'mail@booking.invalid',scope:'restore-drill',apiKey:'no-provider-call',guestKeys:security.guestSealKeys(keys.guest.active,JSON.stringify(keys.guest.keys)),payloadKeys:security.guestSealKeys(keys.payload.active,JSON.stringify(keys.payload.keys)),bindingKeys:security.guestSealKeys(keys.binding.active,JSON.stringify(keys.binding.keys))});
const corpus=`create or replace function pg_temp.restore_rows() returns jsonb language plpgsql as $$ declare r record; result jsonb:='[]'; count_rows bigint; digest_rows text; row_value text; begin
 for r in select schemaname,tablename from pg_tables where schemaname in ('public','decision_lab','booking_private','world_knowledge_private','founder_live_private','decision_vnext_private','event_authoring_private','auth','storage','supabase_migrations') order by schemaname,tablename loop
 row_value:=case when r.schemaname='storage' and r.tablename='migrations' then 'to_jsonb(t)-''executed_at''' else 'to_jsonb(t)' end;
 execute format('select count(*),encode(extensions.digest(convert_to(coalesce(string_agg((%s)::text,E''\\n'' order by (%s)::text collate "C"),''''),''UTF8''),''sha256''),''hex'') from %I.%I t',row_value,row_value,r.schemaname,r.tablename) into count_rows,digest_rows;
 result:=result||jsonb_build_array(jsonb_build_object('relation',r.schemaname||'.'||r.tablename,'rows',count_rows,'sha256',digest_rows));end loop;return result;end $$; select pg_temp.restore_rows();`;
function fingerprints(db) {
 const engine=readFileSync(resolve(root,'scripts/ci/application-schema-fingerprint.sql'),'utf8');
 return {application:sql(db,`begin;set local search_path=pg_catalog,public;${engine} rollback;`,'application-fingerprint'),private:sql(db,`begin;set local search_path=pg_catalog,public;set local backyrd.fingerprint_scope='booking-private-v1';${engine} rollback;`,'private-fingerprint')};
}
function controls(db) {
 return sql(db,`select jsonb_build_object('triggers',(select jsonb_agg(jsonb_build_object('table',n.nspname||'.'||c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace f on f.oid=p.pronamespace where not t.tgisinternal and n.nspname in ('auth','storage') and f.nspname='public'),'storagePolicies',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',p.polname,'permissive',p.polpermissive,'roles',(select array_agg(coalesce(r.rolname,'PUBLIC') order by coalesce(r.rolname,'PUBLIC')) from unnest(p.polroles) x left join pg_roles r on r.oid=x),'cmd',p.polcmd,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by c.relname,p.polname) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage'),'realtime',(select jsonb_agg(schemaname||'.'||tablename order by schemaname,tablename) from pg_publication_tables where pubname='supabase_realtime'));`,'managed-controls');
}
function outcome(db){return JSON.parse(sql(db,`select public.booking_mail_summary_recover_v1(${id('owner')},${id('spot')},(select reservation_id from booking_private.reservation_requests_v2 where request_id=${id('summary-op')}),${id('summary-op')},0,'restore-recipient@booking.invalid');`,'manual-recovery'));}
const mode=process.argv[2];
if(mode==='seed') {
 assert.equal(sql(source,'select count(*) from public.booking_restaurant_settings;','empty-synthetic-source'),'0');
 sql(source,readFileSync(resolve(root,'scripts/ops/fixtures/booking-restore.sql'),'utf8'),'synthetic-corpus-seed');
 console.log('Namespaced synthetic restore corpus seeded in the disposable source.');
} else if(mode==='prepare') {
 sql(admin(source),'select cron.unschedule(jobid) from cron.job;','disable-local-source-cron');
 const lease=randomUUID(),claim=mail.parseMailClaim(JSON.parse(sql(source,`select public.booking_mail_claim_v1('${lease}');`,'prepare-claim')),lease);
 assert.equal(claim.snapshot.messageMode,'manual_summary');
 assert.equal(claim.snapshot.name,'Restore fixture');assert.match(claim.snapshot.email,/@booking\.invalid$/);assert.match(claim.snapshot.guest_name,/^Synthetic /);
 const keys={guest:keyring(),payload:keyring(),binding:keyring()},config=configFrom(keys),envelope=mail.buildMailEnvelope(claim,config),sealed=mail.sealMailEnvelope(envelope,config.payloadKeys);
 assert.equal(sql(source,`select public.booking_mail_prepare_v1('${claim.id}','${lease}','${claim.context}',${quote(sealed.sealed)},'${sealed.digest}');`,'prepare-payload'),'t');
 const began=JSON.parse(sql(source,`select public.booking_mail_begin_v1('${claim.id}','${lease}','${sealed.digest}');`,'begin-without-provider'));
 assert.equal(began.id,claim.id);
 const observation={controls:controls(source),fingerprints:fingerprints(source),rows:JSON.parse(sql(admin(source),corpus,'source-row-snapshot')),outcome:outcome(source),mailId:claim.id,digest:sealed.digest,providerBody:envelope.body};
 writeFileSync(resolve(artifacts,'keys.json'),JSON.stringify(keys),{mode:0o600});writeFileSync(resolve(artifacts,'source.json'),JSON.stringify(observation),{mode:0o600});
 console.log('BOOKING_RESTORE_CORPUS_PREPARED: synthetic guest access, staff roles, idempotent manual intent and genuinely sealed in-flight payload; no provider request.');
} else if(mode==='capture-controls') {
 const file=resolve(artifacts,'source.json'),observed=JSON.parse(readFileSync(file,'utf8'));
 if(JSON.stringify(fingerprints(source))!==JSON.stringify(observed.fingerprints))throw Error('source_schema_changed');
 if(JSON.stringify(JSON.parse(sql(admin(source),corpus,'source-recheck')))!==JSON.stringify(observed.rows))throw Error('source_rows_changed');
 observed.controls=controls(source);writeFileSync(file,JSON.stringify(observed),{mode:0o600});
 console.log('Unchanged local source controls captured; no row or intent was modified.');
} else if(mode==='restore'||mode==='verify-restored') {
 const names=['roles.sql','schema.sql','data.sql','migration-schema.sql','migration-data.sql','scope.json','managed-controls.json','managed-controls.sql','canonical/auth_hooks.sql','canonical/storage.sql','canonical/realtime.sql','canonical/cron.sql','canonical/webhooks.sql'],parts=new Map();
 const manifest=readFileSync(resolve(artifacts,'database/files-sha256.txt'),'utf8').trim().split('\n');
 if(manifest.length!==names.length)throw Error('backup_manifest_invalid');
 for(const line of manifest){const match=/^([a-f0-9]{64})  ([a-z_./-]+\.(?:sql|json))$/.exec(line);if(!match||!names.includes(match[2])||parts.has(match[2]))throw Error('backup_manifest_invalid');const raw=readFileSync(resolve(artifacts,'database',match[2]));if(createHash('sha256').update(raw).digest('hex')!==match[1])throw Error('backup_file_checksum_mismatch');parts.set(match[2],raw.toString('utf8'));}
 if(JSON.parse(parts.get('scope.json')).version!=='backyrd-database-snapshot-v2')throw Error('complete_backup_scope_required');
 if(mode==='restore') {
 const part=name=>parts.get(name);
 // Empty provider project only. Existing managed schemas and role setup are retained.
 assert.equal(sql(target,"select count(*) from pg_namespace where nspname='booking_private';",'empty-target'),'0');
 assert.equal(sql(admin(target),'select (select count(*) from auth.users)+(select count(*) from storage.objects)+(select count(*) from storage.buckets);','empty-managed-target'),'0');
 const restore=`begin;set local session_replication_role=replica;${part('roles.sql')}\nset local role postgres;\nalter default privileges for role postgres in schema public revoke all on functions from anon,authenticated,service_role;\nalter default privileges for role postgres in schema public revoke all on tables from anon,authenticated,service_role;\nalter default privileges for role postgres in schema public revoke all on sequences from anon,authenticated,service_role;\n${part('schema.sql')}\n${part('migration-schema.sql')}\nreset role;\n${part('data.sql')}\n${part('migration-data.sql')}\nset local session_replication_role=replica;\n${part('managed-controls.sql')}\nreset role;\ncommit;`;
 sql(admin(target),restore,'logical-restore');
 }
 const expected=JSON.parse(readFileSync(resolve(artifacts,'source.json'),'utf8'));
 if(controls(target)!==expected.controls)throw Error('restored_managed_controls_mismatch');
 if(JSON.stringify(fingerprints(target))!==JSON.stringify(expected.fingerprints))throw Error('restored_schema_or_acl_mismatch');
 const actualRows=JSON.parse(sql(admin(target),corpus,'target-row-snapshot'));
 const changed=actualRows.filter((row,i)=>JSON.stringify(row)!==JSON.stringify(expected.rows[i])).map(row=>row.relation);
 if(actualRows.length!==expected.rows.length||changed.length)throw Error('restored_corpus_row_mismatch:'+changed.join(','));
 assert.deepEqual(outcome(target),expected.outcome,'original_request_outcome_changed');
 const restored=JSON.parse(sql(target,`select jsonb_build_object('payload',payload_sealed,'digest',payload_digest,'state',state,'attempts',attempts) from booking_private.guest_mail_outbox_v1 where id='${expected.mailId}';`,'restored-mail'));
 assert.equal(restored.state,'sending');assert.equal(restored.attempts,1);assert.equal(restored.digest,expected.digest);
 const keys=JSON.parse(readFileSync(resolve(artifacts,'keys.json'),'utf8')),config=configFrom(keys);
 assert.equal(mail.openMailEnvelope(restored.payload,expected.mailId,restored.digest,config).body,expected.providerBody);
 assert.throws(()=>mail.openMailEnvelope(restored.payload,expected.mailId,restored.digest,configFrom({...keys,payload:keyring()})));
 // An isolated restore must not resume stale sends. Preserve evidence and audit the hold.
 const quarantine=readFileSync(resolve(root,'scripts/ops/fixtures/quarantine-restored-booking.sql'),'utf8');sql(target,quarantine,'quarantine-restored-queue');
 assert.equal(sql(target,"select count(*) from booking_private.guest_mail_outbox_v1 where state in ('pending','leased','sending');",'queue-fence'),'0');
 assert.equal(sql(target,`select public.booking_mail_claim_v1('${randomUUID()}') is null;`,'claim-fenced'),'t');
 assert.equal(sql(target,"select count(*) from public.booking_audit_events where action='guest_mail_restore_quarantined';",'quarantine-audit'),'2');
 sql(target,quarantine,'repeat-quarantine');assert.equal(sql(target,"select count(*) from public.booking_audit_events where action='guest_mail_restore_quarantined';",'repeat-audit'),'2');
 assert.deepEqual(outcome(target),expected.outcome,'quarantine_changed_request_outcome');
 assert.equal(sql(target,`begin;set local role service_role;select public.booking_guest_read_v1((select id from public.booking_reservations where request_id=${id('online-op')}),repeat('b',64))->>'status';rollback;`,'guest-access'),'confirmed');
 assert.equal(sql(target,"select has_table_privilege('authenticated','booking_private.guest_mail_outbox_v1','SELECT');",'private-denial'),'f');
 assert.equal(sql(target,"select has_function_privilege('anon','public.booking_mail_summary_v1(uuid,uuid,uuid,uuid,bigint,text)','EXECUTE');",'anonymous-denial'),'f');
 console.log(`BOOKING_LOGICAL_RESTORE_PASS: ${expected.rows.length} application/Auth/Storage/ledger table digests and both schema/ACL fingerprints plus managed Auth/Storage/Realtime controls match; original intent and guest access survive; sealed payload needs external key; restored sends held with idempotent audit. No actual delivery, Storage-byte, cloud-backup or production-restore claim.`);
} else throw Error('restore_mode_required');
