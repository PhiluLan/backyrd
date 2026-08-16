#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readJson, repoRoot, writeJson } from "./io.mjs";

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;
const PRICE_PER_MILLION_TOKENS_USD = 0.02;
const args = process.argv.slice(2);
const command = args.shift() ?? "estimate";
const option = (name, fallback = null) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const worldPath = resolve(repoRoot, option("world"));
const world = await readJson(worldPath);
const documents = world.spots.map((spot) => ({
  spotId: spot.id,
  text: `Spot: ${spot.observed.name}\nKategorie: ${spot.category}\nStadt: ${spot.observed.city}\nPreislevel: ${spot.observed.priceLevel ?? "unknown"}\nBeschreibung: ${spot.observed.description ?? ""}\nMoods: ${spot.observed.moods.join(", ")}`,
}));
const approximateTokens = (text) => Math.ceil(String(text).length / 4);
const documentTokens = documents.reduce((sum, row) => sum + approximateTokens(row.text), 0);
const queryTokenAllowance = Number(option("query-token-allowance", "4200"));
const estimatedTokens = documentTokens + queryTokenAllowance;
const estimatedCostUsd = estimatedTokens / 1_000_000 * PRICE_PER_MILLION_TOKENS_USD;
const estimate = {
  model: MODEL, dimensions: DIMENSIONS, spotDocuments: documents.length, documentTokens,
  queryTokenAllowance, estimatedTokens, pricePerMillionTokensUsd: PRICE_PER_MILLION_TOKENS_USD,
  estimatedCostUsd, budgetRule: "STOP_ABOVE_CONFIGURED_CAP",
};

if (command === "estimate") {
  process.stdout.write(`${JSON.stringify(estimate, null, 2)}\n`);
  process.exit(0);
}
if (command !== "generate") throw new Error(`Unsupported command: ${command}`);
if (!process.env.DECISION_LAB_OPENAI_API_KEY) throw new Error("FULL_FIDELITY requires DECISION_LAB_OPENAI_API_KEY");
const maxUsd = Number(option("max-usd", "1"));
if (!Number.isFinite(maxUsd) || maxUsd <= 0 || estimatedCostUsd > maxUsd) throw new Error(`Estimated cost ${estimatedCostUsd} exceeds cap ${maxUsd}`);
const outputSql = resolve(repoRoot, option("output-sql"));
const outputManifest = resolve(repoRoot, option("output-manifest"));
const vectors = [];
let actualPromptTokens = 0;
for (let offset = 0; offset < documents.length; offset += 100) {
  const batch = documents.slice(offset, offset + 100);
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.DECISION_LAB_OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: batch.map((row) => row.text), dimensions: DIMENSIONS }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Embedding batch failed ${response.status}: ${payload?.error?.message ?? "unknown"}`);
  actualPromptTokens += Number(payload?.usage?.prompt_tokens ?? 0);
  for (let index = 0; index < batch.length; index += 1) {
    const embedding = payload?.data?.[index]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== DIMENSIONS) throw new Error(`Invalid embedding at batch offset ${offset + index}`);
    vectors.push({ ...batch[index], embedding });
  }
}
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sql = ["\\set ON_ERROR_STOP on", "begin;", ...vectors.map((row) => {
  const sourceHash = createHash("sha256").update(row.text).digest("hex");
  return `update public.backyrd_spot_embeddings_v1 set embedding=${q(`[${row.embedding.join(",")}]`)}::public.vector,model_name=${q(MODEL)},model_dimensions=${DIMENSIONS},source_hash=${q(sourceHash)},updated_at='2026-08-11T12:00:00Z' where spot_id=${q(row.spotId)}::uuid;`;
}), "commit;", "\\echo Full-Fidelity synthetic Spot embeddings installed."].join("\n");
await mkdir(dirname(outputSql), { recursive: true });
await writeFile(outputSql, `${sql}\n`);
const manifest = {
  version: "wave2-full-fidelity-spot-embeddings-v1", ...estimate, actualPromptTokens,
  actualSpotEmbeddingCostUsd: actualPromptTokens / 1_000_000 * PRICE_PER_MILLION_TOKENS_USD,
  corpusHash: createHash("sha256").update(JSON.stringify(documents)).digest("hex"),
  embeddingHash: createHash("sha256").update(JSON.stringify(vectors.map((row) => [row.spotId, row.embedding]))).digest("hex"),
  apiDate: new Date().toISOString(), secretPersisted: false,
};
await writeJson(outputManifest, manifest);
process.stdout.write(`${JSON.stringify({ status: "PASS", outputSql, outputManifest, ...manifest }, null, 2)}\n`);
