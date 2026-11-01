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
