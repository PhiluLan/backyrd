import { canonicalBytes, contentHash } from "./canonical.js";
import {
  ConsentEnvelopeSchema, DomainSufficiencySchema, parseConsentEnvelope, parseRelevantUserProjection, ProjectedDirectSpotSchema, ProjectedPracticalSchema,
  ProjectedTasteSchema, RelevantUserProjection, RelevantUserProjectionRequestSchema, SUPPRESSION_REASON_CODES,
  SuppressionSummarySchema, UserIntelligenceSnapshotSchema, projectionHashBody,
} from "./contracts.js";
import { identifier, Infer, schema, sha256, timestamp } from "./schema.js";

export const ProjectionContentSchema = schema.object({
  taste: schema.array(ProjectedTasteSchema, { max: 64 }), practical: schema.array(ProjectedPracticalSchema, { max: 64 }),
  directSpot: schema.array(ProjectedDirectSpotSchema, { max: 64 }), domainSufficiency: schema.array(DomainSufficiencySchema, { max: 64 }),
  knowledgeLevel: schema.enum(["UNKNOWN", "LOW", "PARTIAL", "SUFFICIENT"] as const), suppression: SuppressionSummarySchema,
});
export type ProjectionContent = Infer<typeof ProjectionContentSchema>;

export const ProjectionBuildInputSchema = schema.object({
  request: RelevantUserProjectionRequestSchema, consent: ConsentEnvelopeSchema,
  manifest: schema.object({ manifestId: identifier, manifestHash: sha256 }),
  snapshot: schema.nullable(UserIntelligenceSnapshotSchema), content: ProjectionContentSchema,
  identity: schema.object({ projectionId: identifier }), clock: schema.object({ now: timestamp }),
  forcedNeutralReason: schema.optional(schema.enum(SUPPRESSION_REASON_CODES)),
});
export type ProjectionBuildInput = Infer<typeof ProjectionBuildInputSchema>;

const boundaries: RelevantUserProjection["boundaries"] = Object.freeze({
  rawEventsIncluded: false, reviewTextIncluded: false, rawLocationIncluded: false, privateSocialDataIncluded: false,
  eligibilityAuthority: false, rankingAuthority: false,
});

function isPrivacyNeutral(reason: RelevantUserProjection["neutralReason"]): boolean {
  return reason === "NO_CONSENT" || reason === "MISSING_SNAPSHOT" || reason === "KILL_SWITCH";
}

function assemble(input: ProjectionBuildInput, status: "ACTIVE" | "NEUTRAL", neutralReason: RelevantUserProjection["neutralReason"], content: ProjectionContent): RelevantUserProjection {
  const actualItems = content.taste.length + content.practical.length + content.directSpot.length;
  const privacyNeutral = isPrivacyNeutral(neutralReason);
  const withoutHash: Omit<RelevantUserProjection, "projectionHash"> = {
    contractVersion: "backyrd.user-intelligence.projection@1.0", projectionId: input.identity.projectionId,
    decisionId: input.request.decisionId, subjectBindingHash: input.request.actor.subjectBindingHash,
    snapshot: privacyNeutral || !input.snapshot ? null : { snapshotId: input.snapshot.snapshotId, snapshotHash: input.snapshot.snapshotHash },
    manifest: input.manifest, status, neutralReason,
    taste: content.taste, practical: content.practical, directSpot: content.directSpot,
    domainSufficiency: content.domainSufficiency, knowledgeLevel: content.knowledgeLevel,
    suppression: privacyNeutral ? { total: 0, byReason: [] } : content.suppression,
    boundaries,
    budgets: { maxItems: input.request.budgets.maxItems, maxBytes: input.request.budgets.maxBytes, actualItems, canonicalPayloadBytes: 0 },
    technicalMetadata: { createdAt: input.clock.now },
  };
  const canonicalPayloadBytes = canonicalBytes(projectionHashBody(withoutHash));
  const measured = { ...withoutHash, budgets: { ...withoutHash.budgets, canonicalPayloadBytes } };
  return { ...measured, projectionHash: contentHash(projectionHashBody(measured)) };
}

const emptyContent = (reason: NonNullable<RelevantUserProjection["neutralReason"]>): ProjectionContent => ({
  taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN",
  suppression: { total: 1, byReason: [{ code: reason, count: 1 }] },
});

export function buildRelevantUserProjection(value: unknown): RelevantUserProjection {
  const input = ProjectionBuildInputSchema.parse(value);
  parseConsentEnvelope(input.consent);
  let neutralReason = input.forcedNeutralReason ?? null;
  if (input.request.killSwitch) neutralReason = "KILL_SWITCH";
  else if (input.consent.state !== "GRANTED" || !input.consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE")) neutralReason = "NO_CONSENT";
  else if (!input.snapshot || !input.request.snapshot) neutralReason = "MISSING_SNAPSHOT";
  else if (input.snapshot.userId !== input.request.actor.userId) throw new Error("projection_cross_user_snapshot");
  else if (input.snapshot.snapshotId !== input.request.snapshot.snapshotId || input.snapshot.snapshotHash !== input.request.snapshot.snapshotHash) throw new Error("projection_snapshot_reference_mismatch");
  else if (input.content.knowledgeLevel === "UNKNOWN" || input.content.knowledgeLevel === "LOW") neutralReason = "COLD_START";

  const activeItems = input.content.taste.length + input.content.practical.length + input.content.directSpot.length;
  if (neutralReason === null && activeItems > input.request.budgets.maxItems) neutralReason = "ITEM_BUDGET";
  let result = assemble(input, neutralReason ? "NEUTRAL" : "ACTIVE", neutralReason, neutralReason ? emptyContent(neutralReason) : input.content);
  if (result.budgets.canonicalPayloadBytes > input.request.budgets.maxBytes && !isPrivacyNeutral(neutralReason) && neutralReason !== "BYTE_BUDGET") result = assemble(input, "NEUTRAL", "BYTE_BUDGET", emptyContent("BYTE_BUDGET"));
  if (result.budgets.canonicalPayloadBytes > input.request.budgets.maxBytes) throw new Error("projection_byte_budget_too_small_for_neutral_contract");
  return parseRelevantUserProjection(result, input.request);
}
