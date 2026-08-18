# N6A North-Star Validation Contract v1

Status: frozen before external model execution.

## Scientific design

The matrix contains 42 decisions per seed across three seeds (126 decisions) and the ACTUAL, NEUTRAL and OPPOSING arms. Candidate universe, current intent and N3 moment are identical across treatment arms. Only the N5 user projection changes. Latent utility and Buddy Direction truth exist only in the evaluator.

Mandatory families are Cold Start, Early, Mature, Power, Same User/Different Moment, Different Users/Same Moment, Cross City, Unknown Context, Intent/History Conflict, Sparse Spot Intelligence, Premium Fairness, Strong Wrong Candidate and Buddy Direction Failure.

## Stages

1. DRY RUN: zero calls and complete cost projection.
2. SMOKE: five ACTUAL decisions; schema, candidate integrity, hallucinations, latency and budget.
3. PILOT: 24 decisions × three treatments; proceed only on the frozen pilot gates.
4. FULL: 126 decisions × three treatments, including locked holdout, only after a passed pilot and a remaining-budget forecast.

A missing stage, treatment arm, scenario family, candidate-parity check or locked-holdout boundary fails closed. A measurement-integrity defect stops the run and requires a versioned fix and complete restart. Poor model quality continues unless the pre-frozen pilot early-stop gate applies.

## Promotion gates

The machine-readable contract freezes NDCG@10, rank-weighted utility, Buddy Direction Alignment, fundamental direction failures, personalization lift and harm, Mature benefit, Cold Start non-regression, contextual differentiation, cross-city lift, current-intent authority, confidence calibration, explanation evidence alignment, candidate/output integrity, Premium parity, treatment parity, latency and budget compliance.

Set-invariant metrics are diagnostic only and cannot serve as reranking-lift gates. No composite score may compensate for an integrity, intent, harm or fundamental direction failure.

## Failure decomposition

The final analysis distinguishes `RETRIEVAL_MISS`, `MOMENT_MISS`, `USER_PROJECTION_MISS`, `SPOT_INTELLIGENCE_MISS`, `AI_REASONING_MISS`, `CONFIDENCE_MISS`, `EXPLANATION_ALIGNMENT_MISS`, `INTEGRITY_FAILURE` and `UNKNOWN`. This preserves the N1–N5 boundaries and prevents N6A from hiding upstream limitations.

Synthetic truth validates architecture and causal mechanisms, not real-world delight. N9 Closed Beta remains required.
