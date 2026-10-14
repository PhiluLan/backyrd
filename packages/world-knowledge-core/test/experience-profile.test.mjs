import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPERIENCE_PROFILE_VERSION, EXPERIENCE_QUESTIONS, EXPERIENCE_TEMPLATES, emptyExperienceConditions, emptyExperienceProfile, parseExperienceProfile, experienceEvidence, getExperienceQuestions, validateAuthoringSubmission, ACCEPTED_ENTITLEMENT_POLICY } from '../dist/index.js';
const condition=emptyExperienceConditions();
const property=(key,value,state='KNOWN',conditions=condition)=>({key,label:null,value,state,conditions});
const price={label:'Mittagessen',currency:'CHF',min:19.50,max:25,basis:'PER_PERSON',minimumAge:null,maximumAge:null,mandatoryFeesIncluded:true,includes:'Hauptgericht',conditions:condition};
const area={id:'terrace',kind:'TERRACE',name:'Terrasse',properties:[property('location.waterbody','Rhein'),property('condition.weather_protection',false)]};
const offer={id:'lunch',kind:'LUNCH',name:'Mittagessen',areaIds:['terrace'],properties:[property('food.meal_extent','Vollständige Mahlzeit')],prices:[price],schedule:[{weekday:1,start:'11:30',end:'14:00'}],validFrom:null,validUntil:null};
const restaurant={...emptyExperienceProfile('RESTAURANT'),reviewed:true,areas:[area],offers:[offer]};
for(const category of Object.keys(EXPERIENCE_TEMPLATES))test(`${category}: all category cards round-trip with their exact scope`,()=>{
 const template=EXPERIENCE_TEMPLATES[category],profile={...emptyExperienceProfile(category),reviewed:true,areas:template.areas.map((a,i)=>({id:'a'+i,kind:a.kind,name:a.label,properties:[]})),offers:template.offers.map((o,i)=>({...offer,id:'o'+i,kind:o.kind,name:o.label,areaIds:['a0'],properties:[],prices:[],schedule:[]}))};
 assert.deepEqual(parseExperienceProfile(profile),profile);
 assert.equal(validateAuthoringSubmission('experience.profile','KNOWN_VALUE',profile).ok,true);
});
test('waterfront terrace and lunch price never become whole-spot properties',()=>{const evidence=experienceEvidence(restaurant);assert.equal(evidence.facts.filter(f=>f.scope==='SPOT').length,0);assert.equal(evidence.facts.find(f=>f.property.key==='location.waterbody').subjectId,'terrace');assert.equal(evidence.offers[0].prices[0].max,25);assert.equal(evidence.facts.some(f=>f.property.key==='budget.maximum'),false);});
test('unanswered, unknown, no and not applicable are distinct',()=>{const profile={...restaurant,areas:[{...area,properties:[property('amenity.toilet',false),property('amenity.playground',null,'UNKNOWN'),property('offer.shade',null,'NOT_APPLICABLE')]}]};assert.deepEqual(parseExperienceProfile(profile).areas[0].properties,profile.areas[0].properties);assert.equal(profile.properties.length,0);assert.throws(()=>parseExperienceProfile({...profile,properties:[property('amenity.toilet',false,'UNKNOWN')]}),/must_be_null/);});
test('unreviewed proposal is not searchable knowledge',()=>{assert.throws(()=>experienceEvidence({...restaurant,reviewed:false}),/review_required/);assert.equal(parseExperienceProfile({...restaurant,reviewed:false},false).reviewed,false);});
test('dangling and duplicate references fail before storage',()=>{assert.throws(()=>parseExperienceProfile({...restaurant,areas:[]}),/reference_invalid/);assert.throws(()=>parseExperienceProfile({...restaurant,areas:[area,area]}),/duplicate/);assert.throws(()=>parseExperienceProfile({...restaurant,offers:[offer,offer]}),/duplicate/);assert.throws(()=>parseExperienceProfile({...restaurant,offers:[{...offer,areaIds:['terrace','terrace']}]}),/duplicate/);});
test('area properties cannot be entered at spot scope',()=>{assert.throws(()=>parseExperienceProfile({...restaurant,properties:[property('location.view','Rhein')]}),/scope_invalid/);assert.throws(()=>parseExperienceProfile({...restaurant,properties:[property('atmosphere.noise','ruhig')]}),/scope_invalid/);});
test('unknown family cannot be silently converted to a known one',()=>{assert.throws(()=>parseExperienceProfile({...restaurant,properties:[property('unknown.magic','X')]}),/unknown_property_key/);const profile={...restaurant,properties:[{...property('custom.detail','Besonderheit'),label:'Eigener Begriff'}]};assert.equal(parseExperienceProfile(profile).properties[0].key,'custom.detail');});
test('price bands do not replace upper bounds or complete costs',()=>{const profile={...restaurant,offers:[{...offer,prices:[{...price,max:null,mandatoryFeesIncluded:null}]}]};assert.equal(parseExperienceProfile(profile).offers[0].prices[0].max,null);assert.equal(parseExperienceProfile(profile).offers[0].prices[0].mandatoryFeesIncluded,null);});
for(const [patch,error] of [[{min:26},/price_order/],[{min:1.001},/minor_units/],[{minimumAge:12,maximumAge:6},/age_order/],[{min:NaN},/finite/],[{currency:'Fr.'},/format/]])test(`invalid price ${JSON.stringify(patch)} fails closed`,()=>assert.throws(()=>parseExperienceProfile({...restaurant,offers:[{...offer,prices:[{...price,...patch}]}]}),error));
test('date, schedule, event and conditions retain boundaries',()=>{const profile={...restaurant,areas:[{...area,properties:[property('atmosphere.noise','leise','KNOWN',{...condition,weekdays:[1],dayparts:['MIDDAY'],event:'ohne Live-Musik',validFrom:'2026-10-14',validUntil:'2026-10-31'})]}]};assert.deepEqual(parseExperienceProfile(profile),profile);assert.throws(()=>parseExperienceProfile({...restaurant,offers:[{...offer,validFrom:'2026-11-01',validUntil:'2026-10-01'}]}),/validity_order/);assert.throws(()=>parseExperienceProfile({...restaurant,offers:[{...offer,schedule:[{weekday:1,start:'12:00',end:'12:00'}]}]}),/schedule_empty/);assert.throws(()=>parseExperienceProfile({...restaurant,offers:[{...offer,validFrom:'2026-02-30'}]}),/calendar/);});
test('museum cafe receives food questions; workshop does not',()=>{assert.ok(getExperienceQuestions('MUSEUM','OFFER','CAFE').some(q=>q.key==='food.drink'));assert.equal(getExperienceQuestions('MUSEUM','OFFER','WORKSHOP').some(q=>q.key==='food.drink'),false);assert.equal(getExperienceQuestions('ZOO','OFFER','VISIT').some(q=>q.key==='food.cuisine'),false);});
test('knowledge can be authored without owner tier affecting ranking',()=>{assert.ok(ACCEPTED_ENTITLEMENT_POLICY.basicKeys.includes('experience.profile'));assert.equal(ACCEPTED_ENTITLEMENT_POLICY.commercialInfluence,'AUTHORING_SCOPE_ONLY');assert.equal(new Set(EXPERIENCE_QUESTIONS.map(q=>q.key)).size,EXPERIENCE_QUESTIONS.length);assert.equal(restaurant.contractVersion,EXPERIENCE_PROFILE_VERSION);});

