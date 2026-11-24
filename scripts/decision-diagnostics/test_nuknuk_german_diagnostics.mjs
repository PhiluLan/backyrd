import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {germanTestWorld} from './nuknuk-german-test-world.mjs';
import {GERMAN_REFERENCE,germanDiagnosticCases} from './nuknuk-german-diagnostic-cases.mjs';
import {prepareLibrarianRequest,LUNA_LIBRARIAN_CONTRACT_VERSION} from '../../packages/decision-vnext-core/dist/product-luna-librarian.js';
import {searchLibrarianCatalog} from '../../packages/decision-vnext-core/dist/product-librarian-matching.js';
import {fact} from '../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';
const world=germanTestWorld(),catalog=world.map(r=>r.binding),ids=new Map(world.map(r=>[r.binding.decisionProjection.spotId,r.key]));
const entities=[{id:'a1',kind:'ACTIVITY',label:'Aktivität',members:[]},{id:'p2',kind:'PERSON',label:'Kind',members:[]},{id:'g1',kind:'GROUP',label:'Gruppe',members:[]}];
const run=facts=>searchLibrarianCatalog({request:prepareLibrarianRequest({contractVersion:LUNA_LIBRARIAN_CONTRACT_VERSION,sourceText:'Synthetische Kontrollanfrage',reference:GERMAN_REFERENCE,output:{entities,facts,logic:null,bindings:[],extensions:[],uncertainties:[],weatherConditions:[]}}),catalog,authority:{city:'Basel',now:GERMAN_REFERENCE.now}});
const ranked=r=>r.ranked.map(x=>ids.get(x.spotId));
test('candidate preparation rejects an adapter from another training run before serving or inference',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'nuknuk-candidate-test-'));
 try{
  await mkdir(resolve(dir,'adapter'));await writeFile(resolve(dir,'adapter/conversion.json'),JSON.stringify({hfAdapterSha256:'wrong-run'}));
  const r=spawnSync(process.execPath,[new URL('./nuknuk-german-diagnostics.mjs',import.meta.url).pathname,'prepare-candidate',resolve(dir,'out'),dir,dir,resolve(dir,'adapter')],{encoding:'utf8',timeout:10000});
  assert.notEqual(r.status,0);assert.match(r.stderr,/candidate_conversion_invalid/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('diagnostic runner rejects unrecognized serving scope before any network request',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'nuknuk-scope-test-')),sha=b=>createHash('sha256').update(b).digest('hex');
 try{
  await writeFile(resolve(dir,'adapters.safetensors'),'test-only');
  for(const n of ['cases.json','requests.json'])await writeFile(resolve(dir,n),'[]');
  await writeFile(resolve(dir,'manifest.json'),JSON.stringify({scope:'UNRECOGNIZED',sourceHashes:{},files:{'cases.json':sha('[]'),'requests.json':sha('[]')},adapter:dir,adapterSha256:sha('test-only'),caseCount:0}));
  const r=spawnSync(process.execPath,[new URL('./nuknuk-german-diagnostics.mjs',import.meta.url).pathname,'run',dir],{encoding:'utf8',timeout:10000});
  assert.notEqual(r.status,0);assert.match(r.stderr,/diagnostic_scope_invalid/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('German catalog includes 20 unique natural diagnostic inputs without training permission',()=>{const r=germanDiagnosticCases();assert.equal(r.length,20);assert.equal(new Set(r.map(x=>x.query)).size,20);assert(r.every(x=>x.trainingPermission===false&&x.obligations.length>=2));});
test('controlled coffee request finds actual coffee offers, not unrelated meals',()=>{const r=ranked(run([fact('coffee','food.drink','coffee')]));assert(r.includes('quiet-coffee'));assert(!r.includes('meal-plain'));});
test('controlled dietary and indoor duties exclude plain and outdoor restaurants',()=>{const r=ranked(run([fact('meal','food.meal','dinner'),fact('diet','food.diet','lactose_free'),fact('inside','offer.area','indoor')]));assert(r.includes('meal-diets'));assert(!r.includes('meal-plain'));assert(!r.includes('meal-outside'));});
test('controlled child activity excludes too-old, outdoor-only and plain food options',()=>{const r=ranked(run([fact('play','experience.activity','open_discovery'),fact('in','offer.area','indoor'),fact('age','people.age',{amount:4,operator:'EQ',unit:'YEARS'},'CONTEXT',['p2'])]));assert(r.includes('child-play'));assert(!r.includes('older-play'));assert(!r.includes('outside-play'));assert(!r.includes('meal-plain'));});
test('controlled own sauna exclusion preserves swimming at mixed venues',()=>{const r=ranked(run([fact('swim','experience.activity','swimming'),fact('noSauna','experience.activity','sauna','EXCLUDED')]));assert(r.includes('pool-plain'));assert(r.includes('pool-sauna'));});
test('controlled venue sauna ban excludes proven presence and retains unproven absence as unknown',()=>{const r=run([fact('swim','experience.activity','swimming'),fact('noSauna','offer.kind','sauna','EXCLUDED')]);assert(!ranked(r).includes('pool-sauna'));assert(!ranked(r).includes('pool-plain'));assert(r.excluded.some(x=>ids.get(x.spotId)==='pool-sauna'));assert(r.unresolved.some(x=>ids.get(x.spotId)==='pool-plain'));});
test('a swimming admission budget remains unknown until its price component is supported',()=>{const r=run([fact('swim','experience.activity','swimming'),fact('n','people.count',{amount:4,operator:'EQ',unit:'PEOPLE'},'CONTEXT',['g1']),fact('scope','budget.scope',{scope:'GROUP_TOTAL'},'CONTEXT'),fact('money','budget.maximum',{amount:80,operator:'LTE',currency:'CHF'})]);assert(!ranked(r).includes('pool-plain'));assert(r.unresolved.find(x=>ids.get(x.spotId)==='pool-plain').facts.some(x=>x.factId==='money'&&x.reason==='PRICE_PURPOSE_UNSTRUCTURED'));});
