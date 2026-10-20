import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/decision/recentDecisionSearch.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
let disk=null,blocked=null;
const writes=[];
function runtime(){const mod={exports:{}};new Function('exports','require','module',compiled)(mod.exports,name=>{
 if(name==='react-native')return {Platform:{OS:'ios'}};
 if(name==='expo-secure-store')return {getItemAsync:async()=>disk,setItemAsync:async(key,value)=>{if(blocked)await blocked;disk=value;writes.push(value);},deleteItemAsync:async()=>{disk=null;}};
 throw Error(name);
},mod);return mod.exports;}
const actorA='person-a',actorB='person-b';
const id1='00000000-0000-0000-0000-000000000001',id2='00000000-0000-0000-0000-000000000002';
const candidate=(spotId,extra={})=>({spotId,rank:1,contextualReject:false,presentation:{},...extra});
let r=runtime();r.setRecentDecisionActor(actorA);
await r.rememberRecentDecisionSearch(actorA,'Coffee with Sam',[candidate(id2),candidate(id1),candidate(id1),candidate('event',{presentation:{event:{}}}),candidate('excluded',{contextualReject:true})]);
assert.deepEqual((await r.readRecentDecisionSearch(actorA)).spotIds,[id2,id1]);
assert.equal(await r.readRecentDecisionSearch(actorB),null);
r=runtime();r.setRecentDecisionActor(actorA);
assert.equal((await r.readRecentDecisionSearch(actorA)).query,'Coffee with Sam','last search survives a native app restart for the same account');
r.setRecentDecisionActor(actorB);assert.equal(await r.readRecentDecisionSearch(actorA),null);assert.equal(await r.readRecentDecisionSearch(actorB),null);assert.equal(disk,null);
await r.rememberRecentDecisionSearch(actorA,'late result',[candidate(id1)]);assert.equal(disk,null,'a previous account cannot save a late response');
await r.rememberRecentDecisionSearch(actorB,'No matches',[]);assert.deepEqual((await r.readRecentDecisionSearch(actorB)).spotIds,[],'zero results replace old places');
r.setRecentDecisionActor(null);await r.readRecentDecisionSearch(actorB);await new Promise(resolve=>setImmediate(resolve));assert.equal(disk,null,'logout clears persisted query');
let release;blocked=new Promise(resolve=>{release=resolve;});r.setRecentDecisionActor(actorA);
const save=r.rememberRecentDecisionSearch(actorA,'in flight',[candidate(id1)]);await new Promise(resolve=>setImmediate(resolve));r.setRecentDecisionActor(actorB);release();await save;await r.readRecentDecisionSearch(actorB);assert.equal(disk,null,'logout wins over an in-flight secure write');blocked=null;
for(const invalid of ['not json',JSON.stringify({actorId:actorB,query:'expired',spotIds:[id1],searchedAt:1}),JSON.stringify({actorId:actorA,query:'other account',spotIds:[id1],searchedAt:Date.now()})]){disk=invalid;const fresh=runtime();fresh.setRecentDecisionActor(actorB);assert.equal(await fresh.readRecentDecisionSearch(actorB),null);}
console.log('Recent Decision: original visible order, native restart, account isolation, logout/write races, malformed data and zero results passed.');
