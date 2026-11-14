#!/usr/bin/env node
// Explicitly commissioned assisted review, not fabricated founder/gold approval.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {auditUnderstandingDataset,understandingSplitHash,exportUnderstandingDataset} from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';
import {createHash} from 'node:crypto';
import {makeInterpretation} from './nuknuk-pilot-authoring.mjs';
import {round2Train,round2Development,round2FreshTest} from './nuknuk-round2-cases.mjs';
import {round3Train,round3Development,round3FreshTest} from './nuknuk-round3-cases.mjs';
import {round4Specs} from './nuknuk-round4-cases.mjs';
import {cleanRound5Training,validateRound5Specs} from './nuknuk-round5-cases.mjs';
import {round5EvaluationSpecs} from './nuknuk-round5-evaluation-cases.mjs';

const [sourceFile,externalFile,outputDirectory]=process.argv.slice(2);
const round2=process.argv.includes('--round2');
const round3=process.argv.includes('--round3');
const round4=process.argv.includes('--round4');
const round5=process.argv.includes('--round5');
const round5Run=process.argv.includes('--round5-run');
if(round5Run&&!round5)throw Error('round5_run_requires_round5');
const compact4=process.argv.includes('--compact4');
if(compact4&&!round4)throw Error('compact4_requires_round4');
if([round2,round3,round4,round5].filter(Boolean).length>1)throw Error('nuknuk_bundle_round_ambiguous');
if(!sourceFile||!externalFile||!outputDirectory) throw Error('nuknuk_bundle_arguments_required');
const source=JSON.parse(await readFile(resolve(sourceFile),'utf8'));
auditUnderstandingDataset(source,understandingSplitHash(source.splitPlan));
const external=JSON.parse(await readFile(resolve(externalFile),'utf8'));
if(external.version!=='backyrd.nuknuk-external-selection@1'||external.examples.length!==40||external.examples.some(r=>r.split!=='TRAIN'||r.sourceSplit!=='train')) throw Error('nuknuk_auxiliary_selection_invalid');
const reviewedAt=new Date().toISOString();
const commission={version:'backyrd.nuknuk-training-commission@1',source:'EXPLICIT_FOUNDER_MESSAGE_IN_THIS_CHAT',
  instruction:round5Run?'Ok, los gehts: nächster Runpod-Lauf mit neuem maximalem Kostendach20USD, getrennt vom abgeschlossenen Lauf; keine Produktaktivierung':round5?'Perfekt, dann mache das nun bitte: Trainingsdaten bereinigen und gezielte Gegenbeispiele lokal vorbereiten; kein neuer GPU-Lauf':round4?'Klingt gut, genauso machen; breites Verständnisprogramm, Runpod, insgesamt 20 USD; temporärer lokaler Trainingswächter ausdrücklich freigegeben':round3?'Perfekt, los gehts (gezielte Gegenbeispiele, eingefrorener Bestand, separater Adapter, neue Anfragen und Wiederholungen)':round2?'Perfekt, los gehts (zweite Trainingsrunde: 120 Kontraste, zwei lokale Adapter und frische Prüfaufgaben)':'Sehr gut, also dann bitte komplett machen Punkt 1-4',
  scope:round5?(round5Run?['REVIEW_BACKYRD_CORPUS','TRAIN_SEPARATE_CLOUD_ADAPTER_20_USD','INTERNAL_BASELINE_COMPARISON']:['REVIEW_BACKYRD_CORPUS','PREPARE_TARGETED_CONTRASTS_LOCAL_ONLY']):['REVIEW_BACKYRD_CORPUS','PREPARE_MASSIVE_AND_PAWS_X','TRAIN_SEPARATE_LOCAL_ADAPTER','INTERNAL_BASELINE_COMPARISON'],
  perCaseFounderReviewWaived:true,independentHumanGold:false,reviewedAt};
