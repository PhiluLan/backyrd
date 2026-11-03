import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../lib/locationPrivacy.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({consent = true, permission = {status:'granted',canAskAgain:true}, requested = {status:'granted',canAskAgain:true}} = {}) {
  const calls={request:0,position:0,permission:0,services:0};
  const location={coords:{latitude:47.56,longitude:7.59},timestamp:Date.now()};
  const modules={
    'react-native':{Platform:{OS:'ios'}},
    'expo-location':{Accuracy:{Balanced:3},hasServicesEnabledAsync:async()=>{calls.services++;return true;},getForegroundPermissionsAsync:async()=>{calls.permission++;return permission;},requestForegroundPermissionsAsync:async()=>{calls.request++;return requested;},getCurrentPositionAsync:async()=>{calls.position++;return location;}},
    './consent':{hasActiveConsent:async()=>consent},
    './privacySanitize':{safeDevelopmentWarning:()=>{}},
  };
  const module={exports:{}};
  new Function('require','module','exports',compiled)((name)=>{if(!(name in modules))throw new Error('Unexpected dependency');return modules[name];},module,module.exports);
  return {api:module.exports,calls};
}
test('no consent means no device permission query and no position read',async()=>{
  const {api,calls}=fixture({consent:false});
  const result=await api.getPrivacySafeLocation({purpose:'city_detection'});
  assert.equal(result.reason,'consent_not_granted');assert.deepEqual(calls,{request:0,position:0,permission:0,services:0});
});
test('permanently denied permission never triggers another OS prompt',async()=>{
  const {api,calls}=fixture({permission:{status:'denied',canAskAgain:false}});
  for(let index=0;index<3;index++)assert.equal((await api.getPrivacySafeLocation({purpose:'city_detection',requestPermission:true})).reason,'permission_denied');
  assert.equal(calls.request,0);assert.equal(calls.position,0);
});
test('passive discovery cannot ask for OS permission',async()=>{
  const {api,calls}=fixture({permission:{status:'undetermined',canAskAgain:true}});
  assert.equal((await api.getPrivacySafeLocation({purpose:'nearby_discovery',requestPermission:false})).reason,'permission_denied');
  assert.equal(calls.request,0);assert.equal(calls.position,0);
});
test('an explicit first request with consent may ask once and use the position',async()=>{
  const {api,calls}=fixture({permission:{status:'undetermined',canAskAgain:true}});
  assert.equal((await api.getPrivacySafeLocation({purpose:'city_detection',requestPermission:true})).ok,true);
  assert.equal(calls.request,1);assert.equal(calls.position,1);
});
test('granting the account setting cannot re-prompt a permanently denied OS permission',async()=>{
  const {api,calls}=fixture({permission:{status:'denied',canAskAgain:false}});
  assert.deepEqual(await api.requestLocationDevicePermissionAfterConsent(),{granted:false,canAskAgain:false});assert.equal(calls.request,0);
});
