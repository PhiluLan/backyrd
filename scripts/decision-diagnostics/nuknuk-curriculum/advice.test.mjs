import test from 'node:test';
import assert from 'node:assert/strict';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {validateNuknukSearchPlan,buildNuknukExperienceProposalRequest,validateNuknukExperienceProposal} from '../../../packages/decision-vnext-core/dist/nuknuk-experience-advice.js';
import {adviceSpecs,adviceCases,adviceCatalog,executeAdviceChain} from './advice.mjs';
import {materialize,R,X,C,A,date} from './authoring.mjs';
import {evaluateAdviceRollouts} from './advice-evaluation.mjs';

const reference={now:'2026-11-12T09:00:00Z',timezone:'Europe/Zurich'};
const base={id:'advice-contract-probe',family:'contract-probe',split:'TRAIN',query:'Such du etwas in Basel, aber nur draussen.',goal:'Eine eigene Idee unter unverändertem Aussenwunsch anbieten.',
 facts:[R('location.destination','Basel',[]),R('offer.area','outdoor'),C('experience.purpose','Auswahl delegiert')]};
const interpretation=materialize(base).content.target;
const direction=(id,value)=>({id,label:value,purpose:'Eine ausdrücklich vorgeschlagene Richtung, keine Nutzerpflicht.',quotes:['Such du etwas'],preferences:[],activityIdea:{key:'experience.activity',value,subjectId:'a1'},evidenceQuestions:[]});
const plan={directions:[direction('walk','walk'),direction('golf','Minigolf')],clarification:null};
const catalog=adviceCatalog({...base,venues:[
 {key:'walk',name:'Lernort Park',category:'OUTDOOR_NATURE',kind:'WALK',areaKind:'OUTDOOR'},
 {key:'golf',name:'Lernort Minigolf',category:'SPORT',kind:'MINI_GOLF',areaKind:'OUTDOOR'},
 {key:'inside',name:'Lernort Halle',category:'SPORT',kind:'MINI_GOLF',areaKind:'INDOOR'},
]});
const noProposal={mode:'NO_MATCH',message:'Nur ein synthetischer Vertragscheck, keine Modellbewertung.',suggestions:[],question:null,limitations:[]};

test('hypothetical directions actually run distinct canonical searches and preserve original hard area',async()=>{
 const chain=await executeAdviceChain({...base,reference,catalog,interpret:async()=>interpretation,planSearch:async()=>plan,propose:async()=>noProposal});
 const branches=validateNuknukSearchPlan(plan,{...base,reference,understanding:interpretation}).branches;
 assert.notEqual(branches[0].branchRequestHash,branches[1].branchRequestHash);
 assert(branches.every(b=>b.selectionAuthority==='HYPOTHETICAL_SELECTION'&&b.originalFactsPreserved));
 assert.deepEqual(interpretation,materialize(base).content.target);
 assert.equal(chain.proofs.length,2);assert(chain.proofs.every(p=>p.httpStatus===200));
 const allowed=chain.proposalRequest.runs.map(r=>r.candidates.map(c=>c.name));
 assert.deepEqual(allowed,[['Lernort Park'],['Lernort Minigolf']]);
 assert(!allowed.flat().includes('Lernort Halle'));
 assert(chain.proposalRequest.runs.every(r=>r.selectionAuthority==='HYPOTHETICAL_SELECTION'));
});

test('a concrete original activity cannot be replaced and invalid plans fail instead of becoming capability gaps',()=>{
 const understood=materialize({...base,query:'Minigolf in Basel, nur draussen.',facts:[A('Minigolf'),R('location.destination','Basel',[]),R('offer.area','outdoor')]}).content.target;
 assert.throws(()=>validateNuknukSearchPlan(plan,{query:'Minigolf in Basel, nur draussen.',reference,understanding:understood}),/quote_not_in_query/);
 const adapted={...plan,directions:[{...direction('walk','walk'),quotes:['Minigolf']}]};
 assert.throws(()=>validateNuknukSearchPlan(adapted,{query:'Minigolf in Basel, nur draussen.',reference,understanding:understood}),/cannot_replace_explicit_core/);
 const twoActivities=materialize({...base,facts:[A('Minigolf'),C('experience.purpose','eine zweite offene Idee',['a2'])]}).content.target;
 const second={...plan,directions:[{...direction('walk','walk'),activityIdea:{key:'experience.activity',value:'walk',subjectId:'a2'}}]};
 assert.throws(()=>validateNuknukSearchPlan(second,{...base,reference,understanding:twoActivities}),/cannot_replace_explicit_core/);
 const bad={...plan,directions:[{...direction('walk','walk'),activityIdea:{key:'participation.accessibility',value:'step_free',subjectId:'a1'}}]};
 assert.throws(()=>validateNuknukSearchPlan(bad,{...base,reference,understanding:interpretation}));
});

