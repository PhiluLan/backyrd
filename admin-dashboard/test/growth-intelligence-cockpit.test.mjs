import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/growth/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/growth/growth.css", import.meta.url), "utf8");
const migration = await readFile(new URL("../../supabase/migrations/20260922183824_create_growth_intelligence_cockpit_v2.sql", import.meta.url), "utf8");

test("Growth is a live Product-v1 cockpit instead of the historical analytics page", () => {
  assert.match(page, /admin_growth_intelligence_v2/);
  assert.match(page, /setInterval\(run, REFRESH_MS\)/);
  assert.match(page, /visibilitychange/);
  assert.match(page, /Founder Briefing/);
  assert.match(page, /Decision vNext/);
  assert.match(page, /Noch nicht messbar/);
  assert.match(page, /Analytics-Einwilligung/);
  assert.doesNotMatch(page, /admin_growth_intelligence_v1/);
});

test("Growth has intentional responsive chart, funnel and cohort presentation", () => {
  assert.match(css, /\.gr-chart\{/);
  assert.match(css, /\.gr-funnelTrack/);
  assert.match(css, /\.gr-coverageDial/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.doesNotMatch(page, /Math\.max\(2, day\.|Math\.max\(4, day\./);
});

test("Growth RPC uses sealed Product milestones and remains consent- and admin-bound", () => {
  assert.match(migration, /PRODUCT_DECISION_VNEXT_EVALUATION/);
  assert.match(migration, /decision_vnext_completed/);
  assert.match(migration, /decision_vnext_candidate_opened/);
  assert.match(migration, /optional_product_analytics/);
  assert.match(migration, /admin_required/);
  assert.match(migration, /rawDecisionTextIncluded',false/);
  assert.match(migration, /userIdentityIncluded',false/);
  assert.match(migration, /revoke all on function public\.admin_growth_intelligence_v2/);
  assert.match(migration, /grant execute on function public\.admin_growth_intelligence_v2[\s\S]+to authenticated,service_role/);
  assert.doesNotMatch(migration, /mood_a_text|mood_b_text|raw_user_meta_data|u\.email/);
});

test("unknown maturity and unavailable error telemetry are never converted to zero", () => {
  assert.match(migration, /case when d1_eligible=0 then null/);
  assert.match(migration, /case when d7_eligible=0 then null/);
  assert.match(migration, /case when d30_eligible=0 then null/);
  assert.match(migration, /NOT_CANONICALLY_AVAILABLE|errorTelemetryStatus/);
});
