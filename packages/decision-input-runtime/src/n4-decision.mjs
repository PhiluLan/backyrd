import { createHash } from "node:crypto";

export const N4_DECISION_VERSION = "backyrd-n4-decision-serialization-v1";
const canonical = (value) => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonical(value[key])])) : value;
const hash = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const bounded = (value) => Number.isFinite(Number(value)) ? Math.max(0,Math.min(1,Number(value))) : null;

export function serializeCandidateN4(candidate,n4) {
  const concepts = Object.entries(n4?.concepts ?? {}).map(([concept,value])=>({concept,presence:bounded(value.presence),confidence:bounded(value.confidence),provenanceIdentity:value.provenance ?? null})).filter((row)=>row.presence!==null&&row.confidence!==null).sort((a,b)=>a.concept.localeCompare(b.concept));
  const availability = !n4?.available || concepts.length===0 ? "UNKNOWN" : n4.placeType && n4.snapshotIdentity ? "FULL" : "PARTIAL";
  const body = {
    version:N4_DECISION_VERSION,
    spotId:candidate.spotId,
    availability,
    placeType:n4?.placeType ?? null,
    concepts,
    snapshotIdentity:n4?.snapshotIdentity ?? null,
    freshness:n4?.freshness ?? null,
    productFacts:{city:candidate.city,category:candidate.category,placeType:candidate.productPlaceType,openNow:candidate.openNow},
    boundaries:{legacySubstitution:false,commercialSignals:false,rankingInfluence:"NONE"},
  };
  return {...body,snapshotHash:hash(body)};
}
