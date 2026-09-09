import { canonicalBytes, contentHash } from "./canonical.js";
import {
  parseRelevantUserProjection, RelevantUserProjection, RelevantUserProjectionRequest, UserIntelligenceManifest,
  UserIntelligenceSnapshot, ConsentEnvelope, projectionHashBody,
} from "./contracts.js";

export interface ProjectionContent {
  readonly taste: RelevantUserProjection["taste"];
  readonly practical: RelevantUserProjection["practical"];
  readonly directSpot: RelevantUserProjection["directSpot"];
  readonly domainSufficiency: RelevantUserProjection["domainSufficiency"];
  readonly knowledgeLevel: RelevantUserProjection["knowledgeLevel"];
  readonly suppression: RelevantUserProjection["suppression"];
}

export interface ProjectionBuildInput {
  readonly request: RelevantUserProjectionRequest;
  readonly consent: ConsentEnvelope;
  readonly manifest: Pick<UserIntelligenceManifest, "manifestId" | "manifestHash">;
  readonly snapshot: UserIntelligenceSnapshot | null;
  readonly content: ProjectionContent;
  readonly identity: { readonly projectionId: string };
  readonly clock: { readonly now: string };
  readonly forcedNeutralReason?: RelevantUserProjection["neutralReason"];
}

const boundaries: RelevantUserProjection["boundaries"] = Object.freeze({
  rawEventsIncluded: false, reviewTextIncluded: false, rawLocationIncluded: false, privateSocialDataIncluded: false,
  eligibilityAuthority: false, rankingAuthority: false,
});

function assemble(input: ProjectionBuildInput, status: "ACTIVE" | "NEUTRAL", neutralReason: RelevantUserProjection["neutralReason"], content: ProjectionContent): RelevantUserProjection {
  const actualItems = content.taste.length + content.practical.length + content.directSpot.length;
  const withoutHash: Omit<RelevantUserProjection, "projectionHash"> = {
    contractVersion: "backyrd.user-intelligence.projection@1.0", projectionId: input.identity.projectionId,
    decisionId: input.request.decisionId, userId: input.request.actor.userId,
    snapshot: input.snapshot ? { snapshotId: input.snapshot.snapshotId, snapshotHash: input.snapshot.snapshotHash } : null,
    manifest: { manifestId: input.manifest.manifestId, manifestHash: input.manifest.manifestHash }, status, neutralReason,
    taste: content.taste, practical: content.practical, directSpot: content.directSpot,
    domainSufficiency: content.domainSufficiency, knowledgeLevel: content.knowledgeLevel, suppression: content.suppression,
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

export function buildRelevantUserProjection(input: ProjectionBuildInput): RelevantUserProjection {
  let neutralReason = input.forcedNeutralReason ?? null;
  if (input.request.killSwitch) neutralReason = "KILL_SWITCH";
  else if (input.consent.state !== "GRANTED" || !input.consent.allowedProcessing.includes("PERSONALIZATION_EVIDENCE")) neutralReason = "NO_CONSENT";
  else if (!input.snapshot) neutralReason = "MISSING_SNAPSHOT";
  else if (input.snapshot.userId !== input.request.actor.userId) throw new Error("projection_cross_user_snapshot");
  else if (input.snapshot.snapshotId !== input.request.snapshot.snapshotId || input.snapshot.snapshotHash !== input.request.snapshot.snapshotHash) throw new Error("projection_snapshot_reference_mismatch");
  else if (input.content.knowledgeLevel === "UNKNOWN" || input.content.knowledgeLevel === "LOW") neutralReason = "COLD_START";

  const activeItems = input.content.taste.length + input.content.practical.length + input.content.directSpot.length;
  if (activeItems > input.request.budgets.maxItems) neutralReason = "ITEM_BUDGET";
  let result = assemble(input, neutralReason ? "NEUTRAL" : "ACTIVE", neutralReason, neutralReason ? emptyContent(neutralReason) : input.content);
  if (result.budgets.canonicalPayloadBytes > input.request.budgets.maxBytes && neutralReason !== "BYTE_BUDGET") result = assemble(input, "NEUTRAL", "BYTE_BUDGET", emptyContent("BYTE_BUDGET"));
  if (result.budgets.canonicalPayloadBytes > input.request.budgets.maxBytes) throw new Error("projection_byte_budget_too_small_for_neutral_contract");
  return parseRelevantUserProjection(result, input.request);
}
