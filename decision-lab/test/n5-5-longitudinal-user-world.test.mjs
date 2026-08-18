import test from "node:test";
import assert from "node:assert/strict";
import { buildN5_5Evaluation, buildN5_5World } from "../src/n5-5-longitudinal-user-world.mjs";
import { buildN5_5SealedArtifact, buildN5_5ValidationResult } from "../src/n5-5-validation.mjs";

test("N5.5 emits only canonical, consented N2 Memory events and keeps evaluator-only data out of engine inputs", () => {
  const world = buildN5_5World();
  assert.equal(world.users.length, 9);
  assert.equal(world.users.find(({ id }) => id === "NORTH_STAR_EXPLORER_01").events.length >= 100, true);
  assert.equal(world.users.find(({ id }) => id === "n55-user-cold").events.length, 1);
  assert.doesNotMatch(JSON.stringify(world.engineInputs), /(latent|ground[_-]?truth|oracle|expected[_-]?utility)/i);
  assert.notEqual(world.engineInputHash, world.worldHash);
});

test("N5.5 derives longitudinal N2 intelligence and N5 projections deterministically", () => {
  const first = buildN5_5Evaluation(); const second = buildN5_5Evaluation();
  assert.equal(first.evaluationHash, second.evaluationHash);
  assert.equal(first.projections.length, 54);
  const explorer = first.profiles.find(({ user }) => user.id === "NORTH_STAR_EXPLORER_01").profile;
  assert.equal(explorer.knowledgeState, "LONG_TERM");
  assert.ok(explorer.patterns.some(({ state }) => state === "KNOWN"));
  assert.equal(first.profiles.find(({ user }) => user.id === "n55-user-cold").profile.knowledgeState, "COLD");
});

test("N5.5 prospectively frozen validation covers context, authority, portability and opportunity", async () => {
  const result = await buildN5_5ValidationResult();
  assert.equal(result.userCount, 9);
  assert.equal(result.projectionScenarioCount, 54);
  assert.equal(result.allMandatoryGatesPass, true);
  assert.equal(result.scientificValidity, "PASS");
  assert.ok(result.opportunities.HIGH >= 20);
  assert.equal(result.metrics.currentIntentAuthority, 1);
  assert.equal(result.metrics.crossCityPortability, 1);
});

test("N5.5 sealed artifact is deterministic, secret-free and carries no N6 quality claim", async () => {
  const first = await buildN5_5SealedArtifact(); const second = await buildN5_5SealedArtifact();
  assert.equal(first.artifactHash, second.artifactHash);
  assert.equal(first.externalAiCalls, 0);
  assert.equal(first.historicalN6AVerdicts, "UNCHANGED_NOT_REEVALUATED");
  assert.doesNotMatch(JSON.stringify(first), /(sk-[a-z0-9]|bearer\s+|ghp_[a-z0-9])/i);
});
