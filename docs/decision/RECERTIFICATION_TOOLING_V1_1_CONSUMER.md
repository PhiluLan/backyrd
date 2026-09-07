# Recertification Tooling V1.1 — D2/D3 Consumer

The D2 CLI and D3.1 preflight consume, but never create or mutate, an active additive recertification chain. The unchanged v44 contract remains the semantic trust anchor.

When no additive freeze exists, both validators use the existing v44 path. When an additive freeze exists, validation requires an externally supplied canonical base (`--trusted-base` for D2 or `CI_BASE_SHA` for D2/D3), a contiguous canonical version chain, the exact embedded candidate artifact and independent verification receipt, matching applied-record/freeze/lineage hashes, clean committed state, and unchanged Decision, Production and D2/D3 identities.

The consumer recursively validates every additive parent back to v44. Missing or altered artifacts or receipts, skipped versions, duplicate/forked lineage entries, stale candidates, a non-canonical base, unknown scope, protected-source drift, Production drift and D2/D3 parent drift fail closed. It emits no evidence, computes no candidate authorization, writes no hash and applies no state.

The additive path may explain an allowed Presentation/Evidence change that invalidates the legacy v44 working-tree evidence hash. It cannot override drift in the Constitution, Scenario registry, Evaluator, Hard-Gate registry, Framework Acceptance, result schema or Engine source. Those identities are independently compared with the unchanged v44 freeze before D2 readiness can pass.
