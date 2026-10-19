// Evaluation binds an independent pre-run reference and an explicit audit to the
// exact report. Missing judgments cannot silently count as correct abstentions.
import {createHash} from 'node:crypto';
export interface AuditReport {spotId:string;results:{attributeKey:string;status:string}[]}
export interface AuditReference {spotId:string;checks:unknown[]}
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
  return {version:'nuknuk-audit@1',spotId:report.spotId,reportHash:digest(report),referenceHash:digest(reference),assessments,
    totals:{fields:assessments.length,correct:assessments.filter(a=>a.outcome==='CORRECT').length,partial:assessments.filter(a=>a.outcome==='PARTIAL').length,omitted:assessments.filter(a=>a.outcome==='OMISSION').length,incorrect:assessments.filter(a=>a.outcome==='INCORRECT').length,justifiedAbstentions:assessments.filter(a=>a.outcome==='JUSTIFIED_ABSTENTION').length,falseAssertions:assessments.reduce((n,a)=>n+a.falseAssertions,0),misattributions:assessments.reduce((n,a)=>n+a.misattributions,0),missedFacts:assessments.reduce((n,a)=>n+a.missedFacts,0)},
    limitations:['ASSESSOR_JUDGMENT_NOT_INDEPENDENT_CERTIFICATION','SMALL_SAMPLE_NOT_GENERAL_ACCURACY','COUNTS_APPLY_ONLY_TO_RECORDED_REFERENCE_CHECKS']};
}
