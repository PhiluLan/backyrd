# Production User Intelligence parity assessment

## Reference

The frozen reference is the Decision-Lab implementation:

- `n5-7-comparative-preference.mjs`
- `n5-8-unified-user-evidence.mjs`
- `n5-8-2-epistemic-high-guard.mjs`
- `n5-8-4-absolute-negativity-guard.mjs`

Sprint 2.1 supplies the missing service-only N4 read boundary. It preserves
concept presence and confidence and returns explicit unavailable state.

## Result

The requested full semantic parity cannot be asserted. This is a
`PORTING_BUG` / incomplete-port finding, not an N4 mapping or numerical
tolerance issue.

The current production rebuild function differs materially from the frozen
reference:

| Reference requirement | Current production runtime |
| --- | --- |
| GLOBAL, PLACE_TYPE, and CONTEXT comparative scopes | GLOBAL only |
| N5.7 correlation/identifiability and scope-diversity rules | not ported |
| Frozen comparative confidence, recency and trend calculation | different simplified calculation |
| N5.8 channel fusion per node | direct and comparative rows are merely kept apart; no frozen fusion result |
| N5.8.2 high eligibility | production writes `high_eligible = false` for comparative nodes |
| N5.8.2 dominance and exact audit reasons | not ported |
| N5.8.4 blocked-negative disposition with direct-evidence fallback | only a simplified absolute-negative condition |
| Full semantic change ledger | rebuild ledger does not contain the frozen transition/audit fields |

Consequently, any fixture for cases F–L or full longitudinal cards would
compare different engines. Passing it through tolerances or fixture-specific
expectations would violate the parity contract.

## Safe disposition

No production learning semantics were changed in Sprint 2.2. The existing
adapter remains read-only and disabled-path safe. A subsequent, explicitly
authorized **full frozen-engine port** must first define the common canonical
fixture serializer and port all of the rows above before golden parity can be
measured. Until then, Sprint 2 is not closed and no N3, N5.6.1, N6, UI, or
deployment work may depend on it.
