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

Parity now passes because Lab and Product execute the same shared runtime;
there is no second SQL engine. The Product validation compares the direct
shared-runtime result with the deserialized snapshot produced by the real
path (DB sources → queue → repository → adapter → worker → persistence).

The final hashes were identical:

- progressive final card: `5b9481bbfd9496a495f5a79035b83119681c199a5481f145129e6690dbb8aef9`
- full rebuild: `5b9481bbfd9496a495f5a79035b83119681c199a5481f145129e6690dbb8aef9`
- direct shared runtime: `5b9481bbfd9496a495f5a79035b83119681c199a5481f145129e6690dbb8aef9`

Compared semantics include concept, scope, polarity, state, affinity,
confidence, evidence composition, HIGH eligibility, and N5.8.4 negative
eligibility. Missing canonical N4 is not substituted: its concept-level Taste
input stays unavailable while the original N2 Experience remains canonical.

Input mapping, N4 batch reads, output validation, persistence serialization,
and ledger transitions are therefore the only Product-specific layers. Frozen
N5.7/N5.8/N5.8.2/N5.8.4 formulas were not changed.
