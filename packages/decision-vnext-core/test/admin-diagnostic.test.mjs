import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminDiagnosticHandler,BASEL_DIAGNOSTIC_QUERIES,resolveAdminDiagnosticCase} from '../dist/admin-diagnostic.js';
const actor={userId:'actor',subjectBindingHash:'hash',sessionId:'session',sessionBindingHash:'session-hash',authenticationContextHash:'auth-hash'};
function setup(overrides={}){const calls=[];const h=createAdminDiagnosticHandler({authenticate:async()=>{calls.push('auth');return actor;},isAdmin:async()=>{calls.push('admin');return true;},checkControl:async()=>{calls.push('control');},diagnose:async(input,value)=>{calls.push(['diagnose',input.caseIndex??input.query,value.userId]);return input;},...overrides});return {h,calls};}
const request=(body={caseIndex:0},headers={})=>new Request('https://example.test/diagnostic',{method:'POST',headers:{authorization:'Bearer user-session','content-type':'application/json',...headers},body:JSON.stringify(body)});
test('ten fixed cases only',()=>assert.equal(BASEL_DIAGNOSTIC_QUERIES.length,10));
test('authorized admin runs one fixed case and receives no-store',async()=>{const {h,calls}=setup();const r=await h(request({caseIndex:9}));assert.equal(r.status,200);assert.deepEqual(await r.json(),{caseIndex:9});assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(calls,['auth','admin','control',['diagnose',9,'actor']]);});
test('missing or invalid authentication never reaches admin/model',async()=>{let s=setup();assert.equal((await s.h(request({}, {authorization:''}))).status,401);assert.deepEqual(s.calls,[]);s=setup({authenticate:async()=>null});assert.equal((await s.h(request())).status,401);assert.deepEqual(s.calls,[]);});
test('ordinary users cannot reach runtime control or diagnosis',async()=>{const {h,calls}=setup({isAdmin:async()=>false});assert.equal((await h(request())).status,403);assert.deepEqual(calls,['auth']);});
test('denied admin lookup fails closed without leaking errors',async()=>{const {h}=setup({isAdmin:async()=>{throw Error('sensitive database detail');}});const r=await h(request());assert.equal(r.status,503);assert.ok(!(await r.text()).includes('sensitive'));});
test('disabled runtime control still prevents model calls',async()=>{const {h,calls}=setup({checkControl:async()=>{throw Error('disabled');}});assert.equal((await h(request())).status,503);assert.deepEqual(calls,['auth','admin']);});
test('arbitrary prompts actors model parameters and invalid indices rejected',async()=>{for(const body of [{caseIndex:0,prompt:'secret'},{caseIndex:0,userId:'other'},{caseIndex:10},{caseIndex:-1},{caseIndex:0.5},{caseIndex:'1'},[],null]){const {h,calls}=setup();assert.equal((await h(request(body))).status,400);assert.deepEqual(calls,['auth','admin']);}});
test('authorized diagnostic remains available after the former calendar expiry',async(t)=>{t.mock.timers.enable({apis:['Date'],now:Date.parse('2027-01-01T00:00:00Z')});const {h}=setup();assert.equal((await h(request())).status,200);});
test('foreign origins and oversized bodies cannot invoke a model',async()=>{let s=setup();assert.equal((await s.h(request({}, {origin:'https://foreign.test'}))).status,403);assert.deepEqual(s.calls,[]);s=setup();assert.equal((await s.h(request({caseIndex:0,extra:'x'.repeat(17000)}))).status,413);assert.deepEqual(s.calls,['auth','admin']);});
test('safe preflight never invokes auth or model',async()=>{const {h,calls}=setup();const r=await h(new Request('https://example.test',{method:'OPTIONS',headers:{origin:'https://intelligence.backyrd.ch'}}));assert.equal(r.status,204);assert.deepEqual(calls,[]);});

test('one hundred authorized requests have no artificial minute or daily quota',async()=>{const {h,calls}=setup();for(let i=0;i<100;i++)assert.equal((await h(request({caseIndex:i%10}))).status,200);assert.equal(calls.filter(c=>Array.isArray(c)&&c[0]==='diagnose').length,100);});


test('custom Admin query keeps exact wording and uses actual server time',async()=>{
 const query='Heute Abend zuerst gemütlich was essen und danach Party machen';
 const {h,calls}=setup();const response=await h(request({query}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{query});
 assert.deepEqual(calls,['auth','admin','control',['diagnose',query,'actor']]);
 const now=new Date('2026-10-30T19:04:00.000Z');
 assert.deepEqual(resolveAdminDiagnosticCase({query},now),{caseIndex:-1,query,reference:{now:now.toISOString(),timezone:'Europe/Zurich'}});
 assert.equal(resolveAdminDiagnosticCase({caseIndex:0},now).reference.now,'2026-10-29T23:49:00.000Z');
});
test('custom queries cannot override identity model city or server reference',async()=>{
 for(const body of [{query:''},{query:'  '},{query:3},{query:'x'.repeat(2001)},{query:'Dinner',userId:'other'},{query:'Dinner',model:'other'},{query:'Dinner',reference:{now:'2099-01-01'}},{query:'Dinner',caseIndex:0}]){
  const {h,calls}=setup();assert.equal((await h(request(body))).status,400);assert.deepEqual(calls,['auth','admin']);
 }
});
test('custom input requires the same Admin and runtime authority',async()=>{
 const query='Dinner';let s=setup({isAdmin:async()=>false});assert.equal((await s.h(request({query}))).status,403);
 s=setup({checkControl:async()=>{throw Error('off');}});assert.equal((await s.h(request({query}))).status,503);
});
