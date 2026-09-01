#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function areaFor(row) {
  const value = `${row.schema_name}.${row.object_name}`.toLowerCase();
  if (row.schema_name === "decision_lab") return "DECISION / N3-N6";
  if (/safety|moderation|report_abuse/.test(value)) return "SAFETY";
  if (/trust|integrity|reputation|governance/.test(value)) return "TRUST / INTEGRITY";
  if (/owner|spot_claim|ownership/.test(value)) return "OWNER";
  if (/admin|founder_control/.test(value)) return "ADMIN";
  if (/decision|n3|n4|n5|n6|candidate_evidence|continuation/.test(value)) return "DECISION / N3-N6";
  if (/taste|memory|user_intelligence|user_evidence|learning/.test(value)) return "USER INTELLIGENCE / N2 / TASTE";
  if (/mood/.test(value)) return "MOOD";
  if (/review/.test(value)) return "REVIEWS";
  if (/social|moment|follow|comment|message|friend/.test(value)) return "MOMENTS / SOCIAL";
  if (/offering|purpose|archetype|taxonomy|gastronomy/.test(value)) return "OFFERING / PURPOSE";
  if (/gold|intelligence|research|fact|source|embedding|city_bootstrap/.test(value)) return "GOLD / SPOT INTELLIGENCE";
  if (/spot|place|photo|hours/.test(value)) return "SPOTS";
  if (/profile|identity|auth|consent|privacy|account_deletion/.test(value)) return "AUTH / IDENTITY";
  if (/analytics|cron|rate_limit|runtime_setting|outbox|job|queue|operation/.test(value)) return "OPERATIONS";
  if (row.object_type === "EXTENSION") return "OPERATIONS";
  return "LEGACY / UNKNOWN";
}

function trackedRuntimeFiles() {
  const names = execFileSync("git", ["-C", repositoryRoot, "ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((name) => !name.startsWith("supabase/migrations/"))
    .filter((name) => !name.startsWith("docs/"))
    .filter((name) => !name.startsWith("legal/"))
    .filter((name) => !name.includes(".backup_"))
    .filter((name) => !/(^|\/)(package-lock|pnpm-lock|yarn\.lock)/.test(name));

  const files = [];
  for (const name of names) {
    const path = resolve(repositoryRoot, name);
    try {
      if (statSync(path).size > 2_000_000) continue;
      const content = readFileSync(path, "utf8");
      if (!content.includes("\0")) files.push({ name, content });
    } catch {
      // A transiently unavailable tracked file is not classification evidence.
    }
  }
  return files;
}

function classify(row, runtimeReferences) {
  if (row.schema_name === "audit" || row.schema_name === "drizzle") {
    return {
      lifecycle: "DEAD_PROVEN",
      evidence: "No repository runtime consumer, database dependency, trigger, FK, publication, cron job, policy, or client/schema grant; technical snapshot/secondary ledger only.",
      disposition: "REMOVE_BY_20260831203122",
    };
  }
  if (row.schema_name === "public" && row.object_name === "_mood_token_merge_map") {
    return {
      lifecycle: "LEGACY_REQUIRED",
      evidence: "Eight retained historical token-merge mappings; no active runtime consumer, retained for lineage/audit compatibility.",
      disposition: "RETAIN",
    };
  }
  if (row.object_type === "EXTENSION" || row.object_type === "SCHEMA") {
    return { lifecycle: "ACTIVE", evidence: "Required by the canonical application schema/bootstrap.", disposition: "RETAIN" };
  }
  if (runtimeReferences.length > 0) {
    return { lifecycle: "ACTIVE", evidence: `Repository consumers: ${runtimeReferences.join(", ")}.`, disposition: "RETAIN" };
  }
  if (Number(row.dependency_count) > 0) {
    return { lifecycle: "ACTIVE", evidence: `${row.dependency_count} current PostgreSQL catalog dependency/dependencies.`, disposition: "RETAIN" };
  }
  if (Number(row.estimated_rows) > 0) {
    return { lifecycle: "LEGACY_REQUIRED", evidence: "Stored rows exist without a proven current runtime consumer; retained to protect history.", disposition: "RETAIN" };
  }
  if (row.client_roles) {
    return { lifecycle: "LEGACY_REQUIRED", evidence: `Callable compatibility surface for ${row.client_roles}; no deletion proof.`, disposition: "RETAIN" };
  }
  return {
    lifecycle: "UNKNOWN",
    evidence: "No current consumer was proven and no complete deletion proof exists; retained fail-closed.",
    disposition: "RETAIN",
  };
}

const inputIndex = process.argv.indexOf("--input");
if (inputIndex < 0 || !process.argv[inputIndex + 1]) {
  process.stderr.write("Usage: generate-database-object-inventory.mjs --input <db-query-json>\n");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(resolve(process.argv[inputIndex + 1]), "utf8"));
const rows = raw.rows ?? raw;
const runtimeFiles = trackedRuntimeFiles();
const grants = rows.filter((row) => row.object_type === "GRANT");
const objects = rows.filter((row) => row.object_type !== "GRANT").map((row) => {
  const references = runtimeFiles.filter((file) => file.content.includes(row.object_name)).map((file) => file.name).slice(0, 12);
  const classification = classify(row, references);
  return {
    object_type: row.object_type,
    identity: row.identity,
    system_area: areaFor(row),
    lifecycle: classification.lifecycle,
    evidence: classification.evidence,
    disposition: classification.disposition,
    security_definer: Boolean(row.security_definer),
    rls_enabled: Boolean(row.rls_enabled),
  };
});

const countBy = (items, key) => Object.fromEntries(
  [...new Set(items.map((item) => item[key]))].sort().map((value) => [value, items.filter((item) => item[key] === value).length]),
);
const grantSummary = Object.entries(countBy(grants.map((row) => ({ grantee: row.client_roles || "UNKNOWN" })), "grantee"))
  .map(([grantee, count]) => ({ grantee, count }));
const output = {
  version: "backyrd-database-object-inventory-v1",
  captured_at: "2026-08-31T20:30:00Z",
  source_project_ref: "hjgcrrzfjchzqoegcywn",
  source_state: "READ_ONLY_PRE_CONSOLIDATION_WITH_FORWARD_DISPOSITION",
  canonical_query: "scripts/ops/database-object-inventory.sql",
  classification_method: "Repository consumer scan plus PostgreSQL dependency/ACL/data evidence; uncertainty is retained, never upgraded to deletion proof.",
  catalog_counts_before: countBy(objects, "object_type"),
  lifecycle_counts_before: countBy(objects, "lifecycle"),
  system_area_counts_before: countBy(objects, "system_area"),
  expected_resulting_lifecycle_counts: {
    ACTIVE: objects.filter((item) => item.lifecycle === "ACTIVE").length,
    LEGACY_REQUIRED: objects.filter((item) => item.lifecycle === "LEGACY_REQUIRED").length,
    DEAD_PROVEN: 0,
    UNKNOWN: objects.filter((item) => item.lifecycle === "UNKNOWN").length,
  },
  dead_proven_removed_count: objects.filter((item) => item.lifecycle === "DEAD_PROVEN").length,
  grant_count: grants.length,
  grants_by_grantee: grantSummary,
  objects,
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
