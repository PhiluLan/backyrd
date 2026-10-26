import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {RESEARCH_MIGRATION as target,VOLTA_MIGRATIONS as volta,DEFERRED_BOOKING_MIGRATIONS as deferred,scopeResearchMigrations,scopeVoltaMigrations,researchAppliedReceipt,voltaAppliedReceipt,prepareResearchMigrationWorkspace} from './isolated-research-migration.mjs';
const base='a'.repeat(40);
const scope={contractVersion:'backyrd.isolated-research-migration-scope@1.0',baseSha:base,migrations:[target],deferredMigrations:deferred,backupRunId:1,executionAuthorized:false};
const input=()=>({pending:[...deferred,target],scope:structuredClone(scope),baseSha:base,deployFunctions:[],authDeploy:false,applied:null});
test('safety correction uses the exact approved SQL and its own receipt without losing research history', async()=>{
 const {RESEARCH_SAFETY_MIGRATION:safety,RESEARCH_SAFETY_DEFERRED_FUNCTION_CHANGES:bindings,SAFETY_DEFERRED_MIGRATIONS:safetyDeferred}=await import('./isolated-research-migration.mjs');
 const request={...input(),scope:{...scope,migrations:[safety],deferredMigrations:safetyDeferred},pending:[...safetyDeferred,safety],applied:{migration:target},appliedSafety:null};
 assert.deepEqual(scopeResearchMigrations(request).pendingMigrations,[safety]);
 assert.deepEqual(scopeResearchMigrations({...request,scope:{...request.scope,deferredFunctionChanges:bindings}}).pendingMigrations,[safety]);
 assert.throws(()=>scopeResearchMigrations({...request,scope:{...request.scope,deferredFunctionChanges:[{...bindings[0],sourceSetHash:'a'.repeat(64)}]}}),/binding_invalid/);
 assert.deepEqual(scopeResearchMigrations({...request,pending:safetyDeferred,appliedSafety:{migration:safety}}).pendingMigrations,[]);
 for(const patch of [{applied:null},{pending:[safety]},{pending:[...deferred,{...safety,sha256:'b'.repeat(64)}]},{deployFunctions:['decision-v13']},{authDeploy:true}])
  assert.throws(()=>scopeResearchMigrations({...request,...patch}),/isolated_research/);
 const receipt={status:'APPLIED_AND_VERIFIED',migration:safety,sourceSha:'b'.repeat(40),deploymentRunId:3,manifestHash:'c'.repeat(64)};
 const root=new URL('../..',import.meta.url).pathname;
 const read=path=>readFileSync(join(root,path));
 assert.equal(researchAppliedReceipt({supabase:{isolatedResearchSafetyRelease:receipt}},read,()=>true,true),receipt);
 assert.equal(researchAppliedReceipt({supabase:{isolatedResearchSafetyRelease:receipt}},read,()=>true),null);
 assert.throws(()=>researchAppliedReceipt({supabase:{isolatedResearchSafetyRelease:{...receipt,migration:target}}},read,()=>true,true),/receipt_invalid/);
 const output=mkdtempSync(join(tmpdir(),'backyrd-isolated-research-safety-'));
 const plan={...scopeResearchMigrations(request),baseSha:base,deployFunctions:[],authConfig:null,appliedResearch:request.applied,appliedResearchSafety:null};
 prepareResearchMigrationWorkspace(plan,root,output);
 assert.equal(readFileSync(join(output,safety.path),'utf8'),readFileSync(join(root,safety.path),'utf8'));
 for(const item of safetyDeferred)assert.equal(existsSync(join(output,item.path)),false);
});
test('a SQL-only deployment audit rejects an unplanned bundle change even at the same version',()=>{
 const dir=mkdtempSync(join(tmpdir(),'backyrd-isolated-function-audit-'));
 const plan={canonicalMainSha:base,planHash:'c'.repeat(64),deployFunctions:[],functions:[{slug:'decision-v13',verifyJwt:true,sourceSetHash:'b'.repeat(64)}],migrations:[],pendingMigrations:[],authConfig:null};
 const before=[{slug:'decision-v13',version:1,verify_jwt:true,ezbr_sha256:'a'.repeat(64)}];
 for(const [name,value] of Object.entries({plan,before,after:[{...before[0],ezbr_sha256:'b'.repeat(64)}]}))writeFileSync(join(dir,name+'.json'),JSON.stringify(value));
 assert.throws(()=>execFileSync(process.execPath,[new URL('./verify-supabase-production-audit.mjs',import.meta.url).pathname,'--plan',join(dir,'plan.json'),'--before',join(dir,'before.json'),'--after',join(dir,'after.json'),'--output',join(dir,'audit.json')],{stdio:'pipe'}),/unplanned_function_bundle_changed/);
});
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

