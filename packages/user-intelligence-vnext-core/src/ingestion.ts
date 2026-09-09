import {
  CanonicalUserEvent, EventReferencesSchema, JourneyBindingSchema, parseCanonicalUserEvent, ServerReferenceBindingSchema, withEventHash,
} from "./contracts.js";
import { ContractValidationError, identifier, Infer, schema, timestamp } from "./schema.js";
import { TemporalValidationPolicy, validateTemporalIntegrity } from "./temporal.js";

export const ClientObservationInputSchema = schema.object({
  clientEventId: identifier,
  eventType: schema.enum(["CANDIDATE_EXPOSED", "SPOT_OPENED", "NAVIGATION_INTENT"] as const),
  clientOccurredAt: timestamp,
  observedTarget: schema.object({ decisionId: schema.optional(identifier), spotId: schema.optional(identifier), candidateId: schema.optional(identifier) }),
  localCorrelationId: schema.optional(identifier),
});
export type ClientObservationInput = Infer<typeof ClientObservationInputSchema>;

export const VerifiedProductStateInputSchema = schema.object({
  eventType: schema.enum(["SAVED", "SAVE_REMOVED", "RESERVATION_INTENT"] as const),
  productStateRecordId: identifier,
});
export type VerifiedProductStateInput = Infer<typeof VerifiedProductStateInputSchema>;

export interface ServerBindingContext {
  readonly authenticatedUserId: string;
  readonly authenticatedActorId: string;
  readonly producer: string;
  readonly sourceRecordId: string;
  readonly eventId: string;
  readonly consent: CanonicalUserEvent["consent"];
  readonly retentionClass: string;
  readonly idempotencyKey: string;
  readonly references: CanonicalUserEvent["references"];
  readonly journey: CanonicalUserEvent["journey"];
  readonly referencePolicyVersion: string;
  readonly referenceBinding: Omit<Infer<typeof ServerReferenceBindingSchema>, "referencePolicyVersion">;
  readonly temporal: {
    readonly occurredAt: string; readonly observedAt: string; readonly ingestedAt: string; readonly serverNow: string;
    readonly timeAuthority: CanonicalUserEvent["temporalBinding"]["timeAuthority"];
    readonly policy: TemporalValidationPolicy;
  };
}

const mapping = Object.freeze({
  CANDIDATE_EXPOSED: { eventClass: "EXPOSURE", payload: { kind: "EXPOSURE", candidateCount: 1 }, authorityKind: "CLIENT_OBSERVATION", sourceTrust: "UNTRUSTED_OBSERVATION" },
  SPOT_OPENED: { eventClass: "WEAK_INTERACTION", payload: { kind: "INTERACTION", action: "SPOT_OPENED" }, authorityKind: "CLIENT_OBSERVATION", sourceTrust: "UNTRUSTED_OBSERVATION" },
  NAVIGATION_INTENT: { eventClass: "DELIBERATE_INTENT", payload: { kind: "INTENT", action: "NAVIGATION" }, authorityKind: "AUTHENTICATED_USER_ACTION", sourceTrust: "AUTHENTICATED" },
} as const);
const productMapping = Object.freeze({
  SAVED: { action: "SAVED" }, SAVE_REMOVED: { action: "SAVE_REMOVED" }, RESERVATION_INTENT: { action: "RESERVATION" },
} as const);

function parseServerBinding(server: ServerBindingContext, eventType: string): ServerBindingContext {
  EventReferencesSchema.parse(server.references);
  JourneyBindingSchema.parse(server.journey);
  const referenceBinding = ServerReferenceBindingSchema.parse({ ...server.referenceBinding, referencePolicyVersion: server.referencePolicyVersion });
  if (referenceBinding.boundUserId !== server.authenticatedUserId) throw new ContractValidationError("$.referenceBinding.boundUserId", "product references are bound to another user");
  validateTemporalIntegrity({ eventType, ...server.temporal });
  return server;
}

