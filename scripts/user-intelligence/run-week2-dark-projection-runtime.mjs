import fs from "node:fs";
import path from "node:path";
import {
  CONTRACT_VERSIONS,
  DARK_PROJECTION_NO_WRITE_PROOF,
  DARK_PROJECTION_RETENTION_TEMPLATE,
  DARK_PROJECTION_RETENTION_TEMPLATE_HASH,
  DARK_PROJECTION_RUNTIME_FLAGS,
  DARK_PROJECTION_RUNTIME_RELEASE,
  DARK_PROJECTION_RUNTIME_TRUST_ANCHOR,
  DARK_RUNTIME_NO_WRITE_PROOF,
  DARK_RUNTIME_RELEASE,
  buildDarkProjectionPrivacyExport,
  canonicalJson,
  contentHash,
  createDarkProjectionRepositoryTrust,
  createSyntheticDarkProjectionAuthority,
  deriveDarkProjectionMetrics,
  rehearseDarkProjectionLifecycle,
  runDarkProjectionRuntime,
  withDarkProjectionEventHash,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const userId = "synthetic-week2-release-user";
const subjectBindingHash = contentHash(userId);
const consent = { contractVersion: CONTRACT_VERSIONS.consentEnvelope, purpose: "PERSONALIZED_RECOMMENDATIONS", state: "GRANTED", consentVersion: "week2-release-consent", policyVersion: "week2-release-policy", uxVersion: "week2-release-ux", effectiveAt: "2026-09-16T08:00:00.000Z", captureContext: "ONBOARDING", allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"], lifecycleEffect: "ALLOW" };
const authority = createSyntheticDarkProjectionAuthority({ authorityRecordId: "week2-release-orchestrator", authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR", userId, subjectBindingHash, consent, allowedActions: ["LOCAL_INGEST", "LOCAL_PROJECT", "LOCAL_REBUILD"] });
const legal = createSyntheticDarkProjectionAuthority({ authorityRecordId: "week2-release-legal", authorityKind: "PRIVACY_LEGAL_PROCESS", userId, subjectBindingHash, consent, allowedActions: ["LEGAL_EXPORT"] });
const trust = createDarkProjectionRepositoryTrust([authority, legal]);
const make = (eventId, eventType, overrides = {}) => withDarkProjectionEventHash({ contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeEvent, eventId, idempotencyKey: `idem-${eventId}`, userId, subjectBindingHash, eventType, journeyId: `journey-${eventId}`, occurredAt: "2026-09-16T09:00:00.000Z", observedAt: "2026-09-16T09:00:01.000Z", ingestedAt: "2026-09-16T09:00:02.000Z", authorityRecordId: authority.authorityRecordId, authorityRecordHash: authority.authorityHash, serverResolutionHash: contentHash(`resolution-${eventId}`), minimizedContextHash: contentHash("morning-solo"), rawTextIncluded: false, preciseLocationIncluded: false, commercialDataIncluded: false, productionAuthorized: false, ...overrides });
const events = [make("save-1", "SAVED", { spotId: "fixture-cafe" }), ...[1, 2, 3].map((n) => make(`visit-${n}`, "VISITED", { spotId: "fixture-cafe", journeyId: `independent-visit-${n}` })), make("dwell-1", "DWELL", { spotId: "fixture-cafe" })];
const request = { contractVersion: CONTRACT_VERSIONS.projectionRequest, requestId: "week2-release-request", actor: { kind: "AUTHENTICATED_USER", userId, subjectBindingHash, authenticationContextHash: "0".repeat(64), boundBy: "SERVER" }, decisionId: "week2-release-decision", snapshot: null, context: { contextContractVersion: "week2-context-1", contextHash: contentHash("morning-solo"), placeTypes: ["cafe"], domainKeys: ["morning", "solo"], rawLocationIncluded: false, socialDetailsIncluded: false }, requestedDomains: ["direct-spot-state"], budgets: { maxItems: 16, maxBytes: 8192 }, projectionPolicyVersion: "week2-read-only-1", killSwitch: false };
const result = runDarkProjectionRuntime({ configuration: "LOCAL_SYNTHETIC_TEST", authorityRecordId: authority.authorityRecordId, consent, lifecycle: "ACTIVE", request, events, trust, now: "2026-09-16T12:00:00.000Z" });
const privacyExport = buildDarkProjectionPrivacyExport({ exportId: "week2-release-export", state: result.state, consent, authorityRecordId: legal.authorityRecordId, sourceAuthority: authority, trust });
const metrics = deriveDarkProjectionMetrics(result);
const lifecycleRehearsal = rehearseDarkProjectionLifecycle({ activeResult: result });
const productionPlan = { migrations: [], functions: [], authChanges: [], rpcChanges: [], edgeChanges: [], productWiring: [], runtimeDeploymentRequired: false, executionAuthorized: false };
const body = { contractVersion: "backyrd.user-intelligence.dark-projection-runtime-artifact@week2-1", release: DARK_PROJECTION_RUNTIME_RELEASE, trustAnchor: DARK_PROJECTION_RUNTIME_TRUST_ANCHOR, flags: DARK_PROJECTION_RUNTIME_FLAGS, week1Bindings: { releaseHash: DARK_RUNTIME_RELEASE.releaseHash, noWriteProofHash: DARK_RUNTIME_NO_WRITE_PROOF.proofHash }, noWriteProof: DARK_PROJECTION_NO_WRITE_PROOF, retentionDecisionTemplate: DARK_PROJECTION_RETENTION_TEMPLATE, result, metrics, lifecycleRehearsal, privacyExport, productionPlan };
const artifact = { ...body, artifactHash: contentHash(body) };
const summaryBody = { contractVersion: "backyrd.user-intelligence.dark-projection-runtime-release-summary@week2-1", releaseHash: DARK_PROJECTION_RUNTIME_RELEASE.releaseHash, trustAnchorHash: DARK_PROJECTION_RUNTIME_TRUST_ANCHOR.anchorHash, week1ReleaseHash: DARK_RUNTIME_RELEASE.releaseHash, week1NoWriteProofHash: DARK_RUNTIME_NO_WRITE_PROOF.proofHash, noWriteProofHash: DARK_PROJECTION_NO_WRITE_PROOF.proofHash, retentionDecisionTemplateHash: DARK_PROJECTION_RETENTION_TEMPLATE_HASH, stateHash: result.state.stateHash, projectionHash: result.projection.projectionHash, handoffHash: result.handoff.handoffHash, privacyExportHash: privacyExport.exportHash, metricsHash: metrics.metricsHash, lifecycleRehearsalHash: lifecycleRehearsal.rehearsalHash, fullReportHash: artifact.artifactHash, flags: DARK_PROJECTION_RUNTIME_FLAGS, productionPlan };
const summary = { ...summaryBody, summaryHash: contentHash(summaryBody) };
const write = (file, value) => { if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); } };
write(argument("--full-output"), artifact); write(argument("--write-summary"), summary);
const verifyPath = argument("--verify-summary"); if (verifyPath) { const expected = JSON.parse(fs.readFileSync(verifyPath, "utf8")); if (canonicalJson(expected) !== canonicalJson(summary)) throw new Error("week2_dark_projection_release_summary_mismatch"); }
process.stdout.write(`${JSON.stringify(summary)}\n`);
