import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../supabase/migrations/20260927134435_world_product_admin_research_queue_v1.sql", import.meta.url), "utf8");
const queueRoute = await readFile(new URL("../app/api/world-knowledge/research-queue/route.ts", import.meta.url), "utf8");
const exportRoute = await readFile(new URL("../app/api/world-knowledge/research-batch/route.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../app/world-knowledge/WorldResearchBatchPanel.tsx", import.meta.url), "utf8");

test("research queue stays Admin-only and reads approved spots in stable ten-item order", () => {
  assert.match(migration, /public\.is_admin_v1\(auth\.uid\(\)\)/);
  assert.match(migration, /where s\.status = 'approved'/);
  assert.match(migration, /order by pg_catalog\.lower\(s\.name\), s\.id/);
  assert.match(migration, /limit 10 offset \(p_page - 1\) \* 10/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on world_knowledge_private\.research_spot_exports_v1 from public, anon, authenticated, service_role/);
  assert.match(queueRoute, /authorizeAdminRequest/);
  assert.doesNotMatch(queueRoute, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("export progress cannot be mistaken for completed research", () => {
  assert.match(migration, /research_claim_evidence_v1 e where e\.spot_id = s\.id/);
  assert.match(migration, /research_spot_exports_v1 x on x\.spot_id = s\.id/);
  assert.match(exportRoute, /body\.recordExport === true/);
  assert.match(panel, /„Exportiert“ heißt noch nicht recherchiert/);
  assert.match(panel, /spot\.importedAt \? "Angaben übernommen" : spot\.exportedAt \? "Exportiert · Import offen" : "Noch offen"/);
  assert.match(panel, /Vorherige 10/);
  assert.match(panel, /Nächste 10/);
});
