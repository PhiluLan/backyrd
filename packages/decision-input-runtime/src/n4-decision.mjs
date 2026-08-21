import { createHash } from "node:crypto";
import { FACT_KEYS,SEMANTIC_CONTRACT_VERSION } from "../../canonical-semantics/src/index.mjs";

export const N4_DECISION_VERSION = "backyrd-n4-decision-serialization-v2";
const canonical = (value) => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonical(value[key])])) : value;
const hash = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const bounded = (value) => Number.isFinite(Number(value)) ? Math.max(0,Math.min(1,Number(value))) : null;
const allowedFacts=new Set(Object.values(FACT_KEYS));

function serializeSuitability(value){
  return Object.fromEntries(Object.entries(value??{}).filter(([key,row])=>allowedFacts.has(key)&&row&&typeof row==="object"&&row.sourceIdentity).map(([key,row])=>[key,{value:canonical(row.value),status:row.status??"ACTIVE",confidence:bounded(row.confidence),sourceIdentity:String(row.sourceIdentity),observedAt:row.observedAt??null,contractVersion:row.contractVersion??SEMANTIC_CONTRACT_VERSION}]).filter(([,row])=>row.confidence!==null).sort(([a],[b])=>a.localeCompare(b)));
}

export function serializeCandidateN4(candidate,n4) {
  const concepts = Object.entries(n4?.concepts ?? {}).map(([concept,value])=>({concept,presence:bounded(value.presence),confidence:bounded(value.confidence),provenanceIdentity:value.provenance ?? null})).filter((row)=>row.presence!==null&&row.confidence!==null).sort((a,b)=>a.concept.localeCompare(b.concept));
  const suitabilityFacts=serializeSuitability(n4?.suitabilityFacts);
  const availability = !n4?.available || (concepts.length===0&&Object.keys(suitabilityFacts).length===0) ? "UNKNOWN" : n4.placeType && n4.snapshotIdentity ? "FULL" : "PARTIAL";
  const body = {
    version:N4_DECISION_VERSION,
    spotId:candidate.spotId,
    availability,
    placeType:n4?.placeType ?? null,
    concepts,
    suitabilityFacts,
    snapshotIdentity:n4?.snapshotIdentity ?? null,
    freshness:n4?.freshness ?? null,
    productFacts:{city:candidate.city,category:candidate.category,placeType:candidate.productPlaceType,openNow:candidate.openNow},
    semanticContractVersion:SEMANTIC_CONTRACT_VERSION,
    boundaries:{legacySubstitution:false,commercialSignals:false,derivedConfidenceEditable:false},
  };
  return {...body,snapshotHash:hash(body)};
}
