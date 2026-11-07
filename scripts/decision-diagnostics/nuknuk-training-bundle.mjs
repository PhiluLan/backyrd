#!/usr/bin/env node
// Explicitly commissioned assisted review, not fabricated founder/gold approval.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {auditUnderstandingDataset,understandingSplitHash,exportUnderstandingDataset} from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';
import {createHash} from 'node:crypto';

const [sourceFile,externalFile,outputDirectory]=process.argv.slice(2);
if(!sourceFile||!externalFile||!outputDirectory) throw Error('nuknuk_bundle_arguments_required');
const source=JSON.parse(await readFile(resolve(sourceFile),'utf8'));
auditUnderstandingDataset(source,understandingSplitHash(source.splitPlan));
const external=JSON.parse(await readFile(resolve(externalFile),'utf8'));
if(external.version!=='backyrd.nuknuk-external-selection@1'||external.examples.length!==40||external.examples.some(r=>r.split!=='TRAIN'||r.sourceSplit!=='train')) throw Error('nuknuk_auxiliary_selection_invalid');
const reviewedAt=new Date().toISOString();
const commission={version:'backyrd.nuknuk-training-commission@1',source:'EXPLICIT_FOUNDER_MESSAGE_IN_THIS_CHAT',
  instruction:'Sehr gut, also dann bitte komplett machen Punkt 1-4',
  scope:['REVIEW_BACKYRD_CORPUS','PREPARE_MASSIVE_AND_PAWS_X','TRAIN_SEPARATE_LOCAL_ADAPTER','INTERNAL_BASELINE_COMPARISON'],
  perCaseFounderReviewWaived:true,independentHumanGold:false,reviewedAt};
const delegationHash=contentHash(commission),corrections=[];
const reviewed={...source,cases:source.cases.map(row=>{
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
const splitHash=understandingSplitHash(reviewed.splitPlan);
const audit=auditUnderstandingDataset(reviewed,splitHash);
const bundle=exportUnderstandingDataset(reviewed,splitHash,'COMPACT_ADAPTER_V1');
const files={...bundle.files,train:[...bundle.files.train,...external.examples.map(r=>({messages:r.messages}))]};
const folder=resolve(outputDirectory);await mkdir(folder,{mode:0o700});
const byteHashes={};
for(const [key,rows] of Object.entries(files)){
  const bytes=rows.map(row=>JSON.stringify(row)).join('\n')+'\n';const filename=key+'.jsonl';
  await writeFile(resolve(folder,filename),bytes,{flag:'wx',mode:0o600});
  byteHashes[filename]=createHash('sha256').update(bytes).digest('hex');
}
const manifest={...bundle.manifest,counts:{...bundle.manifest.counts,TRAIN:files.train.length},filesHash:contentHash(files),fileByteHashes:byteHashes,
  backyrdTrainingCases:200,auxiliaryTrainingCases:40,delegationHash,reviewAttribution:'DELEGATED_ASSISTANT',
  sourceDatasetHash:contentHash(source),externalSelectionHash:contentHash(external),
  auxiliaryCases:external.examples.map(({id,task,sourceId,sourceSplit,locale})=>({id,task,sourceId,sourceSplit,locale})),
  limitations:['ASSISTANT_AUTHORED_AND_REVIEWED_NOT_INDEPENDENT_HUMAN_GOLD','RELATED_SCENARIOS_ARE_NOT_INDEPENDENT_BENCHMARKS','COMPACT_PROFILE_REQUIRES_MATCHED_BASELINE_AND_ADAPTER_EVALUATION']};
for(const [name,data] of Object.entries({'manifest.json':manifest,'reviewed-backyrd.json':reviewed,'review-audit.json':audit,'commission.json':commission,'corrections.json':corrections,'external-lineage.json':external})) await writeFile(resolve(folder,name),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
const manifestHash=createHash('sha256').update(await readFile(resolve(folder,'manifest.json'))).digest('hex');
console.log(JSON.stringify({directory:folder,manifestSha256:manifestHash,counts:manifest.counts,corrections:corrections.length,weightsTrained:false}));
