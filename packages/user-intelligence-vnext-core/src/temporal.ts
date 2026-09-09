import { ContractValidationError, identifier, Infer, schema, timestamp } from "./schema.js";

export const TEMPORAL_VALIDATION_CONTRACT_VERSION = "backyrd.user-intelligence.temporal-policy@1.0";
export const TemporalValidationPolicySchema = schema.object({
  contractVersion: schema.literal(TEMPORAL_VALIDATION_CONTRACT_VERSION), policyVersion: identifier, maxFutureSkewMs: schema.number({ min: 0, integer: true }),
  delayedEventPolicy: schema.enum(["REJECT", "ALLOW_WITHIN_BOUND"] as const), maxDelayMs: schema.number({ min: 0, integer: true }),
  observationOrderExceptionEventTypes: schema.array(identifier, { max: 16 }),
});
export type TemporalValidationPolicy = Infer<typeof TemporalValidationPolicySchema>;

export const TemporalValidationInputSchema = schema.object({
  eventType: identifier, occurredAt: timestamp, observedAt: timestamp, ingestedAt: timestamp, serverNow: timestamp,
  timeAuthority: schema.enum(["SERVER_CLOCK", "CLIENT_REPORTED_ACCEPTED_OFFLINE"] as const), policy: TemporalValidationPolicySchema,
});
export type TemporalValidationInput = Infer<typeof TemporalValidationInputSchema>;

export function validateTemporalIntegrity(value: TemporalValidationInput): void {
  const input = TemporalValidationInputSchema.parse(value);
  const policy = input.policy;
  const occurred = Date.parse(input.occurredAt); const observed = Date.parse(input.observedAt); const ingested = Date.parse(input.ingestedAt); const now = Date.parse(input.serverNow);
  if (occurred > now + policy.maxFutureSkewMs) throw new ContractValidationError("$.occurredAt", "occurrence is beyond the injected future-skew policy");
  if (observed < occurred && !policy.observationOrderExceptionEventTypes.includes(input.eventType)) throw new ContractValidationError("$.observedAt", "observation precedes occurrence without a documented exception");
  if (ingested < observed) throw new ContractValidationError("$.ingestedAt", "ingestion precedes the accepted observation time");
  if (input.timeAuthority === "CLIENT_REPORTED_ACCEPTED_OFFLINE") {
    if (policy.delayedEventPolicy !== "ALLOW_WITHIN_BOUND") throw new ContractValidationError("$.timeAuthority", "offline client time is not allowed by the injected policy");
    if (now - occurred > policy.maxDelayMs) throw new ContractValidationError("$.occurredAt", "offline occurrence exceeds the injected delay bound");
  }
}
