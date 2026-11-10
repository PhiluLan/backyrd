// Target-free orchestration of the canonical Decision composition. No corpus,
// gold targets, author notes or teaching examples are imported here.
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {validateNuknukUnderstanding} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {validateNuknukSearchPlan,buildNuknukExperienceProposalRequest,validateNuknukExperienceProposal,bindNuknukAdviceRun} from '../../../packages/decision-vnext-core/dist/nuknuk-experience-advice.js';
import {exercise} from '../../../packages/decision-vnext-core/test/librarian-active-route-fixtures.mjs';

/** A genuine rollout calls each supplied model phase with only its visible
 * input. No gold understanding/plan/answer is injected into downstream stages.
 * The local corpus builder separately uses authored gold to isolate capabilities. */
export async function executeAdviceChain({query,reference,catalog,interpret,planSearch,propose,toolState=null}){
 const understanding=await interpret({query,reference});
 const understood=validateNuknukUnderstanding(understanding,{query,reference});
 const input={query,reference,understanding:understood.output};
 const plan=await planSearch(input);
 const compiled=validateNuknukSearchPlan(plan,input),proofs=[],runs=[];
 for(const branch of compiled.branches){
  let response=null,state='OK',captured=null,status=null;
  if(toolState==='TOOL_ERROR')state='TOOL_ERROR';
  else if(!branch.request)state='NEEDS_CLARIFICATION';
  else{
   const http=await exercise({text:query,meaning:branch.request,understandOverride:async()=>branch.request,catalog,onSearch:value=>captured=value,
    runtimeReference:reference,runtimeAuthority:{city:'Basel',now:reference.now}});
   status=http.status;
   if(http.status!==200)throw Error('advice_canonical_http_failure:'+http.status+':'+JSON.stringify(http.body));
   response=http.body;
  }
  runs.push(bindNuknukAdviceRun(branch,state,response));
  proofs.push({directionId:branch.directionId,state,httpStatus:status,runtimeAuthority:{city:'Basel',now:reference.now},branchRequestHash:branch.branchRequestHash,
   originalMeaningHash:branch.originalMeaningHash,responseHash:contentHash(response),
   selectionAuthority:branch.selectionAuthority,selectionFacts:branch.selectionFacts,
   originalFactsPreserved:branch.originalFactsPreserved,canonicalRequest:branch.request,
   ranked:captured?.ranked.map(c=>({spotId:c.spotId,status:c.status,facts:c.facts,unknownFactIds:c.unknownFactIds,failedFactIds:c.failedFactIds}))??[],
   excluded:captured?.excluded.map(c=>({spotId:c.spotId,status:c.status,facts:c.facts,unknownFactIds:c.unknownFactIds,failedFactIds:c.failedFactIds}))??[],
   evidenceQuestionsExecuted:false,evidenceQuestions:branch.evidenceQuestions});
 }
 const proposalRequest=buildNuknukExperienceProposalRequest({...input,plan,runs});
 const raw=await propose(proposalRequest);
 const output=validateNuknukExperienceProposal(raw,proposalRequest).output;
 return{understanding:understood.output,plan,runs,proposalRequest,output,proofs};
}
