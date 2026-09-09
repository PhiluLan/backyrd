import { CONTRACT_VERSIONS } from "./contracts.js";

// Runtime schemas are the normative validators. This catalog makes discovery and
// compatibility checks machine-readable without maintaining a second validator.
export const USER_INTELLIGENCE_VNEXT_SCHEMA_CATALOG = Object.freeze({
  catalogVersion: "backyrd.user-intelligence.schema-catalog@1.0",
  additionalPropertiesDefault: false,
  compatibility: {
    major: "EXACT_MATCH_FAIL_CLOSED",
    minor: "ONLY_EXPLICITLY_LISTED_MINOR_VERSIONS_ARE_ACCEPTED",
    unknownRegistry: "FAIL_CLOSED",
  },
  contracts: Object.freeze([
    ["CanonicalUserEvent", CONTRACT_VERSIONS.canonicalUserEvent, "CanonicalUserEventSchema", "parseCanonicalUserEvent"],
    ["EventReferencePolicy", CONTRACT_VERSIONS.eventReferencePolicy, "EVENT_REFERENCE_MATRIX", null],
    ["TemporalBinding", CONTRACT_VERSIONS.temporalValidation, "TemporalBindingSchema", null],
    ["TemporalValidationPolicy", CONTRACT_VERSIONS.temporalPolicy, "TemporalValidationPolicySchema", "validateTemporalIntegrity"],
    ["UserEventAuthority", CONTRACT_VERSIONS.userEventAuthority, "UserEventAuthoritySchema", "parseUserEventAuthority"],
    ["ConsentEnvelope", CONTRACT_VERSIONS.consentEnvelope, "ConsentEnvelopeSchema", "parseConsentEnvelope"],
    ["EvidenceChain", CONTRACT_VERSIONS.evidenceChain, "EvidenceChainSchema", "parseEvidenceChain"],
    ["UserConceptReference", CONTRACT_VERSIONS.userConceptReference, "UserConceptReferenceSchema", null],
    ["TasteNode", CONTRACT_VERSIONS.tasteNode, "TasteNodeSchema", null],
    ["PracticalPreference", CONTRACT_VERSIONS.practicalPreference, "PracticalPreferenceSchema", null],
    ["DirectSpotAffinity", CONTRACT_VERSIONS.directSpotAffinity, "DirectSpotAffinitySchema", null],
    ["UserIntelligenceManifest", CONTRACT_VERSIONS.manifest, "UserIntelligenceManifestSchema", "parseUserIntelligenceManifest"],
    ["UserIntelligenceSnapshot", CONTRACT_VERSIONS.snapshot, "UserIntelligenceSnapshotSchema", "parseUserIntelligenceSnapshot"],
    ["RelevantUserProjectionRequest", CONTRACT_VERSIONS.projectionRequest, "RelevantUserProjectionRequestSchema", null],
    ["RelevantUserProjection", CONTRACT_VERSIONS.projection, "RelevantUserProjectionSchema", "parseRelevantUserProjection"],
    ["UserTransparencyView", CONTRACT_VERSIONS.transparencyView, "UserTransparencyViewSchema", null],
    ["LifecycleCommand", CONTRACT_VERSIONS.lifecycleCommand, "LifecycleCommandSchema", "parseLifecycleCommand"],
  ].map(([name, contractVersion, runtimeSchemaExport, semanticValidatorExport]) => ({ name, contractVersion, runtimeSchemaExport, semanticValidatorExport }))),
});
