# N6A.6 — Sol Transport Timeout Hardening

Status: PASS; no external AI calls and no pilot restart.

## Root cause

The two failed attempts for scenario `6101-8`, `NEUTRAL` ended at `60.000s` and `60.001s`. The N6A.3 live executor creates an `AbortController` and schedules `controller.abort()` from `config.modelConfig.timeoutMs`. The frozen value was exactly `60000`; the caught `AbortError` was therefore a local/client-side timeout (Root Cause A), not an API or network response. The slot was ordinary for transport: 10 candidates and approximately 15.4 KB serialized N6A input; its worst-case estimate was USD 0.19809. No response body or provider error existed for either attempt.

## Change

Only the transport timeout changed from `60000` to `120000` milliseconds. Model, reasoning effort, output limit, prompt, task, retry count, validator, ranking, candidates, treatment, ground truth, budgets, and quality gates are unchanged. The executor now accepts injected timer functions solely for zero-time fake-transport tests; production behavior remains the same timeout boundary.

The retry policy remains one retry for canonical delivery failures only. Valid outputs, validator rejects, and poor rankings are never retried.

## Identity and resume disposition

`modelConfig` is explicitly included in the N6A.3 experiment identity. Consequently the timeout change changes the scientific identity from the previous pilot identity `f92c9e79b0b6c0f556159588f0a6f98f33799e78f0c091333ac4a32025183472` to a new timeout-specific identity recorded in the N6A.6 freeze. The previous committed slot is therefore not reusable under the new identity, and the old pilot cannot be resumed. A future pilot must start from a new empty manifest after separate authorization.

## Offline verification

Fake transport tests verify responses below 60 seconds, at 61 seconds, and just below 120 seconds succeed; a response beyond 120 seconds becomes `ABORT`; the frozen one-retry/stop semantics and atomic committed-slot rules remain covered by the N6A.3/N6A.5 regression suite. No real waiting or external calls are used.

## Cost and historical pilot

The previous pilot remains `INCOMPLETE`. Its verified cost, possible abort costs, and uncommitted slot are not reinterpreted. A longer timeout does not change token or budget formulas. Provider dashboard billing remains unobservable; internal verified usage and conservative possible-cost reserves stay separate.

## Freeze

Current measurement infrastructure: `backyrd-n6a6-sol-transport-timeout-freeze-v1`. The freeze records the new experiment identity and the 120-second transport configuration. N6A.2 semantics and N6A.3/N6A.4/N6A.5 invariants remain protected. Production access and mutation remain disabled.

## Verdicts

- ROOT CAUSE — LOCAL_TIMEOUT
- OLD TIMEOUT — 60s
- NEW TIMEOUT — 120s
- TIMEOUT CHANGE JUSTIFIED — PASS
- RETRY SEMANTICS — PASS
- ATOMIC CHECKPOINTING — PASS
- SCIENTIFIC IDENTITY — CHANGED
- OLD COMMITTED SLOT — NOT REUSABLE
- PILOT DISPOSITION — NEW PILOT REQUIRED
- OFFLINE TRANSPORT TESTS — PASS
- SCIENTIFIC VALIDITY — PASS (infrastructure only)
- NEW N6A PILOT — READY (requires separate authorization)
- EXTERNAL AI CALLS — 0
- PRODUCTION — UNCHANGED
