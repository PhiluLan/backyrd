# D2/D3 Multi-Visit Community Mood Re-Certification — 2026-09-01

## Verdict

The canonical Decision Engine source, weights, hard gates, Product eligibility,
and Production v110 bundle are byte-identical to the certified Mood V1
baseline. This additive re-certification binds only the Founder-authorized
change in the canonical Community Mood read model: repeated eligible visits
are normalized per unique user before the already bounded Mood signal is read.

No Review Mood writes Taste, N4, Gold, Offering or Purpose. Missing or
low-sample Mood evidence remains neutral, and Decision reads only established
canonical profiles after Product and Distribution eligibility.

## Evidence

- Same-day Review publication is enforced by a transactional database trigger
  and unique user/Spot/local-day reservation.
- Multi-visit user scores and unique-user Community aggregation are rebuilt
  deterministically from preserved Reviews.
- Unresolved, invalid and Mood-empty Reviews create no canonical numerator or
  denominator.
- Moderation and restoration rebuild the same derived profile.
- Decision Lab proves the existing 0.06 maximum component, established-only
  threshold and no-evidence neutrality.

Historical v7 certification remains immutable evidence. The v8 contract adds
the new migration and regression sources to the protected identity; it grants
no path-wide exception and changes no Production Decision bytes.
