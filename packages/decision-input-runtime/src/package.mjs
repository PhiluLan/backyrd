import { createHash } from "node:crypto";
import { buildProductCurrentMoment } from "./current-moment.mjs";
import { buildColdUserCard,buildProductProjection } from "./projection.mjs";
import { serializeCandidateN4,N4_DECISION_VERSION } from "./n4-decision.mjs";
import { serializeCandidateOffering,OFFERING_DECISION_VERSION } from "./offering-decision.mjs";
import { SEMANTIC_CONTRACT_VERSION } from "../../canonical-semantics/src/index.mjs";

export const DECISION_INPUT_PACKAGE_VERSION = "backyrd-decision-input-package-v4";
export const DECISION_INPUT_VALIDATION_VERSION = "backyrd-decision-input-validation-v1";
const canonical = (value) => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonical(value[key])])) : value;
export const contentHash = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const normalize = (value) => String(value ?? "").trim().toLowerCase();
const forbiddenKey = /^(payment|paymentState|subscription|subscriptionTier|ownerPlan|ownerTier|commercialPriority|sponsoredBoost|profileCompletenessBoost|evidenceRefs|latentTruth|groundTruth)$/i;

function hasForbiddenKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key,child])=>forbiddenKey.test(key)||hasForbiddenKey(child));
}

function eligibleCandidates(source,currentMoment) {
  const constraints = currentMoment.fields.explicit_constraints?.value ?? {};
  const city = normalize(currentMoment.fields.city?.value);
  const required = new Set((constraints.requiredPlaceTypes ?? []).map(normalize));
  const excluded = new Set((constraints.excludedPlaceTypes ?? []).map(normalize));
  const audit = source.candidates.map((candidate)=>{
    const reasons=[];
    if(candidate.status!=="approved")reasons.push("PRODUCT_NOT_APPROVED");
    if(candidate.distributionEligible!==true)reasons.push("DISTRIBUTION_INELIGIBLE");
    if(city&&normalize(candidate.city)!==city)reasons.push("CITY_MISMATCH");
    if(required.size&&!required.has(normalize(candidate.productPlaceType)))reasons.push("REQUIRED_PLACE_TYPE_MISMATCH");
    if(excluded.has(normalize(candidate.productPlaceType)))reasons.push("EXCLUDED_PLACE_TYPE");
    if(constraints.openNow===true&&candidate.openNow!==true)reasons.push(candidate.openNow===false?"CLOSED_NOW":"OPENING_STATUS_UNKNOWN");
    return {spotId:candidate.spotId,retrievalPosition:candidate.retrievalPosition,eligible:reasons.length===0,reasons};
  });
  return {eligible:source.candidates.filter((candidate)=>audit.find((row)=>row.spotId===candidate.spotId)?.eligible),audit};
}

export function validateDecisionInputPackage(value,{expectedUserId}={}) {
  if(!value||value.version!==DECISION_INPUT_PACKAGE_VERSION)throw new Error("decision_input_version_invalid");
  if(expectedUserId&&value.userId!==expectedUserId)throw new Error("decision_input_cross_user");
  if(value.n3.currentMoment.userId!==value.userId||value.n5.userId!==value.userId)throw new Error("decision_input_identity_mismatch");
  if(value.n3.currentMoment.decisionId!==value.decisionId||value.n5.decisionId!==value.decisionId)throw new Error("decision_input_decision_mismatch");
  const ids=value.candidates.map((candidate)=>candidate.spotId);
  if(ids.length>50||new Set(ids).size!==ids.length)throw new Error("decision_input_candidate_identity_invalid");
  if(value.candidates.some((candidate)=>candidate.eligible!==true||candidate.n4.spotId!==candidate.spotId||candidate.offering.spotId!==candidate.spotId))throw new Error("decision_input_ineligible_candidate");
  if(hasForbiddenKey(value))throw new Error("decision_input_forbidden_field");
  const body={...value};delete body.packageHash;
  if(contentHash(body)!==value.packageHash)throw new Error("decision_input_hash_invalid");
  return {version:DECISION_INPUT_VALIDATION_VERSION,valid:true,disposition:"VALID"};
}

export function buildDecisionInputPackage(source) {
  if(!source?.decision?.id||!source.decision.userId)throw new Error("decision_source_invalid");
  const started=performance.now();
  const n3=buildProductCurrentMoment(source);
  const n3Done=performance.now();
  const card=source.userCard??buildColdUserCard(source.decision.userId);
  if(card.userId!==source.decision.userId)throw new Error("decision_source_cross_user_card");
  const n5=buildProductProjection({userCard:card,currentMoment:n3.result.currentMoment,requestContext:source.requestContext});
  const n5Done=performance.now();
  const eligibility=eligibleCandidates(source,n3.result.currentMoment);
  const candidates=eligibility.eligible.sort((a,b)=>a.retrievalPosition-b.retrievalPosition).map((candidate)=>{
    const n4=serializeCandidateN4(candidate,source.n4BySpot[candidate.spotId]);
    const offering=serializeCandidateOffering(candidate,source.offeringBySpot?.[candidate.spotId]);
    return {spotId:candidate.spotId,retrievalPosition:candidate.retrievalPosition,eligible:true,n4,offering};
  });
  const candidateSetBody={decisionId:source.decision.id,candidates:candidates.map(({spotId,retrievalPosition,n4,offering})=>({spotId,retrievalPosition,n4SnapshotHash:n4.snapshotHash,offeringSnapshotHash:offering.snapshotHash}))};
  const body={
    version:DECISION_INPUT_PACKAGE_VERSION,
    decisionId:source.decision.id,userId:source.decision.userId,requestIdentity:{version:source.requestVersion??"decision-v13-product-context-v1",source:"decision-v13-impressions"},
    n3:{currentMoment:n3.result.currentMoment,momentHash:n3.result.currentMoment.momentHash,contractHash:n3.n3ContractHash},
    n5:n5.projection,
    candidateSet:{candidateSetHash:contentHash(candidateSetBody),count:candidates.length,source:"EXISTING_V13_IMPRESSIONS",openingHoursPolicy:"EXPLICIT_OPEN_NOW_EXCLUDES_FALSE_AND_UNKNOWN"},
    candidates,
    retrievalMetadata:{originalCount:source.candidates.length,eligibleCount:candidates.length,orderAuthority:"V13_RETRIEVAL_POSITION"},
    contractIdentities:{semantics:SEMANTIC_CONTRACT_VERSION,n3Product:n3.inputVersion,n4:N4_DECISION_VERSION,offering:OFFERING_DECISION_VERSION,n5Projection:n5.contractHashes.projection,n5Sufficiency:n5.contractHashes.sufficiency},
    createdAt:source.decision.createdAt,
    boundaries:{n6:"NOT_AUTHORIZED",rankingMutation:false,rawUserHistory:false,commercialSignals:false,latentTruthIncluded:false},
  };
  const packageValue={...body,packageHash:contentHash(body)};
  const packageDone=performance.now();
  const validation=validateDecisionInputPackage(packageValue,{expectedUserId:source.decision.userId});
  return {package:packageValue,validation,eligibilityAudit:eligibility.audit,n3,n5,userCardSource:source.userCard?"LATEST_CANONICAL_SNAPSHOT":"COLD_USER",performance:{n3BuildMs:Number((n3Done-started).toFixed(3)),n5ProjectionMs:Number((n5Done-n3Done).toFixed(3)),candidateFreezeAndSerializationMs:Number((packageDone-n5Done).toFixed(3)),packageValidationMs:Number((performance.now()-packageDone).toFixed(3))}};
}
