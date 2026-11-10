#!/usr/bin/env node
// Offline curriculum assembly. A structural pass never grants semantic approval.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {auditUnderstandingDataset,understandingSplitHash,exportUnderstandingDataset} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';
import {validateNuknukUnderstanding,buildNuknukUnderstandingRequest} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {buildNuknukAssessmentRequest} from '../../../packages/decision-vnext-core/dist/nuknuk-grounded-assessment.js';
import {NUKNUK_TRAINING_VOCABULARY_HASH,NUKNUK_TRAINING_VOCABULARY} from '../../../packages/decision-vnext-core/dist/nuknuk-training-vocabulary.js';
import {trainingSpecs} from './train.mjs';
import {developmentSpecs} from './development.mjs';
import {holdoutSpecs} from './holdout.mjs';
import {materialize} from './authoring.mjs';
import {evidenceCases} from './evidence.mjs';
import {matchingProbes} from './probes.mjs';
import {contrastSpecs} from './contrasts.mjs';
import {varyReference} from './references.mjs';
import {reviseLegacy} from './legacy-revisions.mjs';
import {contrastEvidenceCases} from './evidence-contrasts.mjs';
import {userReviewSpecs} from './user-review.mjs';
import {userReviewEvidenceCases} from './evidence-user-review.mjs';
import {buildSemanticRubric} from './rubric.mjs';
import {auditAssessmentIdentity,buildMetamorphicControls,summarizeTaskMixture} from './methodology.mjs';

export const VERSION='backyrd.nuknuk-solid-curriculum@6';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const local=resolve(root,'.local/nuknuk-understanding');
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const fingerprint=q=>contentHash(q.normalize('NFKC').toLocaleLowerCase('de-CH').replace(/[\p{P}\p{S}\s]+/gu,' ').trim());
const dataset=cases=>({version:'backyrd.nuknuk-understanding-dataset@1',cases,
 splitPlan:[...new Map(cases.map(r=>[r.scenarioGroup,{scenarioGroup:r.scenarioGroup,split:r.split}])).values()]});
