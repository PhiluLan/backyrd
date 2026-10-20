import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

function trustConsumerFixture() {
  const root = mkdtempSync(join(tmpdir(), "backyrd-trust-consumers-"));
  const write = (path, source) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), source); };
  for (const path of [
    "scripts/ci/validate-trust-platform-consumers.sh", "supabase/functions/semantic-spot-search/index.ts",
    "mobile/lib/distributionTrust.ts", "mobile/app/search.tsx", "mobile/lib/useSpotsStore.ts",
    "mobile/app/(tabs)/map.tsx", "mobile/app/(tabs)/map.web.tsx", "mobile/app/(tabs)/index.tsx",
    "mobile/lib/spot-images.ts", "mobile/app/(tabs)/feed.tsx", "web/lib/backyrd-api.ts", "web/lib/public-web-api.ts",
  ]) write(path, read(path));
  mkdirSync(join(root, "admin-dashboard"));
  return { root, write, run: () => spawnSync("bash", [join(root, "scripts/ci/validate-trust-platform-consumers.sh")], { encoding: "utf8" }) };
}

test("Trust consumer guard follows the real search redirect through both maps to Distribution eligibility", () => {
  const fixture = trustConsumerFixture();
  try { const result = fixture.run(); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /runtime consumer boundary validation passed/); }
  finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

for (const [label, path, before, after] of [
  ["search destination", "mobile/app/search.tsx", 'pathname: "/(tabs)/map"', 'pathname: "/(tabs)/feed"'],
  ["search query", "mobile/app/search.tsx", 'search: params.search ?? params.q ?? ""', 'search: ""'],
  ["native filtered store", "mobile/app/(tabs)/map.tsx", "useSpotsStore()", "useUnfilteredCatalog()"],
  ["web filtered store", "mobile/app/(tabs)/map.web.tsx", "useSpotsStore()", "useUnfilteredCatalog()"],
  ["native query filter", "mobile/app/(tabs)/map.tsx", "spotMatchesSearch(", "unfilteredSearch("],
  ["web query filter", "mobile/app/(tabs)/map.web.tsx", "spotMatchesSearch(", "unfilteredSearch("],
  ["central Distribution filter", "mobile/lib/useSpotsStore.ts", 'return filterDistributedSpots(mapped, "maps", signal)', "return mapped"],
  ["semantic eligibility", "supabase/functions/semantic-spot-search/index.ts", "distribution_trust_filter_entities_v1", "unfiltered_entities"],
]) test("Trust consumer guard rejects loss of " + label, () => {
  const fixture = trustConsumerFixture();
  try {
    const source = read(path); assert.ok(source.includes(before), "mutation target missing");
    fixture.write(path, source.replaceAll(before, after));
    const result = fixture.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Trust Platform consumer validation failed/);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

for (const forbidden of ['supabase.from("distribution_trust_states")', 'supabase.rpc("get_social_feed_v1")']) {
  test("Trust consumer guard still rejects private/retired runtime access: " + forbidden, () => {
    const fixture = trustConsumerFixture();
    try {
      fixture.write("web/lib/public-web-api.ts", read("web/lib/public-web-api.ts") + "\n" + forbidden + ";\n");
      const result = fixture.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /private Distribution internals|pre-Distribution social RPC/);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });
}

test("routine Risk Gate is task-scoped and keeps the stable final gate", () => {
  const workflow = read(".github/workflows/risk-gate.yml");
  for (const gate of ["user", "world", "decision", "database", "supply-chain", "delivery-policy", "release-certification"]) {
    assert.match(workflow, new RegExp(`\\n  ${gate}:`));
  }
  assert.match(workflow, /name: Risk-based merge gate/);
  for (const obsolete of [
    "decision-ci:full",
    "decision-lab:d2",
    "week2-dark-wiring-preflight",
    "week3-internal-prodlike-preflight",
    "founder-activation:four-track",
    "user-intelligence-vnext:week1:report",
    "user-intelligence-vnext:week2:report",
    "user-intelligence-vnext:week3:report",
  ]) assert.doesNotMatch(workflow, new RegExp(obsolete.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("current Product system recertification is isolated from pull requests", () => {
  const workflow = read(".github/workflows/deep-recertification.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /decision-product:ci/);
  assert.match(workflow, /world-knowledge:test/);
  assert.match(workflow, /user-intelligence-vnext:test/);
  assert.doesNotMatch(workflow, /decision-ci:full|decision-lab|week[123]|founder-activation/);
  assert.match(workflow, /gh issue create/);
  assert.match(workflow, /Production release is blocked/);
});

test("manual Product artifact certification is canonical-main-only and does not deploy", () => {
  const workflow = read(".github/workflows/manual-product-artifact-certification.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /CERTIFY_PRODUCT_RELEASE/);
  assert.match(workflow, /refs\/remotes\/origin\/main/);
  assert.match(workflow, /POST_MERGE_MAIN/);
  assert.match(workflow, /backyrd-product-release-/);
  assert.match(workflow, /--expected-hash "\$manifest_hash"/);
  assert.match(workflow, /release-manifest\.json/);
  assert.doesNotMatch(workflow, /supabase\s+(?:db push|functions deploy)/);
  assert.doesNotMatch(workflow, /eas\s+update/);
});

test("Production release is manual-only", () => {
  const workflow = read(".github/workflows/supabase-production.yml");
  const trigger = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
  assert.match(trigger, /workflow_dispatch:/);
  assert.doesNotMatch(trigger, /push:/);
  assert.match(workflow, /DEPLOY_SUPABASE_PRODUCTION/);
  assert.match(workflow, /deep-recertification\.yml/);
  assert.match(workflow, /8 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(workflow, /certification_run_id/);
  assert.match(workflow, /release_manifest_hash/);
  assert.match(workflow, /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/);
  assert.match(workflow, /product-release-manifest\.mjs verify/);
});

test("Decision access control binds authenticated-user enablement to the audited shipped Function", () => {
  const workflow = read(".github/workflows/decision-ai-pilot-production.yml");
  for (const required of ["workflow_dispatch:", "ENABLE_AUTHENTICATED_USERS", "EMERGENCY_OFF", "validate-production-state.mjs", ".supabase.shippedSourceSha", ".supabase.deploymentRunId", ".ezbr_sha256 == $digest", "BACKYRD_DECISION_AI_INTENT_ENABLED=false"]) assert.ok(workflow.includes(required), required);
  assert.match(workflow, /test "\$DEPLOYMENT_RUN_ID" = "\$expected_run"/);
  assert.match(workflow, /test "\$CONFIRMATION" = "\$MODE"/);
  assert.doesNotMatch(workflow, /ENABLE_ONE_ACCOUNT|ENABLE_EVAL_COHORT|ENABLE_HELLO_ACCOUNT|allowlist=/);
  const entry = read("supabase/functions/decision-v13/vnext-only.ts");
  const provider = read("packages/decision-vnext-core/src/product-luna-provider.ts");
  assert.doesNotMatch(entry, /ALLOWLIST|allowedUserIds|parseDecisionProductAiIntentAllowlist/);
  assert.doesNotMatch(provider, /allowedUserIds|not_enabled_for_actor/);
});

test("Decision continuity cannot become automated activation or deployment", () => {
  const policy = read("docs/operations/DELIVERY_WORKFLOW_V2.md");
  const migration = read("supabase/migrations/20261001202402_decision_continuous_authority_v1.sql");
  assert.match(policy, /sole runtime-maintenance exception/);
  assert.match(policy, /manual, exact-release Product activation/);
  assert.match(migration, /current_user <> 'postgres'/);
  assert.match(migration, /v_current\.state <> 'ON'/);
  assert.match(migration, /v_expiry is null or v_expiry <= v_now/);
  assert.match(migration, /expires_at <= renewed_at \+ interval '24 hours'/);
  assert.match(migration, /v_authorization\.release_hash is distinct from v_current\.release_hash/);
  assert.match(migration, /v_authorization\.artifact_hash is distinct from v_current\.artifact_hash/);
  assert.match(migration, /v_authorization\.source_set_hash is distinct from v_current\.source_set_hash/);
  assert.doesNotMatch(migration, /cron\.schedule\([^;]*backyrd_decision_vnext_product_activate_v1/s);
  assert.doesNotMatch(migration, /grant execute on function decision_vnext_private\.renew_product_continuity_v1/);
});

test("the supply-chain gate pins dependency review and validates lockfile coupling", () => {
  const workflow = read(".github/workflows/risk-gate.yml");
  assert.match(workflow, /actions\/dependency-review-action@2031cfc080254a8a887f58cffee85186f0e49e48/);
  assert.match(workflow, /validate-supply-chain-change\.mjs/);
  assert.match(workflow, /npm ci --ignore-scripts/);
});

test("incremental PR updates reuse only authenticated successful prior gates", () => {
  const workflow = read(".github/workflows/risk-gate.yml");
  assert.match(workflow, /permissions: \{ contents: read, checks: read \}/);
  assert.match(workflow, /resolve-prior-gates\.mjs/);
  assert.match(workflow, /--resume-evidence/);
  assert.match(workflow, /github\.event\.before/);
});

test("Product release certification uploads one hierarchical tested artifact", () => {
  const workflow = read(".github/workflows/risk-gate.yml");
  assert.match(workflow, /product-release-manifest\.mjs build/);
  assert.match(workflow, /backyrd-product-release-/);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
});

test("superseded manual duplicate workflows are removed", () => {
  for (const path of ["database.yml", "quality.yml", "security.yml"]) {
    assert.equal(existsSync(new URL(`../../.github/workflows/${path}`, import.meta.url)), false);
  }
});


test("authenticated-user enablement has no individual account IDs", () => {
  const workflow = read(".github/workflows/decision-ai-pilot-production.yml");
  const enableStep = workflow.split("      - name: Enable Decision for authenticated users\n")[1].split("      - name: Emergency off\n")[0];
  const script = enableStep.split("        run: |\n")[1].split("\n").map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
  const output = execFileSync("bash", ["-c", `supabase() { printf '%s\\n' "$@"; }\n${script}`], {
    encoding: "utf8", env: { ...process.env, MODE: "ENABLE_AUTHENTICATED_USERS", GITHUB_STEP_SUMMARY: "/dev/null" },
  });
  const args = output.trim().split("\n");
  assert.ok(args.includes("BACKYRD_DECISION_AI_INTENT_USER_ALLOWLIST=*"));
  assert.ok(args.includes("BACKYRD_DECISION_AI_INTENT_ENABLED=true"));
  assert.doesNotMatch(output, /[0-9a-f]{8}-[0-9a-f-]{27,}/);
});
