// Frozen semantic expectations, not an automatic judge of natural language.
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
export const selectionPolicy=Object.freeze({
 version:'backyrd.nuknuk-semantic-selection@3',selectionSplit:'VALIDATION',testCanSelect:false,
 requiredCaseCoverage:1,maximumCriticalErrors:0,maximumMaterialErrorFraction:0.05,minimumGroupSuccessFraction:0.75,
 unresolvedSemanticReviewsAllowed:0,
 criticalClasses:['UNSAFE_ACCESS_ASSUMPTION','HARD_CONSTRAINT_INVERTED','FABRICATED_CONFIRMED_EVIDENCE'],
 materialClasses:['LOST_DUTY','INVENTED_DUTY','LOST_PREFERENCE','INVENTED_CONTEXT','WRONG_PERSONAL_HISTORY','WRONG_PERSON_OR_AREA','LOST_LOGIC_OR_SEQUENCE','CALENDAR_OR_CURRENCY_ERROR','UNJUSTIFIED_CLARIFICATION','FAILED_GENERATION'],
 tieBreak:['FEWER_CRITICAL','FEWER_MATERIAL','HIGHER_WORST_GROUP_SUCCESS','FEWER_REVIEW_CORRECTIONS','EARLIER_FROZEN_CHECKPOINT'],
 independentReviewRequired:true,lossCannotSelect:true,productionApproval:false,
});
export function buildSemanticRubric(dataset,controls){
 if(!controls||!Array.isArray(controls.cases)||!controls.cases.length)throw Error('selection_controls_required');
 if(controls.datasetHash!==contentHash(dataset))throw Error('selection_controls_dataset_mismatch');
 const cases=dataset.cases.map(r=>{
  const t=r.content.target;
  return{id:r.id,split:r.split,scenarioGroup:r.scenarioGroup,query:r.content.query,contentHash:r.contentHash,
   task:r.content.task,
   ...(r.content.task==='INTERPRET_REQUEST'?{
    mustPreserve:t.meaning.facts.filter(f=>['REQUIRED','EXCLUDED'].includes(f.modality)),
    softAndContext:t.meaning.facts.filter(f=>!['REQUIRED','EXCLUDED'].includes(f.modality)),
    entities:t.meaning.entities,logic:t.meaning.logic,bindings:t.meaning.bindings,extensions:t.meaning.extensions,weather:t.meaning.weatherConditions,
    uncertainties:t.meaning.uncertainties,goal:t.moment.goal.statement,hypotheses:t.moment.hypotheses,missing:t.moment.missing,clarification:t.moment.clarification,
    forbiddenAdditions:['Unstated activity, venue type, meal, diet, visit time, date, price or currency','Unproven adult accompaniment or invented participant age','Extra room/offer binding or removal of an explicit order','Converting own consumption exclusions to a ban on all venue offers','Personal familiarity/novelty inferred from public venue age or popularity','Medical/access assumptions from low energy or fatigue','Forced direction question when the user explicitly delegates choice or asks for both alternatives','Extending a child-only activity or adult-only quiet-area wish to every participant'],
   }:r.content.task==='PLAN_SEARCH'?{
    originalMeaningHash:contentHash(r.content.context.understanding.meaning),directions:t.directions,clarification:t.clarification,
    forbiddenAdditions:['Treating a proposed search direction as an explicit user duty','Changing original facts, exclusions, people, scope, bindings or logic','Pretending evidenceQuestions were executed research','Competing hypothetical core selection despite an explicit required core','Duplicate searches presented as different researched meanings'],
   }:r.content.task==='PROPOSE_EXPERIENCE'?{
    proposal:t,
    forbiddenAdditions:['Candidate or property absent from the public evidence','Presenting a hypothetical activity selection as a user requirement','Asserting venue history or personal meaning from generic atmosphere','Recommending a hard-ineligible candidate','Treating a tool failure as no available experiences','Guaranteed availability, recipient delight, history or personal taste','Unnecessary clarification instead of a useful grounded suggestion'],
   }:{assessments:t.assessments,missingKnowledge:t.missingKnowledge,
    forbiddenAdditions:['Claims absent from this candidate evidence and limitations','Personal taste or availability guarantees','Different fit based solely on candidate name/order','Using hard-rejected candidates or changing eligibility/ranking','Personal visit history derived from public Spot evidence','Low effort, fatigue suitability or recipient delight guaranteed from a single amenity']}),
   equivalentsAllowed:['Arbitrary entity/fact ID renaming with preserved references','Canonical Spot vocabulary synonyms only when equally specific','Different goal/judgment prose conveying the same claims and uncertainty','Logically equivalent AND/OR trees; no changed scope or polarity'],
   scoringNote:'Compare actual meaning, then actual matching on relevant fixtures. Text/JSON equality alone cannot certify or reject equivalence. Parser EXECUTABLE is not proof of matchability.'};
 });
 const chains=dataset.cases.filter(r=>r.content.task==='PROPOSE_EXPERIENCE').map(r=>({id:r.id.replace(/-propose_experience$/,''),task:'END_TO_END',split:r.split,scenarioGroup:r.scenarioGroup,
  contentHash:contentHash(dataset.cases.filter(c=>c.scenarioGroup===r.scenarioGroup)),
  scoringNote:'Review the actual sequential model rollout: interpreted meaning -> proposed search -> actual canonical HTTP evidence -> actual proposal. No downstream gold injection; failures at any phase remain failures of this situation. Multiple grounded suggestions and equivalent questions are allowed.'}));
 return{version:'backyrd.nuknuk-semantic-rubric@4',datasetHash:contentHash(dataset),selectionPolicy,cases,chains,
 derivedControls:{datasetHash:controls.datasetHash,hash:contentHash(controls),independentSamples:false,selectionPolicy:controls.selectionPolicy,cases:controls.cases.map(c=>({id:c.id,task:c.task,split:c.split,scenarioGroup:c.scenarioGroup,baseCaseId:c.baseCaseId,variant:c.variant,contentHash:contentHash({task:c.task,messages:c.messages,expected:c.expected}),expected:c.expected,scoringNote:'Review semantics and pairing with the base output; identities/order/codes are nuisance variables, evidence changes must change the appropriate candidate assessment.'}))},
 reviewReceipt:{required:['id','contentHash','rawOutputHash','reviewer','verdict','errorClasses','rationale'],verdicts:['PASS','MATERIAL_ERROR','CRITICAL_ERROR','FAILED_GENERATION','NEEDS_REVIEW']},
 evaluationLayers:['INTERPRETATION','SEARCH_PLANNING','MATCHING_WHEN_SUPPORTED','ADVISORY_ASSESSMENT','GROUNDED_PROPOSAL','SEQUENTIAL_MODEL_ROLLOUT'],
 failedGenerationsStayInDenominator:true,requiresActualOutputReview:true};
}
/** Called only after semantic review of a full DEV run. No TEST-based selection. */
export function assessReviewedDevelopment(rubric,receipts,controlReceipts=[],chainReceipts=[]){
 if(!['backyrd.nuknuk-semantic-rubric@3','backyrd.nuknuk-semantic-rubric@4'].includes(rubric.version)||rubric.derivedControls?.datasetHash!==rubric.datasetHash||!rubric.derivedControls?.cases?.length)throw Error('selection_controls_required');
 const base=assessCases(rubric.cases,receipts),derived=assessCases(rubric.derivedControls.cases,controlReceipts);
 const chains=rubric.version==='backyrd.nuknuk-semantic-rubric@4'&&rubric.chains?.length?assessCases(rubric.chains,chainReceipts):null;
 if(rubric.cases.some(c=>c.task==='PROPOSE_EXPERIENCE')&&!chains)throw Error('selection_actual_chains_required');
 return{...base,eligibleForFrozenSelection:base.eligibleForFrozenSelection&&derived.eligibleForFrozenSelection&&(!chains||chains.eligibleForFrozenSelection),derivedControls:derived,actualChains:chains};
}
function assessCases(cases,receipts){
 const dev=cases.filter(c=>c.split==='VALIDATION'),index=new Map();
 for(const r of receipts){const c=dev.find(c=>c.id===r.id);if(!c)throw Error('selection_non_development_case');
  const criticalClasses=selectionPolicy.criticalClasses,materialClasses=selectionPolicy.materialClasses;
  if(!Array.isArray(r.errorClasses)||new Set(r.errorClasses).size!==r.errorClasses.length||r.errorClasses.some(k=>![...criticalClasses,...materialClasses].includes(k)))throw Error('selection_error_classes_invalid');
  if(r.verdict==='PASS'&&r.errorClasses.length||r.verdict==='CRITICAL_ERROR'&&!r.errorClasses.some(k=>criticalClasses.includes(k))||r.verdict!=='CRITICAL_ERROR'&&r.errorClasses.some(k=>criticalClasses.includes(k))||r.verdict==='MATERIAL_ERROR'&&!r.errorClasses.some(k=>materialClasses.includes(k))||r.verdict==='FAILED_GENERATION'&&!r.errorClasses.includes('FAILED_GENERATION'))throw Error('selection_error_severity_mismatch');
  if(index.has(r.id)||r.contentHash!==c.contentHash||!r.reviewer||!r.rationale||!/^[a-f0-9]{64}$/.test(r.rawOutputHash)||!['PASS','MATERIAL_ERROR','CRITICAL_ERROR','FAILED_GENERATION','NEEDS_REVIEW'].includes(r.verdict))throw Error('selection_review_invalid');index.set(r.id,r);}
 const rows=dev.map(c=>({...c,receipt:index.get(c.id)}));
 const missing=rows.filter(c=>!c.receipt).length,critical=rows.filter(c=>c.receipt?.verdict==='CRITICAL_ERROR').length;
 const material=rows.filter(c=>['MATERIAL_ERROR','FAILED_GENERATION'].includes(c.receipt?.verdict)).length;
 const unresolved=rows.filter(c=>c.receipt?.verdict==='NEEDS_REVIEW').length;
 const groups=[...new Set(dev.map(c=>c.scenarioGroup))].map(group=>{const members=rows.filter(c=>c.scenarioGroup===group);return{group,total:members.length,passed:members.filter(c=>c.receipt?.verdict==='PASS').length,success:members.filter(c=>c.receipt?.verdict==='PASS').length/members.length};});
 const eligibleBase=missing===0&&critical===0&&unresolved===0&&material/dev.length<=selectionPolicy.maximumMaterialErrorFraction&&groups.every(g=>g.success>=selectionPolicy.minimumGroupSuccessFraction);
 const byTask=[...new Set(dev.map(c=>c.task))].map(task=>{const members=rows.filter(c=>c.task===task);return{task,total:members.length,scenarioGroups:new Set(members.map(c=>c.scenarioGroup)).size,passed:members.filter(c=>c.receipt?.verdict==='PASS').length,missing:members.filter(c=>!c.receipt).length,failedGenerations:members.filter(c=>c.receipt?.verdict==='FAILED_GENERATION').length};});
 return{eligibleForFrozenSelection:eligibleBase,eligibleBaseDevelopment:eligibleBase,
 total:dev.length,missing,critical,material,unresolved,groups,byTask,policyHash:contentHash(selectionPolicy),productionApproval:false};
}
