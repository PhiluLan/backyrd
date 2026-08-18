# N6A.3 Atomic Pilot Checkpointing & Safe Resume

Status: **PASS — frozen before any new pilot**

Scope: experiment execution, persistence, resume, retry, and cost accounting only

External AI calls / cost in N6A.3: **0 / USD 0**
Production: **UNCHANGED**

## 1. Incident root cause

The interrupted N6A pilot kept all response bodies, parsed outputs, reason audits, token usage, costs, latency, and validator dispositions in one process-local array. The only durable result write occurred after all 72 calls. Call 62 ended with `DOMException [AbortError]`; the process terminated before the monolithic result write. A successful provider response therefore was incorrectly treated as sufficient progress even though no durable scientific observation existed.

This was a measurement-infrastructure defect, not a Decision Buddy, N2–N5, model, prompt, candidate, treatment, validator, or evaluator defect.

## 2. Old pilot disposition

The old run remains `INTERRUPTED / SCIENTIFICALLY UNUSABLE`:

- 61 completed provider calls are not reconstructed or imported.
- The observed 58 accepted / 3 rejected progress counters are operational history only.
- No ranking, personalization, confidence, or reason-quality conclusion is derived from them.
- Last verified cumulative cost was USD 9.97842; the aborted call may have additional unknown external cost.
- No old call becomes a committed N6A.3 slot.

## 3. Atomic slot model

The canonical pilot has exactly 72 order-independent slots: 24 base scenarios × `ACTUAL`, `NEUTRAL`, and `OPPOSING`. A slot ID hashes:

- scenario, seed, world, and treatment arm;
- ordered candidate set and AI input;
- N3 Moment, N4 Spot, and N5 Projection identities;
- N6 input/output, Buddy instruction, reason authorization, and validator contracts;
- model and model configuration;
- candidate, treatment, validation, and ground-truth evaluator identities.

Changing any scientific identity creates a different experiment and makes resume fail closed.

## 4. State machine

`PENDING → IN_FLIGHT → COMMITTED`

Technical delivery failures use `IN_FLIGHT → FAILED`; process loss is recovered as `IN_FLIGHT → INTERRUPTED`. Only explicitly retryable technical failures can return to `PENDING`. A validator-rejected but completely captured model response becomes `COMMITTED` with disposition `REJECTED`; it is not retried.

## 5. Atomic checkpoint semantics

Before the next call, each completed call produces a self-hashed slot checkpoint containing:

- sanitized input, raw and parsed output;
- candidate IDs and authorized reason sets;
- evidence references and WHY-FOR-YOU / WHY-NOW / uncertainty audits;
- validator disposition and failure reason;
- token usage, latency, verified cost, timestamps, and execution mode;
- model/config and protected freeze IDs.

The write sequence is temporary file → flush → parse/hash validation → atomic rename → directory flush. The manifest marks the slot `COMMITTED` only after the complete checkpoint exists. A crash before the manifest commit leaves an orphan checkpoint, not a scientific observation; resume treats the slot as interrupted and never promotes the orphan implicitly.

## 6. Pilot manifest

The self-hashed manifest contains experiment identity, all 72 slot identities and states, attempt counts, checkpoint hashes, dispositions, timestamps, committed/rejected/remaining counts, verified committed cost, and possible unverified cost. Committed checkpoint hashes are revalidated on every load.

The canonical filesystem boundary is:

```text
experiment/
  manifest.json
  attempts/<slot-id>/<attempt>.json
  slots/<slot-id>.json
  final/result.json
```

## 7. Safe resume and immutability

Resume validates every protected scientific identity and the complete 72-slot topology before doing work. Any model, prompt, validator, contract, candidate, treatment, freeze, validation, or evaluator mismatch returns `N6A3_RESUME_IDENTITY_MISMATCH` before an external call.

Every `COMMITTED` slot is immutable. Its checkpoint must exist and match both its internal hash and the manifest reference. It is skipped on resume, never overwritten, and never paid twice. Corruption, missing slots, duplicates, malformed JSON, or changed hashes fail closed.

## 8. Retry semantics

Only `API_FAILURE`, `TIMEOUT`, `ABORT`, and `NETWORK_FAILURE` are retryable. The frozen maximum is one retry per slot. Retry retains the same Slot ID, input, candidate set, model/config, and all contracts. Each attempt is persisted separately. Valid but poor or validator-rejected outputs are never retried.

An interrupted attempt without an atomically committed checkpoint has no scientific result. It becomes retryable, while its possible external cost remains reserved.

## 9. Cost accounting and budget guard

The ledger separates:

- `priorVerifiedUsd`: verified historical experiment spend that still consumes the cumulative budget but is not imported as scientific evidence;
- `verifiedCommittedUsd`: verified costs attached to committed observations in the new experiment;
- `possibleUnverifiedUsd`: conservative exposure from failed or interrupted in-flight attempts;
- `remainingWorstCaseCostUsd`: exact frozen estimate for all unfinished slots.

