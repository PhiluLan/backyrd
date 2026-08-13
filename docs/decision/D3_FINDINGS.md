# D3 Findings

## D3-F-001 — Hard user constraints remain soft-scored

| Field | Value |
|---|---|
| Severity | P0 — Decision Integrity Failure |
| Status | OPEN — quantified; not fixed in D3-A |
| Evidence | 21/126 Decisions; Hard Category 13/18, Exclusion 3/9, Open Now 5/6 |
| Impact | Contradictory Spots reached public-result ranks |
| Coverage | All three seeds and all three splits |
| Confidence | HIGH |

## D3-F-002 — Candidate retrieval misses the best eligible synthetic Spot systematically

| Field | Value |
|---|---|
| Severity | P1 — Major Decision Quality Risk |
| Status | OPEN |
| Evidence | 118 retrieval failure records; mean eligible Top-1 loss 0.2962 |
| Impact | Low Recall@10 (0.0601) and low ranking ceiling utilization |
| Confidence | HIGH structurally; semantic attribution SIMULATION_ONLY |

## D3-F-003 — Current-intent response is weak

| Field | Value |
|---|---|
| Severity | P1 — Major Decision Quality Risk |
| Status | OPEN |
| Evidence | 15 pairs; 95.29% overlap, 33.33% directional-positive, mean delta -0.00330 |
| Impact | Material intent changes often do not materially change recommendations |
| Confidence | MEDIUM; paired but small sample |

## D3-F-004 — Personalization is neutral overall and harmful in mature/power samples

| Field | Value |
|---|---|
| Severity | P1 — Major Decision Quality Risk |
| Status | OPEN |
| Evidence | 18 treatments; mean lift -0.00251, harm 5/18; power mean -0.02133 |
| Impact | More observed history does not reliably improve the current Decision |
| Confidence | MEDIUM; causal controls pass, cohort n=3 |

## D3-F-005 — Remix repeats excluded Spots

| Field | Value |
|---|---|
| Severity | P1 — Major Decision Quality Risk |
| Status | OPEN |
| Evidence | 112 repeated occurrences over 18 Remix pairs; 1.78 new candidates mean |
| Impact | Remix frequently fails to provide genuinely new alternatives |
| Confidence | HIGH |

## D3-F-006 — Explanation evidence alignment misses the frozen floor

| Field | Value |
|---|---|
| Severity | P1 — Major Decision Quality Risk |
| Status | OPEN |
| Evidence | 1,260 candidates; 59.44% aligned/partial vs 95% floor; 121 misleading, 390 unsupported |
| Impact | Visible reasons often do not reflect traceable material factors |
| Confidence | HIGH for deterministic contract; no human calibration |

## D3-COVERAGE-GAP-001 — Semantic/fallback paths lacked natural final exposure

| Field | Value |
|---|---|
| Severity | P2 — Decision Quality Limitation |
| Status | OPEN |
| Evidence | 0 semantic-only and 0 fallback final candidates in 1,260 Golden candidate rows |
| Impact | D0-F-002 natural impact and fallback utility cannot be estimated from this run |
| Confidence | HIGH |
