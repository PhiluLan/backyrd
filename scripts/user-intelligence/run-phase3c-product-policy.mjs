import fs from "node:fs";
import {
  CONTRACT_VERSIONS, FOUNDER_DECISION_RECORD_3C, FOUNDER_DECISION_RELEASE_3C,
  PHASE3C_RELEASE_ARTIFACT_BODY, PHASE3C_RELEASE_ARTIFACT_HASH,
  PRODUCT_INTERPRETATION_POLICY_3C, PRODUCT_POLICY_RELEASE_3C,
  PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C, USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH,
  canonicalJson, contentHash, parseProductSignalSemanticsRegistry,
  verifyProductInterpretationPolicy, createPhase3CRepositoryReleaseTrust,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const registry = parseProductSignalSemanticsRegistry(PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C);
const policy = verifyProductInterpretationPolicy(PRODUCT_INTERPRETATION_POLICY_3C, createPhase3CRepositoryReleaseTrust());
const artifactBody = PHASE3C_RELEASE_ARTIFACT_BODY;
const artifact = { ...artifactBody, artifactHash: contentHash(artifactBody) };
if (artifact.artifactHash !== PHASE3C_RELEASE_ARTIFACT_HASH) throw new Error("phase3c_release_artifact_trust_anchor_mismatch");
const summaryBody = {
  contractVersion: "backyrd.user-intelligence.product-policy-release-summary@3c-1",
  founderDecisionRecordVersion: CONTRACT_VERSIONS.founderDecisionRecord,
  founderDecisionHash: FOUNDER_DECISION_RECORD_3C.decisionHash,
  productPolicyVersion: policy.policyVersion,
  productPolicyHash: policy.policyHash,
  signalRegistryVersion: registry.registryVersion,
  signalRegistryHash: registry.registryHash,
  lifecycleManifestHash: USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH,
  eventTypeCount: registry.entries.length,
  frozenDecisionCount: FOUNDER_DECISION_RECORD_3C.decisions.length,
  notConfiguredTransitions: Object.entries(policy.transitions).filter(([, value]) => value === "NOT_CONFIGURED").map(([key]) => key).sort(),
  artifactHash: artifact.artifactHash,
  productionPlan: { migrations: [], functions: [], authChanges: [], runtimeDeploymentRequired: false, executionAuthorized: false },
};
const summary = { ...summaryBody, summaryHash: contentHash(summaryBody) };
const matrix = { contractVersion: "backyrd.user-intelligence.phase3c-event-semantics-matrix@3c-1", registryVersion: registry.registryVersion, registryHash: registry.registryHash, entries: registry.entries };
const write = (path, value) => { if (path) fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };
write(argument("--full-output"), artifact); write(argument("--write-summary"), summary); write(argument("--write-matrix"), matrix);
const verifyPath = argument("--verify-summary");
if (verifyPath) {
  const expected = JSON.parse(fs.readFileSync(verifyPath, "utf8"));
  if (canonicalJson(expected) !== canonicalJson(summary)) throw new Error("phase3c_product_policy_release_summary_mismatch");
}
process.stdout.write(`${JSON.stringify(summary)}\n`);
