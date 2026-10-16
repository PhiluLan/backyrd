import test from 'node:test';
import assert from 'node:assert/strict';
import { contentHash } from '../../dist/canonical.js';
import { readFileSync } from 'node:fs';
import {
  LUNA_LIBRARIAN_CONFIGURATION, LUNA_LIBRARIAN_CONTRACT_VERSION,
  buildLunaLibrarianModelRequest, parseLunaMeaningOutput, prepareLibrarianRequest,
} from '../../dist/product-luna-librarian.js';
import { LUNA_LIBRARIAN_CATALOG, LUNA_LIBRARIAN_FACT_KEYS } from '../../dist/product-luna-librarian-assets.js';
const fixtures=JSON.parse(readFileSync(new URL('./luna-librarian-fixtures.json',import.meta.url),'utf8'));
const ref={now:'2026-10-14T10:00:00+02:00',timezone:'Europe/Zurich'};
const prepare=(output,sourceText='Testwunsch',reference=ref)=>prepareLibrarianRequest({contractVersion:LUNA_LIBRARIAN_CONTRACT_VERSION,output,sourceText,reference});
const simple=()=>({entities:[],facts:[{id:'f1',modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[],key:'experience.activity',value:{text:'unbekannte besondere Aktivität'}}],logic:null,bindings:[],extensions:[],uncertainties:[],weatherConditions:[]});
const fact=(id,key,value,modality='REQUIRED',subjectIds=[])=>({id,key,value,modality,subjectIds,basis:'EXPLICIT'});
const flatten=node=>node.kind==='FACT'?[node.factId]:node.kind==='IF'?[node.conditionFactId,...flatten(node.then),...(node.else?flatten(node.else):[])]:node.kind==='FALLBACK'?node.options.flatMap(flatten):node.children.flatMap(flatten);

