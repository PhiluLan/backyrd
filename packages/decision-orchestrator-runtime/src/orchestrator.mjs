import { contentHash } from "../../decision-input-runtime/src/package.mjs";
import { deterministicDecisionStrategy,DETERMINISTIC_RANKING_VERSION,REASON_AUTHORIZATION_VERSION } from "./ranking.mjs";

export const DECISION_RESPONSE_VERSION="backyrd-deterministic-decision-response-v1";
export const DECISION_RESPONSE_VALIDATION_VERSION="backyrd-deterministic-response-validation-v1";
const forbidden=new Set(["payment","subscription","ownertier","ownerplan","commercialpriority","sponsoredboost","profilecompletenessboost","latenttruth","groundtruth","rankingscore"]);
const hasForbidden=(value)=>value&&typeof value==="object"&&Object.entries(value).some(([key,child])=>forbidden.has(key.replace(/[^a-z]/gi,"").toLowerCase())||hasForbidden(child));

export function validateDeterministicDecision({response,internal,decisionPackage,expectedUserId}) {
  if(response.version!==DECISION_RESPONSE_VERSION||response.resultSource!=="DETERMINISTIC_NORTH_STAR")throw new Error("deterministic_response_version_invalid");
  if(expectedUserId!==decisionPackage.userId||internal.userId!==expectedUserId)throw new Error("deterministic_response_cross_user");
  if(response.decisionId!==decisionPackage.decisionId||internal.decisionId!==response.decisionId)throw new Error("deterministic_response_identity_invalid");
  if(response.spots.length!==Math.min(3,decisionPackage.candidates.length)||new Set(response.spots.map((x)=>x.spotId)).size!==response.spots.length)throw new Error("deterministic_response_result_count_invalid");
  const frozen=new Set(decisionPackage.candidates.map((x)=>x.spotId));
  for(const [index,spot] of response.spots.entries()){
    if(spot.rank!==index+1||!frozen.has(spot.spotId))throw new Error("deterministic_response_candidate_invalid");
    const authorized=internal.authorizedReasons[spot.spotId]??[];
    if(!authorized.some((reason)=>reason.id===spot.reasonId&&reason.copy===spot.explanation))throw new Error("deterministic_response_reason_unauthorized");
    if(response.knowledgeMode==="LOW_OR_UNKNOWN"&&authorized.find((reason)=>reason.id===spot.reasonId)?.type==="WHY_FOR_YOU")throw new Error("deterministic_response_low_personal_reason");
  }
  if(hasForbidden({response,internal}))throw new Error("deterministic_response_commercial_or_truth_field");
  for(const candidate of decisionPackage.candidates){const reasons=internal.authorizedReasons[candidate.spotId]??[];if(contentHash(reasons)!==internal.reasonSetHashes[candidate.spotId])throw new Error("deterministic_response_reason_hash_invalid");}
  if(JSON.stringify(internal.finalOrder)!==JSON.stringify(response.spots.map((spot)=>spot.spotId)))throw new Error("deterministic_response_final_order_invalid");
  const body={...response};delete body.responseHash;if(contentHash(body)!==response.responseHash)throw new Error("deterministic_response_hash_invalid");
  if(internal.packageHash!==decisionPackage.packageHash||internal.candidateSetHash!==decisionPackage.candidateSet.candidateSetHash)throw new Error("deterministic_response_trace_mismatch");
  return {version:DECISION_RESPONSE_VALIDATION_VERSION,valid:true,disposition:"COMPLETE_VALID"};
}

export function buildDeterministicDecision(decisionPackage,spotCards,{expectedUserId}={}) {
  const started=performance.now();
  if(!decisionPackage||decisionPackage.userId!==expectedUserId)throw new Error("deterministic_orchestrator_identity_invalid");
  const cards=new Map(spotCards.map((card)=>[card.spotId,card]));
  if(cards.size!==decisionPackage.candidates.length||decisionPackage.candidates.some((candidate)=>!cards.has(candidate.spotId)))throw new Error("deterministic_orchestrator_spot_cards_incomplete");
  const strategy=deterministicDecisionStrategy(decisionPackage);
  const responseBody={version:DECISION_RESPONSE_VERSION,decisionId:decisionPackage.decisionId,resultSource:"DETERMINISTIC_NORTH_STAR",knowledgeMode:decisionPackage.n5.knowledgeMode,spots:strategy.selected.map((row)=>({spotId:row.candidate.spotId,rank:row.rank,name:cards.get(row.candidate.spotId).name,city:cards.get(row.candidate.spotId).city,category:cards.get(row.candidate.spotId).category,headerPhotoPath:cards.get(row.candidate.spotId).headerPhotoPath,explanation:row.explanation,reasonId:row.selectedReasonId,degraded:{n4:row.candidate.n4.availability}})),fallback:{n6Used:false,strategy:"DETERMINISTIC",candidateCount:decisionPackage.candidates.length,returnedCount:strategy.selected.length}};
  const response={...responseBody,responseHash:contentHash(responseBody)};
  const internal={decisionId:decisionPackage.decisionId,userId:decisionPackage.userId,packageHash:decisionPackage.packageHash,candidateSetHash:decisionPackage.candidateSet.candidateSetHash,rankingVersion:DETERMINISTIC_RANKING_VERSION,reasonVersion:REASON_AUTHORIZATION_VERSION,rankingHash:strategy.rankingHash,rankingInputs:Object.fromEntries(strategy.allRanked.map(({candidate,ranking})=>[candidate.spotId,ranking.inputs])),authorizedReasons:Object.fromEntries(strategy.allRanked.map(({candidate,reasons})=>[candidate.spotId,reasons])),reasonSetHashes:strategy.reasonSetHashes,fullOrder:strategy.allRanked.map(({candidate})=>candidate.spotId),finalOrder:response.spots.map((spot)=>spot.spotId)};
  const validation=validateDeterministicDecision({response,internal,decisionPackage,expectedUserId});
  return {response,internal,validation,performance:{rankingReasonValidationMs:Number((performance.now()-started).toFixed(3))}};
}
