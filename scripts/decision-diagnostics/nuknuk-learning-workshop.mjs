#!/usr/bin/env node
/** Reviewed Admin -> canonical training exporter -> isolated inference evidence.
 * No cloud allocation, credentials, public candidate, production writes or deployment.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
import {
  buildNuknukCompactSearchRequest,
  validateNuknukCompactSearch,
} from "../../packages/decision-vnext-core/dist/nuknuk-understanding.js";
import { contentHash } from "../../packages/decision-vnext-core/dist/canonical.js";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const shared = await readFile(
  resolve(repo, "packages/shared/src/nuknuk-learning.ts"),
  "utf8",
);
const { parseLearningDocument, targetCards } = await import(
  "data:text/javascript;base64," +
    Buffer.from(
      ts.transpileModule(shared, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    ).toString("base64")
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const put = async (p, v) =>
  writeFile(p, JSON.stringify(v, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const hashPattern = /^[a-f0-9]{64}$/;
const uuidPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sources = [
  "packages/decision-vnext-core/dist/nuknuk-understanding.js",
  "packages/decision-vnext-core/dist/product-luna-librarian.js",
  "packages/decision-vnext-core/dist/product-luna-librarian-assets.js",
];
export async function parseWorkshopExport(envelope) {
  if (
    !envelope ||
    typeof envelope.manifestBytes !== "string" ||
    envelope.manifestBytes.length > 20000000 ||
    sha(envelope.manifestBytes) !== envelope.manifestHash
  )
    throw Error("learning_export_integrity_failed");
  const m = JSON.parse(envelope.manifestBytes);
  if (
    m.version !== "backyrd.nuknuk-learning@1" ||
    !["TRAIN_DEV", "TEST"].includes(m.kind) ||
    !Array.isArray(m.rows) ||
    m.rows.length < 1 ||
    m.rows.length > 2000 ||
    (m.kind === "TEST" && !hashPattern.test(m.adapterHash))
  )
    throw Error("learning_export_invalid");
  const ids = new Set(),
    families = new Map(),
    queries = new Set();
  for (const row of m.rows) {
    parseLearningDocument(row.document);
    if (
      !uuidPattern.test(row.id) ||
      !uuidPattern.test(row.familyId) ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1 ||
      !hashPattern.test(row.approvalHash) ||
      typeof row.targetPolicy !== "string" ||
      !row.targetPolicy.startsWith("backyrd.learning-teacher@1:") ||
      !row.target ||
      !["TRAIN", "DEV", "TEST"].includes(row.split)
    )
      throw Error("learning_unapproved_row");
    if (
      ids.has(row.id) ||
      (families.has(row.familyId) && families.get(row.familyId) !== row.split)
    )
      throw Error("learning_family_split_leak");
    const query = row.document.query
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .normalize("NFC");
    if (queries.has(query)) throw Error("learning_duplicate_query");
    if (
      (m.kind === "TRAIN_DEV" && row.split === "TEST") ||
      (m.kind === "TEST" && row.split !== "TEST")
    )
      throw Error("learning_test_leak");
    validateNuknukCompactSearch(row.target, {
      query: row.document.query,
      reference: row.document.reference,
    });
    ids.add(row.id);
    families.set(row.familyId, row.split);
    queries.add(query);
  }
  if (
    m.kind === "TRAIN_DEV" &&
    !["TRAIN", "DEV"].every((s) => m.rows.some((r) => r.split === s))
  )
    throw Error("learning_train_dev_required");
  return m;
}
export async function prepareWorkshop(input, output, expectedManifestHash) {
  const envelope = await read(input);
  if (
    !hashPattern.test(expectedManifestHash) ||
    expectedManifestHash !== envelope.manifestHash
  )
    throw Error("learning_trusted_manifest_hash_required");
  const m = await parseWorkshopExport(envelope),
    files = {},
    requests = [];
  for (const row of m.rows) {
    const p = buildNuknukCompactSearchRequest({
      query: row.document.query,
      reference: row.document.reference,
    });
    const messages = [
      { role: "system", content: p.instructions },
      { role: "user", content: p.input },
    ];
    requests.push({
      id: row.id,
      split: row.split,
      query: row.document.query,
      reference: row.document.reference,
      messages,
      outputSchema: p.outputSchema,
      requestHash: contentHash({ messages, outputSchema: p.outputSchema }),
    });
  }
  if (m.kind === "TRAIN_DEV")
    for (const [split, name] of [
      ["TRAIN", "train"],
      ["DEV", "valid"],
    ]) {
      files[name + ".jsonl"] =
        m.rows
          .filter((r) => r.split === split)
          .map((r) => ({
            messages: [
              ...requests.find((p) => p.id === r.id).messages,
              { role: "assistant", content: JSON.stringify(r.target) },
            ],
          }))
          .map((r) => JSON.stringify(r))
          .join("\n") + "\n";
    }
  files["reviewed-export.json"] = JSON.stringify(envelope, null, 2) + "\n";
  files["requests.json"] = JSON.stringify(requests, null, 2) + "\n";
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      sources.map(async (p) => [p, sha(await readFile(resolve(repo, p)))]),
    ),
  );
  const manifest = {
    version: "backyrd.nuknuk-learning-dataset@1",
    purpose: "REVIEWED_UNDERSTANDING_ADAPTER_DATA_ONLY",
    sourceManifestHash: envelope.manifestHash,
    kind: m.kind,
    adapterHash: m.adapterHash,
    counts: {
      TRAIN: m.rows.filter((r) => r.split === "TRAIN").length,
      VALIDATION: m.rows.filter((r) => r.split === "DEV").length,
      TEST: m.rows.filter((r) => r.split === "TEST").length,
    },
    sourceHashes,
    fileByteHashes: Object.fromEntries(
      Object.entries(files).map(([name, b]) => [name, sha(b)]),
    ),
    testUsedForTraining: false,
    qualityApproved: false,
  };
  await mkdir(output, { mode: 0o700 });
  for (const [name, b] of Object.entries(files))
    await writeFile(resolve(output, name), b, { flag: "wx", mode: 0o600 });
  await put(resolve(output, "manifest.json"), manifest);
  return {
    status: "PREPARED_NOT_TRAINED",
    manifestSha256: sha(await readFile(resolve(output, "manifest.json"))),
    counts: manifest.counts,
  };
}
export async function verifyWorkshopData(folder) {
  const bytes = await readFile(resolve(folder, "manifest.json")),
    m = JSON.parse(bytes);
  if (
    m.version !== "backyrd.nuknuk-learning-dataset@1" ||
    m.purpose !== "REVIEWED_UNDERSTANDING_ADAPTER_DATA_ONLY" ||
    m.testUsedForTraining !== false
  )
    throw Error("learning_dataset_invalid");
  for (const [name, expected] of Object.entries(m.fileByteHashes)) {
    if (
      ![
        "train.jsonl",
        "valid.jsonl",
        "requests.json",
        "reviewed-export.json",
      ].includes(name) ||
      sha(await readFile(resolve(folder, name))) !== expected
    )
      throw Error("learning_dataset_file_changed");
  }
  for (const [name, expected] of Object.entries(m.sourceHashes))
    if (
      !sources.includes(name) ||
      sha(await readFile(resolve(repo, name))) !== expected
    )
      throw Error("learning_runtime_changed");
  if (Object.keys(m.sourceHashes).length !== sources.length)
    throw Error("learning_runtime_binding_missing");
  const envelope = await read(resolve(folder, "reviewed-export.json"));
  const original = await parseWorkshopExport(envelope);
  if (
    envelope.manifestHash !== m.sourceManifestHash ||
    original.kind !== m.kind
  )
    throw Error("learning_source_changed");
  const requests = await read(resolve(folder, "requests.json"));
  if (requests.length !== original.rows.length)
    throw Error("learning_request_roster_changed");
  for (const row of original.rows) {
    const req = requests.find((r) => r.id === row.id);
    const p = buildNuknukCompactSearchRequest({
      query: row.document.query,
      reference: row.document.reference,
    });
    const messages = [
      { role: "system", content: p.instructions },
      { role: "user", content: p.input },
    ];
    if (
      !req ||
      contentHash({ messages, outputSchema: p.outputSchema }) !==
        req.requestHash ||
      contentHash(req.messages) !== contentHash(messages) ||
      contentHash(req.outputSchema) !== contentHash(p.outputSchema) ||
      req.split !== row.split
    )
      throw Error("learning_request_changed");
  }
  if (m.kind === "TRAIN_DEV")
    for (const [split, name] of [
      ["TRAIN", "train"],
      ["DEV", "valid"],
    ]) {
      const rows = (await readFile(resolve(folder, name + ".jsonl"), "utf8"))
          .trim()
          .split("\n")
          .map(JSON.parse),
        expected = original.rows.filter((r) => r.split === split);
      if (
        rows.length !== expected.length ||
        rows.length !== m.counts[split === "TRAIN" ? "TRAIN" : "VALIDATION"]
      )
        throw Error("learning_train_count_changed");
      rows.forEach((r, i) => {
        const req = requests.find((q) => q.id === expected[i].id);
        if (
          contentHash(r.messages) !==
          contentHash([
            ...req.messages,
            { role: "assistant", content: JSON.stringify(expected[i].target) },
          ])
        )
          throw Error("learning_training_target_changed");
      });
    }
  return { manifest: m, manifestSha256: sha(bytes), original, requests };
}
export async function captureWorkshop(
  folder,
  output,
  adapterHash,
  port = 8089,
  split = "DEV",
  fetchImpl = fetch,
) {
  const d = await verifyWorkshopData(folder);
  if (
    !hashPattern.test(adapterHash) ||
    port !== 8089 ||
    !["TRAIN", "DEV", "TEST"].includes(split) ||
    (d.manifest.kind === "TEST" &&
      (split !== "TEST" || d.manifest.adapterHash !== adapterHash)) ||
    (d.manifest.kind === "TRAIN_DEV" && split === "TEST")
  )
    throw Error("learning_isolated_capture_invalid");
  const requests = d.requests.filter((r) => r.split === split);
  if (!requests.length || requests.length > 200)
    throw Error("learning_capture_count_bound");
  const endpoint = `http://127.0.0.1:${port}`;
  const health = async () => {
    const response = await fetchImpl(endpoint + "/health", {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!response.ok) throw Error("learning_isolated_health_failed");
    const h = await response.json();
    if (
      h.status !== "healthy" ||
      typeof h.loaded_adapter !== "string" ||
      typeof h.loaded_model !== "string" ||
      (await stat(resolve(h.loaded_adapter, "adapters.safetensors"))).size >
        128 * 1024 * 1024 ||
      sha(await readFile(resolve(h.loaded_adapter, "adapters.safetensors"))) !==
        adapterHash
    )
      throw Error("learning_isolated_adapter_mismatch");
    return h;
  };
  const h = await health();
  await mkdir(output, { mode: 0o700 });
  const records = [];
  for (const request of requests) {
    const current = await health();
    if (
      current.loaded_model !== h.loaded_model ||
      current.loaded_adapter !== h.loaded_adapter
    )
      throw Error("learning_runtime_identity_changed");
    await put(resolve(output, request.id + ".started"), {
      requestHash: request.requestHash,
      adapterHash,
    });
    const started = performance.now(),
      record = {
        id: request.id,
        adapterHash,
        requestHash: request.requestHash,
        split,
        attempt: 1,
      };
    try {
      const response = await fetchImpl(endpoint + "/v1/chat/completions", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(60000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: h.loaded_model,
          messages: request.messages,
          temperature: 0,
          max_tokens: 2048,
          stream: false,
          chat_template_kwargs: { enable_thinking: false },
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "nuknuk_compact_search",
              strict: true,
              schema: request.outputSchema,
            },
          },
        }),
      });
      if (!response.ok) throw Error("inference_http_" + response.status);
      const payload = await response.json(),
        choice = payload.choices?.[0];
      if (
        payload.model !== h.loaded_model ||
        choice?.finish_reason !== "stop" ||
        typeof choice?.message?.content !== "string"
      )
        throw Error("inference_incomplete");
      record.raw = JSON.parse(choice.message.content);
      record.rawHash = contentHash(record.raw);
      try {
        const actual = validateNuknukCompactSearch(record.raw, {
          query: request.query,
          reference: request.reference,
        });
        const gold = d.original.rows.find((r) => r.id === request.id);
        const expected = validateNuknukCompactSearch(gold.target, {
          query: request.query,
          reference: request.reference,
        });
        record.status =
          contentHash(actual.plan.raw) === contentHash(expected.plan.raw)
            ? "EXPECTED_GRAPH_MATCH_NOT_HUMAN_ACCEPTANCE"
            : "SEMANTIC_REVIEW_REQUIRED";
      } catch {
        record.status = "HANDOFF_REJECTED";
      }
    } catch {
      record.status = "INFERENCE_FAILED";
      record.error = "Keine vollständige, modellgebundene Antwort.";
    }
    record.durationMs = Math.round(performance.now() - started);
    await put(resolve(output, request.id + ".json"), record);
    records.push(record);
    console.log(
      JSON.stringify({
        id: record.id,
        status: record.status,
        durationMs: record.durationMs,
      }),
    );
  }
  const files = Object.fromEntries(
    await Promise.all(
      records.map(async (r) => [
        r.id + ".json",
        sha(await readFile(resolve(output, r.id + ".json"))),
      ]),
    ),
  );
  await put(resolve(output, "capture.json"), {
    version: "backyrd.nuknuk-learning-capture@1",
    datasetHash: d.manifestSha256,
    sourceManifestHash: d.manifest.sourceManifestHash,
    adapterHash,
    model: h.loaded_model,
    split,
    caseCount: records.length,
    files,
    productionWrites: 0,
    newModelCalls: records.length,
  });
  return { responses: records.length, adapterHash, productionActivated: false };
}
export async function compareWorkshop(
  folder,
  parentFolder,
  candidateFolder,
  output,
) {
  const d = await verifyWorkshopData(folder),
    p = await read(resolve(parentFolder, "capture.json")),
    c = await read(resolve(candidateFolder, "capture.json"));
  if (
    p.datasetHash !== d.manifestSha256 ||
    c.datasetHash !== d.manifestSha256 ||
    p.split !== c.split ||
    p.model !== c.model ||
    p.caseCount !== c.caseCount ||
    p.adapterHash === c.adapterHash
  )
    throw Error("learning_comparison_not_paired");
  const selected = d.requests.filter((r) => r.split === c.split);
  if (
    c.caseCount !== selected.length ||
    Object.keys(c.files).length !== selected.length ||
    Object.keys(p.files).length !== selected.length
  )
    throw Error("learning_capture_roster_changed");
  const rows = [];
  for (const request of selected) {
    const pair = [];
    for (const [dir, receipt] of [
      [parentFolder, p],
      [candidateFolder, c],
    ]) {
      const file = request.id + ".json",
        bytes = await readFile(resolve(dir, file));
      if (sha(bytes) !== receipt.files[file])
        throw Error("learning_capture_changed");
      const r = JSON.parse(bytes);
      if (
        r.id !== request.id ||
        r.requestHash !== request.requestHash ||
        r.adapterHash !== receipt.adapterHash ||
        r.split !== c.split
      )
        throw Error("learning_capture_binding_invalid");
      pair.push(r);
    }
    rows.push({
      id: request.id,
      query: request.query,
      obligations: d.original.rows.find((r) => r.id === request.id).document
        .obligations,
      parentCards: targetCards(pair[0].raw ?? null),
      candidateCards: targetCards(pair[1].raw ?? null),
      status: pair[1].status,
      durationMs: pair[1].durationMs,
      parent: {
        status: pair[0].status,
        durationMs: pair[0].durationMs,
        rawHash: pair[0].rawHash ?? null,
      },
      candidate: {
        status: pair[1].status,
        durationMs: pair[1].durationMs,
        rawHash: pair[1].rawHash ?? null,
      },
      semanticApproval: "HUMAN_REVIEW_REQUIRED",
    });
  }
  const report = {
    version: "backyrd.nuknuk-learning-report@1",
    kind: "LOCAL_INFERENCE_COMPARISON",
    split: c.split,
    manifestHash: d.manifest.sourceManifestHash,
    datasetHash: d.manifestSha256,
    parentAdapterHash: p.adapterHash,
    adapterHash: c.adapterHash,
    split: c.split,
    rows,
    productionActivated: false,
    independentHumanGold: false,
    method:
      "Same prompt and exact inputs; graph match is conservative and not semantic acceptance. Understanding only, not live inventory or end-to-end recommendations.",
  };
  await put(output, report);
  return { cases: rows.length, semanticApproval: false };
}
export async function workshopTrainingReport(folder, adapter, output) {
  const d = await verifyWorkshopData(folder),
    result = await read(resolve(adapter, "training-result.json"));
  const statuses = {
    TRAINING_FINISHED_REQUIRES_EVALUATION: "FINISHED",
    TRAINING_FAILED: "FAILED",
    TRAINING_TIMED_OUT: "TIMED_OUT",
  };
  const trainingStatus = statuses[result.status];
  if (
    d.manifest.kind !== "TRAIN_DEV" ||
    !trainingStatus ||
    result.trainingExecuted !== true ||
    result.manifestSha256 !== d.manifestSha256
  )
    throw Error("learning_training_completion_unverified");
  const file = resolve(adapter, "adapters.safetensors");
  let adapterHash = null;
  try {
    if ((await stat(file)).size > 128 * 1024 * 1024)
      throw Error("learning_adapter_unbounded");
    adapterHash = sha(await readFile(file));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (trainingStatus === "FINISHED" && (!adapterHash || !result.adapterCreated))
    throw Error("learning_training_adapter_missing");
  const report = {
    version: "backyrd.nuknuk-learning-report@1",
    kind: "TRAINING_RECEIPT",
    manifestHash: d.manifest.sourceManifestHash,
    datasetHash: d.manifestSha256,
    adapterHash,
    trainingStatus,
    trainingReceiptHash: sha(
      await readFile(resolve(adapter, "training-result.json")),
    ),
    rows: [],
    productionActivated: false,
    requiresModelEvaluation: trainingStatus === "FINISHED",
  };
  await put(output, report);
  return {
    status:
      trainingStatus === "FINISHED"
        ? "TRAINED_REQUIRES_COMPARISON"
        : trainingStatus,
    adapterHash,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, ...args] = process.argv.slice(2);
  try {
    let result;
    if (command === "prepare" && args.length === 3)
      result = await prepareWorkshop(
        resolve(args[0]),
        resolve(args[1]),
        args[2],
      );
    else if (command === "verify" && args.length === 1) {
      const d = await verifyWorkshopData(resolve(args[0]));
      result = {
        status: "VERIFIED_NOT_TRAINED",
        manifestSha256: d.manifestSha256,
        counts: d.manifest.counts,
      };
    } else if (command === "capture" && args.length >= 3 && args.length <= 5)
      result = await captureWorkshop(
        resolve(args[0]),
        resolve(args[1]),
        args[2],
        Number(args[3] ?? 8089),
        args[4] ?? "DEV",
      );
    else if (command === "compare" && args.length === 4)
      result = await compareWorkshop(...args.map((p) => resolve(p)));
    else if (command === "training-report" && args.length === 3)
      result = await workshopTrainingReport(...args.map((p) => resolve(p)));
    else
      throw Error(
        "learning_usage_prepare_verify_capture_compare_training-report",
      );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      error instanceof Error && error.message.startsWith("learning_")
        ? error.message
        : "learning_operation_failed",
    );
    process.exitCode = 1;
  }
}
