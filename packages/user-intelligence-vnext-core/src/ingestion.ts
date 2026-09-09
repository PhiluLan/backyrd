import { CanonicalUserEvent, parseCanonicalUserEvent, withEventHash } from "./contracts.js";
import { identifier, Infer, schema, timestamp } from "./schema.js";

const ClientObservationInputSchema = schema.object({
  clientEventId: identifier,
  eventType: schema.enum(["CANDIDATE_EXPOSED", "SPOT_OPENED", "SAVED", "SAVE_REMOVED", "NAVIGATION_INTENT", "RESERVATION_INTENT"] as const),
  occurredAt: timestamp,
  observedAt: timestamp,
  journeyId: identifier,
  references: schema.object({ sessionId: schema.optional(identifier), decisionId: schema.optional(identifier), spotId: schema.optional(identifier) }),
});
export type ClientObservationInput = Infer<typeof ClientObservationInputSchema>;

export interface ServerBindingContext {
  readonly authenticatedUserId: string;
  readonly authenticatedActorId: string;
  readonly producer: string;
  readonly sourceRecordId: string;
  readonly eventId: string;
  readonly ingestedAt: string;
  readonly consent: CanonicalUserEvent["consent"];
  readonly retentionClass: string;
  readonly idempotencyKey: string;
}

const mapping = Object.freeze({
  CANDIDATE_EXPOSED: { eventClass: "EXPOSURE", payload: { kind: "EXPOSURE", candidateCount: 1 }, authorityKind: "CLIENT_OBSERVATION", sourceTrust: "UNTRUSTED_OBSERVATION" },
  SPOT_OPENED: { eventClass: "WEAK_INTERACTION", payload: { kind: "INTERACTION", action: "SPOT_OPENED" }, authorityKind: "AUTHENTICATED_USER_ACTION", sourceTrust: "AUTHENTICATED" },
  SAVED: { eventClass: "DELIBERATE_INTENT", payload: { kind: "INTENT", action: "SAVED" }, authorityKind: "AUTHENTICATED_USER_ACTION", sourceTrust: "AUTHENTICATED" },
  SAVE_REMOVED: { eventClass: "DELIBERATE_INTENT", payload: { kind: "INTENT", action: "SAVE_REMOVED" }, authorityKind: "AUTHENTICATED_USER_ACTION", sourceTrust: "AUTHENTICATED" },
  NAVIGATION_INTENT: { eventClass: "DELIBERATE_INTENT", payload: { kind: "INTENT", action: "NAVIGATION" }, authorityKind: "AUTHENTICATED_USER_ACTION", sourceTrust: "AUTHENTICATED" },
  RESERVATION_INTENT: { eventClass: "DELIBERATE_INTENT", payload: { kind: "INTENT", action: "RESERVATION" }, authorityKind: "AUTHENTICATED_USER_ACTION", sourceTrust: "AUTHENTICATED" },
} as const);

export function bindClientObservation(input: unknown, server: ServerBindingContext): CanonicalUserEvent {
  const parsed = ClientObservationInputSchema.parse(input);
  const semantics = mapping[parsed.eventType];
  const body = {
    contractVersion: "backyrd.user-intelligence.canonical-user-event@1.0" as const,
    eventId: server.eventId, eventType: parsed.eventType, eventClass: semantics.eventClass,
    occurredAt: parsed.occurredAt, observedAt: parsed.observedAt, ingestedAt: server.ingestedAt,
    userId: server.authenticatedUserId, references: parsed.references, journeyId: parsed.journeyId,
    source: { system: "backyrd-product", producer: server.producer, sourceRecordId: server.sourceRecordId, provenance: parsed.eventType === "CANDIDATE_EXPOSED" ? "CLIENT_OBSERVED" as const : "USER_DECLARED" as const },
    authority: {
      contractVersion: "backyrd.user-intelligence.user-event-authority@1.0" as const,
      kind: semantics.authorityKind, boundUserId: server.authenticatedUserId, binding: "SERVER_BOUND" as const,
      assertedBy: server.producer, authenticatedActorId: server.authenticatedActorId, sourceTrust: semantics.sourceTrust,
    },
    consent: server.consent, retentionClass: server.retentionClass, idempotencyKey: server.idempotencyKey, payload: semantics.payload,
  };
  return parseCanonicalUserEvent(withEventHash(body), server.authenticatedUserId);
}