const voltaScope={contractVersion:'backyrd.isolated-volta-migration-scope@1.0',baseSha:base,migrations:volta,deferredMigrations:deferred,backupRunId:2,executionAuthorized:false};
const voltaInput=()=>({pending:[...deferred,...volta],scope:structuredClone(voltaScope),baseSha:base,deployFunctions:[],authDeploy:false,appliedResearch:{migration:target},appliedVolta:null});
test('the Volta release selects only the two data corrections after the verified research release',()=>{
 const selected=scopeVoltaMigrations(voltaInput());
 assert.deepEqual(selected.pendingMigrations,volta);
 assert.deepEqual(selected.deferredMigrations,deferred);
 for(const patch of [
  {pending:[...deferred,volta[0]]},
  {pending:[...deferred,...volta,{path:'supabase/migrations/20261025000000_other.sql',sha256:'c'.repeat(64)}]},
  {pending:[...deferred,{...volta[0],sha256:'b'.repeat(64)},volta[1]]},
  {appliedResearch:null},{deployFunctions:['decision-v13']},{authDeploy:true},{baseSha:'b'.repeat(40)},
  {scope:{...voltaScope,executionAuthorized:true}},
 ])assert.throws(()=>scopeVoltaMigrations({...voltaInput(),...patch}),/isolated_volta/);
});
test('an applied Volta receipt excludes both map migrations but not Booking',()=>{
 const selected=scopeVoltaMigrations({...voltaInput(),pending:deferred,appliedVolta:{migrations:volta}});
 assert.deepEqual(selected.pendingMigrations,[]);
 assert.deepEqual(selected.deferredMigrations,deferred);
 const receipt={status:'APPLIED_AND_VERIFIED',migrations:volta,sourceSha:'b'.repeat(40),deploymentRunId:3,manifestHash:'c'.repeat(64)};
 assert.equal(voltaAppliedReceipt({},()=>'',()=>true),null);
 assert.throws(()=>voltaAppliedReceipt({supabase:{isolatedVoltaRelease:receipt}},()=>'',()=>true),/receipt_invalid/);
 assert.throws(()=>voltaAppliedReceipt({supabase:{isolatedVoltaRelease:{...receipt,migrations:[volta[0]]}}},()=>'',()=>true),/receipt_invalid/);
});
test('the isolated Volta workspace includes both map migrations and excludes Booking',()=>{
 const root=new URL('../..',import.meta.url).pathname;
 const output=mkdtempSync(join(tmpdir(),'backyrd-isolated-volta-'));
 const plan={...scopeVoltaMigrations(voltaInput()),baseSha:base,deployFunctions:[],authConfig:null,appliedResearch:{migration:target},appliedVolta:null};
 prepareResearchMigrationWorkspace(plan,root,output);
 for(const item of volta)assert.equal(readFileSync(join(output,item.path),'utf8'),readFileSync(join(root,item.path),'utf8'));
 for(const item of deferred)assert.equal(existsSync(join(output,item.path)),false);
});
