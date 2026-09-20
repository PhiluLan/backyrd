import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Product spot care reuses the complete typed nine-step World editor, not JSON authoring", async () => {
  const [product, editor] = await Promise.all([
    source("../../packages/world-knowledge-authoring-ui/src/ProductCorrection.tsx"),
    source("../../packages/world-knowledge-authoring-ui/src/index.tsx"),
  ]);
  assert.match(product, /className="wk-app wk-product-app"/);
  assert.match(product, /AUTHORING_STEPS\.map/);
  assert.match(product, /getAuthoringFieldsForContext/);
  assert.match(product, /<FieldEditor/);
  assert.match(editor, /FieldEditor=\{FieldInput\}/);
  assert.doesNotMatch(product, /Wert als JSON|JSON\.parse\(valueText\)|<textarea/);
  assert.match(product, /classification\.primary_category/);
  assert.match(product, /purpose\.primary_visit/);
  assert.match(product, /operation\.price_level/);
});

test("Product edits remain append-only, role-scoped and reader-verified", async () => {
  const product = await source("../../packages/world-knowledge-authoring-ui/src/ProductCorrection.tsx");
  assert.match(product, /actor\.allowedAttributeKeys\.includes\(field\.attributeKey\)/);
  assert.match(product, /snapshotConflicts\(refreshed\)/);
  assert.match(product, /conflict\.severity === "BLOCKING"/);
  assert.doesNotMatch(product, /openConflicts\.some/);
  assert.match(product, /Prüfnotizen.*blockieren die Bearbeitung nicht/);
  assert.match(product, /validateAuthoringSubmission/);
  assert.match(product, /world_product_admin_submit_claim_v1/);
  assert.match(product, /world_product_owner_submit_claim_v1/);
  assert.match(product, /p_supersedes_claim_id/);
  assert.match(product, /await rebuild\(detail\.spotId/);
  assert.match(product, /refreshed\.manifest\?\.manifestHash !== result\.manifestHash/);
  assert.match(product, /Die Angabe wurde gespeichert, aber die Datenvorschau/);
});

test("Admin maintenance has its own OFF switch while owner writes retain Decision authority", async () => {
  const [migration, existing] = await Promise.all([
    source("../../supabase/migrations/20260919120432_world_product_admin_authoring_independent_v1.sql"),
    source("../../supabase/migrations/20260919073307_decision_product_activation_lease_v1.sql"),
  ]);
  assert.match(migration, /values \(0,'OFF','INITIAL_OFF'\)/);
  assert.match(migration, /product_admin_authoring_active_v1\(\)/);
  assert.match(migration, /world_product_admin_authoring_off/);
  assert.match(migration, /current_user <> 'postgres'/);
  assert.match(migration, /public\.is_admin_v1\(auth\.uid\(\)\)/);
  assert.match(migration, /public\.is_admin_v1\(p_actor_user_id\)/);
  assert.match(migration, /revoke all on world_knowledge_private\.product_admin_authoring_control_events_v1/);
  assert.match(existing, /world_product_owner_submit_claim_v1[\s\S]*?product_authoring_active_v1\(\)/);
});

test("the live Decision route reads the current validated World pointer after Admin rebuild", async () => {
  const [route, sql, product] = await Promise.all([
    source("../app/api/world-knowledge/shadow/route.ts"),
    source("../../supabase/migrations/20260919073307_decision_product_activation_lease_v1.sql"),
    source("../../packages/world-knowledge-authoring-ui/src/ProductCorrection.tsx"),
  ]);
  assert.match(product, /await rebuild\(detail\.spotId/);
  assert.match(route, /world_product_rebuild_spot_v1/);
  assert.match(route, /detail\.manifest\.manifestHash !== rebuilt\?\.manifestHash/);
  assert.match(sql, /from world_knowledge_private\.current_projection_pointers p/);
  assert.match(sql, /world_knowledge_private\.validate_resolution_manifest_v1\(m\.id\)/);
});

test("approved catalog coverage is explicit, bounded and resumable without inventing intent", async () => {
  const [migration, product] = await Promise.all([
    source("../../supabase/migrations/20260919122454_world_product_approved_catalog_bootstrap_v1.sql"),
    source("../../packages/world-knowledge-authoring-ui/src/ProductCorrection.tsx"),
  ]);
  assert.match(migration, /world_product_admin_bootstrap_catalog_v1/);
  assert.match(migration, /p_limit not between 1 and 10/);
  assert.match(migration, /p_acknowledgement is distinct from 'APPROVED_CATALOG_BASELINE_ONLY'/);
  assert.match(migration, /where s\.status='approved'/);
  assert.match(migration, /'classification\.primary_category','purpose\.primary_visit'/);
  assert.match(migration, /v_state:='UNKNOWN'; v_value:=null/);
  assert.match(migration, /not exists\(select 1 from world_knowledge_private\.claims c/);
  assert.match(migration, /world_shadow_rebuild_spot_v1/);
  assert.match(product, /world_product_admin_catalog_coverage_v1/);
  assert.match(product, /world_product_admin_bootstrap_catalog_v1/);
  assert.match(product, /Freigegebene Spots in World übernehmen/);
});
