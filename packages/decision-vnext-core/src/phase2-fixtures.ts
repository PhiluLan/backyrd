import {
  CONTRACT_VERSIONS as USER_CONTRACT_VERSIONS, RelevantUserProjectionSchema, SYNTHETIC_CONCEPT_REGISTRY_VERSION, SYNTHETIC_MANIFEST,
  NEUTRAL_SUBJECT_BINDING_HASH, canonicalBytes, contentHash as userContentHash, projectionHashBody,
  type DecisionVNextUserProjectionPort, type RelevantUserProjection, type RelevantUserProjectionRequest,
} from "@backyrd/user-intelligence-vnext-core";
import { SyntheticUserProjectionReader } from "./sandbox.js";

export type SyntheticPhase2UserMode = "ACTIVE" | "NO_CONSENT" | "MISSING_PROJECTION" | "COLD_USER" | "KILL_SWITCH";

/** A test-only port. It emits only the canonical minimized projection contract. */
export class SyntheticPhase2UserProjectionPort implements DecisionVNextUserProjectionPort {
  readonly contractVersion = "backyrd.user-intelligence.decision-projection-port@1.0" as const;
  constructor(private readonly mode: SyntheticPhase2UserMode, private readonly directSpotId = "syn-spot-0001") {}

  async project(request: RelevantUserProjectionRequest): Promise<RelevantUserProjection> {
    if (this.mode === "COLD_USER") {
      if (!request.snapshot) throw new Error("synthetic_cold_projection_requires_snapshot_binding");
      const withoutHash = {
        contractVersion: USER_CONTRACT_VERSIONS.projection, projectionId: `projection-${request.requestId}`, decisionId: request.decisionId, subjectBindingHash: NEUTRAL_SUBJECT_BINDING_HASH,
        snapshot: request.snapshot, manifest: { manifestId: SYNTHETIC_MANIFEST.manifestId, manifestHash: SYNTHETIC_MANIFEST.manifestHash }, status: "NEUTRAL" as const, neutralReason: "COLD_START" as const,
        taste: [], practical: [], directSpot: [], domainSufficiency: [{ domain: "synthetic-fixture", sufficiency: { level: "LOW" as const, policyRef: "phase2-synthetic-sufficiency-v1", reasons: ["COLD_START"] } }], knowledgeLevel: "LOW" as const,
        suppression: { total: 1, byReason: [{ code: "COLD_START" as const, count: 1 }] }, boundaries: { rawEventsIncluded: false as const, reviewTextIncluded: false as const, rawLocationIncluded: false as const, privateSocialDataIncluded: false as const, eligibilityAuthority: false as const, rankingAuthority: false as const },
        budgets: { maxItems: request.budgets.maxItems, maxBytes: request.budgets.maxBytes, actualItems: 0, canonicalPayloadBytes: 0 }, technicalMetadata: { createdAt: "2026-01-15T12:00:00.000Z" },
      };
      const bytes = canonicalBytes(projectionHashBody(withoutHash)); const measured = { ...withoutHash, budgets: { ...withoutHash.budgets, canonicalPayloadBytes: bytes } };
      return RelevantUserProjectionSchema.parse({ ...measured, projectionHash: userContentHash(projectionHashBody(measured)) });
    }
    if (this.mode !== "ACTIVE") {
      const mapped = this.mode === "NO_CONSENT" ? "NO_CONSENT" : this.mode === "KILL_SWITCH" ? "KILL_SWITCH" : "MISSING_SNAPSHOT";
      return new SyntheticUserProjectionReader(mapped).project(request);
    }
    if (!request.snapshot) throw new Error("synthetic_active_projection_requires_snapshot_binding");
    const taste = [
      { concept: { contractVersion: USER_CONTRACT_VERSIONS.userConceptReference, registryVersion: SYNTHETIC_CONCEPT_REGISTRY_VERSION, conceptId: "fixture.mood.calm" }, scope: { kind: "GLOBAL" as const }, affinity: 0.8, confidence: 0.7, reason: { code: "PORTABLE_GLOBAL" as const, subjectRef: "synthetic-taste-calm", policyRef: "phase2-synthetic-projection-policy-v1" } },
      { concept: { contractVersion: USER_CONTRACT_VERSIONS.userConceptReference, registryVersion: SYNTHETIC_CONCEPT_REGISTRY_VERSION, conceptId: "fixture.intent.drink" }, scope: { kind: "GLOBAL" as const }, affinity: -0.7, confidence: 0.65, reason: { code: "PORTABLE_GLOBAL" as const, subjectRef: "synthetic-aversion-drink", policyRef: "phase2-synthetic-projection-policy-v1" } },
    ];
    const practical = [{ preferenceId: "synthetic-practical-distance", dimension: "DISTANCE_BEHAVIOR", knowledgeState: "SUPPORTED" as const, confidence: 0.55, reason: { code: "PRACTICAL_CONTEXT_MATCH" as const, subjectRef: "synthetic-practical-distance", policyRef: "phase2-synthetic-projection-policy-v1" } }];
    const directSpot = [{ relationshipId: "synthetic-direct-spot", spotId: this.directSpotId, state: "SAVED", confidence: 0.8, reason: { code: "DIRECT_SPOT_RELATIONSHIP" as const, subjectRef: "synthetic-direct-spot", policyRef: "phase2-synthetic-projection-policy-v1" } }];
    const withoutHash = {
      contractVersion: USER_CONTRACT_VERSIONS.projection, projectionId: `projection-${request.requestId}`, decisionId: request.decisionId, subjectBindingHash: request.actor.subjectBindingHash,
      snapshot: request.snapshot, manifest: { manifestId: SYNTHETIC_MANIFEST.manifestId, manifestHash: SYNTHETIC_MANIFEST.manifestHash }, status: "ACTIVE" as const, neutralReason: null,
      taste, practical, directSpot, domainSufficiency: [{ domain: "synthetic-fixture", sufficiency: { level: "PARTIAL" as const, policyRef: "phase2-synthetic-sufficiency-v1", reasons: ["fixture-only"] } }], knowledgeLevel: "PARTIAL" as const,
      suppression: { total: 0, byReason: [] }, boundaries: { rawEventsIncluded: false as const, reviewTextIncluded: false as const, rawLocationIncluded: false as const, privateSocialDataIncluded: false as const, eligibilityAuthority: false as const, rankingAuthority: false as const },
      budgets: { maxItems: request.budgets.maxItems, maxBytes: request.budgets.maxBytes, actualItems: taste.length + practical.length + directSpot.length, canonicalPayloadBytes: 0 }, technicalMetadata: { createdAt: "2026-01-15T12:00:00.000Z" },
    };
    const bytes = canonicalBytes(projectionHashBody(withoutHash));
    const measured = { ...withoutHash, budgets: { ...withoutHash.budgets, canonicalPayloadBytes: bytes } };
    return RelevantUserProjectionSchema.parse({ ...measured, projectionHash: userContentHash(projectionHashBody(measured)) });
  }
}
