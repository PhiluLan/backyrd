# D0 Decision Findings

This is the canonical finding register for D0 Decision Engine forensics. It records observed behavior, not remediation proposals.

## D0-F-001 — Approval status is not a hard eligibility constraint in the V11/V12 personalized path

| Field | Value |
|---|---|
| ID | `D0-F-001` |
| Area | Candidate eligibility / Decision integrity |
| Severity | **P0 — Decision Integrity Failure** |
| Confidence | **High** |
| Status | **RESOLVED IN CODE — deterministic acceptance passed; Production deployment pending** |

### Evidence

1. The pre-fix canonical Git definition audited at the integrity stop built `base_spots` from `public.spots` using only the city predicate. It had no `status = 'approved'` predicate (historical baseline function beginning at line 5346; relevant base query at lines 5350–5353).
2. `backyrd_get_decision_spots_v11` consumes that candidate set and applies only `distribution_trust_filter_entities_v1` (`supabase/migrations/20260810191712_add_distribution_policy_and_consumption.sql`, lines 537–566). Distribution eligibility is based on `effective_state`, not the Spot approval status. A missing state defaults to `normal`.
3. `backyrd_get_decision_spots_v12` consumes the V11 result without adding an approval predicate (`supabase/migrations/20260808120517_backyrd_canonical_baseline.sql`, function beginning at line 5657; V11 call at lines 5749–5758).
4. Strictly read-only Live inspection on 2026-08-11 found 106 Basel Spots: 103 `approved`, 3 `pending`.
5. A strictly read-only Live call to `backyrd_get_decision_spots_v11` returned one of those `pending` Spots at rank 18 for a generic lively/drinks query. With its exact name as query it ranked 10th.
6. A minimized read-only Trust lookup showed that Spot's effective Distribution state is `normal`, so the V11 Trust/Distribution boundary does not remove it.

No Production data was written. The authenticated V12 RPC was not invoked because it persists recommendation-run rows.

### Observed behavior

A non-approved Spot is eligible for, and is returned by, the live personalized V11 candidate path. V12 receives V11's result and has no approval hard-filter. V12 score penalties may lower a candidate, but score behavior is not an eligibility guarantee.

The semantic V13 RPC independently requires `approved`; that does not repair the V12 side of the union. Trust/Distribution also does not encode approval state for this Spot.

### Potential Decision impact

The current Mobile Production path can admit non-approved inventory into the V12 side before V13 fusion. This violates the stated Decision invariant that hard eligibility is applied before ranking. The audit has not mutated Production or executed the writeful V12 RPC to force a displayed result, so whether this particular Spot has already appeared in a user's final Top 10 remains unproven.

### Audit consequence

The D0.2 prompt requires an immediate stop and separate report when a genuine Production integrity problem is found. Further Live traces and normal D0.2 completion were therefore stopped after confirming this finding.

### Root cause

`backyrd_get_decision_debug_v3` constructed its base candidate universe with only a city predicate. The later V11 wrapper is `SECURITY DEFINER`, so its call chain did not receive the caller-facing `spots_select_approved` RLS restriction. V11 applied Distribution eligibility, but Distribution deliberately does not encode Spot product approval. V12 and Public Web inherited that candidate universe.

### Fix

The shared V3 base candidate query now requires:

```sql
s.status = 'approved'::public.spot_status
```

This predicate is applied before text, Mood, Taste, exploration, Distribution, or V12 scoring. V11, V12, Mobile V13 personalized candidates, Public Web, and Decision Debug therefore inherit the same product-eligibility boundary. Existing Semantic V13 matching and the V13 fallback catalog were independently re-verified as already approved-only; their ranking behavior was not changed. Distribution Trust was not modified.

### Migration

`supabase/migrations/20260811210000_enforce_decision_product_eligibility.sql`

The migration is additive and redefines only `backyrd_get_decision_debug_v3`. Its scoring formula, ordering, parameters, return contract, ownership, and grants remain unchanged; the only candidate-universe change is the approval predicate.

### Permanent regression

`supabase/tests/sprint_decision_product_eligibility.sql`, executed by the canonical database validation, covers:

- exact-name and broad-query exclusion for stronger `pending` and `rejected` fixtures;
- direct V3 and V11 approved-only contracts;
- three authenticated isolated V12 executions and approved-only recommendation-run items;
- Semantic V13, fallback catalog, and personalized + semantic + fallback union eligibility;
- approved-only V11 score/order equivalence before and after invalid fixtures are added;
- approved `NORMAL`, `REDUCED`, `QUARANTINED`, `EXCLUDED`, and pending `NORMAL` interactions;
- repeated execution inside a rolled-back synthetic transaction.

