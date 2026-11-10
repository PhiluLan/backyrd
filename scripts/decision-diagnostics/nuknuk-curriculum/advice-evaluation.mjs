// Target-free sequential evaluation driver. Transport is supplied explicitly;
// importing this module never loads weights, starts resources or calls a model.
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {buildNuknukUnderstandingRequest} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {buildNuknukSearchPlanRequest} from '../../../packages/decision-vnext-core/dist/nuknuk-experience-advice.js';
import {executeAdviceChain} from './advice-execution.mjs';

export async function evaluateAdviceRollouts({inputs,datasetHash,modelIdentity,frozenSelection=null,modelCall,maximumModelCalls,onEvidence=async()=>{}}){
 if(!/^[a-f0-9]{64}$/.test(datasetHash??''))throw Error('advice_rollout_dataset_binding_required');
 if(!/^[a-f0-9]{64}$/.test(modelIdentity?.adapterHash??''))throw Error('advice_rollout_model_identity_required');
 if(!Number.isInteger(maximumModelCalls)||maximumModelCalls<1||maximumModelCalls>108)throw Error('advice_model_call_bound_invalid');
 if(!inputs.length||inputs.length>36||new Set(inputs.map(c=>c.id)).size!==inputs.length)throw Error('advice_rollout_inventory_invalid');
 if(inputs.some(c=>!['VALIDATION','TEST'].includes(c.split)))throw Error('advice_rollout_holdout_only');
 if(new Set(inputs.map(c=>c.split)).size!==1)throw Error('advice_rollout_one_split_only');
 if(inputs[0].split==='TEST'&&(!frozenSelection||frozenSelection.datasetHash!==datasetHash
  ||!['adapterHash','developmentReportHash'].every(k=>/^[a-f0-9]{64}$/.test(frozenSelection[k]??''))
  ||frozenSelection.adapterHash!==modelIdentity.adapterHash
  ||!Number.isFinite(Date.parse(frozenSelection.frozenAt))))throw Error('advice_test_requires_frozen_development_selection');
 if(inputs.length*3>maximumModelCalls)throw Error('advice_rollout_call_reserve_insufficient');
 let calls=0;const results=[];
 for(const item of inputs){
  const phases=[];
  const call=async(task,request)=>{
   if(calls>=maximumModelCalls)throw Error('advice_model_call_bound_reached');
   calls++;
   const generated=await modelCall({task,instructions:request.instructions,input:request.input,outputSchema:request.outputSchema});
   if(generated?.modelIdentity?.adapterHash!==modelIdentity.adapterHash)throw Error('advice_rollout_actual_adapter_mismatch');
   const raw=generated.raw;
   const evidence={caseId:item.id,task,modelIdentity:{adapterHash:generated.modelIdentity.adapterHash},requestHash:contentHash({instructions:request.instructions,input:request.input,outputSchema:request.outputSchema}),rawOutputHash:contentHash(raw),raw};
   phases.push(evidence);await onEvidence(evidence);return raw;
  };
  try{
   const chain=await executeAdviceChain({...item,
    interpret:async input=>call('INTERPRET_REQUEST',buildNuknukUnderstandingRequest({...input,instructionProfile:'SPOT_GROUNDED_V6'})),
    planSearch:async input=>call('PLAN_SEARCH',buildNuknukSearchPlanRequest(input)),
    propose:async request=>call('PROPOSE_EXPERIENCE',request)});
   const result={id:item.id,split:item.split,status:'COMPLETED_REQUIRES_SEMANTIC_REVIEW',phases,output:chain.output,proofs:chain.proofs};
   results.push(result);await onEvidence(result);
  }catch(error){
   const result={id:item.id,split:item.split,status:'FAILED_CHAIN',phases,error:error instanceof Error?error.message:'UNKNOWN_ERROR'};
   results.push(result);await onEvidence(result);
   if(result.error==='advice_rollout_actual_adapter_mismatch')throw error;
  }
 }
 return{purpose:'ACTUAL_SEQUENTIAL_OUTPUTS_NOT_GOLD_REPLAY',datasetHash,modelIdentity:{adapterHash:modelIdentity.adapterHash},selectionHash:frozenSelection?contentHash(frozenSelection):null,calls,maximumModelCalls,results,
  failed:results.filter(r=>r.status==='FAILED_CHAIN').length,semanticSuccess:null,
  limitations:['Completion and valid references do not certify meaning or usefulness. Review every output.',
   'DEV alone selects. TEST requires a previously frozen selection and never returns to training.',
   'This driver does not authorize a cloud launch or replace provider cost watchers.']};
}
