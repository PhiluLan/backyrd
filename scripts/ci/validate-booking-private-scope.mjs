#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const SHA=/^[a-f0-9]{64}$/;
const hash=value=>createHash('sha256').update(value).digest('hex');
export function scopeInputs(root) {
  const historicalRecords=JSON.parse(readFileSync(resolve(root,'supabase/historical-data-operations.json'),'utf8'));
  if(!Array.isArray(historicalRecords)||historicalRecords.some(x=>!/^\d{14}$/.test(x.version)||!x.file.startsWith(x.version+'_')))throw Error('booking_scope_historical_lineage_invalid');
  const historical=new Set(historicalRecords.map(x=>x.file));
  const migrations=readdirSync(resolve(root,'supabase/migrations')).filter(x=>/^\d{14}_[a-z0-9_]+\.sql$/.test(x)&&!historical.has(x)).sort();
  if(!migrations.length)throw Error('booking_scope_migration_lineage_missing');
  const versions=migrations.map(x=>x.slice(0,14));
  if(new Set(versions).size!==versions.length)throw Error('booking_scope_migration_lineage_ambiguous');
  return {
    historicalVersions:historicalRecords.map(x=>x.version).sort(),
    historicalOperationsSha256:hash(readFileSync(resolve(root,'supabase/historical-data-operations.json'))),
    migrationCount:versions.length,migrationLedgerSha256:hash(versions.join('\n')+'\n'),
    migrationsSha256:hash(JSON.stringify(migrations.map(path=>({path,sha256:hash(readFileSync(resolve(root,'supabase/migrations',path)))})))),
    querySha256:hash(readFileSync(resolve(root,'scripts/ci/booking-private-fingerprint.sql'))),
    engineSha256:hash(readFileSync(resolve(root,'scripts/ci/application-schema-fingerprint.sql'))),
  };
}
export function parseScopeObservation(value) {
  const rows=value.trim().split(/\r?\n/);
  if(rows.length!==2||!/^LEDGER\|[1-9]\d*\|[a-f0-9]{64}$/.test(rows[0])||!/^\d+\|[a-f0-9]{64}$/.test(rows[1]))throw Error('booking_scope_observation_invalid');
  const [,count,ledger]=rows[0].split('|'),[entries,fingerprint]=rows[1].split('|');
  if(!Number.isSafeInteger(Number(count))||!Number.isSafeInteger(Number(entries))||Number(entries)<1)throw Error('booking_scope_observation_invalid');
  return {migrationCount:Number(count),migrationLedgerSha256:ledger,entryCount:Number(entries),fingerprint};
}
export function scopeRecord(inputs,observation) {
  if(inputs.migrationCount!==observation.migrationCount||inputs.migrationLedgerSha256!==observation.migrationLedgerSha256)throw Error('booking_scope_remote_lineage_mismatch');
  return {schemaVersion:'backyrd-booking-private-scope-v1',scope:'booking_private',inputs,entryCount:observation.entryCount,fingerprint:observation.fingerprint};
}
export function verifyScopeRecord(expected,inputs,observation) {
  if(expected?.schemaVersion!=='backyrd-booking-private-scope-v1'||expected.scope!=='booking_private'||!SHA.test(expected.fingerprint??''))throw Error('booking_scope_evidence_invalid');
  const current=scopeRecord(inputs,observation);
  if(JSON.stringify(expected.inputs)!==JSON.stringify(current.inputs))throw Error('booking_scope_evidence_inputs_changed');
  if(expected.entryCount!==current.entryCount||expected.fingerprint!==current.fingerprint)throw Error('booking_private_semantic_or_acl_drift');
  return current;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=Object.fromEntries(process.argv.slice(2).flatMap((v,i,a)=>v.startsWith('--')?[[v.slice(2),a[i+1]]]:[]));
    if(args.mode!=='verify'&&args.mode!=='record')throw Error('booking_scope_mode_required');
    const root=resolve(args.root??new URL('../..',import.meta.url).pathname),output=resolve(root,'delivery/database-scopes/booking-private-v1.json');
    const db=process.env.BACKYRD_BOOKING_SCOPE_DB_URL;
    if(!db)throw Error('booking_scope_database_required');
    const inputs=scopeInputs(root);
    let raw;
    try {raw=execFileSync('psql',['--dbname',db,'-X','--set',`historical_versions={${inputs.historicalVersions.join(',')}}`,'--set','ON_ERROR_STOP=1','--quiet','--tuples-only','--no-align','--file',resolve(root,'scripts/ci/booking-private-fingerprint.sql')],{encoding:'utf8',env:{...process.env,PGCONNECT_TIMEOUT:'10'},stdio:['ignore','pipe','pipe'],timeout:25000});}
    catch {throw Error('booking_scope_read_only_observation_failed');}
    const observation=parseScopeObservation(raw);
    if(args.mode==='record') {
      // Explicit local recording only; normal CI/operating verification never rewrites evidence.
      const parsed=new URL(db);
      if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)||process.env.BACKYRD_BOOKING_DRIFT_EPHEMERAL!=='1')throw Error('booking_scope_record_requires_local_fixture');
      const record=scopeRecord(inputs,observation);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(record,null,2)+'\n');
      process.stdout.write(JSON.stringify({status:'RECORDED',entryCount:record.entryCount,fingerprint:record.fingerprint})+'\n');
    } else {
      const current=verifyScopeRecord(JSON.parse(readFileSync(output,'utf8')),inputs,observation);
      process.stdout.write(JSON.stringify({status:'PASS',scope:current.scope,entryCount:current.entryCount,fingerprint:current.fingerprint})+'\n');
    }
  } catch(error) {process.stderr.write(`booking_private_scope_blocked:${error.message}\n`);process.exitCode=1;}
}
