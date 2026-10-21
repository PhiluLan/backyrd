// Evaluation binds an independent pre-run reference and an explicit audit to the
// exact report. Missing judgments cannot silently count as correct abstentions.
import {createHash} from 'node:crypto';
export interface AuditReport {spotId:string;startedAt?:string;results:{attributeKey:string;status:string}[]}
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
