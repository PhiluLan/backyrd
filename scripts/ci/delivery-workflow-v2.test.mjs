import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("routine Risk Gate is task-scoped and keeps the stable final gate", () => {
  const workflow = read(".github/workflows/risk-gate.yml");
  for (const gate of ["user", "world", "decision", "database", "delivery-policy", "release-certification"]) {
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
});

test("Production release is manual-only", () => {
  const workflow = read(".github/workflows/supabase-production.yml");
  const trigger = workflow.slice(workflow.indexOf("on:"), workflow.indexOf("permissions:"));
  assert.match(trigger, /workflow_dispatch:/);
  assert.doesNotMatch(trigger, /push:/);
  assert.match(workflow, /DEPLOY_SUPABASE_PRODUCTION/);
});

test("superseded manual duplicate workflows are removed", () => {
  for (const path of ["database.yml", "quality.yml", "security.yml"]) {
    assert.equal(existsSync(new URL(`../../.github/workflows/${path}`, import.meta.url)), false);
  }
});
