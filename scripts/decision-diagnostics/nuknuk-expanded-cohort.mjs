#!/usr/bin/env node
// Additive collection preparation only. Never calls, trains or activates a model.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { contentHash } from '../../packages/decision-vnext-core/dist/canonical.js';
import { auditUnderstandingDataset, understandingSplitHash } from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';
import { makeInterpretation } from './nuknuk-pilot-authoring.mjs';
import { buildPilotCohort, worldCases } from './nuknuk-pilot-cohort.mjs';
import { expandedInterpretationSpecs, expandedWorldSpecs } from './nuknuk-expanded-specs.mjs';

export const EXPANSION_PLAN_HASH = '4e46a20c7e579df306bdad9654f4649bbc7aee357b45a5330f7f91f3a11e798f';
export async function buildExpandedCohort({ reviewedParent = null } = {}) {
  const plan = JSON.parse(await readFile(new URL('./nuknuk-expanded-plan.json', import.meta.url),'utf8'));
  if (contentHash(plan) !== EXPANSION_PLAN_HASH) throw Error('nuknuk_expansion_plan_changed');
  const parent = await buildPilotCohort();
  let source = parent.dataset;
  if (reviewedParent !== null) {
    source = auditUnderstandingDataset(reviewedParent, parent.manifest.splitPlanHash).dataset;
    if (contentHash(source.splitPlan) !== contentHash(parent.dataset.splitPlan) || source.cases.length !== parent.dataset.cases.length
      || parent.dataset.cases.some(original => !source.cases.some(row => row.id === original.id && row.contentHash === original.contentHash))) {
      throw Error('nuknuk_expansion_parent_changed');
    }
  }
  const byId = new Map();
  for (const group of plan.additions) for (const id of group.caseIds) {
    if (byId.has(id) || source.cases.some(row=>row.id===id)) throw Error('nuknuk_expansion_duplicate_id');
    byId.set(id,group);
  }
  const added = [], notes = [];
  for (const spec of expandedInterpretationSpecs) {
    const group = byId.get(spec.id);
    if (!group) throw Error('nuknuk_expansion_unplanned_case');
    added.push(makeInterpretation(spec,group));
    notes.push({id:spec.id,query:spec.query,must:spec.must,avoid:spec.avoid});
  }
  for (const spec of expandedWorldSpecs) for (const built of await worldCases(spec,byId)) {
    added.push(built.row); notes.push(built.note);
  }
  if (added.length !== 160 || byId.size !== 160 || added.some(row=>!byId.has(row.id))) throw Error('nuknuk_expansion_inventory_invalid');
  const dataset = {...source,splitPlan:[...source.splitPlan,...plan.additions.map(({scenarioGroup,split})=>({scenarioGroup,split}))],cases:[...source.cases,...added]};
  const {dataset:checked,...audit} = auditUnderstandingDataset(dataset,understandingSplitHash(dataset.splitPlan));
  if (Object.entries(plan.counts).some(([split,count])=>audit.counts[split]!==count)) throw Error('nuknuk_expansion_count_invalid');
  const modelInputCoverage = {
    specialTerms: Object.fromEntries(['besonder','einzigartig','speziell'].map(term=>[term,checked.cases.filter(row=>row.split==='TRAIN'&&row.content.query.toLocaleLowerCase('de-CH').includes(term)).length])),
    newInterpretations: expandedInterpretationSpecs.length,
    newEvidenceExercises: added.filter(row=>row.content.task==='ASSESS_CANDIDATES').length,
    syntheticEvidenceScenarioPairs: expandedWorldSpecs.length,
  };
  return {dataset:checked,audit,notes,manifest:{version:plan.version,cohortId:plan.cohortId,planHash:EXPANSION_PLAN_HASH,
    parentDatasetHash:contentHash(source),parentPlanHash:parent.manifest.planHash,splitPlanHash:audit.splitPlanHash,datasetHash:contentHash(checked),counts:audit.counts,
    trainingTasks:Object.fromEntries(['INTERPRET_REQUEST','ASSESS_CANDIDATES'].map(task=>[task,checked.cases.filter(c=>c.split==='TRAIN'&&c.content.task===task).length])),
    semanticHumanApprovals:source.cases.filter(c=>c.reviews.some(r=>r.kind==='SEMANTICS'&&r.verdict==='ACCEPT')).length,
    authoring:'ASSISTANT_AUTHORED_UNDER_FOUNDER_COMMISSION_NOT_INDIVIDUAL_HUMAN_GOLD',coverage:modelInputCoverage,
    exportReady:audit.exportReady,externalExamplesImported:0,modelCalls:0,weightsTrained:false,productionWrites:0,
    limitations:['SYNTHETIC_CORPUS_NOT_MEASURED_MODEL_QUALITY','NEW_TARGETS_NOT_INDIVIDUALLY_HUMAN_REVIEWED','PARENT_HOLDOUT_IS_NOT_AN_INDEPENDENT_BLIND_BENCHMARK','RELATED_TEMPLATE_EVIDENCE_EXERCISES_ARE_NOT_INDEPENDENT_SCENARIOS']}};
}

async function main() {
  const [directory,parentFile] = process.argv.slice(2);
  if (!directory) throw Error('nuknuk_expansion_output_required');
  const cohort = await buildExpandedCohort({reviewedParent:parentFile?JSON.parse(await readFile(resolve(parentFile),'utf8')):null});
  const folder=resolve(directory);
  await mkdir(folder,{mode:0o700});
  const write=(name,value)=>writeFile(resolve(folder,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  await write('cohort.json',cohort.dataset); await write('manifest.json',cohort.manifest); await write('audit.json',cohort.audit);
  for(const split of ['TRAIN','VALIDATION','TEST']) await write(split.toLowerCase()+'-review-records.json',{...cohort.dataset,cases:cohort.dataset.cases.filter(c=>c.split===split)});
  // No withheld targets in the user-facing inventory, and no forged approval.
  await write('new-training-inventory.json',cohort.notes);
  console.log(JSON.stringify(cohort.manifest));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{console.error(error instanceof Error?error.message:'nuknuk_expansion_failed');process.exitCode=1;});
