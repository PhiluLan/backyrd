import { contentHash } from "./canonical-json.mjs";

export const N5_8_2_HIGH_ELIGIBILITY_CONTRACT = Object.freeze({
  version: "backyrd-n5-8-2-epistemic-high-eligibility-v1",
  purpose: "POST_INFERENCE_HIGH_LABEL_GUARD_ONLY",
  protectedNodeFields: ["affinity", "polarity", "confidence", "knowledgeState", "evidenceRefs", "provenance"],
  candidate: { signedPolarities: ["POSITIVE", "NEGATIVE"], confidenceMinimum: 0.8 },
  globalScopeBreadth: {
    appliesTo: "GLOBAL",
    minimumIndependentAnchors: 3,
    anchorDefinition: "MAX_OF_COMPARATIVE_SCOPE_DIVERSITY_AND_DIRECT_SEMANTIC_BREADTH",
    rationale: "A global HIGH claim needs evidence beyond a narrow observed scope."
  },
  contradictionDominance: {
    appliesWhen: "RELEVANT_SIGNED_EVIDENCE_EXISTS_IN_BOTH_DIRECTIONS",
    minimumDominantToOpposingRatio: 2,
    evaluation: "PER_EVIDENCE_CHANNEL_AFTER_EXISTING_JOURNEY_DEDUPLICATION",
    rationale: "HIGH requires a clearly dominant direction, while context-dependent or mixed knowledge remains available below HIGH."
  },
  onBlock: "RETAIN_NODE_AND_ALL_INFERRED_SEMANTICS_WITHOUT_HIGH_ELIGIBILITY",
  noModel: true
});
export const N5_8_2_HIGH_ELIGIBILITY_CONTRACT_HASH = contentHash(N5_8_2_HIGH_ELIGIBILITY_CONTRACT);

const signed = (node) => ["POSITIVE", "NEGATIVE"].includes(node.polarity);
const round = (value) => Number(value.toFixed(6));
const support = (positive, negative, channel) => {
  const p = Number(positive ?? 0), n = Number(negative ?? 0);
  if (!(p > 0 && n > 0)) return { channel, contradictory: false, positive: round(p), negative: round(n), dominance: null, pass: true };
  const dominance = Math.max(p, n) / Math.max(0.000001, Math.min(p, n));
  return { channel, contradictory: true, positive: round(p), negative: round(n), dominance: round(dominance), pass: dominance >= N5_8_2_HIGH_ELIGIBILITY_CONTRACT.contradictionDominance.minimumDominantToOpposingRatio };
};

export function highEligibilityFor(node) {
  const candidate = signed(node) && node.confidence >= N5_8_2_HIGH_ELIGIBILITY_CONTRACT.candidate.confidenceMinimum;
  const scopeBreadth = Math.max(node.comparativeEvidence?.scopeDiversity ?? 0, node.directEvidence?.breadth ?? 0);
  const scopePass = node.scope.kind !== "GLOBAL" || scopeBreadth >= N5_8_2_HIGH_ELIGIBILITY_CONTRACT.globalScopeBreadth.minimumIndependentAnchors;
  const directSamples = node.directEvidence?.samples ?? [];
  const directPositive = directSamples.filter((sample) => sample.sign > 0).reduce((sum, sample) => sum + Number(sample.confidence ?? 0), 0);
  const directNegative = directSamples.filter((sample) => sample.sign < 0).reduce((sum, sample) => sum + Number(sample.confidence ?? 0), 0);
  const channels = [
    support(node.comparativeEvidence?.presentPositive, node.comparativeEvidence?.presentNegative, "COMPARATIVE_OUTCOMES"),
    support(directPositive, directNegative, "DIRECT_SEMANTIC")
  ];
  const contradictionPass = channels.every((row) => row.pass);
  const reasons = [];
  if (!candidate) reasons.push(signed(node) ? "CONFIDENCE_BELOW_HIGH_THRESHOLD" : "NOT_SIGNED_NODE");
  if (candidate && !scopePass) reasons.push("GLOBAL_SCOPE_BREADTH_INSUFFICIENT");
  if (candidate && !contradictionPass) reasons.push("CONTRADICTION_DIRECTIONAL_DOMINANCE_INSUFFICIENT");
  if (candidate && scopePass && contradictionPass) reasons.push("HIGH_ELIGIBLE");
  const body = { version: N5_8_2_HIGH_ELIGIBILITY_CONTRACT.version, nodeKey: node.nodeKey, candidate, eligible: candidate && scopePass && contradictionPass, scopeBreadth, scopePass, channels, contradictionPass, reasons };
  return { ...body, auditHash: contentHash(body) };
}

export function applyN5_8_2HighEligibility(userCard) {
  const nodes = userCard.nodes.map((node) => ({ ...node, highEligibility: highEligibilityFor(node) }));
  const audit = nodes.filter((node) => node.highEligibility.candidate).map((node) => ({ nodeKey: node.nodeKey, ...node.highEligibility }));
  const body = { baseUserCardHash: userCard.userCardHash, contractHash: N5_8_2_HIGH_ELIGIBILITY_CONTRACT_HASH, audit };
  return { userCard: { ...userCard, nodes }, audit, guardHash: contentHash(body) };
}
