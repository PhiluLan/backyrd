# N6A.4 — Checkpoint Secret-Scanner False-Positive Fix

Status: implementation-only measurement-integrity repair; no pilot restart.

## Incident and scope

The first new N6A pilot stopped before its first scientific commit because the N6A.3 scanner rejected `root.validatorDisposition.audit[7].authorization`. This is canonical validator evidence (`AUTHORIZED` or `NOT_AUTHORIZED`), not credential material. The response was not recovered or adopted; the pilot remains `INCOMPLETE` and slot 1 remains scientifically unusable.

N6A.4 changes only checkpoint secret detection. N2–N5, the Buddy, prompt, model/config, reason semantics, ranking, candidates, treatment contract, ground truth, thresholds, and budget contract are unchanged. External AI calls: 0.

## Minimal rule

The scanner still rejects secret-looking field names globally. It permits one exact schema path only:

`root.validatorDisposition.audit[<array-index>].authorization`

and only when its value is exactly `AUTHORIZED` or `NOT_AUTHORIZED`. The exception is not recursive and does not permit credentials, tokens, bearer values, nested secrets, or arbitrary values. Any other `authorization` key remains rejected. Secret-value detection remains recursive and fail-closed; known OpenAI (`sk-...`), Bearer, GitHub (`ghp_`, `gho_`, `ghs_`, `ghu_`, `github_pat_`) formats and secret-looking fields remain blocked.

## Verification

Adversarial fixtures cover:

- canonical validator audit authorization: accepted and atomically committed;
- authorized-reason audit metadata: accepted through the canonical audit structure;
- OpenAI API key, Bearer token, GitHub token, credential under an audit field, nested token, and obfuscated GitHub format: rejected;
- malformed/non-canonical authorization values: rejected closed.

The synthetic checkpoint contains the exact previously rejected audit shape and reaches `COMMITTED`. Existing crash-at-slot, crash-during-checkpoint, corruption, retry, immutability, budget, treatment-parity, 72/72 aggregation, and deterministic replay tests remain green.

## Freeze identity

The N6A.4 checkpoint-only identity was superseded by the N6A.5 rehearsal identity after the final-artifact path was exercised. The current affected measurement infrastructure is frozen as `backyrd-n6a5-synthetic-rehearsal-freeze-v1`; the protected Decision-Buddy identity remains `f92c9e79b0b6c0f556159588f0a6f98f33799e78f0c091333ac4a32025183472`. The current scanner version is `backyrd-n6a5-secret-scanner-v1`. Freeze hashes are recorded in `decision-lab/config/n6a3-atomic-checkpointing-v1.freeze.json`.

## Pilot disposition

No automatic restart occurred. The prior pilot's one in-flight response was not reconstructed, and no partial result is eligible for quality evaluation. A future pilot requires explicit authorization and a new preflight against this freeze.

## Verdicts

- N6A.4 SECRET SCANNER HARDENING — PASS
- LEGITIMATE AUTHORIZATION AUDIT — PASS
- REAL SECRET DETECTION — PASS
- ATOMIC CHECKPOINT REGRESSION — PASS
- SCIENTIFIC VALIDITY — PASS
- NEW N6A PILOT — READY (authorization still required)
- EXTERNAL AI CALLS — 0
- PRODUCTION — UNCHANGED
