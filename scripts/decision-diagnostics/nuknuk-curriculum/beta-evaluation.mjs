/** Bound catalogue scorer. Reuses the canonical Product semantic comparator. No model/network. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scoreBetaRow} from '../nuknuk-beta-evaluation.mjs';
import {evaluationPacket,trainingStratum} from './beta-mixture.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const bytes=x=>JSON.stringify(x,null,2)+'\n';
const fraction=rows=>rows.filter(r=>r.status==='PASS').length/rows.length;
function grouped(rows,key){return Object.fromEntries([...new Set(rows.map(r=>r[key]))].sort().map(k=>{const all=rows.filter(r=>r[key]===k);return[k,{total:all.length,passed:all.filter(r=>r.status==='PASS').length,fraction:fraction(all),worstVariant:all.every(r=>r.status==='PASS')?'PASS':'FAIL_OR_REVIEW'}];}));}
const quantile=(a,p)=>a.length?[...a].sort((x,y)=>x-y)[Math.ceil(p*a.length)-1]:null;
export function catalogFailureReason(row){
 if(row.error)return row.error;
 if(row.semanticMatch===false)return 'SEMANTIC_GRAPH_MISMATCH';
 if(row.clarificationStatus==='FAIL')return 'CLARIFICATION_FAILED';
 if(row.clarificationStatus==='REVIEW_REQUIRED')return 'CLARIFICATION_REVIEW_REQUIRED';
 return 'REVIEW_REQUIRED';
}
export function catalogDiagnosticDimensions(score,actual,goldModel,goldHost){
 const generated=actual.status==='GENERATED_REQUIRES_SEMANTIC_REVIEW'&&actual.raw!=null;
 return {generation:generated?'PASS':'FAIL',contractValidation:generated?(score.actualMeaning?'PASS':'FAIL'):'NOT_EXECUTED',
  semanticGraph:score.semanticMatch===true?'PASS':score.actualMeaning?'FAIL':'NOT_EXECUTED',
  clarification:score.clarificationStatus??'NOT_EXECUTED',
  modelInteraction:score.modelInteraction?score.modelInteraction===goldModel?'PASS':'FAIL':'NOT_EXECUTED',
  hostInteraction:score.hostInteraction?score.hostInteraction===goldHost?'PASS':'FAIL':'NOT_EXECUTED',
  hostProjection:score.projectedMeaning?'RECORDED_NOT_INDEPENDENTLY_VERIFIED':'NOT_EXECUTED',hostRequestState:score.hostRequestState??null};
}
export function scoreCatalogResults(catalog,manifest,bundle,result,{oracle=false}={}){
 const split=result.split;if(!['DEV','TEST'].includes(split))throw Error('beta_score_split_invalid');
 const packet=evaluationPacket(catalog,split),expected=catalog.cases.filter(r=>r.split===split);
 if(result.datasetHash!==manifest.catalogHash||bundle.datasetHash!==manifest.catalogHash||result.requestPacketSha256!==sha(bytes(packet))||result.firstAttemptOnly!==true||result.caseCount!==expected.length||result.cases.length!==expected.length||(!oracle&&result.modelEvaluated!==true)||! /^[a-f0-9]{64}$/.test(result.adapterSha256))throw Error('beta_score_result_binding_invalid');
 const byId=new Map(result.cases.map(r=>[r.id,r]));if(byId.size!==expected.length||expected.some(r=>!byId.has(r.id)))throw Error('beta_score_roster_invalid');
 const scored=expected.map(row=>{
  const actual=byId.get(row.id);if(actual.attempt!==1||['promptHash','inputHash','schemaHash','task'].some(k=>actual[k]!==row.request[k]&&!(k==='task'&&actual[k]===row.task)))throw Error('beta_score_input_or_attempt_changed');
  const input={...row,familyId:row.family,messages:packet.cases.find(x=>x.id===row.id).messages};
  const score=actual.raw&&actual.status==='GENERATED_REQUIRES_SEMANTIC_REVIEW'?scoreBetaRow(input,actual.raw,{questionScope:'MODEL_WIRE'}):{id:row.id,status:'FAIL',error:actual.errorType??actual.status,semanticMatch:false};
  const goldModel=row.expected.clarification?'CLARIFY':'SEARCH',goldHost=row.expectedInteraction;
  return {...score,diagnosticDimensions:catalogDiagnosticDimensions(score,actual,goldModel,goldHost),locale:row.locale,theme:row.theme,family:row.family,scenarioGroup:row.scenarioGroup,provenance:row.provenance.kind,stratum:trainingStratum(row),dialogue:row.task==='DIALOGAKTUALISIERUNG_V3',expectedModelInteraction:goldModel,expectedHostInteraction:goldHost,firstAttemptPreserved:true,rawOutputHash:sha(JSON.stringify(actual.raw??null)),durationMs:actual.durationMs??null,
    audit:{rubric:row.rubric,criticalFields:['roles','age','money','time','modality','subjectIds','logic','bindings','weatherConditions','dialogue-retention'],expectedMeaning:row.finalMeaning,actualMeaning:score.actualMeaning??null,requiresAdjudication:score.status!=='PASS',automaticGoldRewrite:false}};
 });
 const groups=grouped(scored,'scenarioGroup'),groupFractions=Object.values(groups).map(r=>r.fraction),duration=scored.map(r=>r.durationMs).filter(x=>Number.isFinite(x)&&x>=0);
 const confusion={model:{},host:{}};for(const r of scored){for(const [kind,target,actual]of [['model',r.expectedModelInteraction,r.modelInteraction??'INVALID'],['host',r.expectedHostInteraction,r.hostInteraction??'INVALID']]){const key=target+' -> '+actual;confusion[kind][key]=(confusion[kind][key]??0)+1;}}
 return {version:'backyrd.nuknuk-beta-scored-results@1',datasetHash:manifest.catalogHash,adapterSha256:result.adapterSha256,split,modelEvaluated:!oracle,oracleOnly:oracle,total:scored.length,passed:scored.filter(r=>r.status==='PASS').length,fullCaseFraction:fraction(scored),scenarioGroupMacroFraction:groupFractions.reduce((s,n)=>s+n,0)/groupFractions.length,perScenarioGroup:groups,perFamily:grouped(scored,'family'),perLocale:grouped(scored,'locale'),perTheme:grouped(scored,'theme'),perProvenance:grouped(scored,'provenance'),perStratum:grouped(scored,'stratum'),interactionConfusion:confusion,latency:{p50Ms:quantile(duration,.5),p95Ms:quantile(duration,.95),measured:duration.length,missing:scored.length-duration.length},dialogue:{total:scored.filter(r=>r.dialogue).length,passed:scored.filter(r=>r.dialogue&&r.status==='PASS').length},adjudicationQueue:scored.filter(r=>r.status!=='PASS').map(r=>({id:r.id,status:r.status,reason:catalogFailureReason(r),diagnosticDimensions:r.diagnosticDimensions,audit:r.audit})),cases:scored,limitations:['Strict graph comparison is conservative; equivalent unrecognised graphs require bound adjudication, never automatic PASS.','Visible synthetic TEST is a reviewed regression suite, not an independent blind user study.','Host projection and model wire interaction are reported separately.','No automatic gold edits, candidate activation or actual recommendation acceptance.']};
}
export function pairedCatalogReports(parent,candidate){
 if(parent.datasetHash!==candidate.datasetHash||parent.split!==candidate.split||parent.total!==candidate.total||parent.oracleOnly!==candidate.oracleOnly)throw Error('beta_paired_input_mismatch');
 const p=new Map(parent.cases.map(r=>[r.id,r]));if(p.size!==candidate.cases.length||candidate.cases.some(r=>!p.has(r.id)))throw Error('beta_paired_roster_mismatch');
 const regressions=candidate.cases.filter(r=>p.get(r.id).status==='PASS'&&r.status!=='PASS').map(r=>r.id),improvements=candidate.cases.filter(r=>p.get(r.id).status!=='PASS'&&r.status==='PASS').map(r=>r.id);
 const passed=candidate.fullCaseFraction>=.95&&candidate.scenarioGroupMacroFraction>=.95&&candidate.adjudicationQueue.length===0&&regressions.length===0;
 return {version:'backyrd.nuknuk-beta-paired-review@1',datasetHash:parent.datasetHash,split:parent.split,parentAdapterSha256:parent.adapterSha256,candidateAdapterSha256:candidate.adapterSha256,modelEvaluated:parent.modelEvaluated&&candidate.modelEvaluated,passed,regressions,improvements,unresolvedCriticalCases:candidate.adjudicationQueue.map(r=>r.id),testUsedForSelection:false,activationAuthorized:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,data,bundleDir,parentFile,candidateFile,output,selectionFile]=process.argv.slice(2);
 if(command!=='paired'||!output)throw Error('usage: paired DATA BUNDLE PARENT_RESULTS CANDIDATE_RESULTS OUTPUT [FROZEN_SELECTION_FOR_TEST]');
 const load=async p=>JSON.parse(await readFile(p,'utf8'));const catalog=await load(resolve(data,'catalog.json')),manifest=await load(resolve(data,'manifest.json')),bundle=await load(resolve(bundleDir,'product-gpu-manifest.json'));
 const bundleHash=sha(await readFile(resolve(bundleDir,'product-gpu-manifest.json'))),parentRaw=await load(parentFile),candidateRaw=await load(candidateFile);
 if(parentRaw.bundleManifestSha256!==bundleHash||candidateRaw.bundleManifestSha256!==bundleHash||parentRaw.adapterSha256!==bundle.parent.hfAdapterSha256)throw Error('beta_paired_bundle_or_parent_mismatch');
 const parent=scoreCatalogResults(catalog,manifest,bundle,parentRaw),candidate=scoreCatalogResults(catalog,manifest,bundle,candidateRaw),comparison=pairedCatalogReports(parent,candidate);
 let selection=null;
 if(comparison.split==='TEST'){
  if(!selectionFile)throw Error('beta_score_test_requires_selection');selection=await load(selectionFile);
  if(selection.status!=='DEV_PASSED_FROZEN_SELECTION'||selection.datasetHash!==manifest.catalogHash||selection.bundleManifestSha256!==bundleHash||selection.parentAdapterSha256!==comparison.parentAdapterSha256||selection.candidateAdapterSha256!==comparison.candidateAdapterSha256||selection.testUsedForSelection!==false)throw Error('beta_score_selection_invalid');
 }else if(comparison.passed)selection={...comparison,status:'DEV_PASSED_FROZEN_SELECTION',parentResultSha256:sha(await readFile(parentFile)),candidateResultSha256:sha(await readFile(candidateFile)),bundleManifestSha256:bundleHash};
 await writeFile(output,bytes({parent,candidate,comparison,selection}),{flag:'wx',mode:0o600});
 if(comparison.split==='DEV'&&selection)await writeFile(output+'.selection.json',bytes(selection),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({report:output,passed:comparison.passed,regressions:comparison.regressions.length,modelEvaluated:true,activationAuthorized:false}));
}
