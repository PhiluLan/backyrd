export type DecisionProductRequest = {
  contractVersion: "backyrd.decision-vnext.product-request@1.0";
  requestId: string;
  idempotencyKey: string;
  naturalLanguage: string;
  explicit: {
    primaryIntent?: string | null;
    secondaryIntent?: string | null;
    occasion?: string | null;
    moods?: string[];
    targetCity?: string | null;
    hardConstraints?: string[];
    softPreferences?: string[];
  };
  alternativeRequested: boolean;
  previouslyPresentedCandidateIds: string[];
  rejectedCandidateIds: string[];
};

export type DecisionProductInteractionRequest = {
  contractVersion: "backyrd.decision-vnext.product-interaction-request@1.0";
  actionId: string;
  idempotencyKey: string;
  decisionId: string;
  eventType: "candidate_impression" | "candidate_opened";
  candidateId: string;
};

export type DecisionProductInteractionResponse = {
  contractVersion: "backyrd.decision-vnext.product-interaction-response@1.0";
  status: "ACKNOWLEDGED";
  decisionId: string;
  candidateId: string;
  eventType: DecisionProductInteractionRequest["eventType"];
  legacyWriteUsed: false;
  fallbackUsed: false;
};

export type DecisionProductCandidate = {
  spotId: string;
  presentation: {
    contractVersion: "backyrd.decision-vnext.product-presentation@1.0";
    spotId: string;
    name: string;
    locality: string | null;
    categoryLabel: string | null;
    imageUrl: string | null;
    sourceHash: string;
    presentationHash: string;
  };
  tier: "ELIGIBLE_CONFIRMED" | "UNCONFIRMED_FALLBACK" | "NOT_CONFIGURED" | "INELIGIBLE";
  rank: number | null;
  coreIntentCoverage: "CONFIRMED" | "UNKNOWN" | "NOT_CONFIGURED" | "INCOMPATIBLE" | "DISPUTED" | "NOT_APPLICABLE";
  actualAvailability: "open" | "closed" | "unknown" | "not_authorized" | "expired" | "disputed" | "not_requested";
  confirmedHardConstraints: string[];
  unknownHardConstraints: string[];
  failedHardConstraints: string[];
  rankVector: Record<string, unknown> & { vectorHash: string };
  reasons: Array<{ code: string; domain: "WORLD" | "USER" | "CONTEXT" | "ELIGIBILITY" | "RANKING" | "LIMITATION"; sourceHash: string; statement: string; confirmed: boolean }>;
  limitations: string[];
  contextualReject: boolean;
  candidateHash: string;
};

export type DecisionProductResponse = {
  contractVersion: "backyrd.decision-vnext.product-response@1.0";
  status: "AVAILABLE";
  decisionId: string;
  requestHash: string;
  envelopeHash: string;
  rankingPolicyVersion: "backyrd.decision-vnext.product-ranking-policy@1.0";
  rankingPolicyHash: string;
  interpretation: { interpretationHash: string; targetCity: string | null; [key: string]: unknown };
  primaryCandidateId: string | null;
  candidates: DecisionProductCandidate[];
  limitations: string[];
  alternative: { requested: boolean; selectedCandidateId: string | null; negativeSignalProduced: false };
  reject: { candidateIds: string[]; contextualOnly: true; worldFactProduced: false };
  personalization: { state: "ACTIVE" | "NEUTRAL"; neutralReason: string | null; projectionHash: string };
  learning: { mode: "CONSENT_BOUND_EVENTS" | "DISABLED_NEUTRAL"; acknowledgement: "CONSENT_BOUND_IDEMPOTENT" | "NOT_APPLICABLE_NEUTRAL"; eventCount: number; rawTextIncluded: false };
  productOutputAuthorized: true;
  legacyEngineUsed: false;
  fallbackUsed: false;
  resultHash: string;
};

export type DecisionProductReleaseBinding = {
  status: "PRODUCT_SINGLE_ROUTE_BOUND";
  releaseHash: string;
  bindingHash: string;
  transportFunction: "decision-v13";
  requestContract: DecisionProductRequest["contractVersion"];
  responseContract: DecisionProductResponse["contractVersion"];
  executionAuthorized: false;
};

export class DecisionProductUnavailableError extends Error {
  constructor(code: string, cause?: unknown);
  code: string;
  userMessage: string;
}

export const DECISION_PRODUCT_CONTRACT: Readonly<{ request: DecisionProductRequest["contractVersion"]; response: DecisionProductResponse["contractVersion"]; learningPort: "backyrd.user-intelligence.product-decision-learning-port@1.0"; transportFunction: "decision-v13" }>;
export function validateDecisionProductRequest<T extends DecisionProductRequest>(value: T): T;
export function validateDecisionProductResponse(value: unknown, request: DecisionProductRequest): DecisionProductResponse;
export function executeDecisionProductSingleRoute(input: { binding: DecisionProductReleaseBinding; request: DecisionProductRequest; invoke: (request: DecisionProductRequest) => Promise<unknown> }): Promise<Readonly<DecisionProductResponse>>;
export function executeDecisionProductInteraction(input: { binding: DecisionProductReleaseBinding; request: DecisionProductInteractionRequest; invoke: (request: DecisionProductInteractionRequest) => Promise<unknown> }): Promise<Readonly<DecisionProductInteractionResponse>>;
