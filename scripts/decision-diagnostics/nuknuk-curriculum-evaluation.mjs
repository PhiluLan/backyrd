#!/usr/bin/env node
// Freeze model-visible requests and split IDs. Targets stay local for scoring.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';
import {buildNuknukUnderstandingRequest} from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
const [source,python,output]=process.argv.slice(2);if(!output)throw Error('curriculum_eval_arguments_required');
const dataset=JSON.parse(await readFile(resolve(source,'reviewed-backyrd.json')));
const selected=dataset.cases.filter(r=>r.id.startsWith('r4-')&&r.split!=='TRAIN');
if(selected.length!==400)throw Error('curriculum_eval_inventory_changed');
const grammarCache=new Map();const cases=[];
for(const row of selected){const request=buildNuknukUnderstandingRequest({...row.content,instructionProfile:'COMPACT_ADAPTER_V3'});const schemaHash=contentHash(request.outputSchema);if(!grammarCache.has(schemaHash))grammarCache.set(schemaHash,request.outputSchema);cases.push({id:row.id,query:row.content.query,split:row.split,scenarioGroup:row.scenarioGroup,messages:[{role:'system',content:request.instructions},{role:'user',content:request.input}],promptHash:contentHash(request.instructions),inputHash:contentHash(request.input),schemaHash});}
const schemas=[...grammarCache.entries()];const grammars=JSON.parse(execFileSync(python,['-B','-c',`import json,sys,llguidance,importlib.metadata
assert importlib.metadata.version('llguidance')=='1.9.1'
c=llguidance.JsonCompiler(separators=(', ', ': '),whitespace_pattern='')
print(json.dumps([c.compile(json.dumps(s)) for s in json.load(sys.stdin)]))`],{encoding:'utf8',input:JSON.stringify(schemas.map(([,s])=>s))}));
const byHash=Object.fromEntries(schemas.map(([hash],i)=>[hash,grammars[i]]));
await writeFile(resolve(output),JSON.stringify({version:1,purpose:'FROZEN_CURRICULUM_EVALUATION_INPUTS_ONLY',datasetHash:contentHash(dataset),llguidanceVersion:'1.9.1',maxOutputTokens:2048,grammars:byHash,cases},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({cases:cases.length,grammarCount:schemas.length,targetsIncluded:false}));
