#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {evaluateNuknukAudit,evaluateNuknukCohort,evaluateNuknukSpotAudit} from '../../packages/spot-research-runtime/dist/nuknuk-evaluation.js';

export async function assessCohort(manifestPath) {
  const path=resolve(manifestPath),manifest=JSON.parse(await readFile(path,'utf8'));
  if(!Array.isArray(manifest.cases)||!manifest.cases.length||manifest.cases.length>100)throw new Error('cohort_manifest_invalid');
  const cases=[];
  for(const entry of manifest.cases) {
    if(!entry||!['FOOD_DRINK','STAY','CULTURE','ACTIVITY'].includes(entry.category)||!['reportPath','referencePath','assessmentsPath'].every(key=>typeof entry[key]==='string'&&entry[key].trim()))throw new Error('cohort_case_invalid');
    const read=async key=>JSON.parse(await readFile(resolve(dirname(path),entry[key]),'utf8'));
    const [raw,reference,assessments]=await Promise.all([read('reportPath'),read('referencePath'),read('assessmentsPath')]);
    const report=raw.reports?.length===1?raw.reports[0]:raw;
    if(!report.version?.startsWith('nuknuk-research-v4'))throw new Error('spot_profile_research_version_required');
    if(!['spotReferencePath','spotAssessmentsPath'].every(key=>typeof entry[key]==='string'&&entry[key].trim()))throw new Error('scoped_spot_audit_required');
    const [spotReference,spotAssessments]=await Promise.all([read('spotReferencePath'),read('spotAssessmentsPath')]);
    const audit=evaluateNuknukAudit(report,reference,assessments);
    const spotAudit=evaluateNuknukSpotAudit(report,spotReference,spotAssessments);
    cases.push({category:entry.category,report,audit,spotAudit});
  }
  return evaluateNuknukCohort(cases);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [manifestPath,outputPath]=process.argv.slice(2);
    if(!manifestPath||!outputPath)throw new Error('usage: node nuknuk-readiness.mjs COHORT_MANIFEST OUTPUT_JSON');
    const result=await assessCohort(manifestPath);
    await writeFile(resolve(outputPath),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
    if(!result.readyForUnattendedDrafts)process.exitCode=2;
  }catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
