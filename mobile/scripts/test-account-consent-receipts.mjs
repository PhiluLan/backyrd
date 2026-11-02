import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../lib/consent.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const presentation={exports:{}};
const shared=ts.transpileModule(readFileSync(new URL('../../packages/shared/src/consent-presentation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('module','exports',shared)(presentation,presentation.exports);
function fixture(reply){
 let granted=true,reads=0;
 const dependencies={ '../../packages/shared/src/consent-presentation':presentation.exports, 'expo-constants':{default:{expoConfig:{version:'entry-test'}}}, './supabase':{supabase:{auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name,args)=>{
  if(name==='has_active_consent_v1'){reads++;return {data:granted,error:null};}
  if(name==='set_my_consent_v1'){granted=args.p_granted;if(reply instanceof Error)throw reply;return reply;}
  throw Error('Unexpected RPC');
 }}}};
 const module={exports:{}};new Function('require','module','exports',compiled)(name=>{if(!(name in dependencies))throw Error('Unexpected dependency');return dependencies[name];},module,module.exports);
 return {api:module.exports,reads:()=>reads};
}
for(const [label,reply] of [['error response',{data:null,error:{code:'temporary_failure'}}],['lost response',new Error('offline')]]){
 test(`a committed withdrawal with ${label} cannot retain a cached grant`,async()=>{
  const f=fixture(reply);assert.equal(await f.api.hasActiveConsent('personalized_recommendations'),true);
  await assert.rejects(f.api.setMyConsent('personalized_recommendations',false));
  assert.equal(await f.api.hasActiveConsent('personalized_recommendations'),false);assert.equal(f.reads(),2);
 });
}
test('a successful HTTP response without the requested consent receipt is rejected',async()=>{
 const f=fixture({data:[],error:null});await assert.rejects(f.api.setMyConsent('precise_location',false),/consent_save_not_confirmed/);
});
test('the matching persisted withdrawal is acknowledged',async()=>{
 const f=fixture({data:[{purpose_key:'precise_location',status:'withdrawn'}],error:null});
 await f.api.setMyConsent('precise_location',false);assert.equal(await f.api.hasActiveConsent('precise_location'),false);
});
