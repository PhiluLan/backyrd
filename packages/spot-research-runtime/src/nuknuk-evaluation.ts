// Evaluation binds an independent pre-run reference and an explicit audit to the
// exact report. Missing judgments cannot silently count as correct abstentions.
import {createHash} from 'node:crypto';
export interface AuditReport {version?:string;spotId:string;startedAt?:string;results:{attributeKey:string;status:string;value?:unknown}[]}
export interface AuditReference {spotId:string;preparedAt?:string;checks:unknown[]}
export interface FieldAssessment {
  attributeKey:string;
  outcome:'CORRECT'|'PARTIAL'|'OMISSION'|'INCORRECT'|'JUSTIFIED_ABSTENTION';
  falseAssertions:number;misattributions:number;missedFacts:number;
  note:string;
}
const digest=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function evaluateNuknukAudit(report:AuditReport,reference:AuditReference,assessments:FieldAssessment[]) {
  if(!report||report.spotId!==reference.spotId||!Array.isArray(reference.checks)||!reference.checks.length||!report.results.length||new Set(report.results.map(r=>r.attributeKey)).size!==report.results.length||assessments.length!==report.results.length||new Set(assessments.map(a=>a.attributeKey)).size!==assessments.length)throw new Error('evaluation_incomplete');
  for(const a of assessments) {
    if(!report.results.some(r=>r.attributeKey===a.attributeKey)||!['CORRECT','PARTIAL','OMISSION','INCORRECT','JUSTIFIED_ABSTENTION'].includes(a.outcome)||[a.falseAssertions,a.misattributions,a.missedFacts].some(n=>!Number.isInteger(n)||n<0)||typeof a.note!=='string'||!a.note.trim())throw new Error('evaluation_invalid');
    const proposed=['REQUIRES_REVIEW','AUTO_VERIFIED'].includes(report.results.find(r=>r.attributeKey===a.attributeKey)!.status);
    if((a.outcome==='JUSTIFIED_ABSTENTION'||a.outcome==='OMISSION')&&proposed)throw new Error('evaluation_status_mismatch');
    if(['CORRECT','PARTIAL','INCORRECT'].includes(a.outcome)&&!proposed)throw new Error('evaluation_status_mismatch');
    if(a.outcome==='CORRECT'&&(a.falseAssertions||a.misattributions||a.missedFacts)||a.outcome==='JUSTIFIED_ABSTENTION'&&(a.falseAssertions||a.misattributions||a.missedFacts)||a.outcome==='PARTIAL'&&(a.falseAssertions||a.misattributions||!a.missedFacts)||a.outcome==='OMISSION'&&!a.missedFacts||a.outcome==='INCORRECT'&&!a.falseAssertions&&!a.misattributions)throw new Error('evaluation_counts_mismatch');
  }
  const preparedAt=reference.preparedAt?Date.parse(reference.preparedAt):NaN,startedAt=report.startedAt?Date.parse(report.startedAt):NaN;
  const preRunReference=Number.isFinite(preparedAt)&&Number.isFinite(startedAt)&&preparedAt<startedAt;
  return {version:'nuknuk-audit@1',spotId:report.spotId,reportHash:digest(report),referenceHash:digest(reference),preRunReference,assessments,
    totals:{fields:assessments.length,correct:assessments.filter(a=>a.outcome==='CORRECT').length,partial:assessments.filter(a=>a.outcome==='PARTIAL').length,omitted:assessments.filter(a=>a.outcome==='OMISSION').length,incorrect:assessments.filter(a=>a.outcome==='INCORRECT').length,justifiedAbstentions:assessments.filter(a=>a.outcome==='JUSTIFIED_ABSTENTION').length,falseAssertions:assessments.reduce((n,a)=>n+a.falseAssertions,0),misattributions:assessments.reduce((n,a)=>n+a.misattributions,0),missedFacts:assessments.reduce((n,a)=>n+a.missedFacts,0)},
    limitations:['ASSESSOR_JUDGMENT_NOT_INDEPENDENT_CERTIFICATION','SMALL_SAMPLE_NOT_GENERAL_ACCURACY','COUNTS_APPLY_ONLY_TO_RECORDED_REFERENCE_CHECKS']};
}

export interface CohortCase {
  category:'FOOD_DRINK'|'STAY'|'CULTURE'|'ACTIVITY';
  report:AuditReport & {sourceFailures?:unknown[];stopReason?:string};
  audit:ReturnType<typeof evaluateNuknukAudit>;
  spotAudit?:ReturnType<typeof evaluateNuknukSpotAudit>;
}

