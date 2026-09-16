#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, all) => {
  if (value.startsWith("--")) items.push([value.slice(2), all[index + 1]]);
  return items;
}, []));
if (!args.input || !args.output || !args.summary) throw new Error("usage: --input <local-json> --output <local-candidates> --summary <aggregate-json>");

const source = JSON.parse(readFileSync(resolve(args.input), "utf8"));
if (source.schemaVersion !== "backyrd.world-knowledge.week1-cohort-source@1" || source.environment !== "LOCAL_FOUNDER_EVALUATION" || source.claimAuthority !== "NONE") throw new Error("local_founder_source_contract_required");
if (!Array.isArray(source.spots) || new Set(source.spots.map(({ spotId }) => spotId)).size !== source.spots.length) throw new Error("unique_spot_source_required");
const target = Math.min(30, Math.max(20, source.spots.length));
const quotas = new Map([["EAT",8],["DRINKS",5],["COFFEE_DAYTIME",5],["CULTURE_ARTS",5],["NOT_CONFIGURED",7]]);
const score = (spot) => (spot.alreadyFounderSelected ? 1000 : 0) + spot.claimedFields * 20 + spot.mappedFields * 5 + Math.min(spot.ambiguousValues, 5);
const sorted = [...source.spots].sort((a,b) => score(b)-score(a) || a.spotId.localeCompare(b.spotId));
const selected = [];
for (const [category, quota] of quotas) selected.push(...sorted.filter((spot) => spot.primaryCategory===category && !selected.includes(spot)).slice(0,quota));
for (const spot of sorted) if (selected.length < target && !selected.includes(spot)) selected.push(spot);
selected.length = target;

const candidates = {
  schemaVersion: "backyrd.world-knowledge.week1-cohort-candidates@1",
  environment: source.environment,
  candidateOnly: true,
  claimAuthority: "NONE",
  automaticConfirmation: false,
  selectionPolicy: "DIVERSITY_THEN_DOCUMENTED_COVERAGE_V1",
  candidates: selected.sort((a,b) => a.spotId.localeCompare(b.spotId)),
};
candidates.candidateHash = sha256(stable(candidates));
writeFileSync(resolve(args.output), `${JSON.stringify(candidates,null,2)}\n`, { encoding:"utf8", mode:0o600 });

const categories = Object.fromEntries([...new Set(selected.map(({ primaryCategory }) => primaryCategory))].sort().map((category) => [category,selected.filter((spot)=>spot.primaryCategory===category).length]));
const requiredCoverage = ["purpose.primary_visit","classification.place_types","hours.regular","hours.kitchen_service","context.typical_dayparts","context.visit_situations","context.atmosphere","operation.price_level","accessibility.step_free_entrance","rule.age_access","offering.onsite"];
const fieldCoverage = Object.fromEntries(requiredCoverage.map((key) => [key, {
  confirmedOrAssertedClaim: selected.filter((spot) => spot.claimedKeys?.includes(key)).length,
  safeLegacyPrefill: selected.filter((spot) => spot.mappedKeys?.includes(key)).length,
  reviewRequired: selected.filter((spot) => spot.reviewKeys?.includes(key)).length,
  absent: selected.filter((spot) => !spot.claimedKeys?.includes(key) && !spot.mappedKeys?.includes(key) && !spot.reviewKeys?.includes(key)).length,
}]));
const aggregate = {
  schemaVersion: "backyrd.world-knowledge.week1-cohort-aggregate@1",
  sourceSpotCount: source.spots.length,
  candidateCount: selected.length,
  categories,
  alreadyFounderSelected: selected.filter(({ alreadyFounderSelected }) => alreadyFounderSelected).length,
  coverage: {
    withCanonicalClaims: selected.filter(({ claimedFields }) => claimedFields > 0).length,
    withSafeLegacyMappings: selected.filter(({ mappedFields }) => mappedFields > 0).length,
    withReviewRequiredValues: selected.filter(({ ambiguousValues }) => ambiguousValues > 0).length,
    fields: fieldCoverage,
  },
  authority: "CANDIDATE_ONLY_NO_CLAIMS_OR_CONFIRMATIONS",
  localCandidateHash: candidates.candidateHash,
};
aggregate.aggregateHash = sha256(stable(aggregate));
writeFileSync(resolve(args.summary), `${JSON.stringify(aggregate,null,2)}\n`, "utf8");
