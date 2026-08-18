import { open, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalJson, contentHash } from "./canonical-json.mjs";

export const N6A3_VERSIONS = Object.freeze({
  manifest: "backyrd-n6a3-pilot-manifest-v1",
  slotIdentity: "backyrd-n6a3-slot-identity-v1",
  checkpoint: "backyrd-n6a3-slot-checkpoint-v1",
  resume: "backyrd-n6a3-safe-resume-v1",
  retry: "backyrd-n6a3-technical-retry-v1",
  costAccounting: "backyrd-n6a3-cost-accounting-v1",
  secretScanner: "backyrd-n6a5-secret-scanner-v1"
});

const SLOT_STATES = new Set(["PENDING", "IN_FLIGHT", "COMMITTED", "FAILED", "INTERRUPTED"]);
const RETRYABLE_FAILURES = new Set(["API_FAILURE", "TIMEOUT", "ABORT", "NETWORK_FAILURE"]);
const REQUIRED_CHECKPOINT_FIELDS = [
  "slotId", "inputHash", "sanitizedInput", "model", "modelConfig", "rawOutput", "parsedOutput",
  "candidateIds", "authorizedReasonSets", "evidenceReferences", "whyForYouAudit", "whyNowAudit",
  "uncertaintyAudit", "validatorDisposition", "failureReason", "inputTokens", "outputTokens",
  "latencyMs", "verifiedCostUsd", "startedAt", "completedAt", "execution", "freezeIds"
];
const SECRET_KEY = /(api[_-]?key|authorization|bearer|secret|password|token|credential|private[_-]?key|access[_-]?token)$/i;
const SECRET_VALUE = /(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,}|(?:ghp_|gho_|ghs_|ghu_|github_pat_)[A-Za-z0-9_]{10,})/i;
const AUTHORIZATION_AUDIT_PATH = /^(?:root\.validatorDisposition|root\.slots\[\d+\]\.validatorDisposition)\.audit\[\d+\]\.authorization$/;
const AUTHORIZATION_AUDIT_VALUES = new Set(["AUTHORIZED", "NOT_AUTHORIZED"]);

const invariant = (condition, code) => { if (!condition) throw new Error(code); };
const finiteNonNegative = (value) => Number.isFinite(value) && value >= 0;
const slotFile = (experimentDir, slotId) => join(experimentDir, "slots", `${slotId}.json`);
const attemptFile = (experimentDir, slotId, attempt) => join(experimentDir, "attempts", slotId, `${attempt}.json`);
const manifestFile = (experimentDir) => join(experimentDir, "manifest.json");

export function assertSecretFree(value, path = "root") {
  if (typeof value === "string") invariant(!SECRET_VALUE.test(value), `N6A3_SECRET_MATERIAL:${path}`);
  if (Array.isArray(value)) return value.forEach((entry, index) => assertSecretFree(entry, `${path}[${index}]`));
  if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) {
    const fieldPath = `${path}.${key}`;
    const canonicalAuthorizationAudit = key === "authorization" && AUTHORIZATION_AUDIT_PATH.test(fieldPath);
    if (canonicalAuthorizationAudit) {
      invariant(typeof entry === "string" && AUTHORIZATION_AUDIT_VALUES.has(entry), `N6A3_INVALID_AUTHORIZATION_AUDIT:${fieldPath}`);
    } else {
      invariant(!SECRET_KEY.test(key), `N6A3_SECRET_FIELD:${fieldPath}`);
    }
    assertSecretFree(entry, fieldPath);
  }
}

