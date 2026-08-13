import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateWorld } from "../src/generator.mjs";
import { productSeedSql } from "../src/product-sql.mjs";

const config = JSON.parse(await readFile(new URL("../config/smoke-v1.json", import.meta.url), "utf8"));
const world = generateWorld(config, {});

test("Product seed keeps observed and latent storage structurally separate", () => {
  const sql = productSeedSql(world, { includeEmbeddings: false });
  assert.match(sql, /public\.spots/);
  assert.match(sql, /public\.reviews/);
  assert.match(sql, /public\.backyrd_ml_events_v1/);
  assert.match(sql, /decision_lab\.latent_users/);
  const publicStatements = sql.split("\n").filter((line) => line.includes("public."));
  assert.equal(publicStatements.some((line) => /latent_truth|expected_utility|true_preference/.test(line)), false);
  assert.doesNotMatch(sql, /'archived'::public\.spot_status/);
});
