import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, form, route, migration] = await Promise.all([
  readFile(new URL("../app/spots/[id]/edit/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/spots/SpotForm.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/world-knowledge/shadow/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../../supabase/migrations/20260923045854_unify_world_spot_authoring_projection.sql", import.meta.url), "utf8"),
]);

test("approved spot editing presents World Knowledge before non-semantic operations", () => {
  assert.ok(page.indexOf('id="spot-understanding"') < page.indexOf('id="spot-information"'));
  assert.match(page, /Profil & Angebote/);
  assert.match(page, /canonicalKnowledgeManaged/);
});

test("pending imported spots use the Admin form before World Knowledge is available", () => {
  assert.match(page, /const isDraft = spot\?\.status === "pending"/);
  assert.match(page, /spot\.status === "approved" \? <div id="spot-understanding"/);
  assert.match(page, /canonicalKnowledgeManaged=\{!isDraft\}/);
  assert.match(page, /if \(savedSpot\) setSpot\(savedSpot\)/);
});

test("compatibility mode cannot write a second copy of semantic facts", () => {
  assert.match(form, /const payload: Partial<SpotFormValues> = canonicalKnowledgeManaged/);
  assert.match(form, /if \(mode === "create" && !canonicalKnowledgeManaged\) \{\s*await upsertAdminContent/);
  assert.match(form, /if \(mode === "create" && !canonicalKnowledgeManaged\) await refreshSpotMl/);
  assert.match(form, /hidden=\{canonicalKnowledgeManaged\}/);
  assert.match(form, /Hier verwaltest du Bilder und den Veröffentlichungsstatus/);
});

test("Mobile and Browser read canonical identity and hours without mutating legacy rows", () => {
  assert.match(route, /detail\.manifest\.manifestHash !== rebuilt\?\.manifestHash/);
  assert.match(migration, /'regularHours'.*v_values->'hours\.regular'/s);
  assert.match(migration, /'source'.*'WORLD_KNOWLEDGE'/s);
  assert.doesNotMatch(migration, /\b(?:update|delete\s+from|truncate)\s+public\.(?:spots|spot_hours)\b/i);
});