const delegationHash=contentHash(commission),corrections=[];
let reviewed={...source,cases:source.cases.map(row=>{
  if(round2||round3||round4||round5)return row; // Preserve the prior reviewed content and attribution.
  const content=structuredClone(row.content);
  if(row.id==='expanded-special-meal-01'){
    content.target.meaning.facts.find(f=>f.key==='budget.maximum').value.operator='LT';
    corrections.push({id:row.id,change:'Unter 45 heisst LT, nicht LTE.'});
  }
  if(row.id==='expanded-family-precision-03'){
    content.target.meaning.facts=content.target.meaning.facts.filter(f=>f.key!=='experience.activity');
    corrections.push({id:row.id,change:'Parkausflug erfordert keinen ausdrücklich ungenannten Spaziergang.'});
  }
  if(row.id==='expanded-logical-binding-02'){
    content.target.meaning.facts.push({id:'f3',key:'people.count',value:{amount:2,operator:'EQ',unit:'PEOPLE'},modality:'CONTEXT',basis:'EXPLICIT',subjectIds:[]});
    corrections.push({id:row.id,change:'Die ausdrücklich genannten beiden Personen bleiben erhalten.'});
  }
  content.trainingPermission='APPROVED';
  const hash=contentHash(content);
  const reviews=['SEMANTICS','PRIVACY_AND_SOURCE_USE'].map(kind=>({kind,verdict:'ACCEPT',contentHash:hash,reviewer:'codex-commissioned-corpus-review',reviewerKind:'DELEGATED_ASSISTANT',delegationHash,reviewedAt,
    note:kind==='SEMANTICS'?'Im expliziten Founder-Auftrag geprüft: Pflicht/Wunsch, Negation, Alternativen, Subjekt-/Bereichsbezug, Budget, Zeit, Empfängergeschmack und belegte gegenüber vermuteter Eignung. Synthetisch; keine unabhängige Menschen-Goldprüfung.':'Synthetische/deidentifizierte beauftragte Fallbeispiele; kein privates Nutzerprofil und keine produktiven Sitzungsdaten. Training lokal, keine Veröffentlichung von Profilen. Herkunft und ursprüngliche Bestätigungen bleiben im Elternbestand.'}));
  return {...row,content,contentHash:hash,reviews};
})};
let retainedParentCaseIds=[];
let excludedExposedCases=[];
if(round5){
  const cleaned=cleanRound5Training(source);
  corrections.push(...cleaned.corrections);
  excludedExposedCases=cleaned.excluded;
  const changed=new Set(corrections.map(c=>c.id));
  reviewed={...cleaned.dataset,cases:cleaned.dataset.cases.map(row=>changed.has(row.id)?{
    ...row,reviews:['SEMANTICS','PRIVACY_AND_SOURCE_USE'].map(kind=>({kind,verdict:'ACCEPT',contentHash:row.contentHash,reviewer:'codex-round5-correction-review',reviewerKind:'DELEGATED_ASSISTANT',delegationHash,reviewedAt,note:'New child-corpus correction: conversation ability is not mandatory quiet; synthetic input and old frozen corpus preserved. No independent human gold.'})),
  }:row)};
}
if(round3){
  // Round-robin scenario groups, not arbitrary first rows or inspected TEST
  // outputs. Old records remain intact in the frozen parent dataset.
  const groups=new Map();
  for(const row of source.cases.filter(r=>r.split==='TRAIN'&&r.content.task==='INTERPRET_REQUEST')){
    if(!groups.has(row.scenarioGroup))groups.set(row.scenarioGroup,[]);
    groups.get(row.scenarioGroup).push(row);
  }
  const queues=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([,rows])=>rows.sort((a,b)=>a.contentHash.localeCompare(b.contentHash)));
  for(let index=0;retainedParentCaseIds.length<64;index++){
    let found=false;
    for(const rows of queues)if(rows[index]&&retainedParentCaseIds.length<64){retainedParentCaseIds.push(rows[index].id);found=true;}
    if(!found)throw Error('nuknuk_round3_retention_insufficient');
  }
  const ids=new Set(retainedParentCaseIds);
  const cases=source.cases.filter(row=>ids.has(row.id));
  const scenarioGroups=new Set(cases.map(row=>row.scenarioGroup));
  reviewed={...source,cases,splitPlan:source.splitPlan.filter(row=>scenarioGroups.has(row.scenarioGroup))};
}
if(round2||round3||round4||round5){
  const additions=round5?[...validateRound5Specs(),...(round5Run?round5EvaluationSpecs():[])]:round4?round4Specs():round3?[...round3Train,...round3Development,...round3FreshTest]:[...round2Train,...round2Development,...round2FreshTest];
  if(round3&&(round3Train.length!==96||round3Development.length!==12||round3FreshTest.length!==12))throw Error('nuknuk_round3_inventory_invalid');
  if(round2Train.length!==120||round2Development.length!==12||round2FreshTest.length!==12)throw Error('nuknuk_round2_inventory_invalid');
  const cases=additions.map(spec=>{
    const row=makeInterpretation(spec,spec);
    const content={...row.content,trainingPermission:'APPROVED'};
    const hash=contentHash(content);
    return {...row,content,contentHash:hash,reviews:['SEMANTICS','PRIVACY_AND_SOURCE_USE'].map(kind=>({kind,verdict:'ACCEPT',contentHash:hash,reviewer:round5?'codex-round5-targeted-contrast-review':round4?'codex-round4-template-and-target-review':round3?'codex-round3-commissioned-review':'codex-round2-commissioned-review',reviewerKind:'DELEGATED_ASSISTANT',delegationHash,reviewedAt,
      note:kind==='SEMANTICS'?'Beauftragte Assistenzprüfung der ausdrücklich geschriebenen Kontraste: Modalität, Rollen, Beträge, Zeit, Zweige, Angebot statt Gesamtbetrieb. Keine unabhängige Menschen-Goldprüfung.':'Synthetische beauftragte Beispiele ohne private Profile oder produktive Sitzungsdaten; lokales Training. Quellenrechte externer Übungen bleiben separat dokumentiert.'}))};
  });
  const groups=new Map(additions.map(s=>[s.scenarioGroup,s.split]));
  reviewed={...reviewed,splitPlan:[...reviewed.splitPlan,...[...groups].map(([scenarioGroup,split])=>({scenarioGroup,split}))],cases:[...reviewed.cases,...cases]};
}
if(round4){
  // Historical validation/test answers have already been inspected. Keep them
  // intact in their parent archive, never promote them into TRAIN or new TEST.
  reviewed={...reviewed,cases:reviewed.cases.filter(r=>r.split==='TRAIN'||r.id.startsWith('r4-'))};
  const used=new Set(reviewed.cases.map(r=>r.scenarioGroup));
  reviewed.splitPlan=reviewed.splitPlan.filter(r=>used.has(r.scenarioGroup));
}
if(round5Run){
  const focused=reviewed.cases.filter(row=>row.id.startsWith('r5-train-')||/^r4-train-intent-3-/.test(row.id));
  const focusedIds=new Set(focused.map(row=>row.id));
  const groups=new Map();
  for(const row of reviewed.cases.filter(row=>row.split==='TRAIN'&&row.content.task==='INTERPRET_REQUEST'&&!focusedIds.has(row.id))){
    if(!groups.has(row.scenarioGroup))groups.set(row.scenarioGroup,[]);
    groups.get(row.scenarioGroup).push(row);
  }
  const queues=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([,rows])=>rows.sort((a,b)=>a.contentHash.localeCompare(b.contentHash)));
  for(let index=0;retainedParentCaseIds.length<192;index++){
    let found=false;
    for(const rows of queues)if(rows[index]&&retainedParentCaseIds.length<192){retainedParentCaseIds.push(rows[index].id);found=true;}
    if(!found)throw Error('round5_retention_insufficient');
  }
  const retained=new Set(retainedParentCaseIds);
  const cases=reviewed.cases.filter(row=>row.split!=='TRAIN'||focusedIds.has(row.id)||retained.has(row.id));
  const used=new Set(cases.map(row=>row.scenarioGroup));
  reviewed={...reviewed,cases,splitPlan:reviewed.splitPlan.filter(row=>used.has(row.scenarioGroup))};
}
const splitHash=understandingSplitHash(reviewed.splitPlan);
const audit=auditUnderstandingDataset(reviewed,splitHash);
if(round5){
  const historicalQueries=new Set(source.cases.filter(r=>r.split!=='TRAIN').map(r=>r.content.query));
  if(reviewed.cases.some(r=>r.content.task==='INTERPRET_REQUEST'&&historicalQueries.has(r.content.query)))throw Error('round5_exposed_query_leakage');
  if(audit.cases.some(row=>row.blockers.length))throw Error('round5_preparation_review_incomplete');
}
if(round5&&!round5Run){
  // The canonical exporter correctly requires all three partitions. This is
  // preparation only: do not weaken that invariant or invent a fresh benchmark.
  const folder=resolve(outputDirectory);await mkdir(folder,{mode:0o700});
  const manifest={round:5,status:'LOCAL_DATA_PREPARATION_ONLY',counts:audit.counts,
    datasetHash:contentHash(reviewed),sourceDatasetHash:contentHash(source),delegationHash,
    newTrainingCases:64,newTrainingFamilies:8,correctedTrainingCases:corrections.length,
    excludedExposedCases:excludedExposedCases.length,validationAndTestAbsent:true,
    freshEvaluationRequired:true,exportReady:false,cloudAuthorized:false,trainingExecuted:false,
    instructionProfile:'COMPACT_ADAPTER_V3',independentHumanGold:false,
    retainedAuxiliaryExamples:external.examples.length,auxiliaryMaterialized:false,
    semanticAuditScope:'Targeted review of round-4 template definitions and known confusion dimensions; not independent re-annotation of every inherited example',
    knownBenchmarkErrata:[{family:'r4-test-14',reason:'Wheelchair requirement absent from query; frozen targets unchanged, excluded from formal comparison'}],
    nextEvaluation:{newUnseenQuestionsRequired:true,oldTestUsedOnlyForRegression:true,
      stages:['Inspect meaning','Inspect executable search constraints','Evaluate synthetic positive and negative candidates','Inspect actual candidate reasons'],
      unacceptableFailures:['Invented mandatory property','Changed negation or preference','Lost subject, alternative, sequence or place scope'],
      baseline:'Preserve both parent and round-4 adapter; choose only on new development cases, then freeze before final holdout'},
  };
  for(const [name,data] of Object.entries({'manifest.json':manifest,'reviewed-backyrd.json':reviewed,'review-audit.json':audit,'commission.json':commission,'corrections.json':corrections,'excluded-exposed-cases.json':excludedExposedCases,'external-lineage.json':external}))await writeFile(resolve(folder,name),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({directory:folder,counts:audit.counts,corrections:corrections.length,newCases:64,weightsTrained:false,exportReady:false,reason:'FRESH_VALIDATION_AND_TEST_REQUIRED'}));
  process.exit(0);
}
const bundle=exportUnderstandingDataset(reviewed,splitHash,round3||round5?'COMPACT_ADAPTER_V3':round4?(compact4?'COMPACT_ADAPTER_V4':'COMPACT_ADAPTER_V3'):round2?'COMPACT_ADAPTER_V2':'COMPACT_ADAPTER_V1');
const files={...bundle.files,train:[...bundle.files.train,...(round3||round5?[]:external.examples.map(r=>({messages:r.messages})))]};
const folder=resolve(outputDirectory);await mkdir(folder,{mode:0o700});
const byteHashes={};
for(const [key,rows] of Object.entries(files)){
  const bytes=rows.map(row=>JSON.stringify(row)).join('\n')+'\n';const filename=key+'.jsonl';
  await writeFile(resolve(folder,filename),bytes,{flag:'wx',mode:0o600});
  byteHashes[filename]=createHash('sha256').update(bytes).digest('hex');
}
const manifest={...bundle.manifest,counts:{...bundle.manifest.counts,TRAIN:files.train.length},filesHash:contentHash(files),fileByteHashes:byteHashes,
  backyrdTrainingCases:reviewed.cases.filter(r=>r.split==='TRAIN').length,auxiliaryTrainingCases:round3||round5?0:40,delegationHash,reviewAttribution:'DELEGATED_ASSISTANT',
  ...(round5?{round:5,status:'FROZEN_BEFORE_GPU',newTrainingCases:64,correctedTrainingCases:40,retainedParentCaseIds,retentionPolicy:'192 historical TRAIN only; deterministic group round-robin and content hash, not model outputs',excludedExposedCases:excludedExposedCases.length,cloudDestination:'Approved Runpod own training Pod',costCeilingUsd:20,independentHumanGold:false,syntheticTemplateExpansion:false,freshDevelopmentCases:16,freshTestCases:24}:{}),
  ...(round2?{round:2,newTrainingCases:120,developmentCaseIds:round2Development.map(s=>s.id),freshTestCaseIds:round2FreshTest.map(s=>s.id),knownTestCasesExcludedFromSelection:true}:{}),
  ...(round4?{round:4,newTrainingCases:2000,newDevelopmentCases:100,newSealedTestCases:300,scenarioFamilyCounts:{TRAIN:50,VALIDATION:10,TEST:30},historicalNonTrainExcluded:true,syntheticTemplateExpansion:true,independentHumanGold:false,cloudDestination:'Explicitly approved Runpod training',costCeilingUsd:20}:{}),
  ...(round3?{round:3,newTrainingCases:96,retainedParentCaseIds,retentionPolicy:'64 prior TRAIN interpretation cases, round-robin across scenario groups; no prior VALIDATION or TEST promoted',developmentCaseIds:round3Development.map(s=>s.id),freshTestCaseIds:round3FreshTest.map(s=>s.id),repeatTestCaseIds:['r3-fresh-1','r3-fresh-5','r3-fresh-6'],repeatCount:3,knownTestCasesExcludedFromTraining:true,auxiliaryPolicy:'External corpus retained in prior lineage, not mixed into this focused continuation'}:{}),
  sourceDatasetHash:contentHash(source),externalSelectionHash:contentHash(external),
  auxiliaryCases:round3||round5?[]:external.examples.map(({id,task,sourceId,sourceSplit,locale})=>({id,task,sourceId,sourceSplit,locale})),
  limitations:['ASSISTANT_AUTHORED_AND_REVIEWED_NOT_INDEPENDENT_HUMAN_GOLD','RELATED_SCENARIOS_ARE_NOT_INDEPENDENT_BENCHMARKS','COMPACT_PROFILE_REQUIRES_MATCHED_BASELINE_AND_ADAPTER_EVALUATION']};
for(const [name,data] of Object.entries({'manifest.json':manifest,'reviewed-backyrd.json':reviewed,'review-audit.json':audit,'commission.json':commission,'corrections.json':corrections,'external-lineage.json':external})) await writeFile(resolve(folder,name),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
const manifestHash=createHash('sha256').update(await readFile(resolve(folder,'manifest.json'))).digest('hex');
console.log(JSON.stringify({directory:folder,manifestSha256:manifestHash,counts:manifest.counts,corrections:corrections.length,weightsTrained:false}));
