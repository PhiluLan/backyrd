import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startPhase3CFounderLabServer } from "./phase3c-founder-lab-ui-server.mjs";
import { makeFounderCohortHandoff } from "./phase3c-founder-cohort-fixture.mjs";

test("Founder Decision Lab is loopback-only, no-store, and performs resolve/evaluate/replay", async () => {
  const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "backyrd-founder-ui-test-")); const { server, url } = await startPhase3CFounderLabServer({ port: 0, stateDirectory });
  try {
    const page = await fetch(url); assert.equal(page.status, 200); assert.equal(page.headers.get("cache-control"), "no-store"); assert.match(await page.text(), /Founder Decision Lab/);
    const health = await fetch(`${url}/api/health`).then((response) => response.json()); assert.deepEqual(health, { ok: true, localOnly: true, productionAuthorized: false, rawTextPersisted: false });
    const payload = { text: "Ruhiges Restaurant in Zürich für ein erstes Date", tracking: true, deviceCity: "Basel" };
    const resolved = await fetch(`${url}/api/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then((response) => response.json()); assert.equal(resolved.data.targetCity, "Zurich"); assert.equal(resolved.data.rawTextPersisted, false);
    const evaluated = await fetch(`${url}/api/evaluate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then((response) => response.json()); assert.equal(evaluated.data.productionAuthorized, false);
    const replay = await fetch(`${url}/api/replay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, result: evaluated.data }) }).then((response) => response.json()); assert.equal(replay.data.resultHash, evaluated.data.resultHash);
    const injected = await fetch(`${url}/api/evaluate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, ownerTier: "PRO" }) }); assert.equal(injected.status, 400); assert.match((await injected.json()).message, /Nicht erlaubtes Feld/);
    const artifact = makeFounderCohortHandoff(); const preview = await fetch(`${url}/api/cohort/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ artifact }) }).then((response) => response.json()); assert.equal(preview.data.spotCount, 2);
    const imported = await fetch(`${url}/api/cohort/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ artifact, previewHash: preview.data.previewHash }) }).then((response) => response.json()); assert.equal(imported.data.source, "FOUNDER_WORLD_COHORT"); assert.equal(fs.statSync(path.join(stateDirectory, "active-cohort.json")).mode & 0o777, 0o600);
    const founderResult = await fetch(`${url}/api/evaluate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then((response) => response.json()); assert.equal(founderResult.data.worldCohort.source, "FOUNDER_WORLD_COHORT"); assert.equal(founderResult.data.candidates.length, 2);
    await fetch(`${url}/api/cohort/reset`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); assert.equal(fs.existsSync(path.join(stateDirectory, "active-cohort.json")), false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
