# Resolution, conflicts, and temporal behavior

## Deterministic resolution

Claims are grouped by Spot, area, and attribute key. Superseded and rejected claims remain in history but cannot become the active value. A future `validFrom` claim does not resolve early.

Consistent concurrent claims resolve to their shared value. Different known values or explicit contradiction produce `DISPUTED`; trust becomes `CONFLICTING`. Trust never selects a winner and a newer claim never destroys disagreement.

An explicitly unknown claim resolves to `UNKNOWN`. An unmentioned definition has no resolved record at all.

## Freshness

Slice 1 has a versioned validity policy but no invented universal TTL:

- ordinary facts and rules become `STALE` only after their explicit `validUntil`
- Current State becomes `EXPIRED` after its explicit `validUntil`
- Current State without `validUntil` is retained in resolution history but excluded from the engine port

Later fact-type-specific TTLs require a new validity-policy version.

## Hours

Regular venue hours, dated special hours, and kitchen hours use separate keys. `effectiveVenueHours` applies a special date only to that date; otherwise it selects that weekday's regular schedule. Kitchen intervals outside venue intervals produce a blocking conflict.

Asserted-only regular or service hours do not become engine-authoritative eligibility. A referenced or verified schedule is required.

## Conflict codes

The implemented matrix covers:

- overlapping contradictory values
- overlapping historical claims while preserving history
- indoor plus outdoor capacity exceeding simultaneous total
- supported group maximum exceeding total seats
- reservation threshold outside the supported group range
- explicitly false Take-away with Take-away offering
- kitchen hours outside venue hours
- existing outdoor infrastructure with a temporary area closure
- Current State without expiry
- unusual Pub/Eat classification as non-blocking information

Accessibility remains component-based. No rule promotes one accessible toilet or one step-free element to complete accessibility.