function assertObservedTargetMatches(input: ClientObservationInput, server: ServerBindingContext): void {
  for (const key of ["decisionId", "spotId", "candidateId"] as const) {
    const claim = input.observedTarget[key];
    if (claim !== undefined && claim !== server.references[key]) throw new ContractValidationError(`$.observedTarget.${key}`, "client claim does not match authoritative product reference");
  }
  if (server.temporal.timeAuthority === "CLIENT_REPORTED_ACCEPTED_OFFLINE" && input.clientOccurredAt !== server.temporal.occurredAt) throw new ContractValidationError("$.clientOccurredAt", "accepted offline timestamp must equal the server-bound canonical occurrence time");
}

function commonBody(server: ServerBindingContext) {
  return {
    contractVersion: "backyrd.user-intelligence.canonical-user-event@1.0" as const,
    eventId: server.eventId, occurredAt: server.temporal.occurredAt, observedAt: server.temporal.observedAt,
    ingestedAt: server.temporal.ingestedAt, userId: server.authenticatedUserId, references: server.references,
    journey: server.journey, referenceResolution: { ...server.referenceBinding, referencePolicyVersion: server.referencePolicyVersion },
    temporalBinding: { contractVersion: "backyrd.user-intelligence.temporal-validation@1.0" as const, policyVersion: server.temporal.policy.policyVersion, timeAuthority: server.temporal.timeAuthority, validatedAt: server.temporal.serverNow },
    consent: server.consent, retentionClass: server.retentionClass, idempotencyKey: server.idempotencyKey,
  };
}

export function bindClientObservation(input: unknown, rawServer: ServerBindingContext): CanonicalUserEvent {
  const parsed = ClientObservationInputSchema.parse(input);
  const server = parseServerBinding(rawServer, parsed.eventType);
  assertObservedTargetMatches(parsed, server);
  const semantics = mapping[parsed.eventType];
  const body = {
    ...commonBody(server), eventType: parsed.eventType, eventClass: semantics.eventClass,
    source: { system: "backyrd-product", producer: server.producer, sourceRecordId: server.sourceRecordId, provenance: semantics.authorityKind === "CLIENT_OBSERVATION" ? "CLIENT_OBSERVED" as const : "USER_DECLARED" as const },
    authority: { contractVersion: "backyrd.user-intelligence.user-event-authority@1.0" as const, kind: semantics.authorityKind, boundUserId: server.authenticatedUserId, binding: "SERVER_BOUND" as const, assertedBy: server.producer, authenticatedActorId: server.authenticatedActorId, sourceTrust: semantics.sourceTrust },
    payload: semantics.payload,
  };
  return parseCanonicalUserEvent(withEventHash(body), server.authenticatedUserId);
}

export function bindVerifiedProductState(input: unknown, rawServer: ServerBindingContext): CanonicalUserEvent {
  const parsed = VerifiedProductStateInputSchema.parse(input);
  const server = parseServerBinding(rawServer, parsed.eventType);
  if (parsed.productStateRecordId !== server.sourceRecordId) throw new ContractValidationError("$.productStateRecordId", "product state record is not the authoritative source record");
  const semantics = productMapping[parsed.eventType];
  const body = {
    ...commonBody(server), eventType: parsed.eventType, eventClass: "DELIBERATE_INTENT" as const,
    source: { system: "backyrd-product", producer: server.producer, sourceRecordId: server.sourceRecordId, provenance: "PRODUCT_STATE" as const },
    authority: { contractVersion: "backyrd.user-intelligence.user-event-authority@1.0" as const, kind: "SERVER_VERIFIED_PRODUCT_STATE" as const, boundUserId: server.authenticatedUserId, binding: "SERVER_BOUND" as const, assertedBy: server.producer, sourceTrust: "SERVER_VERIFIED" as const },
    payload: { kind: "INTENT" as const, action: semantics.action },
  };
  return parseCanonicalUserEvent(withEventHash(body), server.authenticatedUserId);
}
