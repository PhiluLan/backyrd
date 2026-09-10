import { canonicalJson, contentHash } from "./canonical.js";
import { CONTRACT_VERSIONS, EventReferencesSchema } from "./contracts.js";
import { ContractValidationError, identifier, Infer, schema, sha256, timestamp } from "./schema.js";

const version = schema.literal(CONTRACT_VERSIONS.journeyResolution);
const linkBase = { recordId: identifier, recordHash: sha256, policyVersion: identifier, boundUserId: identifier } as const;
const ExistingJourneyLinkSchema = schema.object({ ...linkBase, kind: schema.literal("EXISTING_JOURNEY"), authority: schema.literal("SERVER_PRODUCT_TRUTH"), journeyId: identifier, matchedBy: schema.enum(["DECISION", "SESSION", "EXPERIENCE"] as const), decisionId: schema.optional(identifier), sessionId: schema.optional(identifier), spotId: schema.optional(identifier), experienceEventId: schema.optional(identifier) });
const IndependentExperienceLinkSchema = schema.object({ ...linkBase, kind: schema.literal("INDEPENDENT_EXPERIENCE"), authority: schema.literal("VERIFIED_OUTCOME"), spotId: identifier, experienceEventId: identifier });
const CorrelationOnlyLinkSchema = schema.object({ ...linkBase, kind: schema.literal("CORRELATION_ONLY"), authority: schema.literal("SERVER_PRODUCT_TRUTH"), basis: schema.enum(["SAME_SPOT_ONLY", "TEMPORAL_PROXIMITY_WITHOUT_PRODUCT_LINK", "SHARED_CONTEXT_ONLY"] as const), spotId: schema.optional(identifier), decisionId: schema.optional(identifier), sessionId: schema.optional(identifier) });
export const JourneyLinkSchema = schema.union([ExistingJourneyLinkSchema, IndependentExperienceLinkSchema, CorrelationOnlyLinkSchema]);
export type JourneyLink = Infer<typeof JourneyLinkSchema>;

export const JourneyAuthorityRecordSchema = schema.object({
  recordId: identifier, recordHash: sha256, authority: schema.enum(["SERVER_PRODUCT_TRUTH", "VERIFIED_OUTCOME"] as const), policyVersion: identifier, boundUserId: identifier,
  journeyId: schema.nullable(identifier), spotId: schema.nullable(identifier), decisionId: schema.nullable(identifier), sessionId: schema.nullable(identifier), experienceEventId: schema.nullable(identifier), validUntil: timestamp,
});
export type JourneyAuthorityRecord = Infer<typeof JourneyAuthorityRecordSchema>;
export function withJourneyAuthorityRecordHash(value: Omit<JourneyAuthorityRecord, "recordHash">): JourneyAuthorityRecord { return JourneyAuthorityRecordSchema.parse({ ...value, recordHash: contentHash(value) }); }

/** This port is supplied by trusted server composition; event payloads never instantiate authority. */
export interface JourneyAuthorityVerifier {
  readonly contextVersion: string;
  readonly verifiedAt: string;
  readonly acceptedPolicyVersions: readonly string[];
  findRecord(recordId: string): unknown | null;
}

export const JourneyResolutionInputSchema = schema.object({ contractVersion: version, policyVersion: identifier, boundUserId: identifier, subjectBindingHash: sha256, event: schema.object({ eventId: identifier, occurredAt: timestamp, references: EventReferencesSchema }), links: schema.array(JourneyLinkSchema, { max: 32 }) });
export type JourneyResolutionInput = Infer<typeof JourneyResolutionInputSchema>;
const REASONS = ["MATCHED_SERVER_DECISION", "MATCHED_SERVER_SESSION", "MATCHED_VERIFIED_EXPERIENCE", "VERIFIED_INDEPENDENT_EXPERIENCE", "ONLY_NON_AUTHORITATIVE_CORRELATION", "NO_AUTHORITATIVE_LINK", "CONFLICTING_JOURNEY_LINKS", "INDEPENDENT_AND_EXISTING_CONFLICT"] as const;
export const JourneyResolutionSchema = schema.object({ contractVersion: version, policyVersion: identifier, subjectBindingHash: sha256, eventId: identifier, status: schema.enum(["SAME_JOURNEY", "PROBABLE_RELATED", "INDEPENDENT_NEW_JOURNEY", "UNRESOLVED", "CONFLICT"] as const), journeyId: schema.nullable(identifier), independenceEligible: schema.boolean(), reasonCodes: schema.array(schema.enum(REASONS), { min: 1, max: 8 }), authorityContextVersion: identifier, authorityProofHashes: schema.array(sha256, { max: 32 }), proofInputHash: sha256, proofHash: sha256 });
export type JourneyResolution = Infer<typeof JourneyResolutionSchema>;

