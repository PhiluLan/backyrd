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
const sharedUrl = compile(
  await readFile(
    new URL("../../packages/shared/src/nuknuk-learning.ts", import.meta.url),
    "utf8",
  ),
);
const shared = await import(sharedUrl);
const libSource = (
  await readFile(new URL("../lib/nuknukLearning.ts", import.meta.url), "utf8")
).replaceAll("../../packages/shared/src/nuknuk-learning", sharedUrl);
const lib = await import(compile(libSource));
const seedSource = (
  await readFile(
    new URL(
      "../../packages/shared/src/nuknuk-learning-starters.ts",
      import.meta.url,
    ),
    "utf8",
  )
).replaceAll("./nuknuk-learning", sharedUrl);
const { learningStarters } = await import(compile(seedSource));
test("30 starter scenarios are synthetic, distinct, bounded and not approvals", () => {
  assert.equal(learningStarters.length, 30);
  assert.equal(new Set(learningStarters.map((x) => x.id)).size, 30);
  assert.equal(new Set(learningStarters.map((x) => x.document.query)).size, 30);
  for (const row of learningStarters) {
    assert.equal(
      shared.parseLearningDocument(row.document).source,
      "synthetic",
    );
    assert.equal(row.approval_hash, undefined);
  }
  assert.equal(learningStarters.filter((x) => x.split === "TRAIN").length, 24);
  assert.equal(learningStarters.filter((x) => x.split === "DEV").length, 6);
});
test("unknown/private fields and malformed facts never enter the authoring contract", () => {
  const doc = learningStarters[0].document;
  for (const invalid of [
    { ...doc, userId: "private" },
    { ...doc, query: null },
    { ...doc, obligations: [""] },
    { ...doc, reference: { ...doc.reference, latitude: 1 } },
    { ...doc, source: "raw_feedback" },
    { ...doc, dataPolicy: null },
  ])
    assert.throws(() => shared.parseLearningDocument(invalid));
});
test("meaning cards show actual role and requirement mismatches rather than an AI cover story", () => {
  const cards = shared.targetCards({
    meaning: {
      entities: [{ id: "p1", kind: "PERSON", label: "p1" }],
      facts: [
        {
          id: "f1",
          modality: "REQUIRED",
          basis: "EXPLICIT",
          subjectIds: ["p1"],
          key: "people.role",
          value: { text: "self" },
        },
        {
          id: "f2",
          modality: "CONTEXT",
          basis: "EXPLICIT",
          subjectIds: ["p1"],
          key: "people.relationship",
          value: { text: "daughter" },
        },
      ],
    },
  });
  const text = JSON.stringify(cards);
  assert.match(text, /anfragende Person/);
  assert.match(text, /Tochter/);
  assert.match(text, /Pflicht/);
  assert.equal(shared.targetCards(null).length, 0);
});
test("Swiss clock input preserves summer/winter references and rejects nonexistent spring time", () => {
  assert.equal(
    shared.learningReferenceTime("2026-11-25T10:00"),
    "2026-11-25T09:00:00.000Z",
  );
  assert.equal(
    shared.learningReferenceTime("2026-07-25T10:00"),
    "2026-07-25T08:00:00.000Z",
  );
  assert.throws(() => shared.learningReferenceTime("2026-03-29T02:30"));
  assert.equal(
    shared.learningLocalTime("2026-11-25T09:00:00Z"),
    "2026-11-25T10:00",
  );
});
test("exports verify exact bytes and reject TEST in training", async () => {
  const make = async (split) => {
    const manifestBytes = JSON.stringify({
      version: shared.LEARNING_VERSION,
      kind: "TRAIN_DEV",
      rows: [{ split }],
    });
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(manifestBytes),
    );
    return { manifestBytes, manifestHash: Buffer.from(digest).toString("hex") };
  };
  assert.ok(await lib.verifyLearningExport(await make("TRAIN")));
  await assert.rejects(async () =>
    lib.verifyLearningExport(await make("TEST")),
  );
  const envelope = await make("TRAIN");
  await assert.rejects(() =>
    lib.verifyLearningExport({
      ...envelope,
      manifestBytes: envelope.manifestBytes + " ",
    }),
  );
});
test("reports must bind the chosen immutable dataset and never claim deployment", () => {
  const report = {
    version: "backyrd.nuknuk-learning-report@1",
    manifestHash: "1".repeat(64),
    adapterHash: "2".repeat(64),
    kind: "LOCAL_INFERENCE_COMPARISON",
    rows: [],
    productionActivated: false,
  };
  assert.equal(lib.parseLearningReport(report, report.manifestHash), report);
  assert.throws(() => lib.parseLearningReport(report, "3".repeat(64)));
  assert.throws(() =>
    lib.parseLearningReport(
      { ...report, productionActivated: true },
      report.manifestHash,
    ),
  );
  assert.ok(
    lib.parseLearningReport(
      {
        ...report,
        kind: "TRAINING_RECEIPT",
        trainingStatus: "FAILED",
        adapterHash: null,
      },
      report.manifestHash,
    ),
  );
  assert.throws(() =>
    lib.parseLearningReport(
      { ...report, adapterHash: null },
      report.manifestHash,
    ),
  );
});
test("unavailable backend and edit conflicts preserve honest recovery language", () => {
  assert.match(
    shared.learningError({ code: "40001" }),
    /Eingaben bleiben erhalten/,
  );
  assert.match(
    shared.learningError({ code: "PGRST202" }),
    /noch nicht eingerichtet/,
  );
  assert.throws(() =>
    lib.parseLearningPage({
      version: shared.LEARNING_VERSION,
      rows: [],
      coverage: [],
    }),
  );
});