// This is a release *gate*, not an estimate of population-wide accuracy. It
// intentionally fails closed for small, selective or incompletely audited runs.
export function evaluateNuknukCohort(cases:CohortCase[]) {
  if(!Array.isArray(cases)||!cases.length)throw new Error('cohort_empty');
  const categories=['FOOD_DRINK','STAY','CULTURE','ACTIVITY'] as const;
  const counts=Object.fromEntries(categories.map(key=>[key,0])) as Record<typeof categories[number],number>;
  const ids=new Set<string>();
  let assessed=0,proposed=0,incorrect=0,falseAssertions=0,misattributions=0,missedFacts=0,sourceFailures=0,budgetStopped=0,lateReferences=0;
  for(const item of cases) {
    if(!item||!categories.includes(item.category)||!item.report||!item.audit||ids.has(item.report.spotId)||item.report.spotId!==item.audit.spotId||digest(item.report)!==item.audit.reportHash||!Array.isArray(item.report.results)||!Array.isArray(item.audit.assessments)||item.report.results.length!==item.audit.assessments.length)throw new Error('cohort_audit_invalid');
    ids.add(item.report.spotId);counts[item.category]++;
    if(!item.audit.preRunReference)lateReferences++;
    for(const assessment of item.audit.assessments) {
      const field=item.report.results.find(result=>result.attributeKey===assessment.attributeKey);
      if(!field||!['CORRECT','PARTIAL','OMISSION','INCORRECT','JUSTIFIED_ABSTENTION'].includes(assessment.outcome)||field.status==='SKIPPED')throw new Error('cohort_audit_invalid');
      assessed++;
      if(['REQUIRES_REVIEW','AUTO_VERIFIED'].includes(field.status))proposed++;
      if(assessment.outcome==='INCORRECT')incorrect++;
      falseAssertions+=assessment.falseAssertions;misattributions+=assessment.misattributions;missedFacts+=assessment.missedFacts;
    }
    sourceFailures+=item.report.sourceFailures?.length??0;
    if(item.report.stopReason?.endsWith('BUDGET_EXHAUSTED'))budgetStopped++;
  }
  const blockers:string[]=[];
  for(const item of cases.filter(c=>c.report.version?.startsWith('nuknuk-research-v4'))){
    if(!item.spotAudit||item.spotAudit.reportHash!==digest(item.report)||item.spotAudit.spotId!==item.report.spotId){blockers.push('SCOPED_SPOT_AUDIT_REQUIRED');continue;}
    if(!item.spotAudit.preRunReference)blockers.push('SCOPED_REFERENCE_NOT_PRE_RUN');
    if(!item.spotAudit.referenceBreadthSufficient)blockers.push('SCOPED_REFERENCE_TOO_NARROW');
    if(item.spotAudit.totals.falseAssertions||item.spotAudit.totals.wrongScope)blockers.push('SCOPED_FACTUAL_OR_SCOPE_ERROR');
    if(item.spotAudit.totals.missed)blockers.push('SCOPED_KNOWN_FACTS_MISSED');
  }
  if(cases.length<12)blockers.push('MINIMUM_12_SPOTS');
  if(lateReferences)blockers.push('REFERENCE_NOT_PREPARED_BEFORE_RUN');
  for(const key of categories)if(counts[key]<3)blockers.push('CATEGORY_'+key+'_BELOW_3');
  if(incorrect||falseAssertions||misattributions)blockers.push('FACTUAL_OR_SCOPE_ERROR');
  if(missedFacts)blockers.push('KNOWN_FACTS_MISSED');
  if(proposed/assessed<0.3)blockers.push('USEFUL_FIELD_COVERAGE_BELOW_30_PERCENT');
  if(sourceFailures)blockers.push('SOURCE_FAILURES_REQUIRE_TRIAGE');
  if(budgetStopped>cases.length/4)blockers.push('BUDGET_STOPS_ABOVE_25_PERCENT');
  return {version:'nuknuk-cohort-gate@1',readyForUnattendedDrafts:blockers.length===0,readyForCatalogWrites:false,
    counts:{spots:cases.length,categories:counts,fieldsAssessed:assessed,fieldsProposed:proposed,incorrect,falseAssertions,misattributions,missedFacts,sourceFailures,budgetStopped,lateReferences},blockers};
}

