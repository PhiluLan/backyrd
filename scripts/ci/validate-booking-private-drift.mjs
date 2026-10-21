#!/usr/bin/env node
// Deliberate catalog mutations only inside rolled-back transactions in the gate's disposable database.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { scopeInputs } from './validate-booking-private-scope.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname),db=process.env.DB_URL;
if(process.env.BACKYRD_BOOKING_DRIFT_EPHEMERAL!=='1'||!db||!['127.0.0.1','localhost','[::1]'].includes(new URL(db).hostname))throw Error('booking_drift_requires_local_ephemeral_database');
const engine=readFileSync(resolve(root,'scripts/ci/application-schema-fingerprint.sql'),'utf8');
function fingerprint(mutation='',setup='') {
  const sql=`begin; set local statement_timeout='15s'; set local search_path=pg_catalog,public; set local backyrd.fingerprint_scope='booking-private-v1';\n${setup}\n${mutation}\n${engine}\nrollback;`;
  let raw;
  try{raw=execFileSync('psql',['--dbname',db,'-X','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',env:{...process.env,PGCONNECT_TIMEOUT:'10'},stdio:['pipe','pipe','pipe'],timeout:25000}).trim();}
  catch{throw Error('booking_drift_fixture_execution_failed');}
  assert.match(raw,/^\d+\|[a-f0-9]{64}$/);return raw;
}
const baseline=fingerprint();
const mutations=[
 ['column','alter table booking_private.guest_mail_outbox_v1 add column drift_probe text;'],
 ['constraint','alter table booking_private.guest_mail_outbox_v1 add constraint drift_probe check(attempts<99);'],
 ['policy','create policy booking_drift_probe on booking_private.guest_mail_outbox_v1 for select to anon using (true);'],
 ['function-search-path','alter function booking_private.manual_email_v1(text) set search_path=public;'],
 ['rls','alter table booking_private.guest_mail_outbox_v1 disable row level security;'],
 ['forced-rls','alter table booking_private.guest_mail_outbox_v1 force row level security;'],
 ['trigger-enabled','alter table booking_private.guest_mail_outbox_v1 disable trigger booking_mail_payload_guard;'],
 ['schema-usage','grant usage on schema booking_private to anon;'],
 ['schema-create','grant create on schema booking_private to authenticated;'],
 ['table-acl','grant select on booking_private.guest_mail_outbox_v1 to anon;'],
 ['column-acl','grant select(manual_summary) on booking_private.guest_mail_outbox_v1 to authenticated;'],
 ['function-acl','grant execute on function booking_private.manual_email_v1(text) to anon;'],
 ['public-function-acl','grant execute on function booking_private.manual_email_v1(text) to public;'],
 ['function-body',"create or replace function booking_private.manual_email_v1(p_email text) returns text language sql immutable set search_path='' as $$ select trim(p_email); $$;"],
 ['default-acl','alter default privileges for role postgres in schema booking_private grant execute on functions to authenticated;'],
 ['index','create index drift_probe on booking_private.guest_mail_outbox_v1(created_at);'],
];
for(const [name,sql]of mutations){assert.notEqual(fingerprint(sql),baseline,`drift_missed:${name}`);assert.equal(fingerprint(),baseline,`rollback_failed:${name}`);process.stdout.write(`BOOKING_PRIVATE_DRIFT_DETECTED:${name}\n`);}
const domain='create domain booking_private.drift_probe_domain as text;';
assert.notEqual(fingerprint('revoke usage on type booking_private.drift_probe_domain from public;',domain),fingerprint('',domain),'type_acl_drift_missed');
const sequence='create sequence booking_private.drift_probe_sequence;';
assert.notEqual(fingerprint('grant usage on sequence booking_private.drift_probe_sequence to anon;',sequence),fingerprint('',sequence),'sequence_acl_drift_missed');
const inherited='create role booking_drift_scope_role nologin; grant select(manual_summary) on booking_private.guest_mail_outbox_v1 to booking_drift_scope_role;';
assert.notEqual(fingerprint('grant booking_drift_scope_role to authenticated;',inherited),fingerprint('',inherited),'inherited_column_acl_drift_missed');
const ownerSetup='grant create on schema booking_private to service_role;';
assert.notEqual(fingerprint('alter function booking_private.manual_email_v1(text) owner to service_role;',ownerSetup),fingerprint('',ownerSetup),'function_owner_drift_missed');
assert.equal(fingerprint('create table public.booking_drift_unrelated(id integer);'),baseline,'private_scope_includes_unrelated_public_catalog');
const dataSetup='create table booking_private.drift_probe_rows(id integer primary key, payload text);';
assert.equal(fingerprint("insert into booking_private.drift_probe_rows values(1,'SYNTHETIC_GUEST_DATA');",dataSetup),fingerprint('',dataSetup),'private_scope_hashes_guest_rows');
assert.equal(fingerprint(),baseline,'final_rollback_failed');
// Reuse the exact observed ledger query; certified historical data-only operations
// may be present in Production and absent from clean boot. Unknown versions may not.
const wrapper=readFileSync(resolve(root,'scripts/ci/booking-private-fingerprint.sql'),'utf8');
const ledgerQuery=wrapper.slice(wrapper.indexOf("select 'LEDGER'"),wrapper.indexOf('\\ir'));
const ignored=scopeInputs(root).historicalVersions;
function ledger(mutation='') {
  const sql=`begin;\n${mutation}\n${ledgerQuery}\nrollback;`;
  try{return execFileSync('psql',['--dbname',db,'-X','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--set',`historical_versions={${ignored.join(',')}}`],{input:sql,encoding:'utf8',env:{...process.env,PGCONNECT_TIMEOUT:'10'},stdio:['pipe','pipe','pipe'],timeout:25000}).trim();}
  catch{throw Error('booking_drift_ledger_fixture_execution_failed');}
}
const originalLedger=ledger();
for(const version of ignored)assert.equal(ledger(`insert into supabase_migrations.schema_migrations(version) values('${version}') on conflict do nothing;`),originalLedger,'certified_historical_ledger_not_normalized');
assert.notEqual(ledger("insert into supabase_migrations.schema_migrations(version) values('19990101000000');"),originalLedger,'unknown_remote_migration_ignored');
assert.equal(ledger(),originalLedger,'ledger_fixture_not_rolled_back');
process.stdout.write('BOOKING_PRIVATE_DRIFT_ACCEPTANCE_PASS: 20 catalog/ACL mutations detected; rollback, public-scope separation, row-data independence and exact normalized migration ledger verified.\n');
