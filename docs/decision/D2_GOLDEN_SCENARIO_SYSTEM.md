# D2 Golden Scenario System

> `golden-scenarios-v1` is historical. v1.1 adds machine-readable hard-gate applicability and full-result scope without changing scenario semantics or split counts.

`golden-scenarios-v1` generates 42 schema-validated contracts: 18 Development, 12 Regression and 12 Locked Holdout, across 18 families. Scenarios reference D1 observed users/history and evaluator-only latent utility; no expected ranking is copied from V13.

Split integrity rejects duplicate IDs, cross-split users, missing family coverage and insufficient counts. Holdout lives behind the explicit `holdout-acceptance` command and is opened only after freeze. Repository storage cannot provide genuine secrecy; the v1 custody claim is therefore tamper-evidence and process isolation, not security by obscurity. Operational secrecy requires protected CI storage.

D0-F-002 has a deterministic semantic-only NORMAL/REDUCED fixture. Acceptance requires the framework to identify the REDUCED rank-1 exposure as `KNOWN_ENGINE_DEFECT`, record ranks, Top-K exposure and regret, and never modify V13.

Every v1.1 scenario exposes `applicableHardGates` and `hardGateScope: FULL_RETURNED_SET`. Applicability is cross-checked against evaluator logic; disagreement is `NOT_EVALUATED`, not an implicit PASS.
