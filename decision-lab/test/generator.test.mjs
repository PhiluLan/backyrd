import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateWorld } from "../src/generator.mjs";
import { validateWorld } from "../src/health.mjs";

const config = JSON.parse(await readFile(new URL("../config/smoke-v1.json", import.meta.url), "utf8"));

test("same seed produces byte-equivalent deterministic world", () => {
  const a = generateWorld(config, { gitSha: "fixture", migrationHash: "fixture", engineSourceHash: "fixture" });
  const b = generateWorld(config, { gitSha: "fixture", migrationHash: "fixture", engineSourceHash: "fixture" });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("different seed produces a materially different valid world", () => {
  const a = generateWorld(config, {});
  const b = generateWorld({ ...config, seed: `${config.seed}-other` }, {});
  assert.notEqual(a.manifest.worldId, b.manifest.worldId);
  assert.notDeepEqual(a.users[0].latent, b.users[0].latent);
  assert.equal(validateWorld(a).valid, true);
  assert.equal(validateWorld(b).valid, true);
});

test("canonical full-size world passes health and requested scale", async () => {
  const full = JSON.parse(await readFile(new URL("../config/world-v1.json", import.meta.url), "utf8"));
  const world = generateWorld(full, {});
  assert.deepEqual(world.manifest.counts, { users: 500, spots: 300, reviews: 3600, interactions: 30000, decisions: 12000 });
  assert.equal(validateWorld(world).valid, true);
});
