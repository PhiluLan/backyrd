import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../../supabase/migrations/20260919090423_world_product_admin_spot_search_v1.sql", import.meta.url), "utf8");
const executable = migration.replace(/^--.*$/gm, "").split("comment on function")[0];

test("Product Admin discovery uses the real bounded approved catalog with explicit authority", () => {
  assert.match(migration, /from public\.spots s/);
  assert.match(migration, /s\.status = 'approved'/);
  assert.match(migration, /auth\.uid\(\) is null or not public\.admin_is_admin_v1\(\)/);
  assert.match(migration, /limit p_limit \+ 1/);
  assert.match(migration, /'spotId', id, 'name', name, 'city', city/);
  assert.match(migration, /revoke all on function public\.world_product_admin_search_spots_v1\(text,integer\)\s+from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.world_product_admin_search_spots_v1\(text,integer\)\s+to authenticated/);
  assert.doesNotMatch(executable, /world_founder_list_spots_v1|world_founder_[a-z_]*spots|owner_id,|contact|email|actor_id/);
});
