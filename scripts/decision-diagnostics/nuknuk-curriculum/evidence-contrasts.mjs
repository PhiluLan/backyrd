// Advisory comparisons never admit a hard-ineligible candidate.
import assert from 'node:assert/strict';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {validateNuknukUnderstanding,NUKNUK_UNDERSTANDING_VERSION} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {buildNuknukAssessmentRequest,validateNuknukAssessment} from '../../../packages/decision-vnext-core/dist/nuknuk-grounded-assessment.js';
import {exercise} from '../../../packages/decision-vnext-core/test/librarian-active-route-fixtures.mjs';
import {profile,offer,area,prop} from '../../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';
import {bindAssessmentCandidate,identityKeys} from './assessment-identity.mjs';
import {W,A,D,M,P,materialize} from './authoring.mjs';
const scenarios=[
 ['coffee','TRAIN','Kaffee trinken',D('coffee'),'DRINKS','RESTAURANT'],
 ['lunch','TRAIN','Mittagessen',M('lunch'),'LUNCH','RESTAURANT'],
 ['minigolf','TRAIN','Minigolf spielen',A('Minigolf'),'MINI_GOLF','SPORT'],
 ['playground','TRAIN','Einen Spielplatz besuchen',A('playground'),'MOVEMENT_PLAY','OUTDOOR_NATURE'],
 ['walk','VALIDATION','Spazieren gehen',A('walk'),'WALK','OUTDOOR_NATURE'],
 ['snacks','VALIDATION','Snacks essen',M('snacks'),'GASTRONOMY','RESTAURANT'],
 ['animals','TEST','Tiere beobachten',A('animals'),'ANIMAL_OBSERVATION','ZOO'],
 ['breakfast','TEST','Frühstücken',M('breakfast'),'BREAKFAST','RESTAURANT'],
];
export async function contrastEvidenceCases(){
 const output=[];
 for(const [name,split,activity,hard,kind,category] of scenarios)for(const mode of ['PRIORITY','DENIED_UNKNOWN','DISTRACTOR','PRIORITY_REVERSED']){
  const id=`solid-evidence-contrast-${name}-${mode.toLowerCase().replaceAll('_','-')}`,scenarioGroup=`solid-evidence-contrast-${name}`;
  const reverse=mode==='PRIORITY_REVERSED';
  const query=activity+(reverse?', ein WC wäre mir wichtiger als Schatten.':', Schatten wäre mir wichtiger als ein WC.');
  const row=materialize({...W(query,'Hauptangebot und belegte Zusatzwünsche mit ausdrücklich genannter Priorität abwägen.',[hard,P('offer.shade','shade'),P('offer.feature','WC')]),id,scenarioGroup,split,reference:{now:'2026-10-14T08:00:00Z',timezone:'Europe/Zurich'}});
  const understood=validateNuknukUnderstanding(row.content.target,row.content);
  const states=mode==='DENIED_UNKNOWN'?[[false,false],[null,null]]:mode==='DISTRACTOR'?[[false,false],[true,true]]:[[true,false],[false,true]];
  const identities=identityKeys(scenarioGroup,mode);
  const catalog=states.map(([shade,toilet],i)=>{
   const selectedProps=[...(shade===null?[]:[prop('offer.shade',shade)]),...(toilet===null?[]:[prop('amenity.toilet',toilet)]),...(name==='playground'?[prop('amenity.playground',true)]:[])];
   const a={...area('visit',selectedProps),kind:category==='RESTAURANT'?'TERRACE':'OUTDOOR'};
   const props=[...(hard.key==='food.drink'?[prop('food.drink',hard.value.text)]:[]),...(name==='snacks'?[prop('food.meal_extent','Snacks')]:[])];
   const p=profile([offer('visit',kind,['visit'],props)],mode==='DISTRACTOR'&&i===0?[a,{...area('unused',[prop('offer.shade',true),prop('amenity.toilet',true)]),kind:category==='RESTAURANT'?'TERRACE':'OUTDOOR'}]:[a],category);
   const b=bindAssessmentCandidate(scenarioGroup,identities[i],p);b.decisionProjection.facts.find(f=>f.key==='identity.name').value=['Lernort Linden','Lernort Ahorn'][(i+(parseInt(contentHash(id).slice(0,2),16)%2))%2];
   if(category==='SPORT')b.decisionProjection.facts.find(f=>f.key==='classification.place_types').value=['SPORTS_CENTRE'];
   return b;
  });
  if(parseInt(contentHash(id).slice(-2),16)%2)catalog.reverse();
  let captured;const http=await exercise({text:query,meaning:understood.plan,understandOverride:async()=>understood.plan,catalog,onSearch:s=>captured=s});
  assert.equal(http.status,200,id);assert.equal(captured.ranked.length,2,id);
  const request=buildNuknukAssessmentRequest({response:http.body,moment:understood.moment});assert.equal(request.candidates.length,2,id);
  const proofs=[];
  const assessments=request.candidates.map(c=>{
   const original=catalog.find(b=>b.decisionProjection.spotId===c.candidateId);const p=original.decisionProjection.facts.find(f=>f.key==='experience.profile').value;
   const props=p.areas.find(a=>a.id==='visit').properties;const val=k=>props.find(p=>p.key===k)?.value??null;
   const expected=mode==='DISTRACTOR'&&val('offer.shade')===false?['UNKNOWN','UNKNOWN']:[val('offer.shade'),val('amenity.toilet')].map(v=>v===null?'UNKNOWN':v?'MET':'FAILED');
   const match=captured.ranked.find(r=>r.spotId===c.candidateId);const actual=['f2','f3'].map(id=>match.facts.find(f=>f.factId===id)?.state);assert.deepEqual(actual,expected,id);
   // Labels depend only on evidence/limitations visible to the model.
   if(expected.includes('FAILED'))assert(c.limitations.some(l=>l.startsWith('Nicht passend:')),id);
   if(expected.includes('UNKNOWN'))assert(c.limitations.length>0,id);
   const important=reverse?1:0;const fit=expected.every(s=>s==='FAILED')?'WEAK':expected[important]==='MET'?'STRONG':'POSSIBLE';
   const desc=expected.map((s,i)=>`${i===0?'Schatten':'WC'}: ${s==='MET'?'bestätigt':s==='FAILED'?'laut Belegen nicht passend':'unbekannt'}`).join('; ');
   proofs.push({spotId:c.candidateId,preferenceStates:actual,expectedFit:fit,visibleLimitations:c.limitations});
   return{candidateId:c.candidateId,fit,judgment:`Das Grundangebot ist belegt. ${desc}. ${reverse?'WC':'Schatten'} ist ausdrücklich wichtiger; die Beurteilung folgt dieser Priorität, nicht Name oder Reihenfolge.`,reasonCodes:c.evidence.map(e=>e.reasonCode).slice(0,8),uncertainty:'Persönliche Begeisterung und tatsächlich freie Plätze sind nicht bestätigt.'};
  });
  const target={assessments,missingKnowledge:['Freie Plätze und persönliche Begeisterung sind nicht geprüft.']};validateNuknukAssessment(target,request);
  const content={version:NUKNUK_UNDERSTANDING_VERSION,task:'ASSESS_CANDIDATES',query,reference:row.content.reference,target,context:{response:http.body,moment:understood.moment},provenance:{kind:'SYNTHETIC',reference:id},trainingPermission:'PENDING'};
  output.push({row:{id,scenarioGroup,split,content,contentHash:contentHash(content),reviews:[]},note:{id,query,mode,catalogHash:contentHash(catalog),httpStatus:http.status,proofs,hardEligibilityUnchanged:true},metadata:{domain:'grounded-evidence',phenomena:['contradiction','priority','scope','unknown-vs-false','order-permutation'],scenarioGroup,split}});
 }
 return output;
}