Before initial execution and every resumed call:

`verified + possible unverified + exact remaining worst case <= hard budget`

Otherwise resume stops with `N6A3_RESUME_BUDGET_BLOCKED` before a call. Exactly-once payment is guaranteed for committed slots; provider-side exactly-once cannot be guaranteed for an interrupted in-flight request, so its exposure remains explicit.

## 10. Partial-run and final aggregation rules

Operational inspection may report committed, rejected, failed, interrupted, remaining, and cost counts. It always labels incomplete data `PARTIAL_NON_CERTIFIABLE`; quality verdicts are prohibited.

Final aggregation requires:

- 72/72 unique slots `COMMITTED`;
- exactly one ACTUAL, NEUTRAL, and OPPOSING slot per base scenario;
- matching candidate/world/context and ground-truth contracts across each triad;
- valid hashes for every checkpoint.

Coverage below 72/72 produces `N6A3_PILOT_INCOMPLETE`, never a partial verdict.

## 11. Crash and corruption validation

Local fake-response tests made zero external calls and passed:

- process interruption at slots 1, 10, 61, and 71;
- crash before checkpoint write, before atomic rename, after artifact rename, and before manifest commit;
- accepted and fail-closed rejected output persistence;
- committed-slot mutation;
- protected identity changes for model, prompt, candidates, treatments, validator, validation, and evaluator;
- corrupted checkpoint hash, malformed cost, partial JSON, duplicate slot, wrong treatment parity, stale temporary artifacts, and secret-shaped fields;
- budget refusal including possible in-flight cost;
- incomplete 1/72 aggregation refusal;
- uninterrupted versus slot-61-interrupted/resumed 72-slot replay.

Crashes during conceptual raw/parse/audit assembly occur before any checkpoint write because the complete package is validated as one value. They therefore leave `IN_FLIGHT`, never `COMMITTED`.

## 12. Deterministic replay

With identical fake responses, the uninterrupted 72-slot execution and the interrupted/resumed execution produce the same scientific result hash. Attempt metadata, wall-clock timestamps, and provider-delivery history remain auditable but are excluded from the semantic result identity.

## 13. Privacy, secrets, and cache boundary

Every checkpoint is recursively scanned before persistence. API keys, authorization headers, bearer material, passwords, and secret-shaped fields are rejected. Inputs remain sanitized and minimum-necessary; no latent truth, premium/billing, private Trust/Security evidence, or unnecessary raw memory is added.

Cache and checkpoint remain distinct. A cache hit is not scientific evidence unless the frozen experiment explicitly authorizes `CACHE_REPLAY`; N6A.3 does not silently do so.

## 14. Versions and freeze

- Manifest: `backyrd-n6a3-pilot-manifest-v1`
- Slot identity: `backyrd-n6a3-slot-identity-v1`
- Checkpoint: `backyrd-n6a3-slot-checkpoint-v1`
- Resume: `backyrd-n6a3-safe-resume-v1`
- Retry: `backyrd-n6a3-technical-retry-v1`
- Cost accounting: `backyrd-n6a3-cost-accounting-v1`

The N6A.3 freeze protects the persistence engine, canonical pilot binding, runner, acceptance tests, configuration, and the unchanged N3–N6A.2 Decision Buddy identity.

## 15. Boundaries and new-pilot readiness

N6A.3 does not change N2–N5, prompt, model, model config, reason authorization, validator, candidates, treatment contract, ranking, thresholds, ground truth, or evaluator. It performs no AI call and does not resume the invalidated pilot.

A completely new pilot is technically ready after review and merge. It must receive fresh explicit budget/call authorization, create a new experiment directory, and begin with 0/72 committed scientific slots. The old 61 calls remain unusable.

## Final verdicts

- **N6A.3 ATOMIC PILOT CHECKPOINTING — PASS**
- **PER-SLOT ATOMIC PERSISTENCE — PASS**
- **COMMITTED SLOT IMMUTABILITY — PASS**
- **SAFE RESUME — PASS**
- **RETRY SEMANTICS — PASS**
- **BUDGET RESUME GUARD — PASS**
- **PARTIAL QUALITY VERDICT PREVENTION — PASS**
- **72/72 AGGREGATION GUARD — PASS**
- **TREATMENT PARITY — PASS**
- **CRASH RESILIENCE — PASS**
- **DETERMINISTIC RESUME EQUIVALENCE — PASS**
- **SCIENTIFIC VALIDITY — PASS**
- **NEW N6A PILOT — READY**
- **EXTERNAL AI CALLS — 0**
- **PRODUCTION — UNCHANGED**
