export type FounderDecisionRequest = {
  contractVersion: "backyrd.decision-api.request@1.0";
  requestId: string;
  idempotencyKey: string;
  context: { city: string; query: string; moods: string[]; audience: string[]; placeTypes: string[] };
  continuation: null | { decisionId: string; requestId: string };
};

export type FounderReleaseBinding = {
  status: "YELLOW_CANDIDATES_PENDING" | "GREEN_CANDIDATES_BOUND" | "READY_FOR_FOUNDER_ALLOWLIST";
  releaseHash: string;
  bindingHash: string;
  allCandidatesBound: boolean;
  vNextFunction: string | null;
  fallbackFunction: string;
  executionAuthorized: false;
};

export class FounderDecisionUnavailableError extends Error {
  constructor(code: string, cause?: unknown);
  code: string;
  userMessage: string;
}

export const FOUNDER_DECISION_CONTRACT: Readonly<{ request: string; response: string; routeAuthority: string; localStub: string; gatewayResponse: string }>;
export type FounderLiveReadOnlyResponse = { contractVersion: "backyrd.decision-vnext.founder-live-response@1.1"; status: "EVALUATION_ONLY"; understood: { primaryIntent: string | null; secondaryIntent: string | null; occasion: string | null; targetCity: string | null; hardConditions: string[]; softPreferences: string[] }; candidates: Array<{ name: string; group: string; reasons: string[] }>; limitations: string[]; alternative: { requested: boolean; negativeSignalProduced: false }; reject: { contextualOnly: true; userLearningProduced: false }; rankingState: "NOT_CONFIGURED" };
export function validateFounderDecisionGatewayResponse(value: unknown): { contractVersion: string; route: "FOUNDER_LIVE_READ_ONLY" | "EXISTING_ENGINE"; requestId: string; writebackPerformed: false; response: FounderLiveReadOnlyResponse | null };
export function routeFounderDecisionGateway<T extends object>(input: { binding: FounderReleaseBinding; request: FounderDecisionRequest; invokeGateway: (request: FounderDecisionRequest) => Promise<unknown>; invokeExisting: (request: FounderDecisionRequest) => Promise<T>; hash: (value: unknown) => Promise<string> }): Promise<Readonly<{ route: "FOUNDER_LIVE_READ_ONLY" | "EXISTING_ENGINE"; response: FounderLiveReadOnlyResponse | T; mixedResults: false; writebackPerformed: false; observability: Readonly<Record<string, unknown>> }>>;
export function validateFounderDecisionRequest<T extends FounderDecisionRequest>(value: T): T;
export function routeFounderDecision<T>(input: {
  binding: FounderReleaseBinding;
  request: FounderDecisionRequest;
  serverAuthority?: unknown;
  invokeVNext: (request: FounderDecisionRequest) => Promise<T>;
  invokeExisting: (request: FounderDecisionRequest) => Promise<T>;
  hash: (value: unknown) => Promise<string>;
  now?: string;
}): Promise<Readonly<{ response: T; route: "VNEXT" | "EXISTING_ENGINE"; fallbackReason: string | null; mixedResults: false; writebackPerformed: false; observability: Readonly<Record<string, unknown>> }>>;
export function createContractGeneratedLocalStub(input: { worldVersion: string; spots: Array<{ id: string; name: string }> }): (request: FounderDecisionRequest, options: { executionEnvironment: "LOCAL_TEST"; hash: (value: unknown) => Promise<string> }) => Promise<unknown>;
