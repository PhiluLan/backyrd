import test from "node:test";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

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

test("iOS-only certification is explicit and both Supabase verification steps require Product scope", () => {
  const certification=read(".github/workflows/manual-product-artifact-certification.yml");
  assert.match(certification,/options: \[PRODUCT, IOS_OTA\]/);
  assert.match(certification,/default: PRODUCT/);
  assert.match(certification,/--delivery-target "\$\{\{ inputs.delivery_target \}\}"/);
  const production=read(".github/workflows/supabase-production.yml");
  assert.equal((production.match(/--expected-delivery-target PRODUCT/g)||[]).length,2);
  assert.match(read(".github/workflows/risk-gate.yml"), /product-release-manifest\.mjs build --delivery-target IOS_OTA/);
});
