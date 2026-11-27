import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compile = (s) =>
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(s, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64");
const shared = compile(
  await readFile(
    new URL("../../packages/shared/src/nuknuk-learning.ts", import.meta.url),
    "utf8",
  ),
);
const source = (
  await readFile(
    new URL(
      "../../supabase/functions/nuknuk-learning/handler.ts",
      import.meta.url,
    ),
    "utf8",
  )
).replaceAll("../../../packages/shared/src/nuknuk-learning.ts", shared);
const { createWorkshopHandler } = await import(compile(source));
const id = "c09ed000-0000-4000-8000-000000000001";
const document = {
  query: "Kaffee trinken.",
  notes: "",
  obligations: ["Kaffee."],
  forbidden: [],
  tags: [],
  locale: "de",
  reference: { now: "2026-11-25T09:00:00Z", timezone: "Europe/Zurich" },
  source: "authored",
  dataPolicy: "SYNTHETIC_OR_REDACTED",
};
const row = {
  id,
  family_id: id,
  parent_id: null,
  revision: 1,
  state: "draft",
  document,
  target: null,
  target_policy: null,
  approval_hash: null,
  approved_by: null,
  updated_at: "2026-11-25T09:00:00Z",
  family_title: "Coffee",
  topic: "everyday",
  split: "TRAIN",
};
const request = (
  body = { action: "translate", id, revision: 1 },
  origin = "https://admin.invalid",
) =>
  new Request("https://functions.invalid/nuknuk-learning", {
    method: "POST",
    headers: {
      authorization: "Bearer synthetic-session-token-for-tests",
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
function fixture(overrides = {}) {
  const calls = [];
  const ports = {
    origins: ["https://admin.invalid"],
    authenticate: async () => id,
    load: async () => row,
    reserve: async () => {
      calls.push("reserve");
    },
    translate: async () => {
      calls.push("model");
      return { target: { meaning: {} }, policy: "synthetic" };
    },
    variants: async () => ["Variante"],
    commit: async () => {
      calls.push("commit");
      return { id };
    },
    ...overrides,
  };
  return { calls, handler: createWorkshopHandler(ports) };
}
test("unauthorized users and disallowed origins never consume provider quota", async () => {
  for (const [overrides, origin, status] of [
    [{ authenticate: async () => null }, "https://admin.invalid", 403],
    [{}, "https://evil.invalid", 403],
  ]) {
    const f = fixture(overrides);
    assert.equal((await f.handler(request(undefined, origin))).status, status);
    assert.deepEqual(f.calls, []);
  }
});
test("stale revisions and approved target replacement are refused before quota/model", async () => {
  for (const loaded of [
    { ...row, revision: 2 },
    {
      ...row,
      state: "approved",
      target: { meaning: {} },
      approval_hash: "1".repeat(64),
    },
  ]) {
    const f = fixture({ load: async () => loaded });
    assert.equal((await f.handler(request())).status, 409);
    assert.deepEqual(f.calls, []);
  }
});
test("proposal is committed only after verified loading and reserved quota; never human-approved", async () => {
  const f = fixture();
  const response = await f.handler(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(f.calls, ["reserve", "model", "commit"]);
  assert.equal(body.humanApproved, false);
  assert.equal(body.trainingStarted, false);
});
test("quota exhaustion never calls model; commit conflicts never fabricate saved proposals", async () => {
  const q = fixture({
    reserve: async () => {
      throw { code: "54000" };
    },
  });
  assert.equal((await q.handler(request())).status, 429);
  assert.deepEqual(q.calls, []);
  const c = fixture({
    commit: async () => {
      throw { code: "40001" };
    },
  });
  assert.equal((await c.handler(request())).status, 409);
});
test("bounded, allowlisted requests cannot choose model, endpoint, actor or target", async () => {
  const f = fixture();
  for (const extra of [
    { model: "untrusted" },
    { target: {} },
    { actor: id },
    { endpoint: "https://evil.invalid" },
  ])
    assert.equal(
      (
        await f.handler(
          request({ action: "translate", id, revision: 1, ...extra }),
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await f.handler(
        request({
          action: "translate",
          id,
          revision: 1,
          extra: "x".repeat(5000),
        }),
      )
    ).status,
    413,
  );
  assert.deepEqual(f.calls, []);
});
test("new situations use controlled topics/splits, reserved quota and synthetic-only commit", async () => {
  const order = [];
  const f = fixture({
    reserve: async () => order.push("quota"),
    situations: async (topic) => {
      assert.equal(topic, "family");
      order.push("generate");
      return [{ query: "Synthetischer Wunsch" }];
    },
    commitSituations: async (actor, topic, split, rows) => {
      assert.equal(actor, id);
      assert.equal(split, "DEV");
      assert.equal(rows.length, 1);
      order.push("commit");
      return { situationsCreated: 1 };
    },
  });
  const result = await f.handler(
    request({ action: "situations", topic: "family", split: "DEV" }),
  );
  assert.equal(result.status, 200);
  assert.deepEqual(order, ["quota", "generate", "commit"]);
  assert.equal((await result.json()).humanApproved, false);
  assert.equal(
    (
      await f.handler(
        request({
          action: "situations",
          topic: "private_custom_topic",
          split: "TRAIN",
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.handler(
        request({
          action: "situations",
          topic: "family",
          split: "TRAIN",
          actor: id,
        }),
      )
    ).status,
    400,
  );
});
