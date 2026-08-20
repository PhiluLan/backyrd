import { buildCanonicalRuntimeInput } from "./production-input.mjs";
import { buildN5_8_4UserCard } from "../../../decision-lab/src/n5-8-4-absolute-negativity-guard.mjs";

const STATES = new Set(["UNKNOWN", "HYPOTHESIS_POSITIVE", "HYPOTHESIS_NEGATIVE", "POSITIVE", "NEGATIVE", "MIXED"]);
const POLARITIES = new Set(["UNKNOWN", "POSITIVE", "NEGATIVE", "MIXED"]);

export function validateRuntimeResult({ userId, result }) {
  if (result.userCard.userId !== userId) throw new Error("runtime_user_mismatch");
  const keys = new Set();
  for (const node of result.userCard.nodes) {
    if (keys.has(node.nodeKey)) throw new Error("runtime_duplicate_node"); keys.add(node.nodeKey);
    if (!STATES.has(node.knowledgeState) || !POLARITIES.has(node.polarity)) throw new Error("runtime_invalid_node_state");
    if (!Number.isFinite(node.affinity) || node.affinity < -1 || node.affinity > 1 || !Number.isFinite(node.confidence) || node.confidence < 0 || node.confidence > 1) throw new Error("runtime_invalid_node_numeric");
    if (!["GLOBAL", "CONTEXT", "PLACE_TYPE"].includes(node.scope?.kind)) throw new Error("runtime_invalid_scope");
  }
  return { card: result.userCard, nodes: result.userCard.nodes, ledger: result.changeLedger, runtimeVersion: result.identities.n584ContractHash };
}

/** Server worker orchestration. The supplied repository owns DB reads and a single transactional persist call. */
export async function rebuildUserIntelligence({ userId, repository, reason = "MEMORY_COMMITTED" }) {
  const source = await repository.readCanonicalSources(userId);
  if (!source.consentGranted) return repository.purgeDerivedUserIntelligence(userId, reason);
  const input = buildCanonicalRuntimeInput(source);
  const result = buildN5_8_4UserCard(input, { asOf: source.asOf, spotIntelligence: source.n4BySpot });
  const validated = validateRuntimeResult({ userId, result });
  return repository.persistAtomically({ userId, reason, sourceWatermark: source.watermark, input, ...validated });
}
