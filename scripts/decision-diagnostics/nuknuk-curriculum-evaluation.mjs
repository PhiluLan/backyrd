#!/usr/bin/env node
// Freeze model-visible requests and split IDs. Targets stay local for scoring.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {buildMetamorphicControls} from './nuknuk-curriculum/methodology.mjs';
import {buildUnderstandingCasePair} from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';
const [source,python,output,scope='base']=process.argv.slice(2);if(!output||!['base','controls'].includes(scope))throw Error('curriculum_eval_arguments_required');
const manifest=JSON.parse(await readFile(resolve(source,'manifest.json')));
const instructionProfile=manifest.instructionProfile??'COMPACT_ADAPTER_V3';
if(!['COMPACT_ADAPTER_V3','COMPACT_ADAPTER_V4','SPOT_GROUNDED_V5','SPOT_GROUNDED_V6'].includes(instructionProfile))throw Error('curriculum_profile_invalid');
const dataset=JSON.parse(await readFile(resolve(source,'reviewed-backyrd.json')));
if(contentHash(dataset)!==manifest.datasetHash)throw Error('curriculum_dataset_changed');
const round5=manifest.round===5;
const solid=['backyrd.nuknuk-solid-curriculum@1','backyrd.nuknuk-solid-curriculum@2','backyrd.nuknuk-solid-curriculum@3','backyrd.nuknuk-solid-curriculum@4','backyrd.nuknuk-solid-curriculum@5','backyrd.nuknuk-solid-curriculum@6','backyrd.nuknuk-solid-curriculum@7'].includes(manifest.curriculumVersion);
const selected=dataset.cases.filter(r=>(solid||r.id.startsWith(round5?'r5-':'r4-'))&&r.split!=='TRAIN');
if(selected.length!==(solid?manifest.counts.VALIDATION+manifest.counts.TEST:round5?40:400))throw Error('curriculum_eval_inventory_changed');
const grammarCache=new Map();const cases=[];
if(scope==='base')for(const row of selected){const {request}=buildUnderstandingCasePair(row.content,instructionProfile);const schemaHash=contentHash(request.outputSchema);if(!grammarCache.has(schemaHash))grammarCache.set(schemaHash,request.outputSchema);cases.push({id:row.id,task:row.content.task,query:row.content.query,split:row.split,scenarioGroup:row.scenarioGroup,messages:[{role:'system',content:request.instructions},{role:'user',content:request.input}],promptHash:contentHash(request.instructions),inputHash:contentHash(request.input),schemaHash});}
else{
 const controls=buildMetamorphicControls(dataset);
 if(contentHash(controls)!==manifest.derivedControlsHash)throw Error('curriculum_controls_changed');
 const frozen=JSON.parse(await readFile(resolve(source,'metamorphic-evaluation-inputs.json')));
 const expected=controls.cases.map(({expected,proof,...request})=>request);
 if(frozen.datasetHash!==manifest.datasetHash||contentHash(frozen.cases)!==contentHash(expected))throw Error('curriculum_control_inputs_changed');
 for(const {outputSchema,...request}of frozen.cases){grammarCache.set(request.schemaHash,outputSchema);cases.push(request);}
}
const schemas=[...grammarCache.entries()];const grammars=JSON.parse(execFileSync(python,['-B','-c',`import json,sys,llguidance,importlib.metadata
assert importlib.metadata.version('llguidance')=='1.9.1'
c=llguidance.JsonCompiler(separators=(', ', ': '),whitespace_pattern='')
print(json.dumps([c.compile(json.dumps(s)) for s in json.load(sys.stdin)]))`],{encoding:'utf8',input:JSON.stringify(schemas.map(([,s])=>s))}));
const byHash=Object.fromEntries(schemas.map(([hash],i)=>[hash,grammars[i]]));
await writeFile(resolve(output),JSON.stringify({version:1,purpose:scope==='base'?'FROZEN_CURRICULUM_EVALUATION_INPUTS_ONLY':'DERIVED_METAMORPHIC_EVALUATION_INPUTS_ONLY',datasetHash:contentHash(dataset),...(scope==='controls'?{independentSamples:false,controlsHash:manifest.derivedControlsHash}:{}),llguidanceVersion:'1.9.1',maxOutputTokens:2048,grammars:byHash,cases},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({cases:cases.length,grammarCount:schemas.length,targetsIncluded:false}));
