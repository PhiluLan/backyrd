/** Diagnostic review packets; deliberately no automatic comprehension PASS. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {scoreCatalogResults} from './beta-evaluation.mjs';
export const CORRECTION_SELECTION='CANDIDATE_FROZEN_FOR_DIAGNOSTIC_TEST';
const sha=b=>createHash('sha256').update(b).digest('hex');
const encode=x=>JSON.stringify(x,null,2)+'\n';
function completeOriginal(c,model){if(c[model+'Raw']!==null&&c[model+'Raw']!==undefined)return true;try{const x=JSON.parse(c[model+'RawText']);return x!==null&&typeof x==='object';}catch{return false;}}
export function pendingSemanticChecks(criteria){
 if(!criteria?.mustUnderstand?.length)throw Error('correction_semantic_criteria_missing');
 return ['mustUnderstand','mustNotInfer'].flatMap(kind=>(criteria[kind]??[]).map((statement,index)=>({id:`${kind}-${index}`,kind,statement,status:'UNREVIEWED',evidence:null})));
}
export function validateCompletedJudgements(packet,judgements){
 if(judgements.packetSha256!==sha(encode(packet))||!Array.isArray(judgements.cases)||judgements.cases.length!==packet.cases.length)throw Error('correction_review_roster_not_bound');
 const incoming=new Map(judgements.cases.map(c=>[c.id,c]));if(incoming.size!==packet.cases.length)throw Error('correction_review_duplicate_case');
 for(const c of packet.cases){const r=incoming.get(c.id);if(!r||r.parentRawSha256!==c.parentRawSha256||r.candidateRawSha256!==c.candidateRawSha256)throw Error('correction_review_raw_not_bound');
  for(const model of ['parent','candidate']){
   const x=r[model];if(!x||!['UNDERSTOOD','MISUNDERSTOOD','UNCLEAR','NO_COMPLETE_OUTPUT'].includes(x.verdict))throw Error('correction_review_missing_verdict');
   if(x.checks?.length!==c.checks.length||new Set(x.checks.map(q=>q.id)).size!==c.checks.length)throw Error('correction_review_incomplete_coverage');
   for(const expected of c.checks){const check=x.checks.find(q=>q.id===expected.id);if(!check||!['MET','VIOLATED','UNCLEAR','UNSCORABLE'].includes(check.status)||typeof check.evidence!=='string'||!check.evidence.trim())throw Error('correction_review_unchecked_requirement');}
   if(!x.additionalFactsAudit||!['NONE_FOUND','FOUND','UNCLEAR','UNSCORABLE'].includes(x.additionalFactsAudit.status)||typeof x.additionalFactsAudit.evidence!=='string'||!x.additionalFactsAudit.evidence.trim())throw Error('correction_review_additional_facts_unchecked');
   if(x.additionalFactsAudit.status==='FOUND'&&x.verdict!=='MISUNDERSTOOD')throw Error('correction_review_invention_hidden');
   if(x.verdict==='UNDERSTOOD'&&x.additionalFactsAudit.status!=='NONE_FOUND')throw Error('correction_review_invention_not_resolved');
   if(x.verdict==='UNDERSTOOD'&&x.checks.some(q=>q.status!=='MET'))throw Error('correction_review_false_pass');
   if(x.verdict==='MISUNDERSTOOD'&&!x.checks.some(q=>q.status==='VIOLATED')&&x.additionalFactsAudit.status!=='FOUND')throw Error('correction_review_unproven_failure');
   const complete=completeOriginal(c,model);
   if(x.verdict==='NO_COMPLETE_OUTPUT'&&(complete||(x.checks.some(q=>q.status!=='UNSCORABLE')||x.additionalFactsAudit.status!=='UNSCORABLE')))throw Error('correction_review_inconsistent_incomplete');
   if(x.verdict!=='NO_COMPLETE_OUTPUT'&&!complete)throw Error('correction_review_incomplete_original');
   if(x.verdict==='UNCLEAR'&&((!x.checks.some(q=>['UNCLEAR','UNSCORABLE'].includes(q.status))&&!['UNCLEAR','UNSCORABLE'].includes(x.additionalFactsAudit.status))||x.checks.some(q=>q.status==='VIOLATED')))throw Error('correction_review_inconsistent_unclear');
  }
 }
 return {checkedCases:packet.cases.length,checksComplete:true,independentHumanReview:false};
}
/** Both independent reviews remain immutable; disagreements are unresolved, never majority-voted. */
export function reconcilePeerReviews(packet, first, second) {
 for (const review of [first, second]) {
  if (typeof review.reviewerId !== 'string' || !review.reviewerId.trim()) throw Error('correction_peer_identity_required');
  validateCompletedJudgements(packet, review);
 }
 if (first.reviewerId === second.reviewerId) throw Error('correction_peer_distinct_reviewers_required');
 const a = new Map(first.cases.map(c => [c.id,c])), b = new Map(second.cases.map(c => [c.id,c]));
 const cases = packet.cases.map(c => {
  const out = {id:c.id, scenarioGroup:c.scenarioGroup ?? c.family ?? c.id};
  for (const model of ['parent','candidate']) {
   const x=a.get(c.id)[model], y=b.get(c.id)[model];
   const agree = x.verdict===y.verdict && x.additionalFactsAudit.status===y.additionalFactsAudit.status && x.checks.every(q => y.checks.find(z=>z.id===q.id)?.status===q.status);
   out[model] = agree ? x.verdict : 'UNCLEAR';
   out[model+'Disagreement'] = !agree;
  }
  return out;
 });
 const groups = new Map();
 for(const c of cases){if(!groups.has(c.scenarioGroup))groups.set(c.scenarioGroup,[]);groups.get(c.scenarioGroup).push(c);}
 const verdict = (rows,model) => rows.some(c=>c[model]==='MISUNDERSTOOD') ? 'MISUNDERSTOOD' : rows.every(c=>c[model]==='UNDERSTOOD') ? 'UNDERSTOOD' : 'UNRESOLVED';
 const paired = [...groups].map(([id,rows])=>({id,parent:verdict(rows,'parent'),candidate:verdict(rows,'candidate'),fullyConclusive:rows.every(c=>['UNDERSTOOD','MISUNDERSTOOD'].includes(c.parent)&&['UNDERSTOOD','MISUNDERSTOOD'].includes(c.candidate))}));
 const conclusive = paired.filter(g=>g.fullyConclusive);
 const parentErrors=conclusive.filter(g=>g.parent==='MISUNDERSTOOD').length, candidateErrors=conclusive.filter(g=>g.candidate==='MISUNDERSTOOD').length;
 const coverage=paired.length ? conclusive.length/paired.length : 0;
 return {version:'backyrd.nuknuk-correction-peer-review@1',packetSha256:sha(encode(packet)),reviewerIds:[first.reviewerId,second.reviewerId],reviewHashes:[sha(encode(first)),sha(encode(second))],cases,groups:paired,totalGroups:paired.length,conclusiveGroups:conclusive.length,sharedConclusiveCoverage:coverage,parentErrors,candidateErrors,relativeErrorReduction:parentErrors ? (parentErrors-candidateErrors)/parentErrors : null,reductionStatus:!parentErrors?'NOT_APPLICABLE':coverage<0.9?'INSUFFICIENT_COVERAGE':'DIAGNOSTIC_ONLY',activationAuthorized:false};
}
export function diagnosticSelection({datasetHash,bundleHash,parent,candidate,parentBytes,candidateBytes}){
 if(![datasetHash,bundleHash,parent.adapterSha256,candidate.adapterSha256].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x))||parent.adapterSha256===candidate.adapterSha256||parent.split!=='DEV'||candidate.split!=='DEV'||parent.datasetHash!==datasetHash||candidate.datasetHash!==datasetHash||parent.modelEvaluated!==true||candidate.modelEvaluated!==true||!Number.isInteger(parent.total)||parent.total<1||parent.total!==candidate.total||parent.cases?.length!==parent.total||candidate.cases?.length!==parent.total||new Set(parent.cases.map(c=>c.id)).size!==parent.total||new Set(candidate.cases.map(c=>c.id)).size!==parent.total||parent.cases.some(c=>!candidate.cases.some(n=>n.id===c.id)))throw Error('correction_freeze_complete_dev_required');
 return {version:'backyrd.nuknuk-correction-selection@1',status:CORRECTION_SELECTION,datasetHash,bundleManifestSha256:bundleHash,parentAdapterSha256:parent.adapterSha256,candidateAdapterSha256:candidate.adapterSha256,parentResultSha256:sha(parentBytes),candidateResultSha256:sha(candidateBytes),selectionPolicy:'ONE_PREREGISTERED_FINAL_CHECKPOINT',semanticQualityApproved:false,testUsedForSelection:false,activationAuthorized:false};
}
async function main(){
 const [command,data,bundleDir,parentFile,candidateFile,output,selectionFile]=process.argv.slice(2);
 if(command!=='paired'||!output)throw Error('correction_paired_usage');
 const load=async p=>JSON.parse(await readFile(resolve(p),'utf8'));
 const manifest=await load(data+'/manifest.json'),catalog=await load(data+'/catalog.json'),bundleBytes=await readFile(bundleDir+'/product-gpu-manifest.json'),bundle=JSON.parse(bundleBytes),bundleHash=sha(bundleBytes);
 if(manifest.catalogVariant!=='understanding-correction-v1'||bundle.sourceManifestSha256!==sha(await readFile(data+'/manifest.json')))throw Error('correction_profile_or_binding_invalid');
 const [parentBytes,candidateBytes]=await Promise.all([readFile(parentFile),readFile(candidateFile)]),p=JSON.parse(parentBytes),n=JSON.parse(candidateBytes);
 const parent=scoreCatalogResults(catalog,manifest,bundle,p),candidate=scoreCatalogResults(catalog,manifest,bundle,n);
 if(parent.split!==candidate.split||parent.adapterSha256!==bundle.parent.hfAdapterSha256)throw Error('correction_paired_identity_invalid');
 let selection;
 if(parent.split==='DEV')selection=diagnosticSelection({datasetHash:manifest.catalogHash,bundleHash,parent,candidate,parentBytes,candidateBytes});
 else{
  if(!selectionFile)throw Error('correction_test_frozen_selection_required');selection=await load(selectionFile);
  if(selection.status!==CORRECTION_SELECTION||selection.selectionPolicy!=='ONE_PREREGISTERED_FINAL_CHECKPOINT'||selection.datasetHash!==manifest.catalogHash||selection.bundleManifestSha256!==bundleHash||selection.parentAdapterSha256!==p.adapterSha256||selection.candidateAdapterSha256!==n.adapterSha256||selection.testUsedForSelection!==false||selection.semanticQualityApproved!==false||selection.activationAuthorized!==false)throw Error('correction_test_selection_changed');
 }
 const source=await load(data+'/correction-source.json'),byFamily=new Map(source.map(s=>[s.id,s])),pr=new Map(p.cases.map(x=>[x.id,x])),nr=new Map(n.cases.map(x=>[x.id,x]));
 const cases=catalog.cases.filter(c=>c.split===parent.split).map(c=>{
  const spec=byFamily.get(c.family),criteria=spec?.semanticCriteria;
  if(!criteria)throw Error('correction_no_casewise_criteria:'+c.id);
  return {id:c.id,family:c.family,scenarioGroup:c.scenarioGroup,locale:c.locale,query:c.query,turns:c.turns,reference:c.reference,inputHash:c.request.inputHash,parentRaw:pr.get(c.id).raw,parentRawText:pr.get(c.id).rawText,candidateRaw:nr.get(c.id).raw,candidateRawText:nr.get(c.id).rawText,parentRawSha256:sha(JSON.stringify(pr.get(c.id))),candidateRawSha256:sha(JSON.stringify(nr.get(c.id))),criteria,checks:pendingSemanticChecks(criteria),understandingVerdict:'UNREVIEWED',technicalDiagnostics:{parent:parent.cases.find(x=>x.id===c.id),candidate:candidate.cases.find(x=>x.id===c.id)}};
 });
 const result={version:'backyrd.nuknuk-correction-review-packet@1',datasetHash:manifest.catalogHash,split:parent.split,bundleManifestSha256:bundleHash,parentAdapterSha256:p.adapterSha256,candidateAdapterSha256:n.adapterSha256,selection,cases,comparison:{passed:false,testExecutionPermitted:parent.split==='DEV',semanticReview:'PENDING',activationAuthorized:false},strictGraphDiagnostics:{parentPassed:parent.passed,candidatePassed:candidate.passed,total:cases.length,notComprehensionMetric:true},limits:['No automatic understanding PASS or success rate.','Every declared requirement must receive an evidence-bound judgement for both outputs.','Correct patch content, patch addressing and host merge are assessed separately.','Diagnostic TEST does not imply DEV quality acceptance or release authority.','Known538 are regression only; no claim of independent human ground truth.']};
 await writeFile(output,encode(result),{flag:'wx',mode:0o600});if(parent.split==='DEV')await writeFile(output+'.selection.json',encode(selection),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({report:output,cases:cases.length,semanticReview:'PENDING',automaticUnderstandingPasses:0,testExecutionPermitted:parent.split==='DEV',activationAuthorized:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
