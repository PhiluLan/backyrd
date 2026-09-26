import assert from "node:assert/strict";
import test from "node:test";
import { refreshResearchDocument } from "../app/world-knowledge/researchBatchRefresh.mjs";

const spot = (spotId, name, manifestHash) => ({ spotId, name, manifestHash, existingValues: {} });
const make = (spots) => ({
  batch: { batchId: "new", authoringCatalogVersion: "v1", authoringCatalogHash: "catalog", spots },
  research: { instructions: ["current"], spots: spots.map(({ spotId }) => ({ spotId, claims: [], unresolved: [] })) },
  exportHash: "fresh-export-hash",
});

test("stale manifest is replaced while researched claims remain suggestions", () => {
  const previous = make([spot("silo", "Silo", "old"), spot("rhys", "Rhys", "old")]);
  previous.research.spots[0].claims = [{ attributeKey: "classification.primary_category", value: "STAY" }];
  previous.research.spots[1].claims = [{ attributeKey: "classification.primary_category", value: "EAT" }];
  const current = make([spot("silo", "Silo", "new"), spot("rhys", "Rhys", "new")]);
  const refreshed = refreshResearchDocument(previous, current);
  assert.equal(refreshed.batch.spots[0].manifestHash, "new");
  assert.equal(refreshed.batch.spots[1].manifestHash, "new");
  assert.equal(refreshed.exportHash, "fresh-export-hash");
  assert.deepEqual(refreshed.research.spots[0].claims, previous.research.spots[0].claims);
  assert.deepEqual(refreshed.research.spots[1].claims, previous.research.spots[1].claims);
  assert.deepEqual(refreshed.research.instructions, ["current"]);
});

test("spot identity or catalog changes cannot silently rebind old research", () => {
  const previous = make([spot("silo", "Silo", "old")]);
  assert.throws(() => refreshResearchDocument(previous, make([spot("other", "Silo", "new")])), /Spot/);
  assert.throws(() => refreshResearchDocument(previous, make([spot("silo", "Silo neu", "new")])), /umbenannt/);
  const changedCatalog = make([spot("silo", "Silo", "new")]);
  changedCatalog.batch.authoringCatalogHash = "different";
  assert.throws(() => refreshResearchDocument(previous, changedCatalog), /Feldkatalog/);
});

test("duplicate or missing research spots fail closed", () => {
  const previous = make([spot("silo", "Silo", "old"), spot("rhys", "Rhys", "old")]);
  previous.research.spots[1].spotId = "silo";
  assert.throws(() => refreshResearchDocument(previous, make([spot("silo", "Silo", "new"), spot("rhys", "Rhys", "new")])), /nicht eindeutig/);
});
