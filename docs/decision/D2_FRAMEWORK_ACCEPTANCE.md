# D2 Framework Acceptance

> Framework Acceptance v1.1 supersedes v1 for D3 measurement.

Self-validation uses Oracle, Near Oracle, deterministic Random, Reverse, Missing Best, Bad Rank, duplicate, context-blind and identical-A/B fixtures. It proves monotonic ranking metrics, retrieval/ranking separation, duplicate response, D0-F-002 detection, deterministic statistics and null-comparison behavior. Corrupt contracts, non-finite numbers and leakage fail closed.

PASS requires all unit/contract/metamorphic tests, split and leakage checks, D0-F-002 classification, A/B null/blinding, deterministic output and unchanged Decision Engine sources. A measured Engine defect may remain open; a Framework defect may not.

v1.1 adds 45 independent hard-gate cases, the original four false-PASS regressions, valid counterparts, missing-evaluator and per-gate Always-PASS-placeholder mutations, unknown-gate rejection, order independence and contradictory-result rejection. D3 readiness consumes actual coverage/adversarial/freeze state rather than test-process exit alone.
