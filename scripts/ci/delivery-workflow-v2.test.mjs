import test from "node:test";
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

test("historical recertification is isolated from pull requests", () => {
  const workflow = read(".github/workflows/deep-recertification.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /decision-ci:full/);
  assert.match(workflow, /gh issue create/);
  assert.match(workflow, /Production release is blocked/);
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

test("the supply-chain gate pins dependency review and validates lockfile coupling", () => {
  const workflow = read(".github/workflows/risk-gate.yml");
  assert.match(workflow, /actions\/dependency-review-action@2031cfc080254a8a887f58cffee85186f0e49e48/);
  assert.match(workflow, /validate-supply-chain-change\.mjs/);
  assert.match(workflow, /npm ci --ignore-scripts/);
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
