import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  parseWorkshopExport,
  prepareWorkshop,
  verifyWorkshopData,
  captureWorkshop,
  compareWorkshop,
  workshopTrainingReport,
} from "./nuknuk-learning-workshop.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const id = (n) => `c09ed000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = (drink) => ({
  meaning: {
    entities: [{ id: "a1", kind: "ACTIVITY", label: "Besuch", members: [] }],
    facts: [
      {
        id: "f1",
        modality: "REQUIRED",
        basis: "EXPLICIT",
        subjectIds: ["a1"],
        key: "food.drink",
        value: { text: drink },
      },
    ],
    logic: null,
    bindings: [],
    extensions: [],
    uncertainties: [],
    weatherConditions: [],
  },
});
function rows() {
  return ["coffee", "tea"].map((drink, i) => ({
    id: id(i + 1),
    familyId: id(i + 11),
    split: i ? "DEV" : "TRAIN",
    revision: 3,
    approvalHash: "a".repeat(64),
    targetPolicy: "backyrd.learning-teacher@1:" + "b".repeat(64),
    target: target(drink),
    document: {
      query: i
        ? "Ich möchte einen Tee trinken."
        : "Ich möchte einen Kaffee trinken.",
      notes: "",
      obligations: ["Getränk erhalten."],
      forbidden: [],
      tags: [],
      locale: "de",
      reference: { now: "2026-11-25T09:00:00Z", timezone: "Europe/Zurich" },
      source: "synthetic",
      dataPolicy: "SYNTHETIC_OR_REDACTED",
    },
  }));
}
const envelope = (r = rows(), kind = "TRAIN_DEV") => {
  const manifestBytes = JSON.stringify({
    version: "backyrd.nuknuk-learning@1",
    id: id(99),
    kind,
    adapterHash: null,
    rows: r,
  });
  return { manifestBytes, manifestHash: sha(manifestBytes) };
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "nuknuk-workshop-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, "export.json"),
    out = join(root, "data"),
    e = envelope();
  await writeFile(input, JSON.stringify(e));
  await prepareWorkshop(input, out, e.manifestHash);
  return { root, input, out, e };
}
test("reviewed export rejects missing approval, family leakage, duplicate language and path traversal", async () => {
  for (const mutate of [
    (r) => {
      r[0].approvalHash = null;
    },
    (r) => {
      r[1].familyId = r[0].familyId;
    },
    (r) => {
      r[1].document.query = r[0].document.query;
    },
    (r) => {
      r[0].id = "../../outside";
    },
    (r) => {
      r[1].split = "TEST";
    },
  ]) {
    const r = rows();
    mutate(r);
    await assert.rejects(() => parseWorkshopExport(envelope(r)));
  }
});
test("preparation requires independently supplied Admin hash and never writes TEST to training", async (t) => {
  const f = await fixture(t);
  const d = await verifyWorkshopData(f.out);
  assert.deepEqual(d.manifest.counts, { TRAIN: 1, VALIDATION: 1, TEST: 0 });
  assert.equal(d.requests.length, 2);
  assert.equal(
    (await readFile(join(f.out, "train.jsonl"), "utf8")).trim().split("\n")
      .length,
    1,
  );
  await assert.rejects(
    () => prepareWorkshop(f.input, join(f.root, "forged"), "c".repeat(64)),
    /trusted_manifest/,
  );
  await assert.rejects(() => readFile(join(f.out, "test.jsonl")), /ENOENT/);
});
test("changing targets, prompts or runtime bindings invalidates prepared data", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.out, "train.jsonl"), "{}\n");
  await assert.rejects(() => verifyWorkshopData(f.out), /file_changed/);
});
test("failed training is reportable without inventing an adapter or success", async (t) => {
  const f = await fixture(t),
    d = await verifyWorkshopData(f.out),
    adapter = join(f.root, "failed-training");
  await mkdir(adapter);
  await writeFile(
    join(adapter, "training-result.json"),
    JSON.stringify({
      status: "TRAINING_FAILED",
      trainingExecuted: true,
      manifestSha256: d.manifestSha256,
      adapterCreated: false,
    }),
  );
  const output = join(f.root, "failed-report.json");
  await workshopTrainingReport(f.out, adapter, output);
  const report = JSON.parse(await readFile(output));
  assert.equal(report.trainingStatus, "FAILED");
  assert.equal(report.adapterHash, null);
  assert.equal(report.productionActivated, false);
});
test("existing trainer accepts verified workshop TRAIN/DEV and receives no TEST examples", async (t) => {
  const f = await fixture(t),
    d = await verifyWorkshopData(f.out);
  const script =
    "import importlib.util,json,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('trainer',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps({k:len(v) for k,v in m.verify_export(Path(sys.argv[2]),sys.argv[3]).items()}))";
  const counts = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        script,
        resolve("scripts/decision-diagnostics/nuknuk-train.py"),
        f.out,
        d.manifestSha256,
      ],
      { encoding: "utf8" },
    ),
  );
  assert.deepEqual(counts, { train: 1, valid: 1, test: 0 });
});
test("actual capture path binds adapter and prompt, then produces paired conservative evidence", async (t) => {
  const f = await fixture(t),
    a = join(f.root, "adapter-a"),
    b = join(f.root, "adapter-b");
  await mkdir(a);
  await mkdir(b);
  await writeFile(join(a, "adapters.safetensors"), "synthetic-a");
  await writeFile(join(b, "adapters.safetensors"), "synthetic-b");
  let calls = 0;
  const fetcher = (adapter) => async (url) => {
    if (url.endsWith("/health"))
      return Response.json({
        status: "healthy",
        loaded_model: "/synthetic-qwen",
        loaded_adapter: adapter,
      });
    calls++;
    return Response.json({
      model: "/synthetic-qwen",
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(target("tea")) },
        },
      ],
    });
  };
  const parent = join(f.root, "parent"),
    child = join(f.root, "child");
  await captureWorkshop(
    f.out,
    parent,
    sha("synthetic-a"),
    8089,
    "DEV",
    fetcher(a),
  );
  await captureWorkshop(
    f.out,
    child,
    sha("synthetic-b"),
    8089,
    "DEV",
    fetcher(b),
  );
  assert.equal(calls, 2);
  const output = join(f.root, "comparison.json");
  await compareWorkshop(f.out, parent, child, output);
  const report = JSON.parse(await readFile(output));
  assert.equal(report.productionActivated, false);
  assert.equal(report.rows.length, 1);
  assert.equal(report.kind, "LOCAL_INFERENCE_COMPARISON");
  assert.match(report.rows[0].status, /NOT_HUMAN_ACCEPTANCE/);
  await assert.rejects(
    () =>
      captureWorkshop(
        f.out,
        join(f.root, "wrong"),
        sha("wrong"),
        8089,
        "DEV",
        fetcher(a),
      ),
    /adapter_mismatch/,
  );
  await assert.rejects(
    () =>
      captureWorkshop(
        f.out,
        join(f.root, "public"),
        sha("synthetic-a"),
        8088,
        "DEV",
        fetcher(a),
      ),
    /isolated_capture_invalid/,
  );
});
