# D3 Findings

## D3-F-001 — Hard user constraints are soft-scored rather than eligibility-enforced

| Field | Value |
|---|---|
| Severity | P0 — Decision Integrity Failure |
| Status | OPEN — D3 stop |
| Evidence | First D3 synthetic World: 9/42 Decisions failed a hard gate |
| Frequency | Hard Category 5/5; Category Exclusion 3/3; Open Now 1/2 |
| Impact | Contradictory candidates reached ranks 1–10 |
| Affected cohorts | cold, onboarding, sparse, developing, mature, power |
| Affected contexts | explicit category, exact-name/category, negation, open-now |
| Failure class | CONSTRAINT_FAILURE / OPENING_HOURS_FAILURE |
| Confidence | HIGH — deterministic canonical-engine traces across all three splits |
| Reproduction | `bash scripts/decision/run-d3-v13-baseline.sh` stops after the first failing world |
| Recommended investigation | Dedicated P0 integrity repair; no fix in D3 |

Full evidence: [D3_P0_HARD_CONSTRAINT_INTEGRITY_STOP.md](D3_P0_HARD_CONSTRAINT_INTEGRITY_STOP.md).
