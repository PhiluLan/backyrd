#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentHash } from "./canonical-json.mjs";
import { readJson, repoRoot, writeJson } from "./io.mjs";
import { retrievalContractHashes } from "./retrieval-quality-contract.mjs";

const contractPath = resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.json");
const freezePath = resolve(repoRoot, "decision-lab/config/retrieval-quality-contract-v1.freeze.json");
const contract = await readJson(contractPath);
const hashes = retrievalContractHashes(contract);
const implementationHash = createHash("sha256").update(await readFile(resolve(repoRoot, "decision-lab/src/retrieval-quality-contract.mjs"))).digest("hex");
const scientificValidation = {
  version: "retrieval-quality-adversarial-validation-v1",
  cases: ["perfect", "very_good", "mediocre", "bad", "brute_force", "small_high_quality", "full_pool_good_top_k_bad", "top_k_good_coverage_bad", "sparse", "dense"],
  thresholdDerivation: "NORMATIVE_SLOT_AND_USER_OPPORTUNITY_PROTECTION",
  historicalEngineResultsUsedForThresholdSelection: false,
  lockedHoldoutUsedForThresholdSelection: false,
  latentTruthUse: "EVALUATION_ONLY",
  engineMutation: "NONE",
};
const body = {
  version: "retrieval-quality-contract-freeze-v1",
  contractVersion: contract.version,
  ...hashes,
  implementationHash,
  scientificValidation,
  scientificValidationHash: contentHash(scientificValidation),
  parentD2_1Freeze: contract.parents.d2_1Freeze,
  parentD2_2Freeze: contract.parents.d2_2Freeze,
  historicalRecallGateDisposition: contract.supersedes.disposition,
  historicalWave2_1Verdict: "FAIL_UNCHANGED",
  productionAccess: "NONE",
  frozen: true,
};
const freeze = { ...body, freezeManifestHash: contentHash(body) };

if (process.argv.includes("write")) {
  await writeJson(freezePath, freeze);
  process.stdout.write(`${JSON.stringify(freeze, null, 2)}\n`);
} else {
  const existing = await readJson(freezePath);
  const valid = contentHash(Object.fromEntries(Object.entries(existing).filter(([key]) => key !== "freezeManifestHash"))) === existing.freezeManifestHash
    && existing.contractHash === freeze.contractHash
    && existing.oracleCapacityDefinitionHash === freeze.oracleCapacityDefinitionHash
    && existing.promotionGateDefinitionHash === freeze.promotionGateDefinitionHash
    && existing.scientificValidationHash === freeze.scientificValidationHash;
  process.stdout.write(`${JSON.stringify({ valid, expected: freeze, actual: existing }, null, 2)}\n`);
  if (!valid) process.exitCode = 1;
}
