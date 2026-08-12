# D2 Decision Quality Constitution v1

> Historical v1 contract. Superseded for D3 measurement by `decision-quality-v1.1` after `D3-CONSTITUTION-ISSUE-001`. See `D2.1_HARD_GATE_RECERTIFICATION.md`. The v1 hashes remain immutable.

Normative code: `decision-lab/config/decision-quality-v1.json`. Its content hash freezes `decision-quality-v1`; prose never overrides that registry.

## Evaluation contract

Runs are evaluated in this order: validity/integrity, hard correctness, retrieval, ranking, context, personalization, maturity, diversity/novelty/repetition, fallback, explanation, reliability, outcome-potential, cohort/family verdict. INVALID runs never enter quality averages. There is no compensating total score.

Hard gates require 100% approved Product status, eligible Distribution, entity/trace integrity, latent-leakage freedom, and declared must-pass constraints. Empty relevant sets return `null`, never artificial recall 1. Utility is clamped latent utility; NDCG uses non-negative utility gain and logarithmic discount. Retrieval and conditional ranking remain separate. Production latency and real outcomes are explicitly NOT YET CALIBRATED.

The executable registry fixes K=5/10/20, relevance >=0.60, paired bootstrap (2,000 iterations, 95%, fixed seed), dimension floors, cohort floors, and known-defect policy. D0-F-002 is an Engine-verdict exception only; it never excuses Framework invalidity.

Freeze rule: gates, metrics, splits, scenarios and aggregation are immutable after holdout opening. Any change creates a new version; cross-version scores are not directly comparable.

## v1.1 executable correction

The v1.1 Constitution keeps the Quality intent and soft thresholds unchanged while assigning explicit IDs and deterministic evaluation semantics to Product eligibility, Distribution eligibility, entity integrity, latent leakage, city, hard category, category exclusion, open-now and duplicate results. Applicable missing evidence is `NOT_EVALUATED`, never PASS. All returned results are in scope. Certification, hard correctness and soft quality are separate states.
