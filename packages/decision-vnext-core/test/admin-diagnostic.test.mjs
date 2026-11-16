import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminDiagnosticHandler,BASEL_DIAGNOSTIC_QUERIES,resolveAdminDiagnosticCase} from '../dist/admin-diagnostic.js';
import { summarizeNuknukActivity } from '../dist/nuknuk-activity-summary.js';
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

test('NukNuk status uses the admin boundary and a model check also uses runtime control', async () => {
 const check = async mode => ({state:mode === 'model' ? 'healthy' : 'connected'});
 let s=setup({isAdmin:async()=>false,nuknukStatus:()=>assert.fail('non-admin status check')});
 assert.equal((await s.h(request({nuknukStatus:'connection'}))).status,403);
 s=setup({nuknukStatus:check});
 assert.deepEqual(await (await s.h(request({nuknukStatus:'connection'}))).json(),{state:'connected'});
 assert.deepEqual(s.calls,['auth','admin']);
 assert.deepEqual(await (await s.h(request({nuknukStatus:'model'}))).json(),{state:'healthy'});
 assert.deepEqual(s.calls,['auth','admin','auth','admin','control']);
 assert.equal((await s.h(request({nuknukStatus:'model',endpoint:'https://foreign.test'}))).status,400);
 s=setup({checkControl:async()=>{throw Error('off');},nuknukStatus:()=>assert.fail('disabled model check')});
 assert.equal((await s.h(request({nuknukStatus:'model'}))).status,503);
});

test('a reachable HTTPS endpoint does not count as a healthy model', async () => {
 const {checkAdminNuknukStatus}=await import('../dist/admin-nuknuk-status.js');
 const configuration={provider:'nuknuk-personal',aiEnabled:true,personalUser:'00000000-0000-0000-0000-000000000001',
  model:'nuknuk-35b-r15',endpoint:'https://fixture.example/v1/chat/completions',apiKey:'private-fixture-key'};
 const signal=new AbortController().signal;
 const passive=await checkAdminNuknukStatus(configuration,'connection',signal,async (_url,init)=>{
  assert.deepEqual(init.headers,{'content-type':'application/json'});
  assert.equal(init.redirect,'error');
  return new Response(null,{status:401});
 });
 assert.equal(passive.state,'connected');
 const result=await checkAdminNuknukStatus(configuration,'model',signal,async (_url,init)=>{
  assert.equal(init.headers.authorization,'Bearer private-fixture-key');
  assert.equal(JSON.parse(init.body).max_tokens,96);
  return Response.json({model:configuration.model,choices:[{message:{content:'{"route":"UPDATE_SEARCH"}'}}]});
 });
 assert.equal(result.state,'healthy');
 assert.ok(!JSON.stringify(result).includes('private-fixture-key')&&!JSON.stringify(result).includes('fixture.example'));
 const offline=await checkAdminNuknukStatus(configuration,'connection',signal,async ()=>new Response(null,{status:404}));
 assert.equal(offline.state,'unreachable');
 const disabled=await checkAdminNuknukStatus({...configuration,aiEnabled:false},'model',signal,()=>assert.fail('disabled model still called'));
 assert.equal(disabled.state,'disabled');
});

test('NukNuk activity only reads via authorized admin access', async () => {
  const overview = { totals: { requests: 0 }, recent: [] };
  let reads = 0;
  const read = async () => { reads++; return overview; };
  const allowed = setup({ nuknukActivity: read });
  const denied = setup({ isAdmin: async () => false, nuknukActivity: read });
  assert.equal((await denied.h(request({ nuknukActivity: 'recent' }))).status, 403);
  assert.equal((await allowed.h(request({ nuknukActivity: 'recent', days: 90 }))).status, 400);
  assert.equal(reads, 0);
  const response = await allowed.h(request({ nuknukActivity: 'recent' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), overview);
  assert.equal(reads, 1);
  assert.deepEqual(allowed.calls, ['auth', 'admin', 'auth', 'admin']);
});

const observation = {
  stages: [
    { stage: 'INTERPRETATION', operationMs: 940, controlBeforeMs: 50, controlAfterMs: 10 },
    { stage: 'EVALUATION', operationMs: 120, controlBeforeMs: 15, controlAfterMs: 5 },
  ],
  calls: ['simple', 'full'], elapsedMs: 1340.75, dialogue: false,
};

test('provisional results and a question are reported together without copying request or spot data', () => {
  const response = { primaryCandidateId: null, candidates: [{ name: 'a private spot' }], clarification: 'Private text?' };
  assert.deepEqual(summarizeNuknukActivity({ ...observation, response }), {
    outcome: 'PROVISIONAL', clarification: true, path: 'SIMPLE_TO_FULL', candidate_count: 1,
    model_calls: 2, model_ms: 940, librarian_ms: 120, total_ms: 1341, failure_stage: null,
  });
});

test('provider timeout, unresolved request and question-only outcome stay distinct', () => {
  const base = { ...observation, stages: observation.stages.slice(0, 1), calls: ['dialogue'], dialogue: true };
  const summarize = code => summarizeNuknukActivity({ ...base, failure: { code, stage: 'INTERPRETATION' } });
  const timeout = summarize('REQUEST_TIMEOUT');
  assert.equal(timeout.outcome, 'TIMEOUT');
  assert.equal(timeout.path, 'DIALOGUE');
  assert.equal(timeout.librarian_ms, null);
  assert.equal(timeout.failure_stage, 'INTERPRETATION');
  assert.equal(summarize('DECISION_NUKNUK_UNRESOLVED').outcome, 'UNRESOLVED');
  assert.equal(summarize('DECISION_NEEDS_CLARIFICATION').clarification, true);
  assert.equal(summarize('DECISION_NUKNUK_OFF_TOPIC').failure_stage, null);
});
