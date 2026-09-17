export type FounderDecisionRequest = {
  contractVersion: "backyrd.decision-api.request@1.0";
  requestId: string;
  idempotencyKey: string;
  context: { city: string; query: string; moods: string[]; audience: string[]; placeTypes: string[] };
  continuation: null | { decisionId: string; requestId: string };
};

export type FounderReleaseBinding = {
  status: "YELLOW_CANDIDATES_PENDING" | "READY_FOR_FOUNDER_ALLOWLIST";
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

export const FOUNDER_DECISION_CONTRACT: Readonly<{ request: string; response: string; routeAuthority: string; localStub: string }>;
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
