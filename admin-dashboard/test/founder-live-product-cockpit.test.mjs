import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/founder/page.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../../supabase/migrations/20260922165937_founder_live_product_cockpit_v2.sql", import.meta.url), "utf8");

test("Founder Cockpit reads the canonical live Product projection and refreshes it", () => {
  assert.match(page, /founder_live_product_overview_v2/);
  assert.match(page, /setInterval\(run, REFRESH_MS\)/);
  assert.match(page, /visibilitychange/);
  assert.match(page, /Live-Daten aktuell/);
  assert.match(page, /Decision vNext/);
  assert.match(page, /World Knowledge im Product-Pfad/);
  assert.match(page, /Historische Basel-Launchbereitschaft/);
  assert.doesNotMatch(page, /founder_launch_overview_v1|Launchbereitschaft.*%/s);
});

test("live Product RPC is admin-only, aggregate and explicit about unknown error telemetry", () => {
  assert.match(migration, /auth\.uid\(\) is null or not coalesce\(public\.admin_is_admin_v1\(\),false\)/);
  assert.match(migration, /product_runtime_control_events_v1/);
  assert.match(migration, /product_idempotency_records_v1/);
  assert.match(migration, /current_projection_pointers/);
  assert.match(migration, /product_learning_records_v1/);
  assert.match(migration, /founder_trust_health_v1/);
  assert.match(migration, /NOT_CANONICALLY_AVAILABLE/);
  assert.match(migration, /rawDecisionTextIncluded',false/);
  assert.match(migration, /userIdentityIncluded',false/);
  assert.doesNotMatch(migration, /mood_a_text|mood_b_text|u\.email|profiles p/);
  assert.match(migration, /revoke all on function public\.founder_live_product_overview_v2\(\)[\s\S]+from public,anon,authenticated,service_role/);
  assert.match(migration, /grant execute on function public\.founder_live_product_overview_v2\(\)[\s\S]+to authenticated,service_role/);
});

test("the active cockpit does not relabel approved catalog rows as launch-ready", () => {
  assert.match(page, /Freigegebene Spots/);
  assert.match(page, /Davon Basel/);
  assert.doesNotMatch(page, /Launchbereite Basel-Spots/);
  assert.match(migration, /launchReadinessArchived',true/);
});