test('public replies are bound to their exact branch and cannot authorize foreign evidence',async()=>{
 const chain=await executeAdviceChain({...base,reference,catalog,interpret:async()=>interpretation,planSearch:async()=>plan,propose:async()=>noProposal});
 const input={...base,reference,understanding:chain.understanding,plan:chain.plan,runs:chain.runs};
 const changed=structuredClone(input);changed.runs[0].response=changed.runs[1].response;
 assert.throws(()=>buildNuknukExperienceProposalRequest(changed),/execution_binding_invalid/);
 const stale=structuredClone(input);stale.runs[0].execution.branchRequestHash='0'.repeat(64);
 assert.throws(()=>buildNuknukExperienceProposalRequest(stale),/execution_binding_invalid/);
 const request=chain.proposalRequest,c=request.runs[0].candidates[0];
 const good={mode:'SUGGEST',message:'Eine Idee wäre ein Spaziergang.',suggestions:[{directionId:'walk',candidateId:c.candidateId,proposal:'Eine Idee wäre ein Spaziergang.',evidence:[c.evidence[0]],caveat:null}],question:null,limitations:[]};
 validateNuknukExperienceProposal(good,request);
 const fake=structuredClone(good);fake.suggestions[0].evidence[0].statement='Dieser Ort hat eine besondere Geschichte.';
 assert.throws(()=>validateNuknukExperienceProposal(fake,request),/evidence_not_authorized/);
 const rejected=structuredClone(good);rejected.suggestions[0].candidateId=catalog[2].decisionProjection.spotId;
 assert.throws(()=>validateNuknukExperienceProposal(rejected,request),/candidate_not_authorized/);
});

test('rollout forwards actual generated understanding and plan, never substitutes gold downstream',async()=>{
 const actualPlan={...plan,directions:[direction('golf','Minigolf')]},seen=[];
 const chain=await executeAdviceChain({...base,reference,catalog,
  interpret:async input=>{seen.push(['interpret',input.query]);return interpretation;},
  planSearch:async input=>{seen.push(['plan',contentHash(input.understanding)]);return actualPlan;},
  propose:async request=>{seen.push(['propose',request.runs.map(r=>r.directionId)]);return noProposal;}});
 assert.deepEqual(seen,[['interpret',base.query],['plan',contentHash(interpretation)],['propose',['golf']]]);
 assert.equal(chain.proofs.length,1);
 const failure={...noProposal,limitations:['Der Suchdienst ist technisch fehlgeschlagen.']};
 const failed=await executeAdviceChain({...base,reference,catalog,interpret:async()=>interpretation,planSearch:async()=>actualPlan,propose:async()=>failure,toolState:'TOOL_ERROR'});
 assert.equal(failed.runs[0].state,'TOOL_ERROR');assert.equal(failed.proofs[0].httpStatus,null);
 assert.throws(()=>validateNuknukExperienceProposal(noProposal,failed.proposalRequest),/failure_must_be_visible/);
});