test('revision 2 retains the frozen base, schema, catalog, model and reasoning',()=>{
 const cfg=LUNA_LIBRARIAN_CONFIGURATION;
 assert.equal(cfg.model,'gpt-5.6-luna');assert.equal(cfg.reasoningEffort,'low');assert.equal(cfg.store,false);
 assert.equal(cfg.basePromptHash,'712fe522d0cf4c4004d62c3efcf6a611d0db4024be0ca13479828b7cb00daef0');assert.equal(cfg.promptRevision,'backyrd.luna-prompt@2');
 assert.equal(cfg.schemaHash,'9261d8d2b0605e203e928af92de83697d3df33539e2621424b5cf6cbf45ea8cc');
 assert.equal(cfg.catalogHash,'7216d0011879d1e6b78e6186146305755111ceea87fa0992ee051b2b613e927c');
 const body=buildLunaLibrarianModelRequest({sourceText:'Heute Abend etwas trinken',reference:ref});
 assert.equal(contentHash(body.instructions),cfg.promptHash);
 assert.equal(body.text.format.name,'backyrd_luna_meaning_v7');assert.equal(body.text.format.strict,true);
 assert.deepEqual(Object.keys(body).sort(),['model','reasoning','store','max_output_tokens','instructions','input','text'].sort());
 assert.equal(JSON.stringify(body).includes('apiKey'),false);
});
test('all 127 families have one fixed value profile; weather is separate',()=>{
 assert.equal(LUNA_LIBRARIAN_CATALOG.concepts.length,127);
 const keys=Object.values(LUNA_LIBRARIAN_FACT_KEYS).flat();assert.equal(new Set(keys).size,126);
 assert.deepEqual(LUNA_LIBRARIAN_CATALOG.concepts.filter(c=>!keys.includes(c.key)).map(c=>c.key),['condition.weather']);
 for(const c of LUNA_LIBRARIAN_CATALOG.concepts)if(c.valueKind!=='WEATHER')assert.ok(LUNA_LIBRARIAN_FACT_KEYS[c.valueKind].includes(c.key));
});
for(const fixture of fixtures)test(`frozen ${fixture.id}: every emitted fact, scope and original byte survives`,()=>{
 const original=structuredClone(fixture.output),plan=prepare(fixture.output,fixture.request,fixture.reference);
 assert.deepEqual(plan.raw,original);assert.deepEqual(fixture.output,original);assert.equal(plan.source.sourceText,fixture.request);
 assert.deepEqual(plan.source.reference,fixture.reference);assert.deepEqual(plan.entities,original.entities);
 assert.deepEqual(plan.bindings,original.bindings);assert.deepEqual(plan.extensions,original.extensions);assert.deepEqual(plan.weatherConditions,original.weatherConditions);
 assert.deepEqual(plan.facts.map(({value,...rest})=>({...rest,value:Object.fromEntries(Object.entries(value).filter(([key])=>key!=='kind'))})),original.facts);
 assert.equal(plan.requestHash,prepare(fixture.output,fixture.request,fixture.reference).requestHash);
 assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(plan.facts[0].value));
 const before=plan.facts[0].modality;fixture.output.facts[0].modality='EXCLUDED';assert.equal(plan.facts[0].modality,before);fixture.output=original;
});
test('today, tomorrow, amounts and qualitative duration are not reinterpreted',()=>{
 const today=prepare(fixtures[0].output,fixtures[0].request);assert.equal(today.facts.find(f=>f.key==='time.date').value.date,'2026-10-14');
 const course=prepare(fixtures[9].output,fixtures[9].request);assert.equal(course.facts.find(f=>f.key==='time.duration_quality').value.text,'kurz');
 assert.equal(course.facts.some(f=>f.key==='time.duration'),false);
 assert.deepEqual(course.facts.find(f=>f.key==='budget.maximum').value,{amount:80,operator:'LTE',currency:'CHF',kind:'MONEY'});
});
test('implicit common ALL never converts a required alternative into two global duties',()=>{
 const p=prepare(fixtures[8].output,fixtures[8].request);
 assert.equal(p.logic.kind,'ALL');const choice=p.logic.children.find(n=>n.kind==='ANY');assert.equal(choice.strength,'REQUIRED');
 const branchFacts=choice.children.flatMap(flatten),globals=p.logic.children.filter(n=>n.kind==='FACT').map(n=>n.factId);
 assert.ok(branchFacts.every(id=>!globals.includes(id)));assert.ok(globals.includes(p.facts.find(f=>f.key==='budget.maximum').id));
});
test('weather then/else and inside/outside properties stay attached to their original branch',()=>{
 const raw=fixtures[5].output,p=prepare(raw,fixtures[5].request);
 assert.ok(p.logic.children.some(n=>n===raw.logic)===false); // Parser owns its copy.
 const modelLogic=p.logic.children.find(n=>n.kind==='ALL');assert.deepEqual(modelLogic,raw.logic);
 const branchIds=raw.logic.children.flatMap(flatten);assert.ok(branchIds.includes('c1'));assert.ok(branchIds.includes('c2'));
 assert.equal(p.diagnostics.some(d=>d.code==='CROSS_BRANCH_BINDING'),true);
 assert.deepEqual(p.bindings,raw.bindings); // Diagnose the known scope gap; never silently repair it.
});
test('unknown terms remain extensions and the engine does not substitute a known category',()=>{
 const d=simple();d.extensions=[{id:'x1',modality:'REQUIRED',basis:'EXPLICIT',subjectIds:[],description:'Besonderheit mit unbekanntem Namen'}];
 const p=prepare(d);assert.deepEqual(p.extensions,d.extensions);assert.ok(flatten(p.logic).includes('x1'));
 const wrong=simple();wrong.facts[0].key='experience.unregistered';assert.throws(()=>prepare(wrong));
});
test('preferred, excluded and not-required meanings keep separate modalities',()=>{
 const d=simple();d.facts.push(fact('f2','offer.facility',{text:'Sauna'},'NOT_REQUIRED'),fact('f3','atmosphere.music',{text:'Musik'},'EXCLUDED'),fact('f4','food.dish',{text:'Kuchen'},'PREFERRED'));
 const p=prepare(d);assert.deepEqual(p.facts.map(f=>f.modality),['REQUIRED','NOT_REQUIRED','EXCLUDED','PREFERRED']);
});
test('type, unit, non-finite numeric and calendar failures are rejected',()=>{
 const d=simple();d.facts[0]=fact('f1','route.length',{amount:3000,operator:'LTE',unit:'MINUTES',referenceEntityId:null});assert.throws(()=>prepare(d));
 d.facts[0]=fact('f1','people.count',{amount:3,operator:'EQ',unit:'ITEMS'});assert.throws(()=>prepare(d),/count_unit_invalid/);
 d.facts[0]=fact('f1','budget.maximum',{amount:Infinity,operator:'LTE',currency:'CHF'});assert.throws(()=>prepare(d),/non_json_payload/);
 d.facts[0]=fact('f1','time.date',{date:'2026-02-30',operator:'EQ',timezone:'Europe/Zurich'});assert.throws(()=>prepare(d),/date_invalid/);
 d.facts[0]=fact('f1','time.date',{date:'2026-02-28',operator:'EQ',timezone:'invalid_timezone'});assert.throws(()=>prepare(d),/timezone_invalid/);
});
test('distance preserves endpoints, marks unresolved ones and rejects unknown references',()=>{
 const d=simple();d.entities=[{id:'start',kind:'PLACE',label:'Startpunkt',members:[]},{id:'station',kind:'PLACE',label:'Bahnhof',members:[]}];
 d.facts.push(fact('f2','location.distance',{amount:300,operator:'LTE',unit:'METERS',referenceEntityId:'station'},'REQUIRED',['start']));
 const p=prepare(d);assert.equal(p.facts[1].value.referenceEntityId,'station');assert.deepEqual(p.facts[1].subjectIds,['start']);
 d.facts[1].value.referenceEntityId=null;const unresolved=prepare(d);assert.equal(unresolved.facts[1].value.referenceEntityId,null);assert.ok(unresolved.diagnostics.some(d=>d.code==='DISTANCE_ENDPOINTS_UNRESOLVED'));assert.deepEqual(unresolved.entities,d.entities);
 d.facts[1].value.referenceEntityId='absent';assert.throws(()=>prepare(d),/unknown_distance_reference/);
});
test('unknown subjects, duplicate IDs, cyclic groups and unknown binding references fail',()=>{
 let d=simple();d.facts[0].subjectIds=['missing'];assert.throws(()=>prepare(d),/unknown_entity/);
 d=simple();d.facts.push(structuredClone(d.facts[0]));assert.throws(()=>prepare(d),/duplicate_id/);
 d=simple();d.entities=[{id:'e1',kind:'GROUP',label:'a',members:['e2']},{id:'e2',kind:'GROUP',label:'b',members:['e1']}];assert.throws(()=>prepare(d),/group_cycle/);
 d=simple();d.bindings=[{kind:'SAME_PLACE',factIds:['f1','missing']}];assert.throws(()=>prepare(d),/binding_reference_invalid/);
});
test('conditions cannot appear as wishes or refer to their own result',()=>{
 const d=simple();d.weatherConditions=[{id:'c1',basis:'EXPLICIT',subjectIds:[],state:'RAIN',detail:null}];
 d.logic={kind:'IF',conditionFactId:'c1',then:{kind:'FACT',factId:'f1'},else:null};assert.doesNotThrow(()=>prepare(d));
 d.logic={kind:'FACT',factId:'c1'};assert.throws(()=>prepare(d),/unknown_fact/);
 d.logic=null;assert.throws(()=>prepare(d),/condition_unbound/);
 d.logic={kind:'IF',conditionFactId:'f1',then:{kind:'FACT',factId:'f1'},else:null};assert.throws(()=>prepare(d),/condition_invalid/);
 d.facts[0].modality='CONTEXT';d.weatherConditions=[];assert.throws(()=>prepare(d),/condition_self_reference/);
});
test('empty, incompatible-version, extra-field and maliciously nested requests fail honestly',()=>{
 const empty=simple();empty.facts=[];assert.throws(()=>prepare(empty),/empty_meaning/);
 const context=simple();context.facts[0].modality='CONTEXT';assert.throws(()=>prepare(context),/empty_instructions/);
 assert.throws(()=>prepareLibrarianRequest({contractVersion:'future-version',output:simple(),sourceText:'x',reference:ref}),/version_mismatch/);
 const extra=simple();extra.summary='private unnecessary prose';assert.throws(()=>prepare(extra),/unknown field/);
 const cyclic=simple();cyclic.logic=cyclic;assert.throws(()=>parseLunaMeaningOutput(cyclic),/cyclic_payload/);
 const big=simple();big.facts[0].value.text='x'.repeat(70_000);assert.throws(()=>prepare(big),/payload_limit/);
 let nested={kind:'FACT',factId:'f1'};for(let i=0;i<26;i++)nested={kind:'ALL',children:[nested]};const deep=simple();deep.logic=nested;assert.throws(()=>prepare(deep),/maximum expression depth/);
});
test('source is byte-preserved, reference is trusted input and hashes include the reference',()=>{
 const original='  Café\nmit Freunden 🥳  ';
 const body=buildLunaLibrarianModelRequest({sourceText:original,reference:ref});assert.equal(JSON.parse(body.input).request,original);
 const p=prepare(simple(),original),q=prepare(simple(),original,{...ref,now:'2026-10-15T10:00:00+02:00'});assert.equal(p.source.sourceText,original);assert.notEqual(p.requestHash,q.requestHash);
 const composed=prepare(simple(),'Café'),decomposed=prepare(simple(),'Cafe\u0301');assert.notEqual(composed.sourceTextHash,decomposed.sourceTextHash);assert.notEqual(composed.requestHash,decomposed.requestHash);
 assert.throws(()=>buildLunaLibrarianModelRequest({sourceText:'x',reference:{...ref,now:'2026-02-30T10:00:00+02:00'}}),/reference_invalid/);
});
test('boundary error messages never include private labels or user text',()=>{
 const d=simple();d.facts[0].subjectIds=['private-person'];assert.throws(()=>prepare(d,'sensitive user text'),error=>!error.message.includes('private-person')&&!error.message.includes('sensitive user text'));
});
