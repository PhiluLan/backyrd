import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const version = "backyrd.world-knowledge.coverage-normalizer@1.0";
const path = process.argv[2];
if (!path) throw new Error("usage: node normalize-production-coverage.mjs <aggregate-json-file>");
const parsed = JSON.parse(readFileSync(path, "utf8"));
if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("aggregate object required");

const allowedCounts = Object.freeze({
  spots: ["total", "approved", "archived", "other"],
  coverage: ["name", "address", "locality", "coordinates", "implausible_coordinates", "category", "ordinal_price", "website", "phone", "ambiguous_email", "external_google_reference"],
  hours: ["spots_with_regular_hours", "structurally_invalid_rows"],
  gold: ["spots_with_accepted_facts", "accepted_fact_rows", "accepted_facts_without_source_fk", "accepted_facts_without_observed_at", "accepted_facts_without_valid_until", "stale_rows"],
  sources: ["source_rows", "unbound_source_rows", "sources_without_last_check"],
  duplicates: ["duplicate_rows_by_google_reference", "duplicate_google_reference_groups"],
  categories: ["used_legacy_categories", "spots_without_category"],
  security: ["public_tables", "public_tables_with_rls", "public_views", "security_definer_functions", "security_definer_public_execute"],
});
const allowedRoot = ["queryVersion", "migrationTip", ...Object.keys(allowedCounts)];
for (const field of Object.keys(parsed)) if (!allowedRoot.includes(field)) throw new Error(`identifying or unknown field forbidden at $.${field}`);
if (parsed.queryVersion !== "backyrd.world-knowledge.production-coverage-query@1.0") throw new Error("unknown query version");
if (parsed.migrationTip !== null && (typeof parsed.migrationTip !== "string" || !/^\d{14}$/.test(parsed.migrationTip))) throw new Error("invalid migration tip");
const aggregate = { queryVersion: parsed.queryVersion, migrationTip: parsed.migrationTip ?? null };
for (const [group, fields] of Object.entries(allowedCounts)) {
  const value = parsed[group];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`aggregate group required at $.${group}`);
  for (const field of Object.keys(value)) if (!fields.includes(field)) throw new Error(`identifying or unknown field forbidden at $.${group}.${field}`);
  aggregate[group] = Object.fromEntries(fields.map((field) => {
    const count = value[field];
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`non-negative integer required at $.${group}.${field}`);
    return [field, count];
  }));
}
const canonicalize = (value) => Array.isArray(value) ? `[${value.map(canonicalize).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}` : JSON.stringify(value);
const body = { contractVersion: version, aggregate };
const aggregateHash = createHash("sha256").update(canonicalize(body)).digest("hex");
process.stdout.write(`${JSON.stringify({ ...body, aggregateHash }, null, 2)}\n`);
