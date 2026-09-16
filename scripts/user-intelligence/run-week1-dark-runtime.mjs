import fs from "node:fs";
import path from "node:path";
import {
  buildDarkRuntimePrivacyExport,
  buildDarkRuntimeSyntheticState,
  canonicalJson,
  contentHash,
  createDarkRuntimeRepositoryTrust,
  createSyntheticDarkRuntimeAuthority,
  DARK_RUNTIME_FLAGS,
  DARK_RUNTIME_NO_WRITE_PROOF,
  DARK_RUNTIME_RELEASE,
  DARK_RUNTIME_RETENTION_DECISION_TEMPLATE,
  DARK_RUNTIME_RETENTION_DECISION_TEMPLATE_HASH,
  DARK_RUNTIME_TRUST_ANCHOR,
  deriveDarkRuntimeMetrics,
  updateDarkRuntimeSyntheticState,
  verifyDarkRuntimeReplay,
  withDarkRuntimeCommandHash,
  withDarkRuntimeSyntheticEventHash,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const userId = "synthetic-week1-release-user"; const subjectBindingHash = contentHash(userId);
const consent = { contractVersion: "backyrd.user-intelligence.consent-envelope@1.0", purpose: "PERSONALIZED_RECOMMENDATIONS", state: "GRANTED", consentVersion: "week1-release-consent", policyVersion: "week1-release-policy", uxVersion: "week1-release-ux", effectiveAt: "2026-09-16T08:00:00.000Z", captureContext: "ONBOARDING", allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"], lifecycleEffect: "ALLOW" };
const authority = createSyntheticDarkRuntimeAuthority({ authorityRecordId: "week1-release-orchestrator", authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR", boundUserId: userId, subjectBindingHash, consent, allowedActions: ["PREVIEW_FULL_REBUILD", "PREVIEW_INCREMENTAL_UPDATE"] });
const legalAuthority = createSyntheticDarkRuntimeAuthority({ authorityRecordId: "week1-release-legal", authorityKind: "PRIVACY_LEGAL_PROCESS", boundUserId: userId, subjectBindingHash, consent, allowedActions: ["PREVIEW_PRIVACY_EXPORT"] });
const trust = createDarkRuntimeRepositoryTrust([authority, legalAuthority]);
const make = (eventId, eventType, overrides = {}) => withDarkRuntimeSyntheticEventHash({ contractVersion: "backyrd.user-intelligence.dark-runtime-synthetic-event@week1-1", eventId, idempotencyKey: `idem-${eventId}`, userId, subjectBindingHash, eventType, journeyId: `journey-${eventId}`, occurredAt: "2026-09-16T09:00:00.000Z", ingestedAt: "2026-09-16T09:00:01.000Z", authority: "SYNTHETIC_SERVER_FIXTURE", rawPersonalDataIncluded: false, productionAuthorized: false, ...overrides });
const events = [make("search-1", "SEARCH"), make("save-1", "SAVED", { spotId: "fixture-spot" }), make("visit-1", "VISITED", { spotId: "fixture-spot" })];
const first = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events: events.slice(0, 1) });
const incremental = updateDarkRuntimeSyntheticState({ previous: first, userId, subjectBindingHash, lifecycle: "ACTIVE", delta: events.slice(1) });
const full = buildDarkRuntimeSyntheticState({ userId, subjectBindingHash, lifecycle: "ACTIVE", events }); verifyDarkRuntimeReplay({ full, incremental });
const exportCommand = withDarkRuntimeCommandHash({ commandId: "week1-release-export", action: "PREVIEW_PRIVACY_EXPORT", userId, subjectBindingHash, consent, authorityRecordId: legalAuthority.authorityRecordId, requestedAt: "2026-09-16T12:00:00.000Z", clientSelectedPolicy: false, productionWriteRequested: false });
const privacyExport = buildDarkRuntimePrivacyExport({ exportId: "week1-release-export", command: exportCommand, state: full, trust });
const metrics = deriveDarkRuntimeMetrics({ deliveredEvents: events, state: full });
const productionPlan = { migrations: [], functions: [], authChanges: [], rpcChanges: [], edgeChanges: [], productWiring: [], runtimeDeploymentRequired: false, executionAuthorized: false };
const body = { contractVersion: "backyrd.user-intelligence.dark-runtime-artifact@week1-1", release: DARK_RUNTIME_RELEASE, trustAnchor: DARK_RUNTIME_TRUST_ANCHOR, retentionDecisionTemplate: DARK_RUNTIME_RETENTION_DECISION_TEMPLATE, noWriteProof: DARK_RUNTIME_NO_WRITE_PROOF, state: full, metrics, privacyExport, productionPlan };
const artifact = { ...body, artifactHash: contentHash(body) };
const summaryBody = { contractVersion: "backyrd.user-intelligence.dark-runtime-release-summary@week1-1", releaseHash: DARK_RUNTIME_RELEASE.releaseHash, trustAnchorHash: DARK_RUNTIME_TRUST_ANCHOR.anchorHash, retentionDecisionTemplateHash: DARK_RUNTIME_RETENTION_DECISION_TEMPLATE_HASH, noWriteProofHash: DARK_RUNTIME_NO_WRITE_PROOF.proofHash, syntheticStateHash: full.stateHash, privacyExportHash: privacyExport.exportHash, metricsHash: metrics.metricsHash, fullReportHash: artifact.artifactHash, flags: DARK_RUNTIME_FLAGS, productionPlan };
const summary = { ...summaryBody, summaryHash: contentHash(summaryBody) };
const write = (file, value) => { if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); } };
write(argument("--full-output"), artifact); write(argument("--write-summary"), summary);
const verifyPath = argument("--verify-summary"); if (verifyPath) { const expected = JSON.parse(fs.readFileSync(verifyPath, "utf8")); if (canonicalJson(expected) !== canonicalJson(summary)) throw new Error("week1_dark_runtime_release_summary_mismatch"); }
process.stdout.write(`${JSON.stringify(summary)}\n`);
