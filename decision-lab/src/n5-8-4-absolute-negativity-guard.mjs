import { contentHash } from "./canonical-json.mjs";
import { buildN5_8UserCard } from "./n5-8-unified-user-evidence.mjs";
import { applyN5_8_2HighEligibility } from "./n5-8-2-epistemic-high-guard.mjs";

export const N5_8_4_NEGATIVE_PROMOTION_CONTRACT = Object.freeze({
  version: "backyrd-n5-8-4-absolute-negativity-promotion-v1",
  appliesOnlyTo: "COMPARATIVE_DURABLE_NEGATIVE_PROMOTION",
  required: ["RELATIVE_NEGATIVE_DISCRIMINATION", "NET_NEGATIVE_CONCEPT_PRESENT_OUTCOME_EVIDENCE"],
  absoluteNegativity: {
    formula: "presentNegativeOutcomeStrength > presentPositiveOutcomeStrength",
    evidence: "EXISTING_DEDUPLICATED_COMPARATIVE_OUTCOME_STRENGTH",
    rationale: "A concept can be weaker than alternatives without being disliked."
  },
  onIneligible: "RETAIN_COMPARATIVE_STATISTICS_AND_AFFINITY_BUT_DO_NOT_EMIT_COMPARATIVE_DURABLE_NEGATIVE",
  directSemanticEvidence: "UNCHANGED_AND_NOT_SUBJECT_TO_THIS_GUARD",
  protected: ["weights", "confidenceFormula", "generalPromotionThresholds", "attribution", "scopeGeneralization", "world", "truth", "projection"],
  noModel: true
});
export const N5_8_4_NEGATIVE_PROMOTION_CONTRACT_HASH = contentHash(N5_8_4_NEGATIVE_PROMOTION_CONTRACT);

export function absoluteNegativityEligibility(node) {
  const comparative=node.comparativeEvidence;
  const comparativeNegative=node.polarity==="NEGATIVE"&&Boolean(comparative);
  const presentPositive=Number(comparative?.presentPositive??0),presentNegative=Number(comparative?.presentNegative??0);
  const relativeNegative=comparativeNegative&&Number(comparative?.discrimination??node.affinity)<0;
  const absoluteNegative=presentNegative>presentPositive;
  const eligible=!comparativeNegative||relativeNegative&&absoluteNegative;
  const body={version:N5_8_4_NEGATIVE_PROMOTION_CONTRACT.version,nodeKey:node.nodeKey,comparativeNegative,relativeNegative,presentPositive,presentNegative,netConceptPresentEvidence:Number((presentNegative-presentPositive).toFixed(6)),absoluteNegative,eligible,reasons:!comparativeNegative?["NOT_COMPARATIVE_NEGATIVE"]:eligible?["RELATIVE_AND_ABSOLUTE_NEGATIVE"]:["RELATIVE_DISADVANTAGE_WITHOUT_ABSOLUTE_NEGATIVITY"]};
  return {...body,auditHash:contentHash(body)};
}
function cardWithHash(card){const body={...card,userCardHash:undefined};delete body.userCardHash;return {...body,userCardHash:contentHash(body)};}

export function buildN5_8_4UserCard(events,options={}) {
  const full=buildN5_8UserCard(events,options);
  const comparative=buildN5_8UserCard(events,{...options,channels:{comparative:true,mood:false,review:false}});
  const direct=buildN5_8UserCard(events,{...options,channels:{comparative:false,mood:true,review:true}});
  const comparativeNodes=new Map(comparative.userCard.nodes.map((node)=>[node.nodeKey,node]));
  const directNodes=new Map(direct.userCard.nodes.map((node)=>[node.nodeKey,node]));
  let comparativeBlocked=0,directSemanticNegativesChanged=0;
  const nodes=full.userCard.nodes.map((node)=>{
    const comp=comparativeNodes.get(node.nodeKey),directNode=directNodes.get(node.nodeKey);
    const eligibility=absoluteNegativityEligibility({...node,polarity:comp?.polarity??node.polarity,comparativeEvidence:comp?.comparativeEvidence??node.comparativeEvidence,affinity:comp?.affinity??node.affinity});
    if(!comp||comp.polarity!=="NEGATIVE"||eligibility.eligible) return {...node,comparativeNegativeEligibility:eligibility};
    comparativeBlocked+=1;
    if(directNode?.polarity==="NEGATIVE") return {...node,comparativeNegativeEligibility:eligibility,comparativeNegativeDisposition:"DIRECT_NEGATIVE_RETAINED"};
    const replacement=directNode?.polarity==="MIXED"?{polarity:"MIXED",knowledgeState:"MIXED"}:directNode?.polarity==="POSITIVE"?{polarity:"POSITIVE",knowledgeState:directNode.knowledgeState,affinity:directNode.affinity,confidence:directNode.confidence}:{polarity:"UNKNOWN",knowledgeState:"UNKNOWN"};
    return {...node,...replacement,comparativeNegativeEligibility:eligibility,comparativeNegativeDisposition:"COMPARATIVE_NEGATIVE_BLOCKED_RELATIVE_ONLY"};
  });
  const preliminary=cardWithHash({...full.userCard,nodes,boundaries:{...full.userCard.boundaries,comparativeNegativePromotion:N5_8_4_NEGATIVE_PROMOTION_CONTRACT.version}});
  const highGuarded=applyN5_8_2HighEligibility(preliminary).userCard;
  const userCard=cardWithHash(highGuarded);
  return {...full,userCard,negativePromotionAudit:{comparativeBlocked,directSemanticNegativesChanged,contractHash:N5_8_4_NEGATIVE_PROMOTION_CONTRACT_HASH},identities:{...full.identities,n584ContractHash:N5_8_4_NEGATIVE_PROMOTION_CONTRACT_HASH}};
}