test('calendar reference, runtime authority and dated offer validity describe the same situation',async()=>{
 const dated={...base,query:'Heute einen Spaziergang in Basel.',reference:{now:'2026-11-13T09:00:00Z',timezone:'Europe/Zurich'},facts:[A('walk'),date('2026-11-13'),R('location.destination','Basel',[])]};
 const understanding=materialize(dated).content.target;
 const worlds=adviceCatalog({...dated,venues:[{key:'friday',name:'Lernort Freitag',category:'OUTDOOR_NATURE',kind:'WALK',areaKind:'OUTDOOR',
  offers:[{key:'walk',kind:'WALK',areaKey:'visit',properties:[],price:0,schedule:[{weekday:5,start:'09:00',end:'17:00'}],validFrom:'2026-11-13',validUntil:'2026-11-13'}]}]});
 const one={directions:[{id:'walk',label:'Spaziergang',purpose:'Den ausdrücklichen Wunsch suchen.',quotes:['Heute einen Spaziergang'],preferences:[],activityIdea:null,evidenceQuestions:[]}],clarification:null};
 const chain=await executeAdviceChain({...dated,catalog:worlds,interpret:async()=>understanding,planSearch:async()=>one,propose:async()=>noProposal});
 assert.equal(chain.proofs[0].runtimeAuthority.now,dated.reference.now);
 assert.equal(worlds[0].resolvedAt,dated.reference.now);
 assert.deepEqual(chain.proposalRequest.runs[0].candidates.map(c=>c.name),['Lernort Freitag']);
 const expired={...dated,query:'Heute einen Spaziergang in Basel.',reference:{now:'2026-11-14T09:00:00Z',timezone:'Europe/Zurich'},facts:[A('walk'),date('2026-11-14'),R('location.destination','Basel',[])]};
 const next=await executeAdviceChain({...expired,catalog:worlds,interpret:async()=>materialize(expired).content.target,planSearch:async()=>one,propose:async()=>noProposal});
 assert.equal(next.proofs[0].runtimeAuthority.now,expired.reference.now);assert.equal(next.proposalRequest.runs[0].candidates.length,0);
});

test('120 authored situations remain the unit; three task rows are not 360 independent situations',async()=>{
 assert.equal(adviceSpecs.length,120);assert.equal(new Set(adviceSpecs.map(s=>s.id)).size,120);
 const result=await adviceCases();assert.equal(result.flatMap(r=>r.rows).length,360);
 for(const [split,n]of [['TRAIN',84],['VALIDATION',18],['TEST',18]])assert.equal(result.filter(r=>r.spec.split===split).length,n);
 const familySplits=new Map();
 for(const {spec,rows,note}of result){
  assert(spec.wrong.text&&spec.wrong.why&&spec.why);assert.equal(rows.length,3);assert(!note.modelRun);
  const prior=familySplits.get(spec.family);if(prior)assert.equal(prior,spec.split);familySplits.set(spec.family,spec.split);
  assert(rows.every(r=>r.split===spec.split&&r.scenarioGroup==='advice-'+spec.family&&r.content.provenance.kind==='SYNTHETIC'));
 }
});

test('target-free rollout records generation failures and does not report schema completion as semantic success',async()=>{
 const input={...base,reference,catalog,split:'VALIDATION'};
 const result=await evaluateAdviceRollouts({datasetHash:contentHash('synthetic-test-only'),modelIdentity:{adapterHash:contentHash('test-adapter-only')},inputs:[input],maximumModelCalls:3,modelCall:async({task})=>({modelIdentity:{adapterHash:contentHash('test-adapter-only')},raw:task==='INTERPRET_REQUEST'?interpretation:task==='PLAN_SEARCH'?plan:noProposal})});
 assert.equal(result.calls,3);assert.equal(result.semanticSuccess,null);assert.equal(result.results[0].status,'COMPLETED_REQUIRES_SEMANTIC_REVIEW');
 const failed=await evaluateAdviceRollouts({datasetHash:contentHash('synthetic-test-only'),modelIdentity:{adapterHash:contentHash('test-adapter-only')},inputs:[input],maximumModelCalls:3,modelCall:async()=>({modelIdentity:{adapterHash:contentHash('test-adapter-only')},raw:{invalid:true}})});
 assert.equal(failed.calls,1);assert.equal(failed.failed,1);assert.equal(failed.results.length,1);
 await assert.rejects(()=>evaluateAdviceRollouts({datasetHash:contentHash('synthetic-test-only'),modelIdentity:{adapterHash:contentHash('test-adapter-only')},inputs:[input],maximumModelCalls:2,modelCall:async()=>noProposal}),/reserve_insufficient/);
 await assert.rejects(()=>evaluateAdviceRollouts({datasetHash:contentHash('synthetic-test-only'),modelIdentity:{adapterHash:contentHash('test-adapter-only')},inputs:[{...input,split:'TRAIN'}],maximumModelCalls:3,modelCall:async()=>noProposal}),/holdout_only/);
 await assert.rejects(()=>evaluateAdviceRollouts({datasetHash:contentHash('synthetic-test-only'),modelIdentity:{adapterHash:contentHash('test-adapter-only')},inputs:[{...input,split:'TEST'}],maximumModelCalls:3,modelCall:async()=>noProposal}),/requires_frozen/);
});
