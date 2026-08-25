import { createHash } from "node:crypto";
import { CANONICAL_OFFERINGS,CANONICAL_PURPOSES,OFFERING_CONTRACT_VERSION,OFFERING_STATES,PURPOSE_STATES,expandOfferingHierarchy } from "../../canonical-semantics/src/index.mjs";

export const OFFERING_DECISION_VERSION="backyrd-offering-decision-serialization-v1";
const canonical=(value)=>value&&typeof value==="object"?(Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonical(value[key])]))):value;
const hash=(value)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const bounded=(value)=>Number.isFinite(Number(value))?Math.max(0,Math.min(1,Number(value))):null;

function rows(value,allowed,states){
  const source=value?.value&&typeof value.value==="object"?value.value:{};
  return Object.fromEntries(Object.entries(source).filter(([key,state])=>allowed.includes(key)&&states.includes(state)).map(([key,state])=>[key,state]).sort(([a],[b])=>a.localeCompare(b)));
}

export function serializeCandidateOffering(candidate,value={}){
  const offerings=rows(value.offerings,CANONICAL_OFFERINGS,OFFERING_STATES);
  const purposes=rows(value.purposes,CANONICAL_PURPOSES,PURPOSE_STATES);
  const explicitlyAvailable=Object.entries(offerings).filter(([,state])=>state==="AVAILABLE").map(([key])=>key);
  const availableWithAncestors=expandOfferingHierarchy(explicitlyAvailable);
  const hasKnownTruth=[...Object.values(offerings),...Object.values(purposes)].some((state)=>state!=="UNKNOWN");
  const body={
    version:OFFERING_DECISION_VERSION,contractVersion:OFFERING_CONTRACT_VERSION,spotId:candidate.spotId,
    availability:hasKnownTruth?"KNOWN":"UNKNOWN",
    offerings,purposes,availableWithAncestors,
    sourceIdentity:value.sourceIdentity??null,observedAt:value.observedAt??null,confidence:bounded(value.confidence),
    boundaries:{independentFromN4:true,userTaste:false,placeTypeInference:false,displayFactsReinterpreted:false},
  };
  return {...body,snapshotHash:hash(body)};
}
