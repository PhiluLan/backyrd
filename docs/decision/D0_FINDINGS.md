# D0 Decision Findings

This is the canonical finding register for D0 Decision Engine forensics. It records observed behavior, not remediation proposals.

## D0-F-001 — Approval status is not a hard eligibility constraint in the V11/V12 personalized path

| Field | Value |
|---|---|
| ID | `D0-F-001` |
| Area | Candidate eligibility / Decision integrity |
| Severity | **P0 — Decision Integrity Failure** |
| Confidence | **High** |
| Status | **OPEN — immediate Production integrity review required** |

### Evidence

1. The canonical Git definition of `backyrd_get_decision_debug_v3` builds `base_spots` from `public.spots` using only the city predicate. It has no `status = 'approved'` predicate (`supabase/migrations/20260808120517_backyrd_canonical_baseline.sql`, function beginning at line 5346; relevant base query at lines 5350–5353).
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

