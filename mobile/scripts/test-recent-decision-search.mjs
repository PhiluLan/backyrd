import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/decision/recentDecisionSearch.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const disk=new Map();let blocked=null,failWrite=false,failRead=false,uuid=0;
const writes=[];
function runtime(){const mod={exports:{}};new Function('exports','require','module',compiled)(mod.exports,name=>{
 if(name==='react-native')return {Platform:{OS:'ios'}};
 if(name==='expo-crypto')return {randomUUID:()=>`fixture-${++uuid}`};
 if(name==='expo-secure-store')return {
  getItemAsync:async key=>{if(failRead)throw Error('device unavailable');return disk.get(key)??null;},
  setItemAsync:async(key,value)=>{if(blocked)await blocked;if(failWrite)throw Error('write unavailable');assert.ok(Buffer.byteLength(value,'utf8')<=2048,'every encrypted value fits the SecureStore boundary');disk.set(key,value);writes.push({key,value});},
  deleteItemAsync:async key=>{if(failWrite)throw Error('delete unavailable');disk.delete(key);},
 };
 throw Error(name);
},mod);return mod.exports;}
const A='person-a',B='person-b',legacy='backyrd.recent-decision-search.v1',key='backyrd.recent-decision-search.v2';
const id1='00000000-0000-0000-0000-000000000001',id2='00000000-0000-0000-0000-000000000002';
const candidate=(spotId,extra={})=>({spotId,rank:1,contextualReject:false,presentation:{},...extra});
let r=runtime();r.setRecentDecisionActor(A);
assert.equal(await r.rememberRecentDecisionSearch(A,'Coffee with Sam',[candidate(id2),candidate(id1),candidate(id1),candidate('event',{presentation:{event:{}}}),candidate('excluded',{contextualReject:true})]),true);
assert.deepEqual((await r.readRecentDecisionSearch(A)).spotIds,[id2,id1]);
await r.recordRecentDecisionRequest(A,'A request that may fail');
assert.equal((await r.readRecentDecisionSearch(A)).query,'Coffee with Sam','an unsuccessful request does not replace Home’s completed result rail');
assert.equal((await r.readRecentDecisionSearches(A))[0].query,'A request that may fail');
await r.removeRecentDecisionSearch(A,(await r.readRecentDecisionSearches(A))[0].id);
assert.equal(await r.readRecentDecisionSearch(B),null);
await r.rememberRecentDecisionSearch(A,'Tomorrow with my daughter',[]);
assert.deepEqual((await r.readRecentDecisionSearches(A)).map(row=>row.query),['Tomorrow with my daughter','Coffee with Sam']);
r=runtime();r.setRecentDecisionActor(A);
assert.equal((await r.readRecentDecisionSearches(A)).length,2,'multiple requests survive a native app restart');
const coffee=(await r.readRecentDecisionSearches(A))[1];
await r.rememberRecentDecisionSearch(A,' coffee   with SAM ',[candidate(id1)]);
assert.equal((await r.readRecentDecisionSearches(A)).length,2,'repeated requests move to the front instead of duplicating');
assert.equal((await r.readRecentDecisionSearches(A))[0].id,coffee.id,'an updated request keeps its stable identity');
for(let i=0;i<25;i++)await r.rememberRecentDecisionSearch(A,`Request ${i}`,[]);
assert.equal((await r.readRecentDecisionSearches(A)).length,20);
assert.equal((await r.readRecentDecisionSearch(A)).query,'Request 24');
const unicode='👩‍👧 gemütlich 中文 '.repeat(80);
assert.ok(unicode.length<=2000);
await r.rememberRecentDecisionSearch(A,unicode,Array.from({length:50},(_,i)=>candidate(`spot-${i}-${'x'.repeat(100)}`)));
r=runtime();r.setRecentDecisionActor(A);assert.equal((await r.readRecentDecisionSearch(A)).query,unicode.trim(),'long multilingual requests are stored without truncation');
assert.ok(JSON.parse(disk.get(legacy)).parts>1,'large payloads use encrypted chunks');
const toDelete=(await r.readRecentDecisionSearches(A))[1];
assert.equal(await r.removeRecentDecisionSearch(A,toDelete.id),true);
r=runtime();r.setRecentDecisionActor(A);assert.equal((await r.readRecentDecisionSearches(A)).some(row=>row.id===toDelete.id),false,'deletion survives restart');
let before=(await r.readRecentDecisionSearch(A)).query;
failWrite=true;assert.equal(await r.rememberRecentDecisionSearch(A,'This write fails',[]),false);assert.equal(r.hasUnsavedRecentDecisionSearches(A),true);failWrite=false;
const durable=runtime();durable.setRecentDecisionActor(A);assert.equal((await durable.readRecentDecisionSearch(A)).query,before,'failed snapshot commits retain the previous durable history');
assert.equal(await r.retryRecentDecisionSearches(A),true);assert.equal(r.hasUnsavedRecentDecisionSearches(A),false,'retry persists an in-memory request rather than silently hiding the warning');
r=runtime();r.setRecentDecisionActor(A);before='This write fails';assert.equal((await r.readRecentDecisionSearch(A)).query,before);
failWrite=true;assert.equal(await r.clearRecentDecisionSearches(A),false);failWrite=false;
assert.equal((await r.readRecentDecisionSearch(A)).query,before,'failed deletion is not presented as success');
assert.equal(await r.clearRecentDecisionSearches(A),true);assert.equal(disk.size,0,'clear removes pointer, legacy value and committed chunks');
r.setRecentDecisionActor(B);assert.equal(await r.readRecentDecisionSearch(A),null);assert.deepEqual(await r.readRecentDecisionSearches(B),[]);
await r.rememberRecentDecisionSearch(A,'late response',[]);assert.equal(disk.size,0,'old accounts cannot save late responses');
await r.rememberRecentDecisionSearch(B,'No matches',[]);assert.deepEqual((await r.readRecentDecisionSearch(B)).spotIds,[]);
r.setRecentDecisionActor(null);await new Promise(resolve=>setImmediate(resolve));assert.equal(disk.size,0,'logout removes persistent history');
let release;blocked=new Promise(resolve=>{release=resolve;});r.setRecentDecisionActor(A);
const save=r.rememberRecentDecisionSearch(A,'in flight',[candidate(id1)]);await new Promise(resolve=>setImmediate(resolve));r.setRecentDecisionActor(B);release();await save;await r.readRecentDecisionSearch(B);assert.equal(disk.size,0,'account change wins over in-flight encrypted writes');blocked=null;
// Legacy migration retains the last search before the first v2 save.
disk.set(legacy,JSON.stringify({actorId:B,query:'Legacy wish',spotIds:[id2,id1],searchedAt:Date.now()}));
r=runtime();r.setRecentDecisionActor(B);assert.equal((await r.readRecentDecisionSearch(B)).query,'Legacy wish');
await r.rememberRecentDecisionSearch(B,'New wish',[]);assert.equal(JSON.parse(disk.get(legacy)).version,2);assert.equal((await r.readRecentDecisionSearches(B)).length,2);
// TTL applies per entry rather than hiding every newer request when one expires.
const pointer=JSON.parse(disk.get(legacy));let rows=JSON.parse(Array.from({length:pointer.parts},(_,i)=>disk.get(`${key}.${pointer.revision}.${i}`)).join(''));
rows[1].searchedAt=1;const serialized=JSON.stringify(rows);assert.ok(Buffer.byteLength(serialized)<1800);disk.set(`${key}.${pointer.revision}.0`,serialized);disk.set(legacy,JSON.stringify({...pointer,parts:1}));
r=runtime();r.setRecentDecisionActor(B);assert.deepEqual((await r.readRecentDecisionSearches(B)).map(row=>row.query),['New wish']);
assert.equal([...disk.values()].some(value=>value.includes('Legacy wish')),false,'opening history also removes expired requests from persistent snapshots');
const compatible=JSON.parse(disk.get(legacy));assert.equal(compatible.query,'New wish');
disk.delete(legacy);const afterOldLogout=runtime();afterOldLogout.setRecentDecisionActor(B);assert.deepEqual(await afterOldLogout.readRecentDecisionSearches(B),[],'logout in an older app cannot resurrect newer request history');
failRead=true;const unavailable=runtime();unavailable.setRecentDecisionActor(B);await assert.rejects(unavailable.readRecentDecisionSearches(B),/unavailable/);assert.equal(await unavailable.readRecentDecisionSearch(B),null,'Home can degrade while the history screen explains storage failure');failRead=false;
for(const invalid of ['not json',JSON.stringify({actorId:B,query:'expired',spotIds:[id1],searchedAt:1}),JSON.stringify({actorId:A,query:'another account',spotIds:[id1],searchedAt:Date.now()})]){disk.clear();disk.set(legacy,invalid);const fresh=runtime();fresh.setRecentDecisionActor(B);assert.equal(await fresh.readRecentDecisionSearch(B),null);}
console.log('Recent requests: migration, multiple requests, bounded encrypted payloads, restart, order, deduplication, TTL, deletion, failure recovery and account races passed.');
