# Decision vNext Phase 2 — Existing Integration Audit

Canonical base: `983cd7b3a3c11dd3e549c256850749b07b52eadf` (tree `21794c48e538c005cc53f3a7e0f889c383751b22`). This audit treats executable contracts on that commit as truth. Decision v13 and Production RPCs were inspected only as frozen comparison boundaries; they are not imported into vNext.

| Component | Decision | Evidence and Phase-2 action |
|---|---|---|
| Schema-first Decision contracts | KEEP | Strict runtime schemas remain the single source for their inferred TypeScript types. |
| Client `DecisionRequest` | KEEP | Unknown privileged fields fail closed. Server authority remains outside the request. |
| Phase-1 execution envelope | KEEP | Remains the single-engine Phase-1 result authority. Phase 2 composes it through a server-only integration envelope instead of changing its stable result contract. |
| Situational Context | KEEP | Explicit/server-bound/derived separation, location proof, minimization and `writesUserIntelligence:false` already meet the boundary. |
| World adapter | EXTEND | Canonical `WorldKnowledgeReaderPort` is now exercised for every harness candidate with an exact server-accepted source-policy identity. No table reads or copied World types. |
| User projection adapter | EXTEND | Continues to consume only `RelevantUserProjection`; snapshot identity is now checked explicitly, including privacy-neutral suppression. |
| Candidate pool | KEEP | One frozen, neutral pool is generated before all engines and bound to every result. |
| Eligibility and opening-state evaluator | KEEP | The three Phase-1 hard rules and local-time evaluator remain central and unchanged. |
| Baseline A/B | KEEP | Reused behind the evaluation registry with their unapproved fixture parameters. |
| Legacy-v13 comparison | EXTEND | Added only as a frozen, local retrieval-position comparator. It makes no RPC or Production call and claims no v13 parity. |
| Ranking port | EXTEND | Four fixture/comparison adapters accept only branded `EligibleCandidate[]`. |
| Confidence | EXTEND | Evaluation result exposes seven uncalibrated states and never a probability. |
| Evidence and explanation | EXTEND | Evaluation evidence adds explicit World/User/Context/Eligibility/Ranking/Limitation domains; templates can only consume registered evidence IDs. |
| Phase-1 manifest/replay/integrity | KEEP | Existing recursive proofs remain unchanged. Phase 2 adds its own content-addressed comparison artifacts and semantic replay. |
| Sandbox | EXTEND | Existing deterministic 300-spot/50-user seeds are consumed through canonical World/User ports. |
| Decision Lab historical suites | KEEP | They remain an independent Legacy baseline and continue to run in the Risk Gate. |

## Root cause of the Phase-1 gap

Phase 1 proved each stage and two baselines, but each run constructed a baseline-specific synthetic execution. It did not provide one canonical multi-engine envelope, an engine registry, a machine-readable cross-engine report, a versioned degradation mapping, or explicit `NOT_CONFIGURED` evaluation metrics. Phase 2 fills only those integration and measurement gaps.

## Explicitly not changed

Decision v13, database schemas, migrations, RPCs, Edge Functions, Mobile, Web, Production adapters, Product ranking semantics and visible recommendations are unchanged.
