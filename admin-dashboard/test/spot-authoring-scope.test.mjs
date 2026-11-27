import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, writeFile, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {AREA_CATALOG, OFFER_CATALOG, EXPERIENCE_QUESTIONS, AUTHORING_STEPS, emptyExperienceProfile, emptyExperienceConditions, getAuthoringFieldsForContext, parseExperienceProfile} from '../../packages/world-knowledge-core/dist/browser-runtime.js';

const dir=await mkdtemp(join(tmpdir(),'spot-authoring-scope-'));
const runtime=new URL('../../packages/world-knowledge-core/dist/browser-runtime.js',import.meta.url).href;
const source=await readFile(new URL('../../packages/world-knowledge-authoring-ui/src/experience-authoring.ts',import.meta.url),'utf8');
const path=join(dir,'scope.mjs');
await writeFile(path,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"@backyrd/world-knowledge-core/browser"',JSON.stringify(runtime)));
const {getSpotCareSteps,categoryOfferChoices,getExperienceCareQuestions,getExperienceAdditionalQuestions,experienceQuestionSections,simpleOfferSetting,setSimpleOfferSetting}=await import(pathToFileURL(path).href);
const property=(key,value)=>({key,value,label:null,state:'KNOWN',conditions:emptyExperienceConditions()});
const fixture=()=>({...emptyExperienceProfile('MUSEUM'),reviewed:true,properties:[],areas:[{id:'old-room',kind:'EXHIBITION',name:'Bestehender Ausstellungsraum',properties:[property('amenity.step_free',false)]}],offers:[{id:'visit',kind:'PERMANENT_EXHIBITION',name:'Sammlung',areaIds:[],properties:[property('custom.detail','Besondere Sammlung')].map(p=>({...p,label:'Sammlungshinweis'})),prices:[{label:'Eintritt',min:12,max:12,currency:'CHF',basis:'PER_PERSON',includes:'Eintritt',mandatoryFeesIncluded:true,minimumAge:null,maximumAge:null,conditions:emptyExperienceConditions()}],schedule:[{weekday:1,start:'10:00',end:'17:00'}],validFrom:null,validUntil:null},{id:'tour',kind:'GUIDED_TOUR',name:'Führung',areaIds:['old-room'],properties:[],prices:[],schedule:[],validFrom:null,validUntil:null}]});

test('new care fields match the offer and common permission is authored once',()=>{
 const keys=(scope,kind)=>getExperienceCareQuestions('MUSEUM',scope,scope==='OFFER'?kind:undefined,scope==='AREA'?kind:undefined).map(q=>q.key);
 assert.ok(keys('OFFER','BOWLING').includes('sport.level'));
 assert.ok(keys('OFFER','WORKSHOP').includes('participation.group_access'));
 assert.ok(!keys('OFFER','CAFE').includes('participation.group_access'));
 assert.ok(keys('OFFER','BOWLING').includes('participation.subscription'));
 assert.ok(!keys('SPOT').includes('participation.permission'),'canonical pet/food rules already have a common editor');
 assert.ok(getExperienceAdditionalQuestions('MUSEUM','SPOT').some(q=>q.key==='participation.permission'),'deliberate exceptions remain available');
 assert.ok(!keys('OFFER','WORKSHOP').includes('participation.permission'));
 assert.ok(experienceQuestionSections('STAY','OFFER','OVERNIGHT_STAY').primary.some(q=>q.key==='stay.minimum_nights'));
 const previous=fixture();previous.offers[0].properties.push(property('participation.permission','Bestehende Ausnahme'));
 assert.ok(getExperienceCareQuestions('MUSEUM','OFFER','PERMANENT_EXHIBITION',undefined,{},true,previous.offers[0].properties).some(q=>q.key==='participation.permission'));
 assert.deepEqual(parseExperienceProfile(previous),previous);
});

test('general navigation preserves every applicable canonical field exactly once',()=>{
 for(const category of ['EAT','CULTURE_ARTS','ACTIVITIES_PLAY','STAY','SPORT_MOVEMENT']){
  const steps=getSpotCareSteps(category);
  assert.deepEqual(steps.map(step=>step.id),['discovery','areas','shared','basics','classification','review']);
  const keys=steps.flatMap(step=>step.attributeKeys).filter(key=>key!=='experience.profile');
  assert.equal(new Set(keys).size,keys.length);
  const original=AUTHORING_STEPS.flatMap(step=>getAuthoringFieldsForContext(step.id,category).map(field=>field.attributeKey)).filter(key=>key!=='experience.profile');
  assert.deepEqual([...keys].sort(),[...new Set(original)].sort());
 }
 const shared=getSpotCareSteps('EAT').find(step=>step.id==='shared');
 for(const key of ['hours.regular','hours.special','hours.kitchen','hours.kitchen_special','operation.price_options','rule.reservation','amenity.features'])assert.ok(shared.attributeKeys.includes(key),key);
});

test('category choices do not suggest private celebrations at a museum; existing services are not filtered out of storage',()=>{
 assert.ok(categoryOfferChoices('MUSEUM').some(offer=>offer.kind==='WORKSHOP'));
 assert.ok(!categoryOfferChoices('MUSEUM').some(offer=>offer.kind==='PRIVATE_CELEBRATION'));
 assert.ok(categoryOfferChoices('RESTAURANT').some(offer=>offer.kind==='PRIVATE_CELEBRATION'));
 assert.ok(categoryOfferChoices('ACTIVITIES_PLAY').some(offer=>offer.kind==='PRIVATE_CELEBRATION'));
 assert.ok(categoryOfferChoices('SPORT').some(offer=>offer.kind==='PRIVATE_CELEBRATION'));
 const profile=fixture();profile.offers.push({...profile.offers[1],id:'existing-party',kind:'PRIVATE_CELEBRATION',name:'Bereits belegte Feier'});
 assert.equal(parseExperienceProfile(profile).offers.length,3);
});

test('room first screen includes setting and access; secondary details remain available',()=>{
 const sections=experienceQuestionSections('SPORT','AREA',undefined,'BOULDER_AREA');
 assert.deepEqual(sections.primary.map(q=>q.key),['location.setting','amenity.stroller','amenity.step_free']);
 assert.ok(sections.primary.some(q=>q.key==='amenity.step_free'));
 assert.ok(!sections.primary.some(q=>q.key==='amenity.toilet'));
 const celebration=experienceQuestionSections('ACTIVITIES_PLAY','OFFER','PRIVATE_CELEBRATION');
 assert.ok(celebration.primary.some(q=>q.key==='participation.age_suitability'));
 assert.ok(!celebration.primary.some(q=>q.key==='food.cuisine'));
 assert.ok(celebration.additional.some(q=>q.key==='food.cuisine'));
});

test('explicit indoor/outdoor answers retain prices, schedules, details, other offers and all existing rooms',()=>{
 const before=fixture(),frozen=structuredClone(before);
 const inside=setSimpleOfferSetting(before,'visit','INDOOR');
 assert.deepEqual(before,frozen,'the input snapshot is never mutated');
 assert.deepEqual(inside.offers[0].prices,before.offers[0].prices);
 assert.deepEqual(inside.offers[0].schedule,before.offers[0].schedule);
 assert.deepEqual(inside.offers[0].properties,before.offers[0].properties);
 assert.deepEqual(inside.offers[1],before.offers[1]);
 assert.deepEqual(inside.areas[0],before.areas[0]);
 assert.equal(simpleOfferSetting(inside,'visit'),'INDOOR');
 assert.equal(parseExperienceProfile({...inside,reviewed:true}).offers.length,2);
 const both=setSimpleOfferSetting(inside,'visit','BOTH');
 assert.equal(simpleOfferSetting(both,'visit'),'BOTH');
 assert.equal(setSimpleOfferSetting(both,'visit','BOTH').areas.length,both.areas.length,'repeat selection reuses canonical basic areas');
 const unknown=setSimpleOfferSetting(both,'visit','UNKNOWN');
 assert.equal(unknown.areas.length,both.areas.length,'unassigning never deletes stored areas');
 assert.deepEqual(unknown.offers[0].areaIds,[]);
});

test('simple location control cannot replace a named area or silently lose special access conditions',()=>{
 const before=fixture();
 assert.equal(simpleOfferSetting(before,'tour'),null);
 assert.throws(()=>setSimpleOfferSetting(before,'tour','INDOOR'),/requires_area_review/);
 const inside=setSimpleOfferSetting(before,'visit','INDOOR');
 inside.areas.find(area=>area.id.startsWith('setting-')).properties.push(property('amenity.step_free',false));
 assert.equal(simpleOfferSetting(inside,'visit'),null);
 assert.throws(()=>setSimpleOfferSetting(inside,'visit','OUTDOOR'),/requires_area_review/);
 const renamed=setSimpleOfferSetting(before,'visit','INDOOR');
 renamed.areas.find(area=>area.id.startsWith('setting-')).name='Ausstellungssaal';
 assert.equal(simpleOfferSetting(renamed,'visit'),null,'renamed areas require explicit review');
 assert.throws(()=>setSimpleOfferSetting(before,'visit','INVALID'),/setting_invalid/);
});

test('area-id collisions and capacity limits fail safely without changing stored data',()=>{
 const before=fixture();before.areas[0].id='setting-indoor';before.offers[1].areaIds=['setting-indoor'];
 const after=setSimpleOfferSetting(before,'visit','INDOOR');
 assert.equal(after.offers[0].areaIds[0],'setting-indoor-2');
 assert.deepEqual(after.areas[0],before.areas[0]);
 const full=fixture();full.areas=Array.from({length:30},(_,i)=>({...full.areas[0],id:`room-${i}`}));
 const frozen=structuredClone(full);
 assert.throws(()=>setSimpleOfferSetting(full,'visit','BOTH'),/area_limit/);
 assert.deepEqual(full,frozen);
});

test('central facility writer removes duplicate WC questions only where that writer is authorized',async()=>{
 const {getExperienceAuthoringQuestions}=await import(pathToFileURL(path).href);
 assert.ok(!getExperienceAuthoringQuestions('MUSEUM','SPOT',undefined,undefined,{},true).some(q=>q.key==='amenity.toilet'));
 assert.ok(getExperienceAuthoringQuestions('MUSEUM','SPOT',undefined,undefined,{},false).some(q=>q.key==='amenity.toilet'),'Basic owners keep their existing profile-scoped facility editor');
});


test('every stored structured fact retains a typed editor at its exact original scope',()=>{
 for(const question of EXPERIENCE_QUESTIONS)for(const scope of question.scopes){
  const values=[property(question.key,question.control==='NUMBER'?4:question.control==='YES_NO'?false:'Bisherige Formulierung')];
  const before=structuredClone(values);
  const shown=getExperienceCareQuestions('MUSEUM',scope,'CAFE','INDOOR',{},true,values);
  assert.equal(shown.filter(item=>item.key===question.key).length,1,`${scope}:${question.key}`);
  assert.equal(shown.find(item=>item.key===question.key).control,question.control);
  assert.deepEqual(values,before);
 }
});

test('every supported question has a new-entry path without requiring an old saved value',()=>{
 const reachable=new Set();
 const contexts=[['SPOT',undefined,undefined],...OFFER_CATALOG.map(o=>['OFFER',o.kind,undefined]),...AREA_CATALOG.map(a=>['AREA',undefined,a.kind])];
 for(const [scope,offerKind,areaKind] of contexts){
  for(const question of [...getExperienceCareQuestions('OTHER',scope,offerKind,areaKind,{},true),...getExperienceAdditionalQuestions('OTHER',scope,offerKind,areaKind,{},true)])reachable.add(question.key);
 }
 for(const question of EXPERIENCE_QUESTIONS)assert.ok(reachable.has(question.key),`${question.key} lacks a new-entry path`);
});

test('deliberate scoped exceptions start unknown and do not copy common facts or become mandatory duplicates',()=>{
 const shared={'amenity.features':{knowledgeState:'KNOWN_VALUE',value:['TOILET']}};
 const visible=getExperienceCareQuestions('MUSEUM','AREA',undefined,'EXHIBITION',shared,true);
 const extra=getExperienceAdditionalQuestions('MUSEUM','AREA',undefined,'EXHIBITION',shared,true);
 assert.ok(!visible.some(q=>q.key==='amenity.toilet'));
 assert.ok(extra.some(q=>q.key==='amenity.toilet'));
 const values=[{key:'amenity.toilet',label:null,state:'UNKNOWN',value:null,conditions:emptyExperienceConditions()}];
 assert.equal(getExperienceCareQuestions('MUSEUM','AREA',undefined,'EXHIBITION',shared,true,values).filter(q=>q.key==='amenity.toilet').length,1);
 assert.ok(!getExperienceAdditionalQuestions('MUSEUM','AREA',undefined,'EXHIBITION',shared,true,values).some(q=>q.key==='amenity.toilet'));
 assert.equal(values[0].value,null);
});
