import fs from "node:fs";
import {
  CONTRACT_VERSIONS, FOUNDER_DECISION_RECORD_3C, FOUNDER_DECISION_RELEASE_3C,
  PRODUCT_INTERPRETATION_POLICY_3C, PRODUCT_POLICY_RELEASE_3C,
  PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C, USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH,
  canonicalJson, contentHash, parseProductSignalSemanticsRegistry,
  verifyProductInterpretationPolicy, createPhase3CRepositoryReleaseTrust,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const registry = parseProductSignalSemanticsRegistry(PRODUCT_SIGNAL_SEMANTICS_REGISTRY_3C);
const policy = verifyProductInterpretationPolicy(PRODUCT_INTERPRETATION_POLICY_3C, createPhase3CRepositoryReleaseTrust());
const artifactBody = {
  contractVersion: "backyrd.user-intelligence.product-policy-release-artifact@3c-1",
  productionAuthorized: false, runtimeActivated: false, shadowTrafficAuthorized: false, rankingAuthorized: false, eligibilityAuthorized: false,
  founderDecisionRecord: FOUNDER_DECISION_RECORD_3C, founderDecisionRelease: FOUNDER_DECISION_RELEASE_3C,
  productPolicy: policy, productPolicyRelease: PRODUCT_POLICY_RELEASE_3C,
  signalRegistry: registry, lifecycleManifestHash: USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH,
};
const artifact = { ...artifactBody, artifactHash: contentHash(artifactBody) };
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
