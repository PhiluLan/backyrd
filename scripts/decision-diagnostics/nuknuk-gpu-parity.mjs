#!/usr/bin/env node
// Freeze a comparison against real Mac responses; no model, cloud or training call.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildNuknukUnderstandingRequest} from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {contentHash} from '../../packages/decision-vnext-core/dist/canonical.js';

const [dataDirectory,baselineDirectory,python,outputFile]=process.argv.slice(2);
if(!dataDirectory||!baselineDirectory||!python||!outputFile)throw Error('nuknuk_parity_arguments_required');
const parent='cd0735f6cc576df3386ca0254d08d3db7e976f0711a6fad7bf900777a0f180b3';
const digest=value=>createHash('sha256').update(value).digest('hex');
const dataset=JSON.parse(await readFile(resolve(dataDirectory,'reviewed-backyrd.json'),'utf8'));
const rows=dataset.cases.filter(row=>row.split==='TRAIN');
if(rows.length!==6)throw Error('nuknuk_parity_cohort_changed');
const cases=[];
for(const row of rows){
  const request=buildNuknukUnderstandingRequest({...row.content,instructionProfile:'COMPACT_ADAPTER_V3'});
  const bytes=await readFile(resolve(baselineDirectory,row.id+'.json'));
  const mac=JSON.parse(bytes.toString());
  if(mac.adapterHash!==parent||mac.query!==row.content.query||mac.promptHash!==contentHash(request.instructions)
      ||mac.inputHash!==contentHash(request.input)||mac.metadata?.finishReason!=='stop'||!mac.raw)
    throw Error('nuknuk_parity_mac_identity_or_inputs_changed');
  cases.push({id:row.id,query:row.content.query,messages:[{role:'system',content:request.instructions},{role:'user',content:request.input}],
    promptHash:mac.promptHash,inputHash:mac.inputHash,schemaHash:contentHash(request.outputSchema),
    outputSchema:request.outputSchema,macResponseFileSha256:digest(bytes),macInputTokens:mac.metadata.usage.prompt_tokens});
}
const compiled=JSON.parse(execFileSync(python,['-B','-c',`
import importlib.metadata,json,sys
import llguidance
assert importlib.metadata.version('llguidance')=='1.9.1'
compiler=llguidance.JsonCompiler(separators=(', ', ': '),whitespace_pattern='')
print(json.dumps([compiler.compile(json.dumps(schema)) for schema in json.load(sys.stdin)]))
`],{input:JSON.stringify(cases.map(row=>row.outputSchema)),encoding:'utf8'}));
for(const [index,row] of cases.entries()){row.grammar=compiled[index];delete row.outputSchema;}
const plan={version:1,purpose:'KNOWN_CASE_RUNTIME_PARITY_NOT_GENERALIZATION',parentAdapterSha256:parent,
  llguidanceVersion:'1.9.1',maxOutputTokens:2048,temperature:0,enableThinking:false,
  macBaselineDirectory:resolve(baselineDirectory),macBaselineIsHistorical:true,trainingExecuted:false,
  cases};
// No expected answers or previous responses are placed in the GPU's prompt.
await writeFile(resolve(outputFile),JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({cases:cases.length,sameMacPromptsVerified:true,parentAdapterSha256:parent,
  file:resolve(outputFile),sha256:digest(await readFile(resolve(outputFile))),trainingExecuted:false}));
