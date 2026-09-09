import type { ClientObservationInput, RelevantUserProjectionRequest } from "../src/index.js";

const validClientObservation: ClientObservationInput = {
  clientEventId: "client-1", eventType: "SPOT_OPENED", occurredAt: "2026-01-15T12:00:00.000Z",
  observedAt: "2026-01-15T12:00:00.000Z", journeyId: "journey-1", references: { spotId: "spot-1" },
};
void validClientObservation;

const forbiddenClientIdentity: ClientObservationInput = {
  clientEventId: "client-2", eventType: "SPOT_OPENED", occurredAt: "2026-01-15T12:00:00.000Z",
  observedAt: "2026-01-15T12:00:00.000Z", journeyId: "journey-1", references: { spotId: "spot-1" },
  // @ts-expect-error user identity is server-bound and absent from client input
  userId: "forged-user",
};
void forbiddenClientIdentity;

const forbiddenClientOutcome: ClientObservationInput = {
  clientEventId: "client-3",
  // @ts-expect-error clients cannot declare verified outcomes
  eventType: "VERIFIED_VISIT",
  occurredAt: "2026-01-15T12:00:00.000Z", observedAt: "2026-01-15T12:00:00.000Z",
  journeyId: "journey-1", references: { spotId: "spot-1" },
};
void forbiddenClientOutcome;

declare const request: RelevantUserProjectionRequest;
const serverBoundUser: string = request.actor.userId;
void serverBoundUser;