const normalizedInput = (input: JourneyResolutionInput): JourneyResolutionInput => ({ ...input, links: [...input.links].sort((a, b) => a.recordId.localeCompare(b.recordId)) });
function verifyLinks(input: JourneyResolutionInput, verifier: JourneyAuthorityVerifier): readonly { link: JourneyLink; record: JourneyAuthorityRecord }[] {
  timestamp.parse(verifier.verifiedAt, "$.authority.verifiedAt"); identifier.parse(verifier.contextVersion, "$.authority.contextVersion");
  const ids = new Map<string, string>(); const hashes = new Map<string, string>();
  for (const link of input.links) {
    if (ids.has(link.recordId)) throw new ContractValidationError("$.links", ids.get(link.recordId) === link.recordHash ? "duplicate authority record id" : "conflicting authority record id reuse");
    if (hashes.has(link.recordHash)) throw new ContractValidationError("$.links", "authority record hash is reused by another record id");
    ids.set(link.recordId, link.recordHash); hashes.set(link.recordHash, link.recordId);
  }
  return input.links.map((link) => {
    if (!verifier.acceptedPolicyVersions.includes(link.policyVersion) || link.policyVersion !== input.policyVersion) throw new ContractValidationError("$.links.policyVersion", "unknown or mismatched authority policy version");
    const raw = verifier.findRecord(link.recordId); if (raw === null || raw === undefined) throw new ContractValidationError("$.links.recordId", "authority record is absent from the injected server verifier");
    const record = JourneyAuthorityRecordSchema.parse(raw); const recordBody = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "recordHash"));
    if (contentHash(recordBody) !== record.recordHash) throw new ContractValidationError("$.authority.recordHash", "authoritative record hash is invalid");
    if (Date.parse(record.validUntil) < Date.parse(verifier.verifiedAt)) throw new ContractValidationError("$.authority.validUntil", "authority record is expired");
    const expected = { recordId: link.recordId, recordHash: link.recordHash, authority: link.authority, policyVersion: link.policyVersion, boundUserId: link.boundUserId, journeyId: link.kind === "EXISTING_JOURNEY" ? link.journeyId : null, spotId: "spotId" in link ? link.spotId ?? null : null, decisionId: "decisionId" in link ? link.decisionId ?? null : null, sessionId: "sessionId" in link ? link.sessionId ?? null : null, experienceEventId: "experienceEventId" in link ? link.experienceEventId ?? null : null, validUntil: record.validUntil };
    if (canonicalJson(record) !== canonicalJson(expected)) throw new ContractValidationError("$.links", "journey link differs from the authoritative server record");
    if (record.boundUserId !== input.boundUserId) throw new ContractValidationError("$.links.boundUserId", "authority record belongs to another user");
    const refs = input.event.references;
    if (record.spotId !== (refs.spotId ?? null) || record.decisionId !== (refs.decisionId ?? null) || record.sessionId !== (refs.sessionId ?? null) || record.experienceEventId !== (refs.experienceEventId ?? null)) throw new ContractValidationError("$.links", "authority record does not exactly bind event spot, decision, session and experience references");
    if (link.kind === "EXISTING_JOURNEY" && ((link.matchedBy === "DECISION" && record.decisionId === null) || (link.matchedBy === "SESSION" && record.sessionId === null) || (link.matchedBy === "EXPERIENCE" && record.experienceEventId === null))) throw new ContractValidationError("$.links", "declared match lacks its authoritative reference");
    return { link, record };
  });
}

