import { assertContentHash } from "./canonical.js";
import { AuthorizedReasonSchema, type AuthorizedReason, type Confidence, type EvidenceItem, type FitDimensions, type WorldCandidate } from "./contracts.js";
import { evidenceMap, validateEvidence } from "./evidence.js";

type Claim = Omit<AuthorizedReason, "renderedText">;

const allowedEvidenceKinds: Readonly<Record<Claim["reasonCode"], readonly EvidenceItem["kind"][]>> = Object.freeze({
  verified_open: ["open_status"],
  nearby_fixture: ["distance"],
  popularity_fixture: ["popularity"],
  intent_match_fixture: ["intent_tags"],
  mood_match_fixture: ["mood_tags"],
  weak_world_evidence: ["data_quality"],
});

export function authorizeReasons(candidate: WorldCandidate, fit: FitDimensions, confidence: Confidence): readonly Claim[] {
  const byId = evidenceMap(candidate);
  const claims: Claim[] = [];
  const add = (reasonCode: Claim["reasonCode"], evidenceIds: readonly string[]) => {
    if (evidenceIds.length === 0) throw new Error("reason_evidence_required");
    for (const id of evidenceIds) {
      const item = byId.get(id);
      if (!item) throw new Error(`unknown_evidence_id:${id}`);
      if (!allowedEvidenceKinds[reasonCode].includes(item.kind)) throw new Error(`evidence_kind_not_authorized:${reasonCode}:${item.kind}`);
    }
    claims.push({ reasonCode, evidenceIds });
  };
  for (const dimension of fit.dimensions) {
    if (dimension.key === "fixture.open" && dimension.rawValue === 1) add("verified_open", dimension.evidenceIds);
    if (dimension.key === "fixture.distance" && dimension.rawValue >= 0.5) add("nearby_fixture", dimension.evidenceIds);
    if (dimension.key === "fixture.popularity" && dimension.rawValue > 0) add("popularity_fixture", dimension.evidenceIds);
    if (dimension.key === "fixture.intent_match" && dimension.rawValue > 0) add("intent_match_fixture", dimension.evidenceIds);
    if (dimension.key === "fixture.mood_match" && dimension.rawValue > 0) add("mood_match_fixture", dimension.evidenceIds);
  }
  for (const limitation of confidence.limitations) if (limitation.code === "weak-world-evidence") add("weak_world_evidence", limitation.evidenceIds);
  return claims;
}

const renderers: Readonly<Record<Claim["reasonCode"], string>> = Object.freeze({
  verified_open: "Der synthetische Öffnungsstatus ist als geöffnet belegt.",
  nearby_fixture: "Der Spot liegt im synthetischen Vergleich relativ nah.",
  popularity_fixture: "Für diesen Spot liegt ein synthetisches Popularitätssignal vor.",
  intent_match_fixture: "Die synthetischen Intent-Tags passen zur Anfrage.",
  mood_match_fixture: "Die synthetischen Mood-Tags passen zur Anfrage.",
  weak_world_evidence: "Die synthetische Datengrundlage dieses Spots ist schwach.",
});

export function renderAuthorizedReasons(claims: readonly Claim[], evidence: readonly EvidenceItem[]): readonly AuthorizedReason[] {
  const byId = new Map(evidence.map((item) => {
    validateEvidence(item);
    return [item.evidenceId, item] as const;
  }));
  return claims.map((claim) => {
    if (!renderers[claim.reasonCode]) throw new Error(`unknown_reason_code:${claim.reasonCode}`);
    for (const id of claim.evidenceIds) {
      const item = byId.get(id);
      if (!item) throw new Error(`unknown_evidence_id:${id}`);
      if (!allowedEvidenceKinds[claim.reasonCode].includes(item.kind)) throw new Error(`evidence_kind_not_authorized:${claim.reasonCode}:${item.kind}`);
    }
    return AuthorizedReasonSchema.parse({ ...claim, renderedText: renderers[claim.reasonCode] });
  });
}

export function validateExplanation(reasons: readonly AuthorizedReason[], candidate: WorldCandidate): void {
  const byId = evidenceMap(candidate);
  for (const reason of reasons) {
    AuthorizedReasonSchema.parse(reason);
    if (reason.evidenceIds.length === 0) throw new Error("reason_evidence_required");
    for (const id of reason.evidenceIds) {
      const item = byId.get(id);
      if (!item) throw new Error(`unknown_evidence_id:${id}`);
      assertContentHash(item as unknown as Record<string, unknown>, "evidenceHash");
      if (!allowedEvidenceKinds[reason.reasonCode].includes(item.kind)) throw new Error("reason_claim_not_supported");
    }
    if (reason.renderedText !== renderers[reason.reasonCode]) throw new Error("renderer_introduced_or_changed_claim");
  }
}
