# N6A.5 — Full Synthetic 72-Slot Pilot Rehearsal

Status: PASS; synthetic measurement rehearsal only. No external AI calls and no real-pilot restart.

## Coverage and path

The rehearsal executed the exact canonical 24-scenario × `ACTUAL`/`NEUTRAL`/`OPPOSING` matrix (72 unique slot IDs) through the real N6A.3 path. The only substituted component was the external Sol transport: deterministic contract-conformant fake responses were passed through candidate-specific authorized reasons, evidence references, WHY-FOR-YOU/WHY-NOW/uncertainty audits, N6A.2 validation, secret scanning, atomic checkpointing, manifest updates, and the real 72/72 aggregator.

All 72 slots committed; 24 treatment triads and candidate parity passed. Three slots were validly rejected by the validator (one rejected scenario across its three treatment arms) and remained immutable `COMMITTED/REJECTED` checkpoints. They were not retried.

## Resume and failure rehearsal

Deterministic interruptions after slots 1, 10, 36, 61, and 71 were resumed through the same retry/resume path. A synthetic `NETWORK_FAILURE` was retried once under the frozen policy. Before each resume, the partial state reported `PARTIAL_NON_CERTIFIABLE`; aggregation was unavailable until 72/72. No committed slot was re-executed. Direct and resumed runs with the same experiment identity produced identical final scientific result hashes.

Checkpoint and final-artifact secret scans passed, including canonical validator authorization audits at both checkpoint and `final.result.slots[].validatorDisposition` paths. Temporary/partial files were absent after each completed rehearsal. Cost fields were finite and persisted; the rehearsal used `FAKE_FIXTURE` responses with zero external cost.

## Scientific boundary

This is infrastructure evidence only. It is not N6A quality evidence and produces no ranking, personalization, or model-quality verdict. The real pilot remains historically `INCOMPLETE`; its uncommitted slot 1 was not reconstructed or imported.

## Freeze

Because the final artifact path exercised a previously narrower scanner exception, the affected measurement infrastructure was re-frozen as `backyrd-n6a5-synthetic-rehearsal-freeze-v1` with scanner version `backyrd-n6a5-secret-scanner-v1`. The protected Buddy identity remains `f92c9e79b0b6c0f556159588f0a6f98f33799e78f0c091333ac4a32025183472`. Freeze hashes are recorded in `decision-lab/config/n6a3-atomic-checkpointing-v1.freeze.json`.

## Verification

The focused rehearsal suite passes 7/7 tests. The full Decision-Lab suite is rerun after this freeze and must remain fully green before any real pilot authorization.

Final verdicts:

- N6A.5 FULL SYNTHETIC PILOT REHEARSAL — PASS
- 72/72 END-TO-END COVERAGE — PASS
- ATOMIC CHECKPOINT PIPELINE — PASS
- SAFE RESUME E2E — PASS
- TREATMENT PARITY — PASS
- FINAL AGGREGATION — PASS
- SECRET/ARTIFACT INTEGRITY — PASS
- SCIENTIFIC MEASUREMENT READINESS — PASS (rehearsal infrastructure only)
- REAL N6A PILOT — READY (requires separate explicit authorization)
- EXTERNAL AI CALLS — 0
- PRODUCTION — UNCHANGED
