import { buildCanonicalRuntimeInput } from "./production-input.mjs";
import { buildN5_8_4UserCard } from "../../../decision-lab/src/n5-8-4-absolute-negativity-guard.mjs";
import { buildCanonicalUserCard } from "../../../decision-lab/src/n5-6-canonical-user-intelligence.mjs";
import { createHash } from "node:crypto";

const STATES = new Set(["UNKNOWN", "HYPOTHESIS_POSITIVE", "HYPOTHESIS_NEGATIVE", "POSITIVE", "NEGATIVE", "MIXED"]);
const POLARITIES = new Set(["UNKNOWN", "POSITIVE", "NEGATIVE", "MIXED"]);
const canonical = (value) => value && typeof value === "object"
  ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  : value;
const digest = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

export function semanticLedger(previousCard, nextCard, runtimeVersion, watermark) {
  const before = new Map((previousCard?.nodes ?? []).map((node) => [node.nodeKey, node]));
  const after = new Map((nextCard.nodes ?? []).map((node) => [node.nodeKey, node]));
  const changes = [];
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const left = before.get(key) ?? null, right = after.get(key) ?? null;
    if (digest(left) === digest(right)) continue;
    const body = { nodeKey: key, before: left, after: right, reasonCode: !left ? "NODE_CREATED" : !right ? "SOURCE_EVIDENCE_REMOVED" : "NODE_SEMANTICS_CHANGED", evidenceRefs: right?.evidenceRefs ?? left?.evidenceRefs ?? [], runtimeVersion, triggerWatermark: watermark };
    changes.push({ ...body, changeId: digest(body) });
  }
  return changes;
}

export function validateRuntimeResult({ userId, result }) {
  if (result.userCard.userId !== userId) throw new Error("runtime_user_mismatch");
  const keys = new Set();
  for (const node of result.userCard.nodes) {
    if (keys.has(node.nodeKey)) throw new Error("runtime_duplicate_node"); keys.add(node.nodeKey);
    if (!STATES.has(node.knowledgeState) || !POLARITIES.has(node.polarity)) throw new Error("runtime_invalid_node_state");
    if (!Number.isFinite(node.affinity) || node.affinity < -1 || node.affinity > 1 || !Number.isFinite(node.confidence) || node.confidence < 0 || node.confidence > 1) throw new Error("runtime_invalid_node_numeric");
    if (!["GLOBAL", "CONTEXT", "PLACE_TYPE"].includes(node.scope?.kind) || typeof node.scope?.key!=="string" || node.scope.key.length===0) throw new Error("runtime_invalid_scope");
  }
  return { card: result.userCard, nodes: result.userCard.nodes, ledger: result.changeLedger, runtimeVersion: result.identities.n584ContractHash };
}

function exposeEvidenceAuthorities(result,input,{asOf,spotIntelligence}){
  const declaredIds=new Set(input.filter((event)=>event.eventType==="onboarding_preference").map((event)=>event.id));
  const declaredCard=declaredIds.size?buildCanonicalUserCard(input.filter((event)=>declaredIds.has(event.id)),{asOf,spotIntelligence}).userCard:null;
  const merged=new Map(result.userCard.nodes.map((node)=>[node.nodeKey,node]));
  for(const node of declaredCard?.nodes??[])if(!merged.has(node.nodeKey))merged.set(node.nodeKey,{...node,knowledgeState:"UNKNOWN"});
  const nodes=[...merged.values()].map((node)=>{const refs=(node.evidenceRefs??[]).map((ref)=>typeof ref==="string"?ref:ref.eventId);const declared=refs.filter((id)=>declaredIds.has(id)).length;return{...node,evidenceComposition:{behavioral:0,comparative:0,mood:0,review:0,explicit:0,...node.evidenceComposition,declared},evidenceAuthorities:{declared,directReview:node.evidenceComposition?.review??0,comparative:node.evidenceComposition?.comparative??0,behavioral:node.evidenceComposition?.behavioral??0}};}).sort((a,b)=>a.nodeKey.localeCompare(b.nodeKey));
  const body={...result.userCard,nodes,evidenceAuthorityVersion:"backyrd-canonical-semantics-v1"};delete body.userCardHash;
  return{...result,userCard:{...body,userCardHash:digest(body)}};
}

/** Server worker orchestration. The supplied repository owns DB reads and a single transactional persist call. */
export async function rebuildUserIntelligence({ userId, repository, reason = "MEMORY_COMMITTED", watermark = null, workIds = [], leaseToken = null }) {
  const source = await repository.readCanonicalSources(userId, { watermark });
  if (!source.consentGranted) return repository.purgeDerivedUserIntelligence(userId, reason);
  const input = buildCanonicalRuntimeInput(source);
  const result = exposeEvidenceAuthorities(buildN5_8_4UserCard(input, { asOf: source.asOf, spotIntelligence: source.n4BySpot }),input,{asOf:source.asOf,spotIntelligence:source.n4BySpot});
  const validated = validateRuntimeResult({ userId, result });
  const previousCard = await repository.readLatestCard(userId);
  const ledger = semanticLedger(previousCard, validated.card, validated.runtimeVersion, source.watermark);
  const persisted = await repository.persistAtomically({ userId, reason, sourceWatermark: source.watermark, input, ...validated, ledger, workIds, leaseToken });
  return { ...persisted, nodesChanged: ledger.length, runtimeVersion: validated.runtimeVersion };
}
