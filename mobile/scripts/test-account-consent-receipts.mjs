import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../lib/consent.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const presentation={exports:{}};
const shared=ts.transpileModule(readFileSync(new URL('../../packages/shared/src/consent-presentation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('module','exports',shared)(presentation,presentation.exports);
function fixture(reply, firstRead){
 let granted=true,reads=0;
 const dependencies={ '../../packages/shared/src/consent-presentation':presentation.exports, 'expo-constants':{default:{expoConfig:{version:'entry-test'}}}, './supabase':{supabase:{auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name,args)=>{
  if(name==='has_active_consent_v1'){reads++;return reads===1 && firstRead ? firstRead : {data:granted,error:null};}
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
test('an in-flight grant cannot survive withdrawal or an account cache reset', async () => {
  for (const invalidate of [
    api => api.setMyConsent('precise_location', false),
    api => api.clearConsentCache(),
  ]) {
    let resolveRead;
    const read = new Promise(resolve => { resolveRead = resolve; });
    const receipt = {data:[{purpose_key:'precise_location',status:'withdrawn'}],error:null};
    const f = fixture(receipt, read);
    const previous = f.api.hasActiveConsent('precise_location', {forceRefresh:true});
    await invalidate(f.api);
    resolveRead({data:true,error:null});
    assert.equal(await previous, false);
    await f.api.hasActiveConsent('precise_location');
    assert.equal(f.reads(), 2, 'the stale result must never populate the cache');
  }
});
