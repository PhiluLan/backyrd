import { contentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, EventReferencesSchema } from "./contracts.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";

const version = schema.literal(CONTRACT_VERSIONS.journeyResolution);

const ExistingJourneyLinkSchema = schema.object({
  kind: schema.literal("EXISTING_JOURNEY"), authority: schema.literal("SERVER_PRODUCT_TRUTH"),
  boundUserId: identifier, journeyId: identifier, matchedBy: schema.enum(["DECISION", "SESSION", "EXPERIENCE"] as const),
  decisionId: schema.optional(identifier), sessionId: schema.optional(identifier), spotId: schema.optional(identifier), recordHash: sha256,
});
const IndependentExperienceLinkSchema = schema.object({
  kind: schema.literal("INDEPENDENT_EXPERIENCE"), authority: schema.literal("VERIFIED_OUTCOME"),
  boundUserId: identifier, spotId: identifier, recordHash: sha256,
});
const CorrelationOnlyLinkSchema = schema.object({
  kind: schema.literal("CORRELATION_ONLY"), authority: schema.literal("SERVER_PRODUCT_TRUTH"),
  boundUserId: identifier, basis: schema.enum(["SAME_SPOT_ONLY", "TEMPORAL_PROXIMITY_WITHOUT_PRODUCT_LINK", "SHARED_CONTEXT_ONLY"] as const), recordHash: sha256,
});
export const JourneyLinkSchema = schema.union([ExistingJourneyLinkSchema, IndependentExperienceLinkSchema, CorrelationOnlyLinkSchema]);
export type JourneyLink = Infer<typeof JourneyLinkSchema>;

export const JourneyResolutionInputSchema = schema.object({
  contractVersion: version, policyVersion: identifier, boundUserId: identifier, subjectBindingHash: sha256,
  event: schema.object({ eventId: identifier, occurredAt: timestamp, references: EventReferencesSchema }),
  links: schema.array(JourneyLinkSchema, { max: 32 }),
});
export type JourneyResolutionInput = Infer<typeof JourneyResolutionInputSchema>;

const JOURNEY_REASON_CODES = [
  "MATCHED_SERVER_DECISION", "MATCHED_SERVER_SESSION", "MATCHED_VERIFIED_EXPERIENCE",
  "VERIFIED_INDEPENDENT_EXPERIENCE", "ONLY_NON_AUTHORITATIVE_CORRELATION", "NO_AUTHORITATIVE_LINK",
  "FOREIGN_USER_LINK", "CONFLICTING_JOURNEY_LINKS", "REFERENCE_MISMATCH", "INDEPENDENT_AND_EXISTING_CONFLICT",
] as const;

export const JourneyResolutionSchema = schema.object({
  contractVersion: version, policyVersion: identifier, subjectBindingHash: sha256, eventId: identifier,
  status: schema.enum(["SAME_JOURNEY", "PROBABLE_RELATED", "INDEPENDENT_NEW_JOURNEY", "UNRESOLVED", "CONFLICT"] as const),
  journeyId: schema.nullable(identifier), independenceEligible: schema.boolean(),
  reasonCodes: schema.array(schema.enum(JOURNEY_REASON_CODES), { min: 1, max: 8 }),
  proofInputHash: sha256, proofHash: sha256,
});
export type JourneyResolution = Infer<typeof JourneyResolutionSchema>;

function normalizedInput(input: JourneyResolutionInput): JourneyResolutionInput {
  return { ...input, links: [...input.links].sort((left, right) => left.recordHash.localeCompare(right.recordHash)) };
}

function finalize(input: JourneyResolutionInput, status: JourneyResolution["status"], journeyId: string | null, independenceEligible: boolean, reasonCodes: readonly JourneyResolution["reasonCodes"][number][]): JourneyResolution {
  const normalized = normalizedInput(input);
  const proofInputHash = contentHash(normalized);
  const body = { contractVersion: CONTRACT_VERSIONS.journeyResolution, policyVersion: input.policyVersion, subjectBindingHash: input.subjectBindingHash, eventId: input.event.eventId, status, journeyId, independenceEligible, reasonCodes: [...reasonCodes].sort(), proofInputHash } as const;
  return JourneyResolutionSchema.parse({ ...body, proofHash: contentHash(body) });
}

