import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("every privileged Admin user-management route authenticates as Admin", () => {
  for (const path of [
    "admin-dashboard/app/api/admin/invite-user/route.ts",
    "admin-dashboard/app/api/admin/users/route.ts",
    "admin-dashboard/app/api/admin/users/delete/route.ts",
    "admin-dashboard/app/api/admin/users/toggle/route.ts",
    "admin-dashboard/app/api/admin/operations/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /authorizeAdminRequest\(/, `${path} has no server-side Admin authorization`);
    assert.doesNotMatch(source, /error\.message\s*\}/, `${path} returns a provider error to the browser`);
  }
});

test("variable-cost runtime paths use bounded, fail-closed server counters", () => {
  const expected = [
    ["supabase/functions/decision-v13/live-index.ts", "decision_v13", 100, 100, 300, 2000],
    ["supabase/functions/google-place-photo/index.ts", "google_place_photo", 60, 200, 300, 3000],
    ["supabase/functions/mobile-geocode/index.ts", "mobile_geocode", 20, 100, 100, 2000],
    ["supabase/functions/safety-evaluate/index.ts", "safety_evaluate", 30, 100, 120, 1000],
    ["supabase/functions/generate-spot-embeddings/index.ts", "spot_embedding", 10, 100, 10, 100],
    ["supabase/functions/send-spot-claim-code/index.ts", "spot_claim_email", 3, 10, 30, 200],
    ["supabase/functions/send-spot-claim-approved-email/index.ts", "claim_approved_email", 10, 100, 20, 200],
    ["supabase/functions/send-test-push/index.ts", "test_push", 5, 20, 100, 1000],
    ["supabase/functions/decision-copy/index.ts", "legacy_decision_copy", 10, 50, 50, 500],
    ["supabase/functions/semantic-spot-search/index.ts", "legacy_semantic_search", 20, 100, 100, 1000],
  ];
  for (const [path, operation, subjectMinute, subjectDay, globalMinute, globalDay] of expected) {
    const source = read(path);
    assert.match(source, new RegExp(`operation: ["']${operation}["']`));
    assert.match(source, new RegExp(`subjectMinute: ${subjectMinute}`));
    assert.match(source, new RegExp(`subjectDay: ${subjectDay}`));
    assert.match(source, new RegExp(`globalMinute: ${globalMinute}`));
    assert.match(source, new RegExp(`globalDay: ${globalDay}`));
    assert.match(source, /boundary\.reason === "LIMITED" \? 429 : 503/);
  }
});

test("external provider calls are time-bounded", () => {
  assert.match(read("supabase/functions/decision-v13/index.ts"), /AbortSignal\.timeout\(8_000\)/);
  assert.match(read("supabase/functions/google-place-photo/index.ts"), /AbortSignal\.timeout\(8_000\)/);
  assert.match(read("supabase/functions/safety-evaluate/index.ts"), /AbortSignal\.timeout\(10_000\)/);
  assert.match(read("supabase/functions/generate-spot-embeddings/index.ts"), /AbortSignal\.timeout\(10_000\)/);
  assert.match(read("supabase/functions/send-spot-claim-code/index.ts"), /AbortSignal\.timeout\(10_000\)/);
  assert.match(read("supabase/functions/send-spot-claim-approved-email/index.ts"), /AbortSignal\.timeout\(10_000\)/);
  assert.match(read("supabase/functions/send-test-push/index.ts"), /AbortSignal\.timeout\(10_000\)/);
  assert.match(read("supabase/functions/semantic-spot-search/index.ts"), /AbortSignal\.timeout\(10_000\)/);
});

test("gateway identity is explicit for every changed Edge Function", () => {
  const config = read("supabase/config.toml");
  for (const [slug, entrypoint] of [
    ["decision-v13", "./functions/decision-v13/index.deploy.ts"],
    ["google-place-photo", "./functions/google-place-photo/index.ts"],
    ["mobile-geocode", "./functions/mobile-geocode/index.ts"],
    ["safety-evaluate", "./functions/safety-evaluate/index.ts"],
    ["generate-spot-embeddings", "./functions/generate-spot-embeddings/index.ts"],
    ["send-spot-claim-code", "./functions/send-spot-claim-code/index.ts"],
    ["send-spot-claim-approved-email", "./functions/send-spot-claim-approved-email/index.ts"],
    ["send-test-push", "./functions/send-test-push/index.ts"],
    ["decision-copy", "./functions/decision-copy/index.ts"],
    ["semantic-spot-search", "./functions/semantic-spot-search/index.ts"],
  ]) {
    const section = config.match(new RegExp(`\\[functions\\.${slug}\\]([\\s\\S]*?)(?=\\n\\[|$)`))?.[1] ?? "";
    assert.match(section, /verify_jwt = true/);
    assert.match(section, new RegExp(`entrypoint = ["']${entrypoint.replaceAll(".", "\\.")}["']`));
  }
});

test("retired unauthenticated legacy functions are inert 410 tombstones", () => {
  const config = read("supabase/config.toml");
  for (const slug of ["cluster-mood", "semantic-bridge-decision", "enrich-spot-description"]) {
    const path = `supabase/functions/${slug}/index.ts`;
    const source = read(path);
    assert.match(source, /status: 410/);
    assert.match(source, /endpoint_retired/);
    assert.doesNotMatch(source, /createClient|fetch\(|Deno\.env|getUser|OPENAI|service.role/i);

    const section = config.match(new RegExp(`\\[functions\\.${slug}\\]([\\s\\S]*?)(?=\\n\\[|$)`))?.[1] ?? "";
    assert.match(section, /verify_jwt = false/);
    assert.match(section, new RegExp(`entrypoint = ["']\\./functions/${slug}/index\\.ts["']`));
  }
});

test("Founder operations reports actionable queue failures and verified recovery truth", () => {
  const migration = read("supabase/migrations/20260905183000_gate7_operations_snapshot_truth.sql");
  const route = read("admin-dashboard/app/api/admin/operations/route.ts");
  const page = read("admin-dashboard/app/founder/operations/page.tsx");
  assert.match(migration, /backyrd_embedding_jobs_v1 where status = 'failed'/);
  assert.match(migration, /c\.case_status not in \('decided', 'closed'\)/);
  assert.match(route, /VERIFIED_AWS_DAILY_AND_WEEKLY/);
  assert.match(page, /queueFailures > 0/);
  assert.match(page, /data\.recovery\.storageObjectBackup === "VERIFIED_AWS_DAILY_AND_WEEKLY"/);
});

test("Mobile geocoding never calls Google REST APIs directly and address typing is debounced", () => {
  const geocode = read("mobile/lib/geocode.ts");
  assert.doesNotMatch(geocode, /googleapis\.com|GOOGLE_KEY/);
  assert.match(geocode, /functions\.invoke[^\n]*\("mobile-geocode"/);
  const spotCreation = read("mobile/app/spot/new.tsx");
  assert.match(spotCreation, /setTimeout\(\(\) =>/);
  assert.match(spotCreation, /request === addressRequest\.current/);
});
