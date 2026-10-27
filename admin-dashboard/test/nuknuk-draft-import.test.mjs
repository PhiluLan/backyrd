import assert from "node:assert/strict";
import {readFile,writeFile,mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import ts from "typescript";
import {createWorldResearchBatch,emptyExperienceProfile,emptyExperienceConditions,parseWorldResearchBatch} from "../../packages/world-knowledge-core/dist/index.js";
import test from "node:test";
const dir=await mkdtemp(join(tmpdir(),"nuknuk-import-"));
const source=await readFile(new URL('../lib/nuknukDraftImport.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText
 .replace('"@backyrd/world-knowledge-core"',JSON.stringify(new URL('../../packages/world-knowledge-core/dist/index.js',import.meta.url).href));
await writeFile(join(dir,'import.mjs'),compiled);
const {mergeResearchProfile,prepareNuknukDraftImport,planAdminResearchReview,supplementResearchValue}=await import(pathToFileURL(join(dir,'import.mjs')).href);
const id='174cfd79-d10d-434d-be8f-1a7e39047e82';
const citation={url:'https://example.org/menu',evidence:'Getränke und Restaurant mit 50 Plätzen',observedAt:'2026-10-24T10:00:00Z'};
const claim=(value)=>({claimId:'11111111-1111-4111-8111-111111111111',knowledgeState:'KNOWN_VALUE',value});
const batch=(values={})=>createWorldResearchBatch({batchId:id,createdAt:'2026-10-24T10:00:00Z',spots:[{spotId:id,name:'Fixture',locality:'Basel',manifestHash:'a'.repeat(64),existingValues:{'contact.website':claim('https://example.org'),...values}}]});
const result=(attributeKey,value,extra={})=>({attributeKey,value,status:'REQUIRES_REVIEW',citations:[citation],...extra});
const draft=(results)=>({version:'nuknuk-research-v4.16',spotId:id,name:'Fixture',canonicalWrite:false,importable:false,results});
const area=(id,name='Restaurant')=>({id,kind:'DINING_AREA',name,properties:[{key:'offer.capacity',label:null,state:'KNOWN',value:50,conditions:emptyExperienceConditions()}]});
const offer=(id,areaIds=[])=>({id,kind:'DRINKS',name:'Getränke',properties:[],prices:[],schedule:[],validFrom:null,validUntil:null,areaIds});

test('partial profiles preserve existing entities and map researched links to existing IDs',()=>{
 const existing={...emptyExperienceProfile('EAT'),reviewed:true,areas:[area('real'),{...area('garden','Garten'),kind:'TERRACE'}],offers:[offer('real-offer',['garden'])]};
 const incoming={...emptyExperienceProfile('EAT'),areas:[area('researched')],offers:[offer('research-offer',['researched'])]};
 const actual=mergeResearchProfile(existing,incoming);
 assert.equal(actual.areas.length,2);assert.equal(actual.offers.length,1);
 assert.deepEqual(actual.offers[0].areaIds,['garden','real']);assert.equal(actual.areas[0].id,'real');
 assert.equal(incoming.reviewed,false);assert.equal(actual.reviewed,true);
});
test('partial profiles never replace contradictory properties, ambiguous names or changed categories',()=>{
 const existing={...emptyExperienceProfile('EAT'),areas:[area('real')]};
 const changed={...area('different'),properties:[{...area('different').properties[0],value:40}]};
 assert.throws(()=>mergeResearchProfile(existing,{...emptyExperienceProfile('EAT'),areas:[changed]}),/widerspricht/);
 assert.throws(()=>mergeResearchProfile({...existing,areas:[area('one'),area('two')]},{...emptyExperienceProfile('EAT'),areas:[area('other')]}),/eindeutig/);
 assert.throws(()=>mergeResearchProfile(existing,emptyExperienceProfile('STAY')),/Profilkategorie/);
 assert.throws(()=>mergeResearchProfile(existing,{...emptyExperienceProfile('EAT'),areas:[{...area('real'),name:'Another room'}]}),/eindeutig/);
});
test('separately named room details remain independent during repeat and partial research review',()=>{
 const detail=(label,value)=>({key:'custom.detail',label,state:'KNOWN',value,conditions:emptyExperienceConditions()});
 const room={...area('hall','Saal'),properties:[detail('Bestuhlung','50 Sitzplätze'),detail('Bildschirm','Ein grosser Bildschirm')]};
 const existing={...emptyExperienceProfile('EAT'),reviewed:true,areas:[room]};
 assert.deepEqual(mergeResearchProfile(existing,structuredClone(existing)),existing);
 const added=mergeResearchProfile(existing,{...emptyExperienceProfile('EAT'),areas:[{...room,id:'research-hall',properties:[detail('Stehtische','Für einen Apéro geeignet')]}]});
 assert.deepEqual(added.areas[0].properties,[...room.properties,detail('Stehtische','Für einen Apéro geeignet')]);
 assert.throws(()=>mergeResearchProfile(existing,{...emptyExperienceProfile('EAT'),areas:[{...room,properties:[detail('Bildschirm','Kein Bildschirm')]}]}),/widerspricht/);
});
test('unknown future offer details do not erase saved prices or schedules',()=>{
 const existing={...emptyExperienceProfile('EAT'),offers:[{...offer('saved'),schedule:[{weekday:1,start:'12:00',end:'14:00'}]}]};
 const incoming={...emptyExperienceProfile('EAT'),offers:[offer('new')]};
 assert.deepEqual(mergeResearchProfile(existing,incoming).offers[0].schedule,existing.offers[0].schedule);
 assert.throws(()=>mergeResearchProfile(existing,{...incoming,offers:[{...offer('new'),schedule:[{weekday:1,start:'18:00',end:'23:00'}]}]}),/Zeiten/);
});
test('a partial weekly plan retains existing weekends and never invents closure',()=>{
 const saturday={day:'SATURDAY',intervals:[{start:'10:00',end:'12:00'}]};
 const monday={day:'MONDAY',intervals:[{start:'12:00',end:'14:00'}]};
 const prepared=prepareNuknukDraftImport(draft([result('hours.regular',[monday],{partialHours:true})]),batch({'hours.regular':claim([saturday])}),['hours.regular']);
 assert.deepEqual(prepared.document.research.spots[0].claims[0].value,[saturday,monday]);
 assert.equal(prepared.document.research.spots[0].claims[0].value.some(day=>day.day==='SUNDAY'),false);
});
test('preparation is bound to a real current spot and an explicit human selection',()=>{
 assert.throws(()=>prepareNuknukDraftImport(draft([result('contact.website','https://example.org')]),batch(),[]),/mindestens/);
 assert.throws(()=>prepareNuknukDraftImport({...draft([]),spotId:'11111111-1111-4111-8111-aaaaaaaaaaaa'},batch(),['contact.website']),/gehört nicht/);
 const duplicated=result('contact.website','https://example.org');
 assert.throws(()=>prepareNuknukDraftImport(draft([duplicated,duplicated]),batch(),['contact.website']),/mehrfach/);
});
test('missing source times and unconfirmed external domains are held without guessing trust or timestamps',()=>{
 const missing=result('contact.website','https://example.org',{citations:[{url:'https://example.org',evidence:'Public website'}]});
 const external=result('contact.website','https://example.org',{citations:[{...citation,url:'https://unrelated.org'}]});
 for(const item of [missing,external]){
  const prepared=prepareNuknukDraftImport(draft([item]),batch(),['contact.website']);
  assert.equal(prepared.document.research.spots[0].claims.length,0);assert.equal(prepared.held.length,1);
 }
});
test('supplementary citations preserve each source, quote and observed time',()=>{
 const d=draft([result('experience.profile',{...emptyExperienceProfile('EAT'),areas:[area('restaurant')],offers:[offer('drinks')]},{partialProfile:true,citations:[citation,{...citation,url:'https://example.org/drinks',evidence:'Weinkarte'}]})]);
 const prepared=prepareNuknukDraftImport(d,batch(),['experience.profile']);
 const proposed=prepared.document.research.spots[0].claims[0];
 assert.equal(proposed.value.reviewed,true);assert.deepEqual(proposed.supportingSources,[{url:'https://example.org/drinks',evidence:'Weinkarte',observedAt:citation.observedAt,trust:'OFFICIAL_PRIMARY'}]);
 assert.equal(d.results[0].value.reviewed,false);
 assert.equal(parseWorldResearchBatch(prepared.document).validatedClaims.get(id).length,1);
});
test('the public email exception is limited to the exact field value in every citation',()=>{
 const make=(key,value,evidence)=>prepareNuknukDraftImport(draft([result(key,value,{citations:[{...citation,evidence}]})]),batch(),[key]);
 assert.equal(make('contact.public_email','tobias@example.org','Kontakt: tobias@example.org').held.length,0);
 assert.equal(make('contact.public_email','tobias@example.org','other@example.org').held.length,1);
 assert.equal(make('contact.public_email','tobias@example.org','tobias@example.org; api_key=secret').held.length,1);
 assert.equal(make('contact.website','https://example.org','tobias@example.org').held.length,1);
});
test('source validation also applies to extra citations and unknown data never becomes a false claim',()=>{
 const unknown={attributeKey:'amenity.features',status:'UNRESOLVED',reason:'NO_SUPPORTED_TARGET_FACT'};
 const value=result('contact.public_email','tobias@example.org',{citations:[{...citation,evidence:'tobias@example.org'},{...citation,evidence:'other@example.org'}]});
 const prepared=prepareNuknukDraftImport(draft([unknown,value]),batch(),['contact.public_email']);
 assert.deepEqual(prepared.document.research.spots[0].claims,[]);
 assert.equal(prepared.document.research.spots[0].unresolved.find(item=>item.attributeKey==='amenity.features')?.reason.includes('unverändert'),true);
});

const {assessNuknukDraftReview,finishNuknukDraftReview}=await import(pathToFileURL(join(dir,'import.mjs')).href);
const publicAnswer=value=>({...claim(value),visibility:'PUBLIC'});
test('review completion uses persisted coverage and retains extra existing details',()=>{
 const incoming={...emptyExperienceProfile('EAT'),offers:[offer('research')]};
 const existing={...incoming,reviewed:true,areas:[area('existing')]};
 const d=draft([result('experience.profile',incoming),result('classification.place_types',['BAR']),{attributeKey:'contact.tiktok',status:'UNRESOLVED'}]);
 const answers={'experience.profile':publicAnswer(existing),'classification.place_types':publicAnswer(['BAR','RESTAURANT'])};
 assert.ok(assessNuknukDraftReview(d,answers).every(field=>field.covered));
 const finished=finishNuknukDraftReview(d,answers,{});assert.deepEqual(finished.pending,[]);assert.equal(finished.decisions.length,2);
 assert.ok(finished.decisions.every(field=>field.outcome==='PROFILE_VERIFIED'));
});
test('partial review never archives unselected fields and does not infer rejection from unknown',()=>{
 const d=draft([result('identity.name','Fixture'),result('hours.regular',[{day:'MONDAY',intervals:[{start:'11:00',end:'00:00'}]}])]);
 const answers={'identity.name':publicAnswer('Fixture'),'hours.regular':publicAnswer([{day:'MONDAY',intervals:[{start:'11:00',end:'23:00'}]}])};
 assert.deepEqual(finishNuknukDraftReview(d,answers,{}).pending,['hours.regular']);
 assert.deepEqual(finishNuknukDraftReview(d,answers,{'hours.regular':answers['hours.regular'].claimId}).pending,[]);
 assert.equal(finishNuknukDraftReview(d,answers,{'hours.regular':answers['hours.regular'].claimId}).decisions[1].outcome,'KEPT_PROFILE');
 assert.deepEqual(finishNuknukDraftReview(d,answers,{'hours.regular':'stale-claim'}).pending,['hours.regular']);
 assert.deepEqual(finishNuknukDraftReview(d,{},{}).pending,['identity.name','hours.regular']);
});
test('declining a missing proposal is explicit, private values are not exposed, foreign decisions fail',()=>{
 const d=draft([result('contact.phone','+41612725415')]);
 assert.deepEqual(assessNuknukDraftReview(d,{'contact.phone':{...publicAnswer('secret'),visibility:'PRIVATE'}}),[{attributeKey:'contact.phone',covered:false,claimId:null,currentValue:undefined}]);
 assert.equal(finishNuknukDraftReview(d,{}, {'contact.phone':null}).decisions[0].outcome,'DECLINED');
 assert.throws(()=>finishNuknukDraftReview(d,{}, {'another.field':null}),/fremdes Feld/);
});

test('empty catalog selections do not assert subset coverage; empty partial schedules preserve saved days',()=>{
 const d=draft([result('hours.regular',[])]);
 const existing={'hours.regular':publicAnswer([{day:'MONDAY',intervals:[{start:'11:00',end:'23:00'}]}])};
 // Empty partial weekly plans may supplement nothing; that must not assert closure or overwrite the saved schedule.
 const fields=assessNuknukDraftReview(d,existing);
 assert.equal(fields[0].covered,true); // supplement semantics preserve the entire existing plan
 assert.equal(existing['hours.regular'].value[0].intervals[0].end,'23:00');
 const dietDraft=draft([result('classification.place_types',[])]);
 assert.equal(assessNuknukDraftReview(dietDraft,{'classification.place_types':publicAnswer(['RESTAURANT'])})[0].covered,false);
});


test('conflicting profile supplements remain reviewable and cannot bypass the editor via confirmation',()=>{
 const existing={...emptyExperienceProfile('EAT'),reviewed:true,areas:[area('real')],offers:[offer('drink',['real'])]};
 const incoming=structuredClone(existing);incoming.areas[0].properties[0].value=75;
 const current={'experience.profile':claim(existing)};
 const proposal={attributeKey:'experience.profile',knowledgeState:'KNOWN_VALUE',value:incoming,source:{...citation,trust:'OFFICIAL_PRIMARY'}};
 for(const confirmations of [{},{'experience.profile':current['experience.profile'].claimId}]){
  const plan=planAdminResearchReview({claims:[proposal],current,confirmations,declined:[],majorKeys:['experience.profile'],observedAt:citation.observedAt});
  assert.equal(plan.accepted.length,0);assert.equal(plan.reviews.length,1);assert.ok(plan.reviews[0].editorRequired);
  assert.deepEqual(plan.reviews[0].current.value,existing);assert.deepEqual(plan.reviews[0].proposed.value,incoming);
 }
 const kept=planAdminResearchReview({claims:[proposal],current,confirmations:{},declined:['experience.profile'],majorKeys:[],observedAt:citation.observedAt});
 assert.equal(kept.accepted.length,0);assert.equal(kept.reviews.length,0);
 assert.equal(existing.areas[0].properties[0].value,50);
});

test('MAJOR identical values remain actionable until an explicit current-claim decision',()=>{
 const current={'rule.reservation':claim({status:'REQUIRED',details:null})};
 const proposal={attributeKey:'rule.reservation',knowledgeState:'KNOWN_VALUE',value:current['rule.reservation'].value,source:{...citation,trust:'OFFICIAL_PRIMARY'}};
 const input={claims:[proposal],current,confirmations:{},declined:[],majorKeys:['rule.reservation'],observedAt:citation.observedAt};
 const pending=planAdminResearchReview(input);assert.equal(pending.reviews.length,1);assert.equal(pending.skipped.length,0);assert.equal(pending.accepted.length,0);
 const confirmed=planAdminResearchReview({...input,confirmations:{'rule.reservation':current['rule.reservation'].claimId}});
 assert.equal(confirmed.reviews.length,0);assert.deepEqual(confirmed.skipped,['rule.reservation']);assert.equal(confirmed.accepted.length,0);
 const normal=planAdminResearchReview({...input,majorKeys:[]});assert.equal(normal.reviews.length,0);assert.deepEqual(normal.skipped,['rule.reservation']);
});

test('confirmed yes and no proposals are covered by boolean profile claims',()=>{
 for(const value of [true,false])assert.equal(assessNuknukDraftReview(draft([result('operation.takeaway',value)]),{'operation.takeaway':{claimId:'confirmed',visibility:'PUBLIC',knowledgeState:value?'KNOWN_TRUE':'KNOWN_FALSE',value}})[0].covered,true);
});
test('accepting special dates preserves existing dates outside the proposal',()=>{
 const old={date:'2026-11-01',status:'CLOSED',intervals:[]},proposed={date:'2026-12-24',status:'CLOSED',intervals:[]};
 const value=supplementResearchValue('hours.special',{knowledgeState:'KNOWN_VALUE',value:[old]},[proposed]);assert.deepEqual(value,[old,proposed]);
});
test('an already-present second property is not mistaken for a conflicting first property',()=>{
 const p=(value)=>({key:'custom.detail',label:'Spezialität',state:'KNOWN',value,conditions:emptyExperienceConditions()});
 const current={...emptyExperienceProfile('EAT'),properties:[p('First'),p('Second')]};
 assert.deepEqual(mergeResearchProfile(current,{...emptyExperienceProfile('EAT'),properties:[p('Second')]}).properties,current.properties);
 assert.throws(()=>mergeResearchProfile(current,{...emptyExperienceProfile('EAT'),properties:[p('Third')]}),/widerspricht/);
});

test('an empty special-hours proposal cannot silently retain or remove existing dates',()=>{
 for(const key of ['hours.special','hours.kitchen_special']){
  assert.throws(()=>supplementResearchValue(key,{knowledgeState:'KNOWN_VALUE',value:[{date:'2026-12-24',status:'CLOSED',intervals:[]}]},[]),/bereits besondere Öffnungszeiten/);
  assert.deepEqual(supplementResearchValue(key,{knowledgeState:'KNOWN_VALUE',value:[]},[]),[]);
 }
});