function finalize(input: JourneyResolutionInput, verifier: JourneyAuthorityVerifier, records: readonly JourneyAuthorityRecord[], status: JourneyResolution["status"], journeyId: string | null, independenceEligible: boolean, reasonCodes: readonly JourneyResolution["reasonCodes"][number][]): JourneyResolution {
  const authorityProofHashes = records.map((record) => record.recordHash).sort(); const proofInputHash = contentHash({ input: normalizedInput(input), authorityContextVersion: verifier.contextVersion, authorityProofHashes });
  const body = { contractVersion: CONTRACT_VERSIONS.journeyResolution, policyVersion: input.policyVersion, subjectBindingHash: input.subjectBindingHash, eventId: input.event.eventId, status, journeyId, independenceEligible, reasonCodes: [...reasonCodes].sort(), authorityContextVersion: verifier.contextVersion, authorityProofHashes, proofInputHash } as const;
  return JourneyResolutionSchema.parse({ ...body, proofHash: contentHash(body) });
}

export function resolveJourney(value: unknown, verifier: JourneyAuthorityVerifier): JourneyResolution {
  const input = JourneyResolutionInputSchema.parse(value); const verified = verifyLinks(input, verifier); const links = verified.map((entry) => entry.link); const records = verified.map((entry) => entry.record);
  const existing = links.filter((link): link is Infer<typeof ExistingJourneyLinkSchema> => link.kind === "EXISTING_JOURNEY"); const independent = links.filter((link): link is Infer<typeof IndependentExperienceLinkSchema> => link.kind === "INDEPENDENT_EXPERIENCE"); const journeyIds = [...new Set(existing.map((link) => link.journeyId))];
  if (journeyIds.length > 1) return finalize(input, verifier, records, "CONFLICT", null, false, ["CONFLICTING_JOURNEY_LINKS"]);
  if (journeyIds.length === 1 && independent.length) return finalize(input, verifier, records, "CONFLICT", null, false, ["INDEPENDENT_AND_EXISTING_CONFLICT"]);
  if (journeyIds.length === 1) return finalize(input, verifier, records, "SAME_JOURNEY", journeyIds[0]!, true, [...new Set(existing.map((link) => link.matchedBy === "DECISION" ? "MATCHED_SERVER_DECISION" as const : link.matchedBy === "SESSION" ? "MATCHED_SERVER_SESSION" as const : "MATCHED_VERIFIED_EXPERIENCE" as const))]);
  if (independent.length) return finalize(input, verifier, records, "INDEPENDENT_NEW_JOURNEY", `journey-${contentHash({ subjectBindingHash: input.subjectBindingHash, eventId: input.event.eventId, policyVersion: input.policyVersion, records: independent.map((link) => link.recordHash).sort() })}`, true, ["VERIFIED_INDEPENDENT_EXPERIENCE"]);
  if (links.some((link) => link.kind === "CORRELATION_ONLY")) return finalize(input, verifier, records, "PROBABLE_RELATED", null, false, ["ONLY_NON_AUTHORITATIVE_CORRELATION"]);
  return finalize(input, verifier, records, "UNRESOLVED", null, false, ["NO_AUTHORITATIVE_LINK"]);
}

export function parseJourneyResolution(value: unknown): JourneyResolution {
  const parsed = JourneyResolutionSchema.parse(value);
  if ((parsed.status === "SAME_JOURNEY" || parsed.status === "INDEPENDENT_NEW_JOURNEY") !== (parsed.journeyId !== null && parsed.independenceEligible)) throw new ContractValidationError("$.journeyId", "resolution status, journey identity and independence are inconsistent");
  if (contentHash(Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== "proofHash"))) !== parsed.proofHash) throw new ContractValidationError("$.proofHash", "journey proof hash mismatch");
  return parsed;
}