export function resolveJourney(value: unknown): JourneyResolution {
  const input = JourneyResolutionInputSchema.parse(value);
  const links = normalizedInput(input).links;
  if (links.some((link) => link.boundUserId !== input.boundUserId)) return finalize(input, "CONFLICT", null, false, ["FOREIGN_USER_LINK"]);

  const mismatched = links.some((link) => {
    if (link.kind !== "EXISTING_JOURNEY") return link.kind === "INDEPENDENT_EXPERIENCE" && input.event.references.spotId !== undefined && link.spotId !== input.event.references.spotId;
    return (link.decisionId !== undefined && input.event.references.decisionId !== undefined && link.decisionId !== input.event.references.decisionId)
      || (link.sessionId !== undefined && input.event.references.sessionId !== undefined && link.sessionId !== input.event.references.sessionId)
      || (link.spotId !== undefined && input.event.references.spotId !== undefined && link.spotId !== input.event.references.spotId);
  });
  if (mismatched) return finalize(input, "CONFLICT", null, false, ["REFERENCE_MISMATCH"]);

  const existing = links.filter((link): link is Infer<typeof ExistingJourneyLinkSchema> => link.kind === "EXISTING_JOURNEY");
  const independent = links.filter((link): link is Infer<typeof IndependentExperienceLinkSchema> => link.kind === "INDEPENDENT_EXPERIENCE");
  const journeyIds = [...new Set(existing.map((link) => link.journeyId))];
  if (journeyIds.length > 1) return finalize(input, "CONFLICT", null, false, ["CONFLICTING_JOURNEY_LINKS"]);
  if (journeyIds.length === 1 && independent.length > 0) return finalize(input, "CONFLICT", null, false, ["INDEPENDENT_AND_EXISTING_CONFLICT"]);
  if (journeyIds.length === 1) {
    const reasons = existing.map((link) => link.matchedBy === "DECISION" ? "MATCHED_SERVER_DECISION" as const : link.matchedBy === "SESSION" ? "MATCHED_SERVER_SESSION" as const : "MATCHED_VERIFIED_EXPERIENCE" as const);
    return finalize(input, "SAME_JOURNEY", journeyIds[0]!, true, [...new Set(reasons)]);
  }
  if (independent.length > 0) {
    const journeyId = `journey-${contentHash({ subjectBindingHash: input.subjectBindingHash, eventId: input.event.eventId, policyVersion: input.policyVersion, records: independent.map((link) => link.recordHash).sort() })}`;
    return finalize(input, "INDEPENDENT_NEW_JOURNEY", journeyId, true, ["VERIFIED_INDEPENDENT_EXPERIENCE"]);
  }
  if (links.some((link) => link.kind === "CORRELATION_ONLY")) return finalize(input, "PROBABLE_RELATED", null, false, ["ONLY_NON_AUTHORITATIVE_CORRELATION"]);
  return finalize(input, "UNRESOLVED", null, false, ["NO_AUTHORITATIVE_LINK"]);
}

export function parseJourneyResolution(value: unknown): JourneyResolution {
  const parsed = JourneyResolutionSchema.parse(value);
  if ((parsed.status === "SAME_JOURNEY" || parsed.status === "INDEPENDENT_NEW_JOURNEY") !== (parsed.journeyId !== null && parsed.independenceEligible)) throw new ContractValidationError("$.journeyId", "resolution status, journey identity and independence are inconsistent");
  const body = Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== "proofHash"));
  if (contentHash(body) !== parsed.proofHash) throw new ContractValidationError("$.proofHash", "journey proof hash mismatch");
  return parsed;
}