### Resolution evidence

On 2026-08-11 a fresh canonical database boot passed the new regression, all existing Sprint 8–12 acceptance suites, and the reviewed DB-lint baseline. No Production mutation, `db push`, migration repair, deployment, or real-user behavioral write occurred.

After this resolution, D0.2 resumed and completed. The finding status remains unchanged until the normal Production rollout is confirmed.

## D0-F-002 — Semantic-only candidates omit Distribution priority during V13 fusion

| Field | Value |
|---|---|
| ID | `D0-F-002` |
| Area | Distribution / final ordering |
| Severity | **P1 — Major Decision Quality Risk** |
| Confidence | **High** |
| Status | **OPEN — documented, not fixed in D0.2** |

### Evidence

The V12 candidate constructor in `decision-v13/index.ts` assigns `distribution_priority` to both the Candidate and its explanation. The semantic-only constructor does neither, although `Candidate` declares the property as required and the Edge Function supplies a complete priority map. The final comparator subtracts `b.distribution_priority - a.distribution_priority`; for semantic-only values this becomes `undefined`, producing `NaN` and therefore no priority ordering.

The controlled sparse trace supplied priority 50 for the reduced Cellar Bar and 100 for normal fallback Spots. Every semantic-only/fallback candidate nevertheless had no property. Cellar Bar with score `0` stayed ahead of normal Night Owl Club with score `-.08`.

### Observed behavior and impact

Eligible `REDUCED` semantic-only/fallback candidates can outrank eligible `NORMAL` candidates. Quarantined and excluded candidates are still removed by the earlier Distribution filter, so no non-eligible candidate exposure was proved. The defect violates the intended exposure ordering and can materially change the Top 10.

## D0-F-003 — V12 recommendation runs do not represent the displayed Decision

| Field | Value |
|---|---|
| ID | `D0-F-003` |
| Area | Persistence / evaluation integrity |
| Severity | **P1 — Major Decision Quality Risk** |
| Confidence | **High** |
| Status | **OPEN — documented, not fixed in D0.2** |

### Evidence

V12 inserts its recommendation run before V13 fusion and inserts items only for V12's returned list. There is no V12-run ID on `decision_sessions`. Semantic-only/fallback candidates and V13 ranks/scores are absent. Controlled runs declared `candidate_count=40` and `shown_count=16` while persisting 10, 10, and 2 items.

### Observed behavior and impact

Recommendation-run analytics cannot reconstruct the final V13 union or client Top 10 and may misstate candidate/shown counts. Evaluations that treat these rows as impressions or displayed rank will produce invalid conclusions.

## D0-F-004 — Current Decision does not enforce live moment availability

| Field | Value |
|---|---|
| ID | `D0-F-004` |
| Area | Context / candidate validity |
| Severity | **P1 — Major Decision Quality Risk** |
| Confidence | **High** |
| Status | **OPEN — documented, not fixed in D0.2** |

### Evidence

Mobile sends no user coordinates or weather. V12 is called with `p_open_bonus=0`; open-now is not an eligibility predicate. Semantic retrieval and fallback do not filter opening hours. Sunday/weekend/indoor are text/intent signals, not checks against the requested/current time.

### Observed behavior and impact

A closed, distant, unavailable, or weather-inappropriate approved Spot can rank highly. The current system can describe moment fit without proving live feasibility.

## D0-F-005 — V11 base Mood score is query-independent in the Mobile path

| Field | Value |
|---|---|
| ID | `D0-F-005` |
| Area | V3/V11 candidate scoring |
| Severity | **P2 — Decision Quality Limitation** |
| Confidence | **High** |
| Status | **OPEN — documented, not fixed in D0.2** |

### Evidence

Mobile V13 passes `p_selected_cluster_ids=NULL` to V12/V11/V3. V3 then aggregates every valid review-Mood count for the Spot. Its query comparison is only a complete-string name/city substring check.

### Observed behavior and impact

The main V11 base signal behaves like total review-Mood volume rather than current-Mood fit. Spots with no review Moods receive zero; high-volume Spots can dominate V11 regardless of the request.

## D0-F-006 — Deterministic negation and price intent are incomplete

| Field | Value |
|---|---|
| ID | `D0-F-006` |
| Area | Intent understanding |
| Severity | **P2 — Decision Quality Limitation** |
| Confidence | **High** |
| Status | **OPEN — documented, not fixed in D0.2** |

