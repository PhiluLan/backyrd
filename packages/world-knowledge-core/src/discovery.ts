import { canonicalJson, hashBody } from "./canonical.js";
import { array, boolean, enumValue, number, object, required, string, timestamp } from "./schema.js";

export const DISCOVERY_PROFILE_VERSION = "backyrd.world-knowledge.discovery-profile@1.0" as const;
export const DISCOVERY_KINDS = ["VISIT", "OFFERING", "ATMOSPHERE", "SETTING", "FEATURE"] as const;
export type DiscoveryKind = typeof DISCOVERY_KINDS[number];
export type DiscoveryPrice = { readonly currency: string; readonly min: number; readonly max: number; readonly basis: "PER_PERSON" | "PER_GROUP"; readonly mandatoryFeesIncluded: boolean | null };
export type DiscoveryOffering = { readonly id: string; readonly name: string; readonly description: string; readonly price: DiscoveryPrice | null };
export type DiscoveryAssertion = { readonly id: string; readonly kind: DiscoveryKind; readonly concepts: readonly string[]; readonly offeringId: string | null; readonly state: "PRESENT" | "ABSENT"; readonly evidence: string; readonly conditions: string | null; readonly validFrom: string | null; readonly validUntil: string | null };
export type DiscoveryProfile = { readonly contractVersion: typeof DISCOVERY_PROFILE_VERSION; readonly description: string; readonly offerings: readonly DiscoveryOffering[]; readonly assertions: readonly DiscoveryAssertion[]; readonly reviewed: boolean };
export const discoveryTerm = (value: string): string => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[_-]/gu, " ").replace(/\s+/gu, " ").trim();
const id = (value: unknown, path: string) => string(value, path, { min: 1, max: 60, pattern: /^[a-zA-Z0-9_-]+$/ });
const nullableDate = (value: unknown, path: string) => value === null ? null : timestamp(value, path);
export function parseDiscoveryProfile(value: unknown, requireReviewed = true): DiscoveryProfile {
  const row = object(value, "discovery", ["contractVersion", "description", "offerings", "assertions", "reviewed"]);
  if (row.contractVersion !== DISCOVERY_PROFILE_VERSION) throw new Error("discovery_version_invalid");
  const description = string(required(row,"description","discovery"),"discovery.description",{min:1,max:12000});
  const offerings = array(row.offerings,"discovery.offerings",{max:30}).map((input,i):DiscoveryOffering => {
    const p = `discovery.offerings[${i}]`, o = object(input,p,["id","name","description","price"]);
    let price:DiscoveryPrice|null = null;
    if(o.price !== null){ const v=object(o.price,p+".price",["currency","min","max","basis","mandatoryFeesIncluded"]);
      const min=number(v.min,p+".min",{min:0,max:100000}), max=number(v.max,p+".max",{min:0,max:100000});
      if(min>max || [min,max].some(n=>Math.abs(n*100-Math.round(n*100))>0.000001))throw new Error("discovery_price_invalid");
      price={currency:string(v.currency,p+".currency",{pattern:/^[A-Z]{3}$/}),min,max,basis:enumValue(v.basis,["PER_PERSON","PER_GROUP"] as const,p+".basis"),mandatoryFeesIncluded:v.mandatoryFeesIncluded===null?null:boolean(v.mandatoryFeesIncluded,p+".fees")}; }
    return {id:id(o.id,p+".id"),name:string(o.name,p+".name",{min:1,max:160}),description:string(o.description,p+".description",{min:1,max:1000}),price};
  });
  if(new Set(offerings.map(o=>o.id)).size!==offerings.length)throw new Error("discovery_duplicate_offering");
  const assertions=array(row.assertions,"discovery.assertions",{max:60}).map((input,i):DiscoveryAssertion=>{
    const p=`discovery.assertions[${i}]`,a=object(input,p,["id","kind","concepts","offeringId","state","evidence","conditions","validFrom","validUntil"]);
    const offeringId=a.offeringId===null?null:id(a.offeringId,p+".offeringId"),offering=offerings.find(o=>o.id===offeringId);
    if(offeringId!==null && !offering)throw new Error("discovery_offering_reference_invalid");
    const evidence=string(a.evidence,p+".evidence",{min:1,max:1000});
    // Model proposals cannot use their own generated prose as source evidence.
    if(!description.includes(evidence))throw new Error("discovery_source_quote_invalid");
    const concepts=array(a.concepts,p+".concepts",{min:1,max:8}).map((s,j)=>string(s,p+`.concepts[${j}]`,{min:1,max:160}));
    if(new Set(concepts.map(discoveryTerm)).size!==concepts.length)throw new Error("discovery_duplicate_concept");
    const validFrom=nullableDate(a.validFrom,p+".validFrom"),validUntil=nullableDate(a.validUntil,p+".validUntil");
    if(validFrom && validUntil && Date.parse(validFrom)>Date.parse(validUntil))throw new Error("discovery_validity_invalid");
    const kind=enumValue(a.kind,DISCOVERY_KINDS,p+".kind");
    if(kind==="OFFERING" && a.state==="PRESENT" && offeringId===null)throw new Error("discovery_offering_scope_required");
    return{id:id(a.id,p+".id"),kind,concepts,offeringId,state:enumValue(a.state,["PRESENT","ABSENT"] as const,p+".state"),evidence,conditions:a.conditions===null?null:string(a.conditions,p+".conditions",{min:1,max:500}),validFrom,validUntil};
  });
  if(new Set(assertions.map(a=>a.id)).size!==assertions.length)throw new Error("discovery_duplicate_assertion");
  const reviewed=boolean(row.reviewed,"discovery.reviewed");if(requireReviewed&&!reviewed)throw new Error("discovery_review_required");
  return {contractVersion:DISCOVERY_PROFILE_VERSION,description,offerings,assertions,reviewed};
}
/** Prepared meanings are open strings with source quotes, not registry enums.
 * Matching is evidence-bound; similarity and missing entries never prove absence. */
export function matchDiscoveryConcept(profile:DiscoveryProfile,kind:DiscoveryKind,concept:string,at:string){
  const term=discoveryTerm(concept);
  const found=profile.assertions.filter(a=>a.kind===kind && a.concepts.some(c=>discoveryTerm(c)===term));
  const current=found.filter(a=>a.conditions===null && (a.validFrom===null||Date.parse(a.validFrom)<=Date.parse(at))&&(a.validUntil===null||Date.parse(at)<Date.parse(a.validUntil)));
  const present=current.filter(a=>a.state==="PRESENT"),absent=current.filter(a=>a.state==="ABSENT");
  const state=present.length&&absent.length?"UNKNOWN":present.length?"PRESENT":absent.length?"ABSENT":"UNKNOWN";
  return {state,evidenceHashes:current.map(a=>hashBody(a,[])),offeringIds:present.flatMap(a=>a.offeringId?[a.offeringId]:[])} as const;
}
export const discoveryProfileFingerprint=(profile:DiscoveryProfile)=>hashBody(profile,[]);
export const discoveryProfileDocument=(profile:DiscoveryProfile)=>canonicalJson({version:DISCOVERY_PROFILE_VERSION,sourceHash:discoveryProfileFingerprint(profile),concepts:profile.assertions.map(a=>({kind:a.kind,terms:a.concepts,offeringId:a.offeringId,state:a.state}))});
