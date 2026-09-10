import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./normalize-production-coverage.mjs", import.meta.url);
const input = {
  queryVersion: "backyrd.world-knowledge.production-coverage-query@1.0", migrationTip: "20260909073004",
  spots: { total: 10, approved: 8, archived: 1, other: 1 },
  coverage: { name: 10, address: 9, locality: 10, coordinates: 8, implausible_coordinates: 0, category: 9, ordinal_price: 4, website: 5, phone: 4, ambiguous_email: 1, external_google_reference: 7 },
  hours: { spots_with_regular_hours: 5, structurally_invalid_rows: 0 },
  gold: { spots_with_accepted_facts: 4, accepted_fact_rows: 12, accepted_facts_without_source_fk: 0, accepted_facts_without_observed_at: 3, accepted_facts_without_valid_until: 9, stale_rows: 1 },
  sources: { source_rows: 6, unbound_source_rows: 0, sources_without_last_check: 2 },
  duplicates: { duplicate_rows_by_google_reference: 1, duplicate_google_reference_groups: 1 },
  categories: { used_legacy_categories: 5, spots_without_category: 1 },
  security: { public_tables: 20, public_tables_with_rls: 18, public_views: 4, security_definer_functions: 7, security_definer_public_execute: 0 },
};
const run = (value) => {
  const directory = mkdtempSync(join(tmpdir(), "wk-coverage-")); const path = join(directory, "aggregate.json");
  writeFileSync(path, JSON.stringify(value));
  const result = spawnSync(process.execPath, [script.pathname, path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return JSON.parse(result.stdout);
};

test("normalizer emits deterministic SHA-256 for aggregate-only input", () => {
  assert.equal(run(input).aggregateHash, run(structuredClone(input)).aggregateHash);
  assert.match(run(input).aggregateHash, /^[a-f0-9]{64}$/);
});

test("normalizer rejects identifiers even when nested", () => {
  assert.throws(() => run({ ...input, spotName: "Real Place" }), /identifying or unknown field forbidden/);
  assert.throws(() => run({ ...input, coverage: { ...input.coverage, name: "Real Place" } }), /non-negative integer required/);
  assert.throws(() => run({ ...input, coverage: { ...input.coverage, phone: -1 } }), /non-negative integer required/);
});
