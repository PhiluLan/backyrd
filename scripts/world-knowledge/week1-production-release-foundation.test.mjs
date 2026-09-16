import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { buildWorldWeek1Foundation } from "./build-week1-production-release-foundation.mjs";

const root = resolve(import.meta.dirname, "../..");

test("source-aware Week 1 plan binds exactly nine immutable World migrations", () => {
  const plan = buildWorldWeek1Foundation();
  assert.equal(plan.migrationCount, 9);
  assert.equal(plan.migrations.length, 9);
  assert.equal(plan.executionAuthorized, false);
  assert.equal(plan.runtimeActivationAuthorized, false);
  assert.deepEqual(plan.migrations.map(({ order }) => order), [1,2,3,4,5,6,7,8,9]);
  for (const migration of plan.migrations) {
    assert.match(migration.sha256, /^[0-9a-f]{64}$/);
    assert.equal(migration.metrics.destructiveDdl, 0);
    assert.ok(migration.rollback.length > 20);
    assert.ok(migration.stopConditions.includes("HASH_MISMATCH"));
  }
});

test("all SECURITY DEFINER functions in the pending bundle have an empty search_path", () => {
  const plan = buildWorldWeek1Foundation();
  for (const migration of plan.migrations) {
    const sql = readFileSync(resolve(root, migration.path), "utf8");
    const definitions = [...sql.matchAll(/create\s+or\s+replace\s+function[\s\S]*?(?=create\s+or\s+replace\s+function|$)/gi)];
    for (const match of definitions) {
      if (/security\s+definer/i.test(match[0])) assert.match(match[0], /set\s+search_path\s*=\s*''/i, migration.path);
    }
  }
});

test("cohort preparation preserves absence, unknown, not configured and disputed", () => {
  const states = buildWorldWeek1Foundation().cohort.knowledgeStatesPreserved;
  assert.ok(states.includes("ABSENT"));
  assert.ok(states.includes("UNKNOWN"));
  assert.ok(states.includes("NOT_CONFIGURED"));
  assert.ok(states.includes("DISPUTED"));
  assert.ok(states.includes("KNOWN_FALSE"));
});

test("plan is deterministic", () => {
  const first = buildWorldWeek1Foundation();
  const second = buildWorldWeek1Foundation();
  assert.deepEqual(second, first);
  assert.equal(second.foundationHash, first.foundationHash);
});

test("the executable rehearsal rejects Production and keeps apply unauthorized", () => {
  const rehearsal = readFileSync(new URL("./rehearse-week1-world-release.sh", import.meta.url), "utf8");
  assert.match(rehearsal, /production[_ -]?ref|production/i);
  assert.match(rehearsal, /executionAuthorized/);
  assert.equal(buildWorldWeek1Foundation().executionAuthorized, false);
});
