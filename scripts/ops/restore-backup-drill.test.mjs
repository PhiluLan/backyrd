import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copySections,normalizedSchema} from './restore-backup-drill.mjs';
test('COPY evidence preserves escaped tabs, nulls and empty tables independently of row order',()=>{
 const sections=copySections('COPY "public"."fixture" ("name", "note") FROM stdin;\nb\t\\N\na\tline\\nnext\n\\.\nCOPY public.empty (id) FROM stdin;\n\\.\n');
 assert.equal(sections.length,2);assert.equal(sections[0].count,2);assert.equal(sections[1].count,0);
 assert.deepEqual(sections[0].columns,['name','note']);
 assert.equal(sections[0].digest,copySections('COPY public.fixture (name, note) FROM stdin;\na\tline\\nnext\nb\t\\N\n\\.\n')[0].digest);
});
test('a truncated or absent data section cannot pass as a restore',()=>{
 assert.throws(()=>copySections('COPY public.fixture (name) FROM stdin;\na\n'),/incomplete/);
 assert.throws(()=>copySections('-- no data'),/incomplete/);
});
test('schema comparison ignores only dump comments/restriction nonce, keeping ACL differences',()=>{
 assert.equal(normalizedSchema('-- version one\n\\restrict nonce\nGRANT SELECT ON public.a TO anon;\n'),normalizedSchema('-- version two\nGRANT SELECT ON public.a TO anon;\n\\unrestrict other\n'));
 assert.notEqual(normalizedSchema('GRANT SELECT ON public.a TO anon;'),normalizedSchema('REVOKE SELECT ON public.a FROM anon;'));
});

test('AWS restore remains within the existing Main/OIDC/private-backup boundary',async()=>{
 const {readFileSync}=await import('node:fs');
 const workflow=readFileSync(new URL('../../.github/workflows/production-backup.yml',import.meta.url),'utf8');
 const driver=readFileSync(new URL('./restore-production-backup-drill.sh',import.meta.url),'utf8');
 const core=readFileSync(new URL('./restore-backup-drill.mjs',import.meta.url),'utf8');
 assert.match(workflow,/- restore-drill\n/);assert.match(workflow,/AWS_BACKUP_ROLE_ARN/);
 assert.match(driver,/refs\/heads\/main/);assert.match(driver,/archive-sha256/);
 assert.match(driver,/Unsafe backup archive structure/);assert.match(driver,/Links or special files/);
 assert.match(core,/network','create','--internal/);
 assert.match(core,/independentDatabaseAndMediaTargets:true/);assert.match(core,/NetworkSettings.Networks/);assert.match(core,/cron.launch_active_jobs=off/);
 assert.doesNotMatch(driver,/aws s3 (?:rm|sync)|aws s3api delete/);
 assert.match(workflow,/path: \$\{\{ runner.temp \}\}\/backyrd-restore-drill-report.json/);
 assert.doesNotMatch(workflow,/path:.*(?:snapshot.tar|unpacked|database\/data.sql)/);
});

test('CHECK formatting requires PostgreSQL confirmation and never excuses ACL or predicate changes',async()=>{
 const {compareSchema}=await import('./restore-backup-drill.mjs');
 const start='CREATE TABLE IF NOT EXISTS "public"."probe" (\n';
 const a=start+' CONSTRAINT "positive" CHECK (((x > 0) AND (x < 10)))\n);';
 const b=start+' CONSTRAINT "positive" CHECK ((x > 0) AND (x < 10))\n);';
 assert.equal(compareSchema(a,b,check=>check.schema==='public'&&check.name==='probe'&&check.constraint==='positive').matches,true);
 assert.equal(compareSchema(a,b,()=>false).matches,false);
 assert.equal(compareSchema(a+'\nGRANT SELECT ON probe TO anon;',b+'\nGRANT UPDATE ON probe TO anon;',()=>true).matches,false);
 assert.equal(compareSchema(a,b.replace('positive','other_constraint'),()=>true).matches,false);
});

test('restore failure reports SQLSTATE and structural identifiers without private details',async()=>{
 const {safeCommandFailure}=await import('./restore-backup-drill.mjs');
 const output=safeCommandFailure('docker',3,'psql:<stdin>:4: ERROR:  42703: column "missing_field" of relation "users" does not exist\nDETAIL: private@example.invalid PRIVATE_ROW_VALUE\nCONTEXT: COPY users, line 3: PRIVATE_COPY_VALUE','begin;\n-- backyrd-restore-part:data.sql\nCOPY auth.users FROM stdin;\nPRIVATE_COPY_VALUE');
 assert.match(output,/sqlstate=42703:line=4:part=data:identifiers=missing_field,users/);
 assert.doesNotMatch(output,/private@|PRIVATE_|COPY|DETAIL/);
 assert.equal(safeCommandFailure('docker',1,'PRIVATE_ARBITRARY_PROCESS_ERROR',''), 'restore_command_failed:docker:1');
});

test('managed Auth/Storage compatibility is checked before replaying original data',async()=>{
 const {requireManagedColumns}=await import('./restore-backup-drill.mjs');
 const sections=copySections('COPY auth.one_time_tokens (id, expires_at) FROM stdin;\n\\.\nCOPY public.application_table (id) FROM stdin;\n\\.\n');
 assert.throws(()=>requireManagedColumns(sections,[{table_schema:'auth',table_name:'one_time_tokens',column_name:'id'}]),/restore_platform_schema_missing:auth.one_time_tokens.expires_at/);
 assert.doesNotThrow(()=>requireManagedColumns(sections,['id','expires_at'].map(column_name=>({table_schema:'auth',table_name:'one_time_tokens',column_name}))));
});

test('complete multiline CHECK expressions reach PostgreSQL, including quoted parentheses',async()=>{
 const {compareSchema}=await import('./restore-backup-drill.mjs');
 const start='CREATE TABLE IF NOT EXISTS "public"."probe" (\n';
 const source=start+' CONSTRAINT "boundary" CHECK (((day +\n interval \'1 day\') > day) AND (note <> \')\'))\n);';
 const target=start+' CONSTRAINT "boundary" CHECK ((day + interval \'1 day\') > day AND note <> \')\')\n);';
 let complete=false;
 assert.equal(compareSchema(source,target,check=>{complete=check.expression.includes("interval '1 day'")&&check.expression.endsWith("'))");return true;}).matches,true);
 assert.equal(complete,true);
 assert.equal(compareSchema(source,target,()=>false).matches,false);
 assert.equal(compareSchema(source,target+'\nGRANT ALL ON public.probe TO anon;',()=>true).matches,false);
});

test('a rehearsed correction never claims the original source foreign keys were valid',async()=>{
 const {integrityReceiptFields}=await import('./restore-backup-drill.mjs');
 assert.equal(integrityReceiptFields(null).status,'PASS');assert.equal(integrityReceiptFields(null).foreignKeysValidated,true);
 const proposed={migration:{path:'synthetic'},removedDeadReferences:37};const receipt=integrityReceiptFields(proposed);
 assert.equal(receipt.status,'PASS_WITH_REHEARSED_INTEGRITY_REPAIR');assert.equal(receipt.foreignKeysValidated,false);
 assert.equal(receipt.foreignKeysAfterRehearsedRepairValidated,true);assert.deepEqual(receipt.proposedIntegrityRepair,proposed);
});
