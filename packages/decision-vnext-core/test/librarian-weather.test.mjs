import test from 'node:test';
import assert from 'node:assert/strict';
import {fact,request,profile,offer,area,prop,binding,search,date,conditions} from './librarian-matching-fixtures.mjs';
import {validateActiveLunaMeaningOutput,buildLunaLibrarianModelRequest} from '../dist/product-luna-librarian.js';
const weather=(role='CONTEXT',state='RAIN')=>({id:'w1',basis:'EXPLICIT',subjectIds:['a1'],role,state,detail:null});
const outing=(extra=[],weatherConditions=[weather()])=>request([
 fact('play','condition.children','children_activity'),fact('rain','offer.weather_suitability','rain_suitable'),...extra,
],{weatherConditions});
const venue=(kind='INDOOR',properties=[])=>profile([offer('play','MOVEMENT_PLAY',['play'])],[{...area('play',properties),kind}]);
const candidate=r=>[...r.ranked,...r.unresolved,...r.excluded][0];

test('user-stated rain is visit context, not a forecast to verify or an IF gate',()=>{
 const q=outing();assert.doesNotThrow(()=>validateActiveLunaMeaningOutput(q.raw));
 const r=search(q,[binding(1,venue())]);
 assert.equal(r.ranked.length,1);assert.deepEqual(r.conditionUnknownIds,[]);
 assert.equal(r.evaluationPlan.weather[0].authority,'USER_VISIT_CONTEXT');
 assert.equal(candidate(r).facts.find(f=>f.factId==='rain').state,'MET');
 assert.equal(candidate(r).limitations.includes('WEATHER_CONDITION_UNKNOWN'),false);
});

test('weather roles are explicit in new model output; historical triggers keep their old meaning',()=>{
 const q=outing(),old={...q.raw,weatherConditions:[{id:'w1',basis:'EXPLICIT',subjectIds:[],state:'RAIN',detail:null}],logic:{kind:'IF',conditionFactId:'w1',then:{kind:'FACT',factId:'play'},else:null}};
 assert.doesNotThrow(()=>request(old.facts,old));
 assert.throws(()=>validateActiveLunaMeaningOutput(old),/weather_role_required/);
 const invalid={...q.raw,logic:{kind:'IF',conditionFactId:'w1',then:{kind:'FACT',factId:'play'},else:null}};
 assert.throws(()=>request(invalid.facts,invalid),/condition_invalid/);
 const body=buildLunaLibrarianModelRequest({sourceText:'Heute regnet es',reference:q.source.reference});
 assert.deepEqual(body.text.format.schema.$defs.weatherCondition.properties.role.enum,['CONTEXT','CONDITIONAL']);
 assert.ok(body.text.format.schema.$defs.weatherCondition.required.includes('role'));
});

test('real weather alternatives remain unresolved without bound evidence, even beside user weather context',()=>{
 const facts=[fact('inside','experience.activity','children_activity'),date()];
 const q=request(facts,{weatherConditions:[weather('CONDITIONAL'),{...weather(),id:'observed'}],logic:{kind:'IF',conditionFactId:'w1',then:{kind:'FACT',factId:'inside'},else:null}});
 const r=search(q,[binding(1,venue())]);
 assert.equal(r.ranked.length,0);assert.deepEqual(r.conditionUnknownIds,['w1']);
 assert.equal(r.evaluationPlan.weather.find(w=>w.id==='w1').authority,'EXTERNAL_EVIDENCE_REQUIRED');
});

test('rain suitability allows covered outdoors without changing an explicit outdoor requirement',()=>{
 const q=outing([fact('outside','offer.area','outdoor')]);
 const r=search(q,[binding(1,venue('OUTDOOR',[prop('condition.weather_protection',true)]))]);
 assert.equal(r.ranked.length,1,JSON.stringify(r.unresolved));
 assert.equal(search(q,[binding(1,venue())]).ranked.length,0,'indoor cannot satisfy outdoors');
 for(const props of [[],[prop('condition.weather_protection',false)],[prop('offer.shade',true)],[prop('condition.weather_protection',null,{state:'UNKNOWN'})]])
  assert.equal(search(q,[binding(1,venue('OUTDOOR',props))]).ranked.length,0);
});

