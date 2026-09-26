import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/world-knowledge/research-batch/route.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../app/world-knowledge/WorldResearchBatchPanel.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../../supabase/migrations/20260926120337_world_research_batch_import_v1.sql", import.meta.url), "utf8");

test("research import reuses the canonical append-only writer and rebuild", () => {
  assert.match(migration, /submit_authoritative_claim_v3/);
  assert.match(route, /world_product_admin_import_research_spot_v2/);
  assert.match(route, /world_product_rebuild_spot_v1/);
  assert.doesNotMatch(route, /\.from\([^)]*claims[^)]*\).*\.insert/s);
});

test("research provenance is private, immutable and admin-only", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /research_claim_evidence_immutable_v1/);
  assert.match(migration, /revoke all on world_knowledge_private\.research_claim_evidence_v1 from public,anon,authenticated,service_role/);
  assert.match(migration, /public\.is_admin_v1\(auth\.uid\(\)\)/);
  assert.match(migration, /world_research_existing_value_conflict/);
});

test("Admin UI limits the workflow to ten and requires preview before import", () => {
  assert.match(panel, /current\.length < 10/);
  assert.match(panel, /Recherche-JSON herunterladen/);
  assert.match(panel, /JSON prüfen/);
  assert.match(panel, /preview\.mode !== "PREVIEW"/);
  assert.match(panel, /unresolved/);
});

test("review choices refresh the preview automatically and keep commit separate", () => {
  assert.match(panel, /const next = \{ \.\.\.confirmations/);
  assert.match(panel, /void previewBatch\(next, true\)/);
  assert.match(panel, /setReviewChanged\(false\)/);
  assert.match(panel, /busy \|\| reviewChanged \|\| preview\.totals\.invalid > 0 \|\| preview\.totals\.ready < 1/);
  assert.match(panel, /Jetzt \{preview\.totals\.ready\} geprüfte Angabe\(n\) übernehmen/);
  assert.match(panel, /Bisherige behalten/);
});

test("research export starts from canonical World values, never old Spot attributes", () => {
  const exportBranch = route.slice(route.indexOf('if (body?.action === "export")'), route.indexOf('if (body?.action !== "preview"'));
  assert.match(exportBranch, /detail\.answers/);
  assert.match(exportBranch, /entry\[1\]\.visibility === "PUBLIC"/);
  assert.doesNotMatch(exportBranch, /\.from\("spots"\)|legacy|spot\.address|spot\.description/);
  assert.match(panel, /alte Spot-Felder werden nicht als Fakten übernommen/);
});
