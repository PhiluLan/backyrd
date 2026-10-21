import assert from "node:assert/strict";
import { readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync,statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("backup workflow is main-only, OIDC-authenticated and fail-closed", () => {
  const workflow = read(".github/workflows/production-backup.yml");
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /AWS_BACKUP_ROLE_ARN/);
  assert.match(workflow, /allowed-account-ids/);
  assert.match(workflow, /export-production-backup\.sh/);
  assert.doesNotMatch(workflow, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
});

test("bucket contract binds privacy, KMS encryption and 30-day retention", () => {
  const template = read("infrastructure/aws/production-backup.yaml");
  for (const setting of ["BlockPublicAcls", "BlockPublicPolicy", "IgnorePublicAcls", "RestrictPublicBuckets"]) {
    assert.match(template, new RegExp(`${setting}: true`));
  }
  assert.match(template, /SSEAlgorithm: aws:kms/);
  assert.match(template, /EnableKeyRotation: true/);
  assert.match(template, /ExpirationInDays: 30/);
  assert.match(template, /Type: AWS::IAM::OIDCProvider/);
  assert.match(template, /Url: https:\/\/token\.actions\.githubusercontent\.com/);
  assert.match(template, /ClientIdList:\s*\n\s*- sts\.amazonaws\.com/);
  assert.match(template, /repo:\$\{Repository\}:ref:refs\/heads\/main/);
  assert.match(template, /s3:GetEncryptionConfiguration/);
  assert.match(template, /s3:GetLifecycleConfiguration/);
  assert.doesNotMatch(template, /s3:GetBucketEncryption/);
  assert.doesNotMatch(template, /s3:GetBucketLifecycleConfiguration/);
});

test("backup exporter verifies account, bucket and object contracts before success", () => {
  const script = read("scripts/ops/export-production-backup.sh");
  assert.match(script, /canonical main SHA mismatch/);
  assert.match(script, /dedicated backup account mismatch/);
  assert.match(script, /get-public-access-block/);
  assert.match(script, /get-bucket-encryption/);
  assert.match(script, /get-bucket-lifecycle-configuration/);
  assert.match(script, /supabase storage cp/);
  assert.match(script, /export-database-snapshot\.sh/);
  assert.match(script, /head-object/);
  assert.doesNotMatch(script, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
});

test("database export keeps all application/private schemas plus separate migration history",()=>{
  const script=read("scripts/ops/export-database-snapshot.sh");
  assert.match(script,/2\.116\.0/);assert.match(script,/--role-only/);
  assert.doesNotMatch(script,/--schema public(?:\s|,)/);
  assert.match(script,/--data-only --use-copy --file/);
  assert.match(script,/--schema supabase_migrations --file/);
  assert.match(script,/Private Booking schema is missing/);assert.match(script,/Private Booking data sections are missing/);
  assert.match(script,/Migration history is missing/);assert.match(script,/chmod 600/);
  assert.match(script,/Local backup requires an explicit disposable fixture/);
});

test("backup contract is exercised in PR delivery checks and before the Main export",()=>{
  assert.match(read(".github/workflows/risk-gate.yml"),/node --test[^\n]*scripts\/ops\/verify-production-backup-contract\.test\.mjs/);
  const workflow=read(".github/workflows/production-backup.yml");
  assert.ok(workflow.indexOf('Verify backup export contract')<workflow.indexOf('Configure short-lived AWS identity'));
});

function exportFixture(options={}) {
 const root=mkdtempSync(join(tmpdir(),'backyrd-backup-contract-')),workdir=join(root,'fixture'),output=join(root,'database'),binary=join(root,'fake-cli.mjs'),calls=join(root,'calls.json');
 mkdirSync(join(workdir,'supabase'),{recursive:true});writeFileSync(join(workdir,'supabase/config.toml'),options.production?'project_id="hjgcrrzfjchzqoegcywn"':'project_id="synthetic-restore-fixture"');
 writeFileSync(binary,`#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const args=process.argv.slice(2),file=process.env.FAKE_CALLS;const calls=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];calls.push(args);fs.writeFileSync(file,JSON.stringify(calls));
if(args.includes('--version')){console.log(process.env.FAKE_VERSION);process.exit(0);}
if(args[1]==='query'){console.log(JSON.stringify([{managed_backup:{version:'backyrd-managed-recovery-controls-v1',safeStorageRls:process.env.FAKE_SAFE_RLS!=='0',ruleCount:1,sql:'-- synthetic captured controls'}}]));process.exit(0);}
const target=args[args.indexOf('--file')+1],name=path.basename(target);
fs.writeFileSync(target,name==='migration-data.sql'?'COPY supabase_migrations.schema_migrations FROM stdin;':process.env.FAKE_PRIVATE==='0'?'CREATE SCHEMA public;':'-- synthetic booking_private payload section');
`,{mode:0o700});
 if(options.existing){mkdirSync(output);writeFileSync(join(output,'keep'),'original');}
 const result=spawnSync('bash',[new URL('./export-database-snapshot.sh',import.meta.url).pathname,output],{encoding:'utf8',env:{...process.env,BACKYRD_BACKUP_SUPABASE_CLI:binary,BACKYRD_BACKUP_DATABASE_TARGET:options.target??'local',BACKYRD_BACKUP_EPHEMERAL:options.ephemeral??'1',BACKYRD_BACKUP_LOCAL_WORKDIR:workdir,FAKE_CALLS:calls,FAKE_VERSION:options.version??'2.116.0',FAKE_PRIVATE:options.private===false?'0':'1',FAKE_SAFE_RLS:options.safeRls===false?'0':'1'}});
 return {root,output,result,calls:existsSync(calls)?JSON.parse(readFileSync(calls)):[],cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('actual exporter orchestration includes private/default data and a separate migration history with private file permissions',()=>{
 const f=exportFixture();try{assert.equal(f.result.status,0,f.result.stderr);const dump=f.calls.filter(a=>a[0]==='db'&&a[1]==='dump');assert.equal(dump.length,5);
 for(const args of dump){assert.ok(args.includes('--local'));assert.ok(args.includes('--workdir'));}
 const data=dump.find(a=>a[a.indexOf('--file')+1].endsWith('/data.sql'));assert.ok(data.includes('--data-only'));assert.ok(data.includes('--use-copy'));assert.ok(!data.includes('--schema'));
 const history=dump.filter(a=>a.includes('supabase_migrations'));assert.equal(history.length,2);
 for(const file of ['roles.sql','schema.sql','data.sql','migration-schema.sql','migration-data.sql','scope.json','files-sha256.txt'])assert.equal(statSync(join(f.output,file)).mode&0o777,0o600);
 assert.equal(JSON.parse(readFileSync(join(f.output,'scope.json'))).version,'backyrd-database-snapshot-v2');
 assert.equal(readFileSync(join(f.output,'files-sha256.txt'),'utf8').trim().split('\n').length,13);
 assert.match(readFileSync(join(f.output,'canonical/auth_hooks.sql'),'utf8'),/create trigger on_auth_user_created/);
 assert.equal(statSync(join(f.output,'canonical/auth_hooks.sql')).mode&0o777,0o600);
 }finally{f.cleanup();}
});
for(const [label,options] of [['unexpected CLI',{version:'2.80.0'}],['non-disposable local target',{ephemeral:'0'}],['production reference in local fixture',{production:true}],['unknown target',{target:'other'}],['existing snapshot',{existing:true}]])test('exporter refuses '+label+' before dumping any rows',()=>{
 const f=exportFixture(options);try{assert.notEqual(f.result.status,0);assert.equal(f.calls.filter(a=>a[0]==='db'&&a[1]==='dump').length,0);if(options.existing)assert.equal(readFileSync(join(f.output,'keep'),'utf8'),'original');}finally{f.cleanup();}
});
test('missing private Booking content cannot produce a completed snapshot',()=>{const f=exportFixture({private:false});try{assert.notEqual(f.result.status,0);assert.match(f.result.stderr,/Private Booking schema is missing/);assert.equal(existsSync(join(f.output,'scope.json')),false);}finally{f.cleanup();}});

test('disabled Storage protection cannot produce a completed backup',()=>{const f=exportFixture({safeRls:false});try{assert.notEqual(f.result.status,0);assert.equal(existsSync(join(f.output,'scope.json')),false);}finally{f.cleanup();}});
