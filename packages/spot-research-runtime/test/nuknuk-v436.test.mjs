import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hasExplicitKitchenContext,hasPublishedKitchenSchedule,parseHoursRow} from '../src/nuknuk-research.mjs';
import {applyResearchHoursPolicy,researchSpotV2} from '../dist/nuknuk-agent.js';
import {researchValueContract} from '../../world-knowledge-core/dist/research-value-schema.js';
import {validateAuthoringSubmission} from '../../world-knowledge-core/dist/index.js';
const field=attributeKey=>({attributeKey,...researchValueContract(attributeKey),profileCategory:'EAT'});
const spot={spotId:'11111111-1111-4111-8111-111111111111',name:'Example Restaurant',locality:'Bern',existingValues:{'contact.website':{value:'https://example.org/'},'classification.primary_category':{value:'EAT'}}};
const source=text=>({id:'s1',url:'https://example.org/',text,hash:createHash('sha256').update(text).digest('hex'),observedAt:'2026-10-25T19:00:00Z'});
for(const label of ['Küchen Öffnungszeit 11.30 – 17.00 & 18.00 – 21.30 Uhr','Küchenöffnungszeiten 11–21','Kuechen Oeffnungszeit 11–21','Küche\nMontag 11–21','Kitchen hours 11–21'])test('published kitchen label prevents an invented venue-hours fallback: '+label,()=>{
 assert.equal(hasPublishedKitchenSchedule(label),true);assert.equal(hasExplicitKitchenContext(label),true);
 const s=source('Öffnungszeiten\nMontag bis Freitag 11–23\n'+label);const hours=parseHoursRow('Montag bis Freitag 11–23');
 const regular={attributeKey:'hours.regular',status:'REQUIRES_REVIEW',value:hours,partialHours:true,citations:[{url:s.url,evidence:'Montag bis Freitag 11–23',observedAt:s.observedAt,sourceHash:s.hash}]};
 const kitchen={attributeKey:'hours.kitchen',status:'UNRESOLVED',reason:'NO_SUPPORTED_SCOPED_FACT'};
 applyResearchHoursPolicy([regular,kitchen],[s],spot,[field('hours.regular'),field('hours.kitchen')],validateAuthoringSubmission);
 assert.equal(kitchen.status,'UNRESOLVED');assert.equal(kitchen.value,undefined);assert.equal(kitchen.derivation,undefined);
});
test('ordinary cuisine prose is not a published kitchen schedule',()=>{
 assert.equal(hasPublishedKitchenSchedule('Unsere Küche ist frisch und saisonal.'),false);
 assert.equal(hasExplicitKitchenContext('Unsere Küche ist Montag 11–14 geöffnet.'),true);
});
test('duplicate flat output triggers one missing-field repair; typed categories and distinct kitchen intervals survive to projection',async()=>{
 const fields=['identity.name','classification.primary_category','classification.place_types','hours.kitchen','experience.profile'].map(field),events=[],calls=[];
 const body='<main><h1>Example Restaurant</h1><h2>Öffnungszeiten</h2><p>Montag 11:00–23:00</p><p>Küchen Öffnungszeit 11:00–14:00 &amp; 18:00–21:00</p></main>';
 let extractions=0;
 const report=await researchSpotV2({spot:{...spot,existingValues:{'contact.website':spot.existingValues['contact.website']}},fields,sources:['https://example.org/'],modelPath:'/tmp/45797d2985a12c55e6473686e9ea91b95e959553',restaurantWorkingContext:true,maxRequests:1,maxModelCalls:8},{validateValue:validateAuthoringSubmission,fetchPage:async url=>({url,contentType:'text/html',body,observedAt:'2026-10-25T19:00:00Z'}),onProgress:e=>events.push(e),modelFetch:async(_url,init)=>{
  const d=JSON.parse(JSON.parse(init.body).messages[1].content);calls.push(d);let out;
  if(d.fields){
   extractions++;const title=d.blocks.find(b=>b.text==='Example Restaurant');
   if(extractions===1)out={facts:Array.from({length:16},()=>({field:'identity.name',value:'Example Restaurant',blockId:title.id,belongsTo:'TARGET',condition:''}))};
   else {assert.deepEqual(d.fields.map(f=>f.field).sort(),['classification.place_types','classification.primary_category','hours.kitchen']);const schedule=d.blocks.find(b=>b.text.startsWith('Öffnungszeiten')&&b.text.includes('Küchen Öffnungszeit')&&b.text.includes('Montag'));assert.ok(schedule);out={facts:[{field:'classification.primary_category',value:'EAT',blockId:title.id,belongsTo:'TARGET',condition:''},{field:'classification.place_types',value:['RESTAURANT'],blockId:title.id,belongsTo:'TARGET',condition:''},{field:'hours.kitchen',value:[{day:'MONDAY',intervals:[{start:'11:00',end:'14:00'},{start:'18:00',end:'21:00'}]}],blockId:schedule.id,belongsTo:'TARGET',condition:''}]};}
  }else out={verdicts:d.candidates.map(c=>({id:c.id,reasonCode:'DIRECT_SUPPORT',explanation:'The original restaurant source supports this exact typed field.'}))};
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(out)}}]}));
 }});
 assert.equal(extractions,2);assert.equal(events.filter(e=>e.stage==='FLAT_EXTRACTION_COVERAGE_REPAIR').length,1);assert.equal(events.find(e=>e.stage==='FLAT_EXTRACTION_COVERAGE_REPAIR').discardedDuplicates,15);
 assert.equal(report.scopedLedger.filter(c=>c.field==='identity.name').length,1);assert.equal(report.results.find(f=>f.attributeKey==='classification.primary_category').value,'EAT');
 assert.deepEqual(report.results.find(f=>f.attributeKey==='hours.kitchen').value[0].intervals,[{start:'11:00',end:'14:00'},{start:'18:00',end:'21:00'}]);assert.equal(report.canonicalWrite,false);
});