test('indoor setting proves rain suitability but an unknown setting or unsupported type does not',()=>{
 assert.equal(search(outing(),[binding(1,venue('PLAYGROUND',[prop('location.setting','drinnen')]))]).ranked.length,1);
 for(const p of [venue('PLAYGROUND'),venue('INDOOR',[prop('location.setting',null,{state:'UNKNOWN'})])])
  assert.equal(search(outing(),[binding(1,p)]).ranked.length,0);
});

test('an unrelated cafe, a roof somewhere at the venue, or a conditional canopy cannot protect the activity',()=>{
 const p=profile([offer('play','MOVEMENT_PLAY',['play']),offer('cafe','CAFE',['cafe'])],[{...area('play'),kind:'OUTDOOR'},area('cafe',[prop('condition.weather_protection',true)])]);
 assert.equal(search(outing(),[binding(1,p)]).ranked.length,0);
 p.properties=[prop('condition.weather_protection',true)];
 assert.throws(()=>search(outing(),[binding(1,p)]),/experience_property_scope_invalid/,'whole-venue canopy is not valid scoped area evidence');
 p.properties=[];
 p.areas[0].properties=[prop('condition.weather_protection',true,{conditions:{...conditions,weekdays:[1]}})];
 assert.equal(search(outing([date()]),[binding(1,p)]).ranked.length,0);
});

test('permission to get wet adds no rain-protection duty; a concrete excluded roof stays binding',()=>{
 const q=request([fact('play','condition.children','children_activity')],{weatherConditions:[weather()]});
 assert.equal(search(q,[binding(1,venue('OUTDOOR'))]).ranked.length,1,'context alone never rewrites the request');
 const excluded=request([fact('play','condition.children','children_activity'),fact('roof','condition.weather_protection','covered','EXCLUDED')]);
 assert.equal(search(excluded,[binding(1,venue('OUTDOOR',[prop('condition.weather_protection',true)]))]).ranked.length,0);
});

for(const state of ['SUN','HEAT','COLD','WIND','SNOW','THUNDERSTORM'])test(`${state}: weather context preserves explicit outdoor activity and invents no protection`,()=>{
 const q=request([fact('play','condition.children','children_activity'),fact('outside','offer.area','outdoor')],{weatherConditions:[weather('CONTEXT',state)]});
 const r=search(q,[binding(1,venue('OUTDOOR'))]);
 assert.equal(r.ranked.length,1);assert.deepEqual(r.conditionUnknownIds,[]);
 assert.equal(r.evaluationPlan.weather[0].state,state);
 // No claim of safety/suitability for this weather is fabricated.
 assert.ok(!r.ranked[0].facts.some(f=>f.family==='offer.weather_suitability'));
});

test('heat, cold and wind suitability cannot be inferred from indoors, a roof or shade',()=>{
 for(const requirement of ['heat_suitable','cold_suitable','wind_suitable','snow_suitable','thunderstorm_suitable']){
  const q=request([fact('play','condition.children','children_activity'),fact('weather','offer.weather_suitability',requirement)]);
  const r=search(q,[binding(1,venue('INDOOR',[prop('condition.weather_protection',true),prop('offer.shade',true)]))]);
  assert.equal(r.ranked.length,0,requirement);
 }
 const q=request([fact('play','condition.children','children_activity'),fact('cool','offer.temperature','klimatisiert')]);
 assert.equal(search(q,[binding(1,venue('INDOOR',[prop('offer.temperature','klimatisiert')]))]).ranked.length,1);
 assert.equal(search(q,[binding(1,venue())]).ranked.length,0);
});