### Evidence

The parser recognizes listed Bar/restaurant/nightlife phrases and `nicht laut`. It has no deterministic behavior for `nicht teuer`, `nicht touristisch`, or `nichts schickes`. Price is available in documents and learned features but is not a request constraint.

### Observed behavior and impact

Unrecognized negative requirements rely only on embedding behavior and can be inverted or ignored. A user can explicitly reject an attribute without receiving a deterministic penalty for it.

## D0-F-007 — V12 ranking is nondeterministic for identical input state

| Field | Value |
|---|---|
| ID | `D0-F-007` |
| Area | Ranking reproducibility |
| Severity | **P2 — Decision Quality Limitation** |
| Confidence | **High** |
| Status | **OPEN — documented, not fixed in D0.2** |

### Evidence

V11 uses a deterministic daily hash for exploration, but V12 separately calls PostgreSQL `random()` for every candidate and adds up to `.055`. No seed or run-level random value is persisted.

### Observed behavior and impact

Identical requests and stored state can change order, especially near ties, and a historical run cannot be exactly replayed from persisted inputs.

## D0-F-008 — Human explanation is not a complete causal ranking explanation

| Field | Value |
|---|---|
| ID | `D0-F-008` |
| Area | Explainability |
| Severity | **P2 — Decision Quality Limitation** |
| Confidence | **High** |
| Status | **OPEN — documented, not fixed in D0.2** |

### Evidence

`human_reason` is selected through substring/category heuristics over the semantic document and intent. V12 `why_this` predates V13 fusion. Mobile turns these into headline/subtitle copy without attributing Distribution, score saturation, category mismatch, or recent-memory terms.

### Observed behavior and impact

Copy can highlight a true document phrase that was not the material cause of rank, omit a dominant negative factor, or provide plausible fallback copy at semantic score zero.

## D0-F-009 — Available favorite/review ML event types are not proven current product learning chains

| Field | Value |
|---|---|
| ID | `D0-F-009` |
| Area | Learning / outcome wiring |
| Severity | **P2 — Decision Quality Limitation** |
| Confidence | **High** |
| Status | **OPEN — documented, not fixed in D0.2** |

### Evidence

The ML RPC supports `favorite_add/remove` and `review_create/update`, but no current product call site was found that logs those types. Favorites persist user+Spot without Decision linkage. Review submission links reviews to Decisions but does not log a review ML event.

### Observed behavior and impact

The engine can observe these outcomes in separate tables but does not reliably convert them into the implemented feature/context/place-type learning path.

## D0-F-010 — Fallback TypeScript and SQL contracts disagree on `city`

| Field | Value |
|---|---|
| ID | `D0-F-010` |
| Area | Contract / maintainability |
| Severity | **P3 — Architecture / Maintainability** |
| Confidence | **High** |
| Status | **OPEN — documented, not fixed in D0.2** |

### Evidence

`DistributionFallbackRow` declares `city`, while `distribution_trust_spot_catalog_v1` returns only ID, name, category, state, and priority. Edge initially reads `row.city` as undefined; the later metadata fetch fills city.

### Observed behavior and impact

Current output is normally repaired before response, but the compile-time contract masks a database/runtime mismatch and makes the fallback stage easier to misread or reuse incorrectly.

## D3-F-001 — Hard user constraints are soft-scored rather than eligibility-enforced

| Field | Value |
|---|---|
| ID | `D3-F-001` |
| Area | Public Decision hard-constraint integrity |
| Severity | **P0 — Decision Integrity Failure** |
| Confidence | **High** |
| Status | **OPEN — D3 stopped; no baseline certified** |

### Evidence

After the D2.1/v1.1 preflight passed, the first controlled 42-scenario V13 World produced nine full-result hard-gate failures: Hard Category 5/5, Category Exclusion 3/3 and Open Now 1/2. Violations occurred in Development, Regression and Locked Holdout and reached rank 1. Product Eligibility and Distribution Eligibility remained intact.

### Observed behavior and impact

V13 recognizes category/exclusion intent but applies it through bounded fusion boosts and penalties rather than a canonical hard eligibility boundary. A user can therefore receive a Bar after “keine Bar,” a wrong category under strict guided intent, or a closed Spot under an open-now requirement. D3 stopped after seed 1 and certified no baseline. Full evidence is in `docs/decision/D3_P0_HARD_CONSTRAINT_INTEGRITY_STOP.md`.
