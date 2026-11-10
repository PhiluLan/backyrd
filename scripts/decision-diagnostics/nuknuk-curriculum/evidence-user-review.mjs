// Authored advisory contrasts from the Tobi/Astra review. No personal history
// is supplied: an objectively known property cannot prove subjective familiarity.
import assert from 'node:assert/strict';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {validateNuknukUnderstanding,NUKNUK_UNDERSTANDING_VERSION} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {buildNuknukAssessmentRequest,validateNuknukAssessment} from '../../../packages/decision-vnext-core/dist/nuknuk-grounded-assessment.js';
import {exercise} from '../../../packages/decision-vnext-core/test/librarian-active-route-fixtures.mjs';
import {profile,offer,area,prop,binding} from '../../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';
import {W,A,D,M,P,R,materialize} from './authoring.mjs';

// Null negative evidence means this property has no reliable negative witness
// in this fixture. Its absence must remain UNKNOWN, never be relabelled FAILED.
const preference=(key,value,label,sourceKey,positive,negative=null,scope='AREA')=>
 ({key,value,label,sourceKey,positive,negative,scope});
const scenarios=[
 {name:'tea-conversation-seating',split:'TRAIN',activity:'Nach der Arbeit Tee trinken',hard:D('Tee'),kind:'DRINKS',category:'RESTAURANT',
  preferences:[preference('atmosphere.conversation','conversation_possible','Gesprächsmöglichkeit','atmosphere.conversation','Unterhaltung gut möglich'),
   preference('offer.feature','Sitzgelegenheiten','Sitzgelegenheiten','offer.feature','Sitzgelegenheiten')],
  requests:['Gut reden können wäre mir wichtiger als zusätzliche Sitzgelegenheiten.','Zusätzliche Sitzgelegenheiten wären mir wichtiger als gut reden zu können.']},
 {name:'museum-quiet-parking',split:'TRAIN',activity:'Ein Museum besuchen',hard:R('offer.kind','MUSEUM'),kind:'SELF_GUIDED_VISIT',category:'MUSEUM',
  preferences:[preference('atmosphere.noise','quiet','ruhige Räume','atmosphere.noise','ruhig'),
   preference('offer.feature','parking','Parkplatz','amenity.parking',true,false,'SPOT')],
  requests:['Ruhige Räume wären mir wichtiger als ein Parkplatz.','Ein Parkplatz wäre mir wichtiger als ruhige Räume.']},
 {name:'lunch-diet-terrace',split:'TRAIN',activity:'Mittagessen gehen',hard:M('lunch'),kind:'LUNCH',category:'RESTAURANT',
  preferences:[preference('food.diet','vegetarian','vegetarische Option','food.diet','vegetarisch',null,'OFFER'),
   preference('offer.area','terrace','Terrasse','location.setting','terrace')],
  requests:['Eine vegetarische Option wäre mir wichtiger als eine Terrasse.','Eine Terrasse wäre mir wichtiger als eine vegetarische Option.']},
 {name:'coffee-personal-novelty',split:'TRAIN',activity:'Kaffee trinken',hard:D('coffee'),kind:'DRINKS',category:'RESTAURANT',history:true,
  preferences:[preference('experience.character','für mich persönlich neu','persönliche Neuheit',null,null),
   preference('atmosphere.character','cozy','Gemütlichkeit','atmosphere.character','gemütlich')],
  requests:['Ein für mich neuer Ort wäre mir wichtiger als Gemütlichkeit.','Gemütlichkeit wäre mir wichtiger als ein für mich neuer Ort.']},
 {name:'dev-minigolf-cover-music',split:'VALIDATION',activity:'Minigolf spielen',hard:A('Minigolf'),kind:'MINI_GOLF',category:'SPORT',
  preferences:[preference('offer.weather_suitability','rain_suitable','Regenschutz','condition.weather_protection',true,false),
   preference('atmosphere.music','music','Musik','atmosphere.music','Hintergrundmusik','keine Musik')],
  requests:['Regenschutz wäre mir wichtiger als Musik.','Musik wäre mir wichtiger als Regenschutz.']},
 {name:'test-bath-personal-familiarity',split:'TEST',activity:'Baden gehen',hard:A('bathing'),kind:'BATHING',category:'WELLNESS_RELAXATION',history:true,
  preferences:[preference('experience.character','mir persönlich vertraut','persönliche Vertrautheit',null,null),
   preference('offer.temperature','warmes Wasser','warmes Wasser','offer.temperature','warmes Wasser')],
  requests:['Ein mir vertrauter Ort wäre mir wichtiger als warmes Wasser.','Warmes Wasser wäre mir wichtiger als ein mir vertrauter Ort.']},
];
const modes=['PRIORITY','PRIORITY_REVERSED','MISSING_OR_NEGATIVE','KNOWN_TIE'];
const reference={now:'2026-10-14T08:00:00Z',timezone:'Europe/Zurich'};
const stateOf=value=>value===true?'MET':value===false?'FAILED':'UNKNOWN';
function statesFor(scenario,mode){
 if(scenario.history)return mode==='MISSING_OR_NEGATIVE'?[[null,null],[null,null]]
  :mode==='KNOWN_TIE'?[[null,true],[null,true]]:[[null,true],[null,null]];
 if(mode==='KNOWN_TIE')return[[true,true],[true,true]];
 const negative=scenario.preferences.map(p=>p.negative===null?null:false);
 if(mode==='MISSING_OR_NEGATIVE')return[negative,[null,null]];
 return[[true,negative[1]],[negative[0],true]];
}
function candidateProfile(scenario,states){
 const areaProperties=[],offerProperties=[],spotProperties=[];
 if(scenario.hard.key==='food.drink')offerProperties.push(prop('food.drink',scenario.hard.value.text));
 scenario.preferences.forEach((p,i)=>{
  if(states[i]===null)return;
  assert(p.sourceKey,'personal_history_must_not_be_authored_as_spot_property');
  const value=states[i]?p.positive:p.negative;
  assert.notEqual(value,null);
  (p.scope==='OFFER'?offerProperties:p.scope==='SPOT'?spotProperties:areaProperties).push(prop(p.sourceKey,value));
 });
 // An OTHER area does not itself assert a terrace, an indoor room or warmth.
 const visitArea={...area('visit',areaProperties),kind:'OTHER'};
 return {...profile([offer('visit',scenario.kind,['visit'],offerProperties)],[visitArea],scenario.category),properties:spotProperties};
}

