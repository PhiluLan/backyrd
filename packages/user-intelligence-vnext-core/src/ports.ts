import type { CanonicalUserEvent, RelevantUserProjection, RelevantUserProjectionRequest, UserConceptReference } from "./contracts.js";

export interface ExistingMemoryAdapterPort {
  readonly contractVersion: "backyrd.user-intelligence.existing-memory-adapter-port@1.0";
  readAuthorizedObservations(input: { readonly userId: string; readonly afterEventId?: string; readonly limit: number }): Promise<readonly CanonicalUserEvent[]>;
}

export interface WorldConceptEvidence {
  readonly concept: UserConceptReference;
  readonly strength: number;
  readonly confidence: number;
  readonly provenance: readonly string[];
  readonly freshAt: string;
  readonly status: "KNOWN" | "KNOWN_FALSE" | "UNKNOWN" | "DISPUTED" | "EXPIRED";
  readonly conflict: boolean;
  readonly placeType: string | null;
}

export interface WorldKnowledgePort {
  readonly contractVersion: "backyrd.user-intelligence.world-knowledge-port@1.0";
  readSpotConcepts(input: { readonly spotId: string; readonly registryVersion: string }): Promise<readonly WorldConceptEvidence[]>;
}

export interface MinimizedSituationalContext {
  readonly contractVersion: string;
  readonly contextHash: string;
  readonly placeTypes: readonly string[];
  readonly domainKeys: readonly string[];
  readonly rawLocationIncluded: false;
  readonly privateSocialDataIncluded: false;
}

export interface SituationalContextPort {
  readonly contractVersion: "backyrd.user-intelligence.situational-context-port@1.0";
  readMinimizedContext(input: { readonly decisionId: string; readonly authenticatedUserId: string }): Promise<MinimizedSituationalContext>;
}

export interface DecisionVNextUserProjectionPort {
  readonly contractVersion: "backyrd.user-intelligence.decision-projection-port@1.0";
  project(request: RelevantUserProjectionRequest): Promise<RelevantUserProjection>;
}