test('registry 2.3 remains verifiable and upgrades additively with founder authority',async()=>{
 const w=await import('../dist/index.js');
 assert.equal(w.REGISTRY_V2_3_SHAPE.hash,'c3016e37bc0bb178c390a01a55cf69fa8d8f748593e1a794d2b2f9d84e513cc3');
 assert.equal(w.REGISTRY_V2_3_SHAPE.definitions.some(d=>d.key==='experience.profile'),false);
 assert.doesNotThrow(()=>w.validateRegistryTransition(w.REGISTRY_V2_3_SHAPE,w.CURRENT_REGISTRY_SHAPE,w.SLICE4E_REGISTRY_RELEASE,{acceptedApprovalAuthorities:[w.SLICE4E_REGISTRY_APPROVAL_AUTHORITY],acceptedApprovalRecords:[w.SLICE4E_REGISTRY_APPROVAL_RECORD],history:[]}));
});

test('category guidance uses confirmed types and never infers a restaurant from missing classification',async()=>{
 const {experienceCategoryFromAnswers}=await import('../dist/index.js');
 const known=value=>({knowledgeState:'KNOWN_VALUE',value});
 assert.equal(experienceCategoryFromAnswers({}),null);
 assert.equal(experienceCategoryFromAnswers({'classification.place_types':known(['WINE_BAR'])}),'BAR');
 assert.equal(experienceCategoryFromAnswers({'classification.place_types':known(['ZOO','PARK'])}),'ZOO');
 assert.equal(experienceCategoryFromAnswers({'classification.place_types':known(['CLIMBING_GYM'])}),'SPORT');
 assert.equal(experienceCategoryFromAnswers({'classification.primary_category':known('SPORT_MOVEMENT'),'classification.place_types':known(['SWIMMING_POOL'])}),null);
 assert.equal(experienceCategoryFromAnswers({'classification.place_types':{knowledgeState:'UNKNOWN',value:['ZOO']}}),null);
});
test('wine bar aperitif never asks for guiding, skills, entry tickets or recommended ages',()=>{
 const keys=getExperienceQuestions('BAR','OFFER','APERITIF').map(q=>q.key);
 for(const key of ['participation.format','participation.language','participation.prerequisite','participation.entry_mode','participation.age_suitability','route.length','sport.equipment','offer.capacity'])assert.ok(!keys.includes(key),key);
 for(const key of ['food.drink','food.dish','food.meal_extent','participation.booking'])assert.ok(keys.includes(key),key);
});
test('zoo visit, guided tour and zoo restaurant have different question sets',()=>{
 const keys=kind=>getExperienceQuestions('ZOO','OFFER',kind).map(q=>q.key);
 assert.ok(keys('VISIT').includes('participation.entry_mode'));
 assert.ok(!keys('VISIT').includes('participation.format'));
 assert.ok(keys('GUIDED_TOUR').includes('participation.language'));
 assert.ok(keys('GASTRONOMY').includes('food.cuisine'));
 assert.ok(!keys('GASTRONOMY').includes('participation.format'));
 assert.ok(!keys('GASTRONOMY').includes('route.length'));
});
test('bouldering and its cafe have separate equipment and food questions',()=>{
 const boulder=getExperienceQuestions('SPORT','OFFER','BOULDERING').map(q=>q.key);
 for(const key of ['sport.level','sport.equipment','sport.rental','sport.induction','sport.registration','participation.minimum_age'])assert.ok(boulder.includes(key),key);
 for(const key of ['food.drink','food.dish','participation.format','participation.language'])assert.ok(!boulder.includes(key),key);
 const cafe=getExperienceQuestions('SPORT','OFFER','CAFE').map(q=>q.key);
 assert.ok(cafe.includes('food.drink'));
 assert.ok(!cafe.includes('sport.equipment'));
});
test('indoor area does not ask for shade or rain cover; terrace does',()=>{
 const keys=kind=>getExperienceQuestions('BAR','AREA',undefined,kind).map(q=>q.key);
 assert.ok(!keys('INDOOR').includes('condition.weather_protection'));
 assert.ok(!keys('INDOOR').includes('offer.shade'));
 assert.ok(keys('TERRACE').includes('offer.shade'));
 assert.ok(getExperienceQuestions('SPORT','AREA',undefined,'CHANGING_ROOM').some(q=>q.key==='amenity.shower'));
 assert.ok(!getExperienceQuestions('SPORT','AREA',undefined,'BOULDER_AREA').some(q=>q.key==='amenity.shower'));
});
test('hidden historical questions remain parseable and are not silently reclassified',()=>{
 const legacy={...restaurant,offers:[{...offer,kind:'APERITIF',properties:[property('participation.format','Selbstständig')]}]};
 assert.deepEqual(parseExperienceProfile(legacy),legacy);
});

test('the forward SQL validator uses exactly the current scoped JSON schema',async()=>{
 const {readFileSync}=await import('node:fs');
 const {EXPERIENCE_PROFILE_SCHEMA}=await import('../dist/index.js');
 const source=readFileSync(new URL('../../../supabase/migrations/20261014211339_scoped_sport_authoring_catalog_v1_1.sql',import.meta.url),'utf8');
 const schema=source.match(/experience_json_schema_matches_v1\('(.*?)'::jsonb/s)?.[1];
 assert.ok(schema);
 assert.deepEqual(JSON.parse(schema),EXPERIENCE_PROFILE_SCHEMA);
});