const counts=cases=>Object.fromEntries(['TRAIN','VALIDATION','TEST'].map(s=>[s,cases.filter(r=>r.split===s).length]));
const frequencies=items=>Object.fromEntries([...new Set(items)].sort().map(k=>[k,items.filter(i=>i===k).length]));
export function selectLegacy(rows,maximum=300){
 if(rows.some(r=>r.split!=='TRAIN'))throw Error('legacy_train_only');
 const groups=new Map();for(const row of rows){const list=groups.get(row.scenarioGroup)??[];list.push(row);groups.set(row.scenarioGroup,list);}
 const queues=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,list])=>list.sort((a,b)=>contentHash(a.id).localeCompare(contentHash(b.id))).slice(0,list[0].id.startsWith('r4-train-')?2:4));
 const selected=[];let assessments=0;
 for(let index=0;index<4&&selected.length<maximum;index++)for(const queue of queues){const row=queue[index];if(!row||selected.length>=maximum)continue;
  if(row.content.task==='ASSESS_CANDIDATES'&&assessments>=24)continue;
  selected.push(row);if(row.content.task==='ASSESS_CANDIDATES')assessments++;}
 return selected;
}
export async function assemble(){
 const sourcePath=resolve(local,'semantic-acceptance-20261110-reviewed/approved-train.json');
 const legacy=await readJson(sourcePath);
 if(legacy.cases.length!==2221||legacy.cases.some(r=>r.split!=='TRAIN'))throw Error('accepted_source_changed');
 const previous=auditUnderstandingDataset(legacy,understandingSplitHash(legacy.splitPlan));
 if(previous.cases.some(c=>c.blockers.length))throw Error('legacy_review_incomplete');
 const revised=reviseLegacy(legacy.cases);
 const revisedLegacy={...legacy,cases:revised.cases};
 const specs=[...[...trainingSpecs,...developmentSpecs,...holdoutSpecs].map(varyReference),...contrastSpecs,...userReviewSpecs];
 const evidence=[...await evidenceCases(),...await contrastEvidenceCases(),...await userReviewEvidenceCases()];
 const fresh=[...specs.map(materialize),...evidence.map(e=>e.row)];
 if(fresh.length!==680)throw Error('fresh_inventory_changed');
 const full=dataset([...revised.cases,...fresh]);
 const parent=await readJson(resolve(local,'solid-curriculum-20261110-v5/database.json'));
 const parentManifest=await readJson(resolve(local,'solid-curriculum-20261110-v5/manifest.json'));
 if(contentHash(parent)!==parentManifest.fullDatabaseHash)throw Error('frozen_parent_changed');
 const semanticContent=row=>{const {trainingPermission,...content}=row.content;return contentHash(content);};
 const previousById=new Map(parent.cases.map(row=>[row.id,row]));
 const contentRevisions=full.cases.filter(row=>previousById.has(row.id)&&semanticContent(previousById.get(row.id))!==semanticContent(row)).map(row=>({id:row.id,split:row.split,previousContentHash:previousById.get(row.id).contentHash,proposedContentHash:row.contentHash}));
 const audit=auditUnderstandingDataset(full,understandingSplitHash(full.splitPlan));
 // Read only old evaluation queries for collision detection, never their targets.
 const historical=new Set(),historicalSources=[];
 for(const entry of await readdir(local,{withFileTypes:true})){
  if(!entry.isDirectory()||!entry.name.startsWith('training-'))continue;
  let old;try{old=await readJson(resolve(local,entry.name,'reviewed-backyrd.json'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  const queries=old.cases.filter(r=>r.split!=='TRAIN').map(r=>fingerprint(r.content.query));
  queries.forEach(q=>historical.add(q));historicalSources.push({directory:entry.name,queryFingerprintsHash:contentHash(queries),count:queries.length});
 }
 const collisions=fresh.filter(r=>historical.has(fingerprint(r.content.query))).map(r=>r.id);
 if(collisions.length)throw Error('exposed_historical_query_reused:'+collisions.join(','));
 const selectedLegacy=selectLegacy(revised.cases);
 const balanced=dataset([...selectedLegacy,...fresh]);
 const identityAudit=auditAssessmentIdentity(balanced);
 if(identityAudit.perfectGlobalWeakParityShortcut)throw Error('assessment_identity_shortcut');
 const probes=matchingProbes();
 const sources={};for(const file of ['authoring.mjs','train.mjs','development.mjs','holdout.mjs','evidence.mjs','probes.mjs','build.mjs','references.mjs','contrasts.mjs','legacy-revisions.mjs','evidence-contrasts.mjs','user-review.mjs','evidence-user-review.mjs','assessment-identity.mjs','methodology.mjs','methodology.test.mjs','rubric.mjs','preflight.py','curriculum.test.mjs','../../../packages/decision-vnext-core/src/nuknuk-understanding.ts','../../../packages/decision-vnext-core/src/nuknuk-understanding-learning.ts','../nuknuk-pilot-authoring.mjs','../nuknuk-pilot-cohort.mjs','../nuknuk-curriculum-evaluation.mjs'])sources[file]=contentHash(await readFile(new URL(file,import.meta.url),'utf8'));
 const anchor={version:VERSION,rawDatabaseHash:contentHash(full),splitPlanHash:understandingSplitHash(full.splitPlan),vocabularyHash:NUKNUK_TRAINING_VOCABULARY_HASH,
  acceptedLegacyHash:contentHash(legacy),revisedLegacyHash:contentHash(revisedLegacy),revisionLedgerHash:contentHash(revised.ledger),selectedLegacyIdsHash:contentHash(selectedLegacy.map(r=>r.id)),sourcesHash:contentHash(sources),historicalSourcesHash:contentHash(historicalSources),parentManifestHash:contentHash(parentManifest),contentRevisionsHash:contentHash(contentRevisions)};
 const coverage=specs.map(s=>{const row=fresh.find(r=>r.id===s.id),v=validateNuknukUnderstanding(row.content.target,row.content);return{id:s.id,split:s.split,domain:s.domain,phenomena:s.phenomena,
  modalityCounts:frequencies(row.content.target.meaning.facts.map(f=>f.modality)),declaredCapabilityBoundary:!!s.capability,requestState:v.requestState,capabilityGaps:v.capabilityGaps};});
 const report={version:VERSION,anchor,counts:{database:counts(full.cases),fresh:counts(fresh),balanced:counts(balanced.cases),legacySelected:selectedLegacy.length,
  interpretation:specs.length,assessment:evidence.length,newScenarioGroups:new Set(fresh.map(r=>r.scenarioGroup)).size},
  domains:frequencies(specs.map(s=>s.domain)),phenomena:frequencies(specs.flatMap(s=>s.phenomena)),capabilityBoundaries:coverage.filter(r=>r.declaredCapabilityBoundary||r.requestState==='UNSUPPORTED_CAPABILITY'),
  methodology:{identityAudit,taskMixture:summarizeTaskMixture(balanced),holdoutScope:'SYNTHETIC_COMPOSITION_NOT_INDEPENDENT_FIELD_QUALITY',controls:'DERIVED_DEV_AND_TEST_ONLY_NOT_SFT_OR_INDEPENDENT_SAMPLES'},
  legacyRevisions:revised.ledger,contentRevisions,parentVersion:parentManifest.curriculumVersion,selectedLegacyIds:selectedLegacy.map(r=>r.id),historicalSources,exposedQueryCollisions:collisions,sources,
  limitations:['MULTI_ASSISTANT_SYNTHETIC_REVIEW_NOT_HUMAN_GOLD','COMPOSITIONAL_HOLDOUT_SHARES_PRIMITIVES_WITH_TRAIN','NO_MODEL_OUTPUTS_EVALUATED','UNKNOWN_PHRASES_MAY_REQUIRE_NEW_SPOT_ALIASES','PROVIDER_LUNA_PREFERENCE_GUARD_NOT_TESTED_BY_INJECTED_UNDERSTANDING','NO_PRODUCTION_OR_GPU_OPERATIONS'],
  structuralAuditBlockers:frequencies(audit.cases.flatMap(r=>r.blockers)),matchingProbes:probes,
  operationalFindings:[{code:'LUNA_SOFT_PREFERENCE_GUARD',status:'OPEN',detail:'The separate Luna provider rejects some faithfully soft wishes such as wäre mir lieb. Evidence exercises inject validated meaning and do not prove this provider path.'},
   {code:'PARSEABLE_IS_NOT_PROVEN_EXECUTABLE',status:'OPEN',detail:'Some explicit needs (assistance dogs, travel/return time and area-specific pet access) parse as EXECUTABLE but have not been proved against complete matching evidence. Declared capability boundaries remain separate from parser state.'},
   {code:'REMOTE_RUNNER_PREFLIGHT',status:'REQUIRED_BEFORE_SPEND',detail:'Compile schemas with pinned llguidance, tokenize every row without truncation, verify exact model/adapter and arm new budget watchers before launching. No environment or GPU launch in this task.'}],
  independentAcceptance:'ASTRA_RECHECK_REQUIRED_AFTER_REVISION',trainingStarted:false,productionEnabled:false};
 return{full,balanced,fresh,revisionLedger:revised.ledger,report,coverage,evidenceNotes:evidence.map(e=>e.note),anchor,anchorHash:contentHash(anchor)};
}
export function approveSnapshot(prepared,signoff){
 if(contentHash(prepared.anchor)!==prepared.anchorHash||contentHash(prepared.full)!==prepared.anchor.rawDatabaseHash)throw Error('curriculum_signoff_snapshot_mismatch');
 const indexed=new Map(prepared.full.cases.map(r=>[r.id,contentHash(r)]));
 if(prepared.balanced.cases.some(r=>indexed.get(r.id)!==contentHash(r)))throw Error('curriculum_signoff_snapshot_mismatch');
 if(contentHash(prepared.balanced.cases.filter(r=>!r.id.startsWith('solid-')).map(r=>r.id))!==prepared.anchor.selectedLegacyIdsHash)throw Error('curriculum_signoff_snapshot_mismatch');
 if(signoff.anchorHash!==prepared.anchorHash||signoff.verdict!=='ACCEPT_FOR_BOUNDED_TRAINING_EXPERIMENT'||signoff.independentReview!==false||signoff.reviewerKind!=='DELEGATED_ASSISTANT'||!signoff.commission||!signoff.reviewedAt)throw Error('curriculum_signoff_snapshot_mismatch');
 const delegationHash=contentHash(signoff.commission);
 const approve=row=>{
  if(!row.id.startsWith('solid-')&&!prepared.revisionLedger.some(r=>r.id===row.id))return row;
  const content={...row.content,trainingPermission:'APPROVED'},hash=contentHash(content);
  return{...row,content,contentHash:hash,reviews:['SEMANTICS','PRIVACY_AND_SOURCE_USE'].map(kind=>({kind,verdict:'ACCEPT',contentHash:hash,
   reviewer:'codex-commissioned-solid-curriculum-20261110',reviewerKind:'DELEGATED_ASSISTANT',delegationHash,reviewedAt:signoff.reviewedAt,
   ...(kind==='SEMANTICS'?{vocabularyHash:NUKNUK_TRAINING_VOCABULARY_HASH}:{}),
   note:kind==='SEMANTICS'?'Commissioned assistant content review of the frozen authored sentence and target, modality, individual/activity scope, logic, time/budget, uncertainty and capability boundaries. Revision after collaborative Astra/Tobi/product review; scoped final rechecks recorded separately, not human gold.':'Synthetic authored sentences and fictional evidence worlds only; no accounts, private profiles, keys or live spot records. Local data preparation commissioned by founder; no third-party transfer performed.'}))};
 };
 const full=dataset(prepared.full.cases.map(approve)),balanced=dataset(prepared.balanced.cases.map(approve));
 const exportData=exportUnderstandingDataset(balanced,understandingSplitHash(balanced.splitPlan),'SPOT_GROUNDED_V6');
 const fullAudit=auditUnderstandingDataset(full,understandingSplitHash(full.splitPlan));
 if(!fullAudit.exportReady)throw Error('curriculum_full_review_incomplete');
 return{full,balanced,exportData};
}
async function save(dir,name,value){await writeFile(resolve(dir,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
async function main(){
 const [command,out,signoffPath]=process.argv.slice(2);if(!['draft','finalize'].includes(command)||!out)throw Error('usage: draft|finalize OUTPUT [SIGNOFF]');
 const p=await assemble();await mkdir(resolve(out),{recursive:true,mode:0o700});
 if(command==='draft'){
  await save(out,'draft-database.json',p.full);await save(out,'coverage.json',p.report);await save(out,'coverage-cases.json',p.coverage);await save(out,'evidence-proofs.json',p.evidenceNotes);
  await save(out,'methodology-audit.json',p.report.methodology);await save(out,'metamorphic-controls.json',buildMetamorphicControls(p.balanced));
  console.log(JSON.stringify({anchorHash:p.anchorHash,...p.report.counts}));return;
 }
 if(!signoffPath)throw Error('content_signoff_required');
 const signoff=await readJson(resolve(signoffPath)),approved=approveSnapshot(p,signoff);
 const controls=buildMetamorphicControls(approved.balanced);
 await save(out,'database.json',approved.full);await save(out,'reviewed-backyrd.json',approved.balanced);
 for(const [key,rows]of Object.entries(approved.exportData.files))await save(out,key+'.jsonl',rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
 await save(out,'manifest.json',{...approved.exportData.manifest,curriculumVersion:VERSION,anchor:p.anchor,anchorHash:p.anchorHash,signoffHash:contentHash(signoff),fullDatabaseHash:contentHash(approved.full),
  futureTrainingBudgetUSD:100,trainingLaunchAuthorizedByThisExport:false,independentReviewAtExport:false,independentReviewRecord:'independent-review.json',
  derivedControlsHash:contentHash(controls),derivedControlsCounts:controls.counts,derivedControlsAreIndependentSamples:false});
 await save(out,'coverage.json',p.report);await save(out,'coverage-cases.json',p.coverage);await save(out,'evidence-proofs.json',p.evidenceNotes);await save(out,'review-signoff.json',signoff);await save(out,'vocabulary.json',NUKNUK_TRAINING_VOCABULARY);
 // Target-free requests are separate from local gold labels. No model invoked.
 const evaluation=approved.balanced.cases.filter(r=>r.split!=='TRAIN').map(r=>{const request=r.content.task==='INTERPRET_REQUEST'?buildNuknukUnderstandingRequest({...r.content,instructionProfile:'SPOT_GROUNDED_V6'}):buildNuknukAssessmentRequest(r.content.context);
  return{id:r.id,query:r.content.query,task:r.content.task,split:r.split,scenarioGroup:r.scenarioGroup,messages:[{role:'system',content:request.instructions},{role:'user',content:request.input}],promptHash:contentHash(request.instructions),inputHash:contentHash(request.input),schemaHash:contentHash(request.outputSchema),outputSchema:request.outputSchema};});
 await save(out,'semantic-rubric.json',buildSemanticRubric(approved.balanced,controls));
 await save(out,'evaluation-inputs.json',{purpose:'FROZEN_INPUTS_ONLY_NO_TARGETS',datasetHash:contentHash(approved.balanced),cases:evaluation});
 await save(out,'methodology-audit.json',p.report.methodology);
 await save(out,'metamorphic-controls.json',controls);
 await save(out,'metamorphic-evaluation-inputs.json',{purpose:'DERIVED_INPUTS_ONLY_NO_TARGETS',datasetHash:contentHash(approved.balanced),independentSamples:false,cases:controls.cases.map(({expected,proof,...request})=>request)});
 console.log(JSON.stringify({anchorHash:p.anchorHash,...p.report.counts,exported:approved.exportData.manifest.counts,independentReview:false,trainingStarted:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