export interface SpotAuditReference {
 spotId:string;preparedAt:string;
 checks:{id:string;dimension:'IDENTITY'|'OFFER'|'AREA'|'PROPERTY'|'RELATIONSHIP'|'TIMES'|'RULE'|'ACCESS';requirement:string}[];
}
export interface SpotAuditAssessment {
 assertions:{path:string;verdict:'SUPPORTED'|'UNSUPPORTED'|'WRONG_SCOPE';note:string}[];
 checks:{id:string;outcome:'FOUND'|'MISSING'|'JUSTIFIED_ABSTENTION';paths:string[];note:string}[];
}
export function listNuknukSpotAssertions(report:AuditReport & {results:(AuditReport['results'][number]&{value?:unknown})[]}) {
 const assertions:{path:string;dimension:string;value:unknown}[]=[];
 const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 report.results.forEach((r,index)=>{
  if(!['REQUIRES_REVIEW','AUTO_VERIFIED'].includes(r.status)||r.value===undefined)return;
  const path='/results/'+index+'/value';
  if(r.attributeKey!=='experience.profile'){assertions.push({path,dimension:r.attributeKey.startsWith('hours.')?'TIMES':r.attributeKey.startsWith('rule.')?'RULE':r.attributeKey.startsWith('accessibility.')?'ACCESS':'IDENTITY',value:r.value});return;}
  if(!obj(r.value)||!Array.isArray(r.value.areas)||!Array.isArray(r.value.offers)||!Array.isArray(r.value.properties))throw new Error('spot_audit_profile_invalid');
  r.value.properties.forEach((value,i)=>assertions.push({path:path+'/properties/'+i,dimension:'PROPERTY',value}));
  for(const collection of ['areas','offers'] as const)(r.value[collection] as unknown[]).forEach((node,i)=>{
   if(!obj(node)||typeof node.kind!=='string'||typeof node.name!=='string'||!Array.isArray(node.properties))throw new Error('spot_audit_entity_invalid');
   const base=path+'/'+collection+'/'+i;assertions.push({path:base,dimension:collection==='areas'?'AREA':'OFFER',value:{kind:node.kind,name:node.name}});
   node.properties.forEach((value,j)=>assertions.push({path:base+'/properties/'+j,dimension:'PROPERTY',value}));
   if(collection==='offers')for(const key of ['areaIds','prices','schedule'] as const){if(!Array.isArray(node[key]))throw new Error('spot_audit_offer_invalid');(node[key] as unknown[]).forEach((value,j)=>assertions.push({path:base+'/'+key+'/'+j,dimension:key==='areaIds'?'RELATIONSHIP':key==='schedule'?'TIMES':'PROPERTY',value}));}
  });
 });return assertions;
}
/** Every proposed assertion and every pre-run expected dimension requires an
 * explicit assessment. Empty output cannot masquerade as perfect precision. */
export function evaluateNuknukSpotAudit(report:Parameters<typeof listNuknukSpotAssertions>[0],reference:SpotAuditReference,assessment:SpotAuditAssessment) {
 const assertions=listNuknukSpotAssertions(report);
 if(report.spotId!==reference.spotId||!Array.isArray(reference.checks)||!reference.checks.length||new Set(reference.checks.map(c=>c.id)).size!==reference.checks.length||reference.checks.some(c=>!c.id||!c.requirement?.trim()||!['IDENTITY','OFFER','AREA','PROPERTY','RELATIONSHIP','TIMES','RULE','ACCESS'].includes(c.dimension)))throw new Error('spot_audit_reference_invalid');
 if(!Array.isArray(assessment.assertions)||!Array.isArray(assessment.checks)||assessment.assertions.length!==assertions.length||assessment.checks.length!==reference.checks.length||new Set(assessment.assertions.map(a=>a.path)).size!==assertions.length||new Set(assessment.checks.map(c=>c.id)).size!==reference.checks.length)throw new Error('spot_audit_incomplete');
 for(const a of assessment.assertions)if(!assertions.some(v=>v.path===a.path)||!['SUPPORTED','UNSUPPORTED','WRONG_SCOPE'].includes(a.verdict)||!a.note?.trim())throw new Error('spot_assertion_assessment_invalid');
 for(const c of assessment.checks)if(!reference.checks.some(r=>r.id===c.id)||!['FOUND','MISSING','JUSTIFIED_ABSTENTION'].includes(c.outcome)||!c.note?.trim()||!Array.isArray(c.paths)||c.paths.some(path=>!assessment.assertions.some(a=>a.path===path&&a.verdict==='SUPPORTED'))||c.outcome==='FOUND'&&!c.paths.length||c.outcome!=='FOUND'&&c.paths.length)throw new Error('spot_reference_assessment_invalid');
 const dimensions=[...new Set(reference.checks.map(c=>c.dimension))];
 return {version:'nuknuk-spot-audit@1',spotId:report.spotId,reportHash:digest(report),referenceHash:digest(reference),assessmentHash:digest(assessment),
  preRunReference:Number.isFinite(Date.parse(reference.preparedAt))&&Date.parse(reference.preparedAt)<Date.parse(report.startedAt??''),
  referenceBreadthSufficient:dimensions.includes('OFFER')&&dimensions.includes('AREA')&&dimensions.some(d=>['RULE','ACCESS','TIMES','PROPERTY'].includes(d)),
  totals:{proposedAssertions:assertions.length,supported:assessment.assertions.filter(a=>a.verdict==='SUPPORTED').length,falseAssertions:assessment.assertions.filter(a=>a.verdict==='UNSUPPORTED').length,wrongScope:assessment.assertions.filter(a=>a.verdict==='WRONG_SCOPE').length,expectedChecks:reference.checks.length,found:assessment.checks.filter(c=>c.outcome==='FOUND').length,missed:assessment.checks.filter(c=>c.outcome==='MISSING').length,justifiedAbstentions:assessment.checks.filter(c=>c.outcome==='JUSTIFIED_ABSTENTION').length},
  dimensions,assessment,readyForCatalogWrites:false,limitations:['ASSESSOR_JUDGMENT_NOT_INDEPENDENT_CERTIFICATION','REFERENCE_COVERAGE_IS_NOT_TOTAL_SPOT_COMPLETENESS']};
}
