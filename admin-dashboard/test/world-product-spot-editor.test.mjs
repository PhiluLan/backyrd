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
  assert.match(product, /openConflicts\.some/);
  assert.match(product, /validateAuthoringSubmission/);
  assert.match(product, /world_product_admin_submit_claim_v1/);
  assert.match(product, /world_product_owner_submit_claim_v1/);
  assert.match(product, /p_supersedes_claim_id/);
  assert.match(product, /await rebuild\(detail\.spotId/);
  assert.match(product, /refreshed\.manifest\?\.manifestHash !== result\.manifestHash/);
  assert.match(product, /Die Angabe wurde gespeichert, aber die Datenvorschau/);
});

test("Decision-OFF authoring boundary is unchanged by the UI improvement", async () => {
  const migration = await source("../../supabase/migrations/20260919073307_decision_product_activation_lease_v1.sql");
  assert.match(migration, /if not world_knowledge_private\.product_authoring_active_v1\(\) then/);
  assert.match(migration, /world_product_authoring_authority_off/);
});
