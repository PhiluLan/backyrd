import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as w from '../dist/index.js';
const conditions=w.emptyExperienceConditions();
const prop=(key,value)=>({key,value,label:null,state:'KNOWN',conditions});
const offer=(kind,id=kind)=>({id,kind,name:kind,areaIds:[],properties:[],prices:[],schedule:[],validFrom:null,validUntil:null});
test('catalogue is complete, unique, grouped and preserves all prior types',()=>{
 assert.equal(w.SPOT_GROUPS.length,16);assert.equal(w.SPOT_TYPE_CATALOG.length,111);assert.equal(new Set(w.PLACE_TYPES).size,w.SPOT_TYPE_CATALOG.length);
 for(const type of w.SPOT_TYPE_CATALOG){assert.ok(w.SPOT_GROUPS.some(g=>g.id===type.group));assert.ok(w.PLACE_TYPE_AUTHORING_OPTIONS.some(o=>o.value===type.kind&&o.label===type.label&&o.state==='CANONICAL'));assert.deepEqual(w.parseAttributeValue('classification.place_types',[type.kind]),[type.kind]);assert.ok(w.experienceCategoryFromAnswers({'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:[type.kind]}}));}
 for(const type of w.REGISTRY_V2_4_PLACE_TYPES)assert.ok(w.PLACE_TYPES.includes(type));
 assert.equal(w.assessPlaceTypeCompatibility('STAY',['HOTEL','RESTAURANT','BAR']).state,'COMPATIBLE');
});
for(const type of w.SPOT_TYPE_CATALOG)test(`catalogue ${type.kind}: real scoped offer can be saved`,()=>{
 const category=w.experienceCategoryFromAnswers({'classification.place_types':{knowledgeState:'KNOWN_VALUE',value:[type.kind]}});
 const p={...w.emptyExperienceProfile(category),reviewed:true,offers:[offer(w.OFFER_CATALOG.find(o=>o.group===type.group)?.kind??'VISIT')]};
 assert.deepEqual(w.parseExperienceProfile(p),p);assert.equal(w.validateAuthoringSubmission('experience.profile','KNOWN_VALUE',p).ok,true);
});
for(const item of w.OFFER_CATALOG)test(`offer ${item.kind}: cross-category round trip and shared activity vocabulary`,()=>{
 const p={...w.emptyExperienceProfile('STAY'),reviewed:true,offers:[offer(item.kind)]};assert.deepEqual(w.parseExperienceProfile(p),p);
 for(const activity of item.activities){const concept=w.librarianConcept(activity);assert.ok(concept,activity);assert.ok(w.OFFER_CONCEPTS[item.kind].includes(concept),`${item.kind}:${activity}`);}
 assert.ok(w.getExperienceQuestions('STAY','OFFER',item.kind).some(q=>q.key==='experience.activity'));
});
for(const item of w.AREA_CATALOG)test(`area ${item.kind}: available independently of the spot category`,()=>{
 const p={...w.emptyExperienceProfile('RESTAURANT'),reviewed:true,areas:[{id:'area',kind:item.kind,name:item.label,properties:[]}]};assert.deepEqual(w.parseExperienceProfile(p),p);
});
test('hotel combines stay, food and bar without assigning their facts to the venue',()=>{
 const p={...w.emptyExperienceProfile('STAY'),reviewed:true,offers:[{...offer('OVERNIGHT_STAY'),properties:[prop('stay.check_in','15:00')],prices:[{label:'Zimmer',currency:'CHF',min:160,max:160,basis:'PER_ROOM_NIGHT',minimumAge:null,maximumAge:null,mandatoryFeesIncluded:true,includes:'Übernachtung',conditions}]},offer('BREAKFAST'),{...offer('DRINKS'),properties:[prop('participation.audience','Öffentlich zugänglich')]}]};
 assert.deepEqual(w.parseExperienceProfile(p),p);assert.equal(w.experienceEvidence(p).facts.filter(f=>f.scope==='SPOT').length,0);
 const stay=w.getExperienceQuestions('STAY','OFFER','OVERNIGHT_STAY').map(q=>q.key),drinks=w.getExperienceQuestions('STAY','OFFER','DRINKS').map(q=>q.key);
 assert.ok(stay.includes('stay.check_in'));assert.ok(stay.includes('stay.minimum_booking_age'));assert.ok(!stay.includes('time.duration'));assert.ok(!stay.includes('experience.theme'));assert.ok(!stay.includes('food.cuisine'));assert.ok(drinks.includes('food.drink'));assert.ok(!drinks.includes('stay.check_in'));
 assert.throws(()=>w.parseExperienceProfile({...p,offers:[{...p.offers[0],properties:[prop('stay.check_in','morgen irgendwann')]}]}),/clock/);
 assert.throws(()=>w.parseExperienceProfile({...p,offers:[offer('UNREGISTERED_OFFER')]}));
});
test('subtype proofs are directed and do not manufacture facilities',()=>{assert.ok(w.spotTypeSupports('BOUTIQUE_HOTEL','HOTEL'));assert.equal(w.spotTypeSupports('HOTEL','BOUTIQUE_HOTEL'),false);assert.equal(w.spotTypeSupports('HOTEL','SPA'),false);assert.equal(w.spotTypeSupports('EXCURSION_RAILWAY','LANDMARK'),false);});
test('migration has exactly the shared schema and keeps the old validator and registry immutable',()=>{
 const source=readFileSync(new URL('../../../supabase/migrations/20261015110000_universal_spot_catalog_v2_5.sql',import.meta.url),'utf8');
 assert.deepEqual(JSON.parse(source.match(/experience_json_schema_matches_v1\('(.*?)'::jsonb/s)[1]),w.EXPERIENCE_PROFILE_SCHEMA);
 assert.ok(source.includes('experience_profile_valid_v2'));assert.ok(!source.includes('create or replace function world_knowledge_private.experience_profile_valid_v1('));
 assert.ok(!/update\s+world_knowledge_private\.(claims|registry_releases)/i.test(source));
});