export async function userReviewEvidenceCases(){
 const results=[];
 for(const scenario of scenarios)for(const mode of modes){
  const id=`solid-evidence-user-${scenario.name}-${mode.toLowerCase().replaceAll('_','-')}`;
  const scenarioGroup=`solid-evidence-user-${scenario.name}`;
  const important=mode==='PRIORITY_REVERSED'?1:0;
  const query=`${scenario.activity}. ${scenario.requests[important]}`;
  const interpreted=materialize({...W(query,'Das genannte Hauptangebot und die ausdrückliche Priorität anhand sichtbarer Belege abwägen.',
   [scenario.hard,...scenario.preferences.map(p=>P(p.key,p.value))]),id,scenarioGroup,split:scenario.split,reference});
  const understood=validateNuknukUnderstanding(interpreted.content.target,interpreted.content);
  const expectedById=new Map();
  const catalog=statesFor(scenario,mode).map((states,i)=>{
   const index=100000000+parseInt(contentHash({scenario:scenario.name,mode}).slice(0,6),16)*2+i;
   const p=candidateProfile(scenario,states),b=binding(index,p);
   b.decisionProjection.facts.find(f=>f.key==='identity.name').value=['Lernort Buche','Lernort Birke'][(i+parseInt(contentHash(id).slice(0,2),16))%2];
   if(scenario.category==='SPORT')b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['SPORTS_CENTRE'];
   if(scenario.category==='WELLNESS_RELAXATION')b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['SPA'];
   expectedById.set(b.decisionProjection.spotId,states.map(stateOf));
   return b;
  });
  if(parseInt(contentHash(id).slice(-2),16)%2)catalog.reverse();
  let captured;
  const http=await exercise({text:query,meaning:understood.plan,understandOverride:async()=>understood.plan,catalog,onSearch:s=>captured=s});
  assert.equal(http.status,200,`${id}: ${JSON.stringify(http.body)}`);assert.equal(captured.ranked.length,2,id);
  const request=buildNuknukAssessmentRequest({response:http.body,moment:understood.moment});
  assert.equal(request.candidates.length,2,id);
  const proofs=[];
  const assessments=request.candidates.map(candidate=>{
   const match=captured.ranked.find(r=>r.spotId===candidate.candidateId);
   const actual=['f2','f3'].map(factId=>match.facts.find(f=>f.factId===factId)?.state);
   const expected=expectedById.get(candidate.candidateId);
   assert.deepEqual(actual,expected,id);
   // A target cannot claim a fact merely because it existed in a hidden fixture.
   // Check the model-visible proof for each preference, including unknowns.
   const responseCandidate=http.body.candidates.find(c=>c.spotId===candidate.candidateId);
   scenario.preferences.forEach((_,i)=>{
    const fact=match.facts.find(f=>f.factId===`f${i+2}`);
    const projected=responseCandidate.reasons.find(r=>r.sourceHash===contentHash({candidateHash:match.candidateHash,fact}));
    if(actual[i]==='MET')assert(projected?.confirmed&&candidate.evidence.some(e=>e.reasonCode===projected.code),id);
    if(actual[i]==='FAILED')assert(projected&&!projected.confirmed&&candidate.limitations.includes(projected.statement),id);
    if(actual[i]==='UNKNOWN'&&projected)assert(!projected.confirmed&&candidate.limitations.includes(projected.statement),id);
   });
   if(actual.includes('FAILED'))assert(candidate.limitations.some(l=>l.startsWith('Nicht passend:')),id);
   if(actual.includes('UNKNOWN'))assert(candidate.limitations.length>0,id);
   if(scenario.history)assert.equal(actual[0],'UNKNOWN',id);
   const fit=actual.every(state=>state==='FAILED')?'WEAK':actual[important]==='MET'?'STRONG':'POSSIBLE';
   const description=actual.map((state,i)=>`${scenario.preferences[i].label}: ${state==='MET'?'belegt':state==='FAILED'?'laut Belegen nicht passend':'nicht belegt'}`).join('; ');
   const historyNote=scenario.history?' Die Belege enthalten keine persönliche Besuchs- oder Bekanntheitshistorie. Objektive Eigenschaften beweisen weder persönliche Neuheit noch persönliche Vertrautheit.':'';
   proofs.push({candidateId:candidate.candidateId,preferenceStates:actual,expectedFit:fit,visibleEvidence:candidate.evidence,visibleLimitations:candidate.limitations,personalHistorySupplied:false});
   return{candidateId:candidate.candidateId,fit,
    judgment:`Das Hauptangebot ist belegt. ${description}. Ausdrücklich wichtiger ist: ${scenario.preferences[important].label}.${historyNote}`,
    reasonCodes:candidate.evidence.map(e=>e.reasonCode).slice(0,8),
    uncertainty:scenario.history?'Persönliche Neuheit oder Vertrautheit und freie Plätze sind nicht bestätigt.':'Nicht belegte Wünsche bleiben offen; freie Plätze und persönliche Begeisterung sind nicht bestätigt.'};
  });
  const target={assessments,missingKnowledge:scenario.history?['Persönliche Besuchs- oder Bekanntheitshistorie fehlt.','Freie Plätze sind nicht geprüft.']:['Freie Plätze und persönliche Begeisterung sind nicht geprüft.']};
  validateNuknukAssessment(target,request);
  const content={version:NUKNUK_UNDERSTANDING_VERSION,task:'ASSESS_CANDIDATES',query,reference,target,
   context:{response:http.body,moment:understood.moment},provenance:{kind:'SYNTHETIC',reference:id},trainingPermission:'PENDING'};
  results.push({row:{id,scenarioGroup,split:scenario.split,content,contentHash:contentHash(content),reviews:[]},
   note:{id,query,mode,catalogHash:contentHash(catalog),httpStatus:http.status,proofs,hardEligibilityUnchanged:true,personalHistorySupplied:false},
   metadata:{domain:'grounded-evidence',phenomena:['priority','unknown-vs-false','evidence-scope','order-permutation',...(scenario.history?['personal-history-unknown']:[])],scenarioGroup,split:scenario.split}});
 }
 assert.equal(results.length,24);
 assert.deepEqual([...new Set(results.flatMap(r=>r.row.content.target.assessments.map(a=>a.fit)))].sort(),['POSSIBLE','STRONG','WEAK']);
 return results;
}
