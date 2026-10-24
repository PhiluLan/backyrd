import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {RESEARCH_MIGRATION as target,DEFERRED_BOOKING_MIGRATIONS as deferred,scopeResearchMigrations,researchAppliedReceipt,prepareResearchMigrationWorkspace} from './isolated-research-migration.mjs';
const base='a'.repeat(40);
const scope={contractVersion:'backyrd.isolated-research-migration-scope@1.0',baseSha:base,migrations:[target],deferredMigrations:deferred,backupRunId:1,executionAuthorized:false};
const input=()=>({pending:[...deferred,target],scope:structuredClone(scope),baseSha:base,deployFunctions:[],authDeploy:false,applied:null});
test('the isolated scope selects exactly research and keeps every Booking migration explicitly deferred',()=>{
 const selected=scopeResearchMigrations(input());
 assert.deepEqual(selected.pendingMigrations,[target]);assert.deepEqual(selected.deferredMigrations,deferred);
 assert.deepEqual(scopeResearchMigrations({...input(),scope:null}).pendingMigrations,[...deferred,target]);
});
test('extra, changed or missing migration bytes and unrelated runtime changes fail closed',()=>{
 for(const patch of [
  {pending:[...deferred,{...target,sha256:'b'.repeat(64)}]},
  {pending:[...deferred,target,{path:'supabase/migrations/20261025000000_other.sql',sha256:'c'.repeat(64)}]},
  {pending:[target]}, {deployFunctions:['decision-v13']},{authDeploy:true},{baseSha:'b'.repeat(40)},
  {scope:{...scope,executionAuthorized:true}},{scope:{...scope,deferredMigrations:[]}},
 ])assert.throws(()=>scopeResearchMigrations({...input(),...patch}),/isolated_research/);
});
test('a verified isolated receipt removes only research, never hides deferred Booking migrations',()=>{
 const selected=scopeResearchMigrations({...input(),pending:deferred,applied:{migration:target}});
 assert.deepEqual(selected.pendingMigrations,[]);assert.deepEqual(selected.deferredMigrations,deferred);
 assert.throws(()=>scopeResearchMigrations({...input(),applied:{migration:target}}),/scope_changed/);
});
test('forged receipts, source lineage and changed canonical bytes cannot suppress a migration',()=>{
 const receipt={status:'APPLIED_AND_VERIFIED',migration:target,sourceSha:'b'.repeat(40),deploymentRunId:1,manifestHash:'c'.repeat(64)};
 for(const patch of [{status:'PENDING'},{migration:{...target,sha256:'c'.repeat(64)}},{deploymentRunId:0},{sourceSha:'unknown'},{manifestHash:'missing'}])
  assert.throws(()=>researchAppliedReceipt({supabase:{isolatedResearchRelease:{...receipt,...patch}}},()=>'',()=>true),/receipt_invalid/);
 assert.throws(()=>researchAppliedReceipt({supabase:{isolatedResearchRelease:receipt}},()=>'',()=>false),/receipt_invalid/);
 assert.throws(()=>researchAppliedReceipt({supabase:{isolatedResearchRelease:receipt}},()=>'',()=>true),/receipt_invalid/);
 assert.equal(researchAppliedReceipt({},()=>'',()=>true),null);
});
test('workspace refuses tampered plan before copying or removing any checkout files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'backyrd-isolated-deny-'));
 mkdirSync(join(dir,'supabase/migrations'),{recursive:true});
 writeFileSync(join(dir,'supabase/config.toml'),'project_id="fixture"');
 const plan={...scopeResearchMigrations(input()),baseSha:base,deployFunctions:[],authConfig:null};
 assert.throws(()=>prepareResearchMigrationWorkspace({...plan,pendingMigrations:[]},dir,join(dir,'output')),/workspace_plan_invalid|scope_changed/);
 assert.equal(existsSync(join(dir,'output')),false);
});

test('the real isolated workspace retains exact SQL and leaves all four Booking files untouched in source',()=>{
 const root=new URL('../..',import.meta.url).pathname;
 const output=mkdtempSync(join(tmpdir(),'backyrd-isolated-workspace-'));
 const plan={...scopeResearchMigrations(input()),baseSha:base,deployFunctions:[],authConfig:null,appliedResearch:null};
 prepareResearchMigrationWorkspace(plan,root,output);
 assert.equal(readFileSync(join(output,target.path),'utf8'),readFileSync(join(root,target.path),'utf8'));
 for(const item of deferred){assert.equal(existsSync(join(output,item.path)),false);assert.equal(existsSync(join(root,item.path)),true);}
 assert.throws(()=>prepareResearchMigrationWorkspace({...plan,pendingMigrations:[{...target,sha256:'b'.repeat(64)}]},root,join(output,'bad')),/isolated_research/);
});

test('deployment audit names applied research separately from the four deferred Booking migrations',()=>{
 const dir=mkdtempSync(join(tmpdir(),'backyrd-isolated-audit-'));
 const plan={canonicalMainSha:base,planHash:'c'.repeat(64),deployFunctions:[],functions:[],migrations:[...deferred,target],pendingMigrations:[target],deferredMigrations:deferred,authConfig:null};
 for(const [name,value] of Object.entries({plan,before:[],after:[]}))writeFileSync(join(dir,name+'.json'),JSON.stringify(value));
 execFileSync(process.execPath,[new URL('./verify-supabase-production-audit.mjs',import.meta.url).pathname,'--plan',join(dir,'plan.json'),'--before',join(dir,'before.json'),'--after',join(dir,'after.json'),'--output',join(dir,'audit.json')]);
 const result=JSON.parse(readFileSync(join(dir,'audit.json'),'utf8'));
 assert.deepEqual(result.appliedMigrations,[target]);assert.deepEqual(result.deferredMigrations,deferred);assert.equal(result.result,'PASS');
});
