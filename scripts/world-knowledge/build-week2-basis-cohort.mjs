#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}` : JSON.stringify(value);
const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => { if (value.startsWith("--")) all.push([value.slice(2), list[index + 1]]); return all; }, []));
if (!args.input || !args.output) throw new Error("usage: --input <week1-candidates.json> --output <aggregate.json>");
const input = JSON.parse(readFileSync(resolve(args.input), "utf8"));
if (input.schemaVersion !== "backyrd.world-knowledge.week1-cohort-candidates@1" || input.environment !== "LOCAL_FOUNDER_EVALUATION" || input.claimAuthority !== "NONE" || input.automaticConfirmation !== false || input.candidates?.length !== 30) throw new Error("week1_candidate_contract_required");
const keys = ["classification.primary_category", "purpose.primary_visit", "offering.onsite", "context.visit_situations", "context.atmosphere", "context.typical_dayparts", "hours.regular", "rule.age_access", "accessibility.step_free_entrance", "operation.price_level"];
const coverage = Object.fromEntries(keys.map((key) => [key, {
  documentedClaim: input.candidates.filter((spot) => spot.claimedKeys?.includes(key)).length,
  safeLegacyPrefill: input.candidates.filter((spot) => spot.mappedKeys?.includes(key)).length,
  reviewRequired: input.candidates.filter((spot) => spot.reviewKeys?.includes(key)).length,
  absent: input.candidates.filter((spot) => !spot.claimedKeys?.includes(key) && !spot.mappedKeys?.includes(key) && !spot.reviewKeys?.includes(key)).length,
  semanticStateCounts: { CONFIRMED: null, UNKNOWN: null, NOT_CONFIGURED: null, NOT_APPLICABLE: null, DISPUTED: null },
  semanticStateEvidence: "NOT_DERIVABLE_FROM_MINIMIZED_WEEK1_CANDIDATE_SOURCE",
}]));
const body = {
  schemaVersion: "backyrd.world-knowledge.world-basis-cohort@week2-v1",
  scope: "INTERNAL_ALLOWLIST_PREPARATION_ONLY",
  sourceCandidateHash: input.candidateHash,
  candidateCount: 30,
  geography: "Basel",
  identifiersIncluded: false,
  namesIncluded: false,
  contactsIncluded: false,
  actorPseudonymsIncluded: false,
  automaticConfirmation: false,
  automaticCohortMembership: false,
  registryVersion: "backyrd.world-knowledge.registry@2.1",
  stateVocabulary: ["CONFIRMED", "UNKNOWN", "NOT_CONFIGURED", "NOT_APPLICABLE", "DISPUTED"],
  coverage,
  gaps: Object.entries(coverage).filter(([, counts]) => counts.absent > 0 || counts.reviewRequired > 0).map(([key, counts]) => ({ key, absent: counts.absent, reviewRequired: counts.reviewRequired })),
  caveat: "The minimized Week-1 candidate source proves field presence only. It does not preserve per-value resolution, therefore semantic states remain explicitly uncounted rather than inferred.",
};
const output = { ...body, artifactHash: sha256(stable(body)) };
writeFileSync(resolve(args.output), `${JSON.stringify(output, null, 2)}\n`, "utf8");