async function fsyncDirectory(path) {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function atomicWriteJson(path, value, { beforeRename } = {}) {
  assertSecretFree(value);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${contentHash({ path, value }).slice(0, 12)}`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(canonicalJson(value), "utf8"); await handle.sync(); } finally { await handle.close(); }
  const verified = JSON.parse(await readFile(temporary, "utf8"));
  invariant(contentHash(verified) === contentHash(value), "N6A3_ATOMIC_WRITE_VALIDATION_FAILED");
  if (beforeRename) await beforeRename(temporary);
  await rename(temporary, path);
  await fsyncDirectory(dirname(path));
}

export function buildExperimentIdentity(identity) {
  const required = [
    "n6InputContract", "outputContract", "buddyInstruction", "reasonAuthorizationContract", "validator",
    "n3Freeze", "n4Freeze", "n5Freeze", "candidateContract", "treatmentContract", "model", "modelConfig",
    "validationContract", "groundTruthEvaluator"
  ];
  for (const field of required) invariant(identity[field] !== undefined, `N6A3_IDENTITY_MISSING:${field}`);
  const protectedIdentity = { manifestVersion: N6A3_VERSIONS.manifest, ...identity };
  return { ...protectedIdentity, identityHash: contentHash(protectedIdentity) };
}

export function buildSlotIdentity({ scenarioId, seed, worldHash, arm, candidateIds, inputHash, relevantHashes, experimentIdentity }) {
  invariant(["ACTUAL", "NEUTRAL", "OPPOSING"].includes(arm), "N6A3_INVALID_TREATMENT_ARM");
  invariant(Array.isArray(candidateIds) && candidateIds.length > 0 && new Set(candidateIds).size === candidateIds.length, "N6A3_INVALID_CANDIDATES");
  const material = {
    version: N6A3_VERSIONS.slotIdentity, scenarioId, seed, worldHash, arm, candidateSetHash: contentHash(candidateIds),
    inputHash, relevantHashes, experimentIdentityHash: experimentIdentity.identityHash
  };
  return { ...material, slotId: `n6a3-${contentHash(material)}` };
}

function summarize(manifest) {
  const states = Object.values(manifest.slots).map(({ state }) => state);
  return {
    expected: manifest.expectedSlots,
    committed: states.filter((state) => state === "COMMITTED").length,
    inFlight: states.filter((state) => state === "IN_FLIGHT").length,
    failed: states.filter((state) => state === "FAILED").length,
    interrupted: states.filter((state) => state === "INTERRUPTED").length,
    remaining: states.filter((state) => state !== "COMMITTED").length,
    rejected: Object.values(manifest.slots).filter(({ state, disposition }) => state === "COMMITTED" && disposition === "REJECTED").length
  };
}

function sealManifest(manifest) {
  const body = { ...manifest, summary: summarize(manifest) };
  delete body.manifestHash;
  return { ...body, manifestHash: contentHash(body) };
}

async function readJson(path, errorCode) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { throw new Error(`${errorCode}:${error.code ?? error.message}`); }
}

function validateSlotTopology(slotIdentities, expectedSlots) {
  invariant(slotIdentities.length === expectedSlots, `N6A3_EXPECTED_SLOT_MISMATCH:${slotIdentities.length}:${expectedSlots}`);
  invariant(new Set(slotIdentities.map(({ slotId }) => slotId)).size === expectedSlots, "N6A3_DUPLICATE_SLOT");
  const groups = new Map();
  for (const slot of slotIdentities) {
    const material = { ...slot }; delete material.slotId;
    invariant(slot.slotId === `n6a3-${contentHash(material)}`, "N6A3_SLOT_IDENTITY_HASH_MISMATCH");
    const key = `${slot.seed}:${slot.scenarioId}:${slot.worldHash}`;
    const arms = groups.get(key) ?? [];
    arms.push(slot.arm); groups.set(key, arms);
  }
  invariant(groups.size * 3 === expectedSlots, "N6A3_TREATMENT_GROUP_COUNT_MISMATCH");
  for (const arms of groups.values()) invariant(JSON.stringify([...arms].sort()) === JSON.stringify(["ACTUAL", "NEUTRAL", "OPPOSING"]), "N6A3_TREATMENT_PARITY_FAILED");
}

export async function initializePilot({ experimentDir, experimentId, experimentIdentity, slotIdentities, initialVerifiedCostUsd = 0, initialPossibleUnverifiedCostUsd = 0, now = new Date().toISOString() }) {
  invariant(experimentIdentity.identityHash === contentHash(Object.fromEntries(Object.entries(experimentIdentity).filter(([key]) => key !== "identityHash"))), "N6A3_EXPERIMENT_IDENTITY_INVALID");
  validateSlotTopology(slotIdentities, 72);
  invariant(finiteNonNegative(initialVerifiedCostUsd) && finiteNonNegative(initialPossibleUnverifiedCostUsd), "N6A3_INVALID_INITIAL_COST");
  await mkdir(join(experimentDir, "slots"), { recursive: true });
  await mkdir(join(experimentDir, "attempts"), { recursive: true });
  await mkdir(join(experimentDir, "final"), { recursive: true });
  const manifest = sealManifest({
    version: N6A3_VERSIONS.manifest, experimentId, experimentIdentity, expectedSlots: 72, startedAt: now, updatedAt: now,
    slots: Object.fromEntries(slotIdentities.map((identity) => [identity.slotId, { identity, state: "PENDING", attempts: 0, checkpointHash: null, disposition: null, lastFailure: null }])),
    cost: { priorVerifiedUsd: initialVerifiedCostUsd, verifiedCommittedUsd: 0, possibleUnverifiedUsd: initialPossibleUnverifiedCostUsd }
  });
  await atomicWriteJson(manifestFile(experimentDir), manifest);
  return manifest;
}

async function validateCheckpoint(experimentDir, slotId, expectedHash) {
  const checkpoint = await readJson(slotFile(experimentDir, slotId), "N6A3_CHECKPOINT_UNREADABLE");
  invariant(checkpoint.checkpointHash === expectedHash, "N6A3_CHECKPOINT_HASH_REFERENCE_MISMATCH");
  const body = { ...checkpoint }; delete body.checkpointHash;
  invariant(contentHash(body) === checkpoint.checkpointHash, "N6A3_CHECKPOINT_CORRUPT");
  invariant(checkpoint.slotId === slotId, "N6A3_CHECKPOINT_SLOT_MISMATCH");
  assertSecretFree(checkpoint);
  return checkpoint;
}

export async function loadPilot({ experimentDir, expectedIdentity, recoverInterrupted = false, now = new Date().toISOString() }) {
  let manifest = await readJson(manifestFile(experimentDir), "N6A3_MANIFEST_UNREADABLE");
  const manifestBody = { ...manifest }; delete manifestBody.manifestHash;
  invariant(contentHash(manifestBody) === manifest.manifestHash, "N6A3_MANIFEST_CORRUPT");
  invariant(manifest.version === N6A3_VERSIONS.manifest, "N6A3_MANIFEST_VERSION_MISMATCH");
  const identityBody = { ...manifest.experimentIdentity }; delete identityBody.identityHash;
  invariant(contentHash(identityBody) === manifest.experimentIdentity.identityHash, "N6A3_EXPERIMENT_IDENTITY_CORRUPT");
  invariant(manifest.experimentIdentity.identityHash === expectedIdentity.identityHash, "N6A3_RESUME_IDENTITY_MISMATCH");
  invariant(Object.keys(manifest.slots).length === manifest.expectedSlots && manifest.expectedSlots === 72, "N6A3_MANIFEST_SLOT_COVERAGE_INVALID");
  validateSlotTopology(Object.values(manifest.slots).map(({ identity }) => identity), 72);
  for (const [slotId, slot] of Object.entries(manifest.slots)) {
    invariant(SLOT_STATES.has(slot.state), "N6A3_INVALID_SLOT_STATE");
    invariant(slot.identity.slotId === slotId, "N6A3_MANIFEST_SLOT_ID_MISMATCH");
    if (slot.state === "COMMITTED") await validateCheckpoint(experimentDir, slotId, slot.checkpointHash);
  }
  if (recoverInterrupted) {
    let changed = false;
    for (const slot of Object.values(manifest.slots)) if (slot.state === "IN_FLIGHT") {
      const path = attemptFile(experimentDir, slot.identity.slotId, slot.attempts);
      const attempt = await readJson(path, "N6A3_ATTEMPT_UNREADABLE");
      invariant(attempt.state === "IN_FLIGHT" || attempt.state === "COMMITTED", "N6A3_ATTEMPT_STATE_MISMATCH");
      const possibleCost = Math.max(Number(attempt.possibleUnverifiedCostUsd), Number(attempt.verifiedCostUsd ?? 0));
      invariant(finiteNonNegative(possibleCost), "N6A3_ATTEMPT_COST_INVALID");
      manifest.cost.possibleUnverifiedUsd += possibleCost;
      Object.assign(attempt, { state: "INTERRUPTED", failureType: "PROCESS_INTERRUPTED", completedAt: now });
      await atomicWriteJson(path, attempt);
      slot.state = "INTERRUPTED"; slot.lastFailure = "PROCESS_INTERRUPTED"; changed = true;
    }
    if (changed) { manifest.updatedAt = now; manifest = sealManifest(manifest); await atomicWriteJson(manifestFile(experimentDir), manifest); }
  }
  return manifest;
}

export async function markRetryable({ experimentDir, expectedIdentity, slotId, now = new Date().toISOString() }) {
  let manifest = await loadPilot({ experimentDir, expectedIdentity }); const slot = manifest.slots[slotId];
  invariant(slot, "N6A3_UNKNOWN_SLOT"); invariant(["INTERRUPTED", "FAILED"].includes(slot.state), "N6A3_SLOT_NOT_RETRYABLE_STATE");
  invariant(RETRYABLE_FAILURES.has(slot.lastFailure) || slot.lastFailure === "PROCESS_INTERRUPTED", "N6A3_FAILURE_NOT_RETRYABLE");
  invariant(slot.attempts < 2, "N6A3_RETRY_LIMIT_EXCEEDED");
  slot.state = "PENDING"; manifest.updatedAt = now; manifest = sealManifest(manifest);
  await atomicWriteJson(manifestFile(experimentDir), manifest); return manifest;
}

export async function beginSlotAttempt({ experimentDir, expectedIdentity, slotId, estimatedWorstCaseCostUsd, remainingWorstCaseCostUsd, budgetUsd, now = new Date().toISOString() }) {
  let manifest = await loadPilot({ experimentDir, expectedIdentity }); const slot = manifest.slots[slotId];
  invariant(slot, "N6A3_UNKNOWN_SLOT"); invariant(slot.state === "PENDING", slot.state === "COMMITTED" ? "N6A3_COMMITTED_SLOT_IMMUTABLE" : "N6A3_SLOT_NOT_PENDING");
  invariant(finiteNonNegative(estimatedWorstCaseCostUsd), "N6A3_INVALID_ESTIMATED_COST");
  const pendingCount = Object.values(manifest.slots).filter(({ state }) => state !== "COMMITTED").length;
  const remainingProjection = remainingWorstCaseCostUsd ?? pendingCount * estimatedWorstCaseCostUsd;
  invariant(finiteNonNegative(remainingProjection), "N6A3_INVALID_REMAINING_COST");
  const projected = manifest.cost.priorVerifiedUsd + manifest.cost.verifiedCommittedUsd + manifest.cost.possibleUnverifiedUsd + remainingProjection;
  invariant(projected <= budgetUsd + 1e-12, `N6A3_RESUME_BUDGET_BLOCKED:${projected}:${budgetUsd}`);
  slot.state = "IN_FLIGHT"; slot.attempts += 1; slot.lastFailure = null;
  const attempt = { version: N6A3_VERSIONS.retry, slotId, attempt: slot.attempts, state: "IN_FLIGHT", startedAt: now, estimatedWorstCaseCostUsd, possibleUnverifiedCostUsd: estimatedWorstCaseCostUsd };
  await atomicWriteJson(attemptFile(experimentDir, slotId, slot.attempts), attempt);
  manifest.updatedAt = now; manifest = sealManifest(manifest); await atomicWriteJson(manifestFile(experimentDir), manifest);
  return { manifest, attempt };
}

function validateCheckpointPayload(payload, slot) {
  for (const field of REQUIRED_CHECKPOINT_FIELDS) invariant(Object.hasOwn(payload, field), `N6A3_CHECKPOINT_FIELD_MISSING:${field}`);
  invariant(payload.slotId === slot.identity.slotId && payload.inputHash === slot.identity.inputHash, "N6A3_CHECKPOINT_IDENTITY_MISMATCH");
  invariant(Array.isArray(payload.candidateIds) && contentHash(payload.candidateIds) === slot.identity.candidateSetHash, "N6A3_CHECKPOINT_CANDIDATE_MISMATCH");
  invariant(finiteNonNegative(payload.inputTokens) && finiteNonNegative(payload.outputTokens) && finiteNonNegative(payload.latencyMs) && finiteNonNegative(payload.verifiedCostUsd), "N6A3_CHECKPOINT_NUMERIC_INVALID");
  invariant(["LIVE", "CACHE_REPLAY", "FAKE_FIXTURE"].includes(payload.execution), "N6A3_CHECKPOINT_EXECUTION_INVALID");
  assertSecretFree(payload);
}

export async function commitSlot({ experimentDir, expectedIdentity, slotId, payload, now = new Date().toISOString(), crashHook }) {
  let manifest = await loadPilot({ experimentDir, expectedIdentity }); const slot = manifest.slots[slotId];
  invariant(slot, "N6A3_UNKNOWN_SLOT"); invariant(slot.state === "IN_FLIGHT", slot.state === "COMMITTED" ? "N6A3_COMMITTED_SLOT_IMMUTABLE" : "N6A3_SLOT_NOT_IN_FLIGHT");
  validateCheckpointPayload(payload, slot);
  const checkpointBody = { version: N6A3_VERSIONS.checkpoint, attempt: slot.attempts, ...payload };
  const checkpoint = { ...checkpointBody, checkpointHash: contentHash(checkpointBody) };
  if (crashHook) await crashHook("BEFORE_CHECKPOINT_WRITE", { checkpoint });
  await atomicWriteJson(slotFile(experimentDir, slotId), checkpoint, { beforeRename: crashHook ? async () => crashHook("BEFORE_CHECKPOINT_RENAME", { checkpoint }) : undefined });
  if (crashHook) await crashHook("AFTER_CHECKPOINT_RENAME", { checkpoint });
  slot.state = "COMMITTED"; slot.checkpointHash = checkpoint.checkpointHash; slot.disposition = payload.validatorDisposition.valid ? "ACCEPTED" : "REJECTED"; slot.lastFailure = null;
  manifest.cost.verifiedCommittedUsd += payload.verifiedCostUsd;
  const attemptPath = attemptFile(experimentDir, slotId, slot.attempts);
  const attempt = await readJson(attemptPath, "N6A3_ATTEMPT_UNREADABLE");
  attempt.state = "COMMITTED"; attempt.completedAt = payload.completedAt; attempt.verifiedCostUsd = payload.verifiedCostUsd; attempt.possibleUnverifiedCostUsd = 0; attempt.checkpointHash = checkpoint.checkpointHash;
  await atomicWriteJson(attemptPath, attempt);
  manifest.updatedAt = now; manifest = sealManifest(manifest);
  if (crashHook) await crashHook("BEFORE_MANIFEST_COMMIT", { checkpoint, manifest });
  await atomicWriteJson(manifestFile(experimentDir), manifest);
  return { manifest, checkpoint };
}

export async function failSlotAttempt({ experimentDir, expectedIdentity, slotId, failureType, possibleUnverifiedCostUsd, now = new Date().toISOString() }) {
  invariant(RETRYABLE_FAILURES.has(failureType), "N6A3_UNKNOWN_TECHNICAL_FAILURE");
  let manifest = await loadPilot({ experimentDir, expectedIdentity }); const slot = manifest.slots[slotId];
  invariant(slot?.state === "IN_FLIGHT", "N6A3_SLOT_NOT_IN_FLIGHT"); invariant(finiteNonNegative(possibleUnverifiedCostUsd), "N6A3_INVALID_UNVERIFIED_COST");
  slot.state = "FAILED"; slot.lastFailure = failureType; manifest.cost.possibleUnverifiedUsd += possibleUnverifiedCostUsd;
  const path = attemptFile(experimentDir, slotId, slot.attempts); const attempt = await readJson(path, "N6A3_ATTEMPT_UNREADABLE");
  Object.assign(attempt, { state: "FAILED", failureType, completedAt: now, possibleUnverifiedCostUsd }); await atomicWriteJson(path, attempt);
  manifest.updatedAt = now; manifest = sealManifest(manifest); await atomicWriteJson(manifestFile(experimentDir), manifest); return manifest;
}

export function assertResumeBudget({ manifest, budgetUsd, remainingWorstCaseCostUsd }) {
  invariant(finiteNonNegative(budgetUsd) && finiteNonNegative(remainingWorstCaseCostUsd), "N6A3_INVALID_BUDGET_INPUT");
  const projected = manifest.cost.priorVerifiedUsd + manifest.cost.verifiedCommittedUsd + manifest.cost.possibleUnverifiedUsd + remainingWorstCaseCostUsd;
  invariant(projected <= budgetUsd + 1e-12, `N6A3_RESUME_BUDGET_BLOCKED:${projected}:${budgetUsd}`);
  return { priorVerifiedUsd: manifest.cost.priorVerifiedUsd, verifiedCommittedUsd: manifest.cost.verifiedCommittedUsd, possibleUnverifiedUsd: manifest.cost.possibleUnverifiedUsd, remainingWorstCaseCostUsd, projectedUsd: projected, budgetUsd };
}

export async function aggregatePilot({ experimentDir, expectedIdentity, now = new Date().toISOString() }) {
  const manifest = await loadPilot({ experimentDir, expectedIdentity });
  invariant(manifest.summary.committed === 72 && manifest.summary.remaining === 0, `N6A3_PILOT_INCOMPLETE:${manifest.summary.committed}:72`);
  const checkpoints = [];
  for (const [slotId, slot] of Object.entries(manifest.slots)) checkpoints.push(await validateCheckpoint(experimentDir, slotId, slot.checkpointHash));
  validateSlotTopology(Object.values(manifest.slots).map(({ identity }) => identity), 72);
  const scientificSlots = checkpoints.sort((a, b) => a.slotId.localeCompare(b.slotId)).map(({ slotId, inputHash, parsedOutput, validatorDisposition, failureReason }) => ({ slotId, inputHash, parsedOutput, validatorDisposition, failureReason }));
  const scientificBody = { version: "backyrd-n6a3-pilot-result-v1", experimentId: manifest.experimentId, experimentIdentityHash: expectedIdentity.identityHash, coverage: "72/72", treatmentParity: "PASS", slots: scientificSlots };
  const result = { ...scientificBody, resultHash: contentHash(scientificBody), generatedAt: now, qualityVerdict: "ELIGIBLE_FOR_CANONICAL_EVALUATION" };
  await atomicWriteJson(join(experimentDir, "final", "result.json"), result); return result;
}

export async function removeExperiment(experimentDir) { await rm(resolve(experimentDir), { recursive: true, force: true }); }
export async function listTemporaryArtifacts(experimentDir) {
  const found = [];
  async function walk(path) { let entries = []; try { entries = await readdir(path, { withFileTypes: true }); } catch { return; } for (const entry of entries) { const child = join(path, entry.name); if (entry.isDirectory()) await walk(child); else if (entry.name.includes(".tmp-")) found.push(child); } }
  await walk(experimentDir); return found.sort();
}
