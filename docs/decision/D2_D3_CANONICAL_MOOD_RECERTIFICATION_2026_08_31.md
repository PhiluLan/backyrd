# D2/D3 Minimal Canonical Community Mood Re-Certification — 2026-08-31

## Status

Founder/CTO authorized exactly one production Decision delta: resolve explicit or free-text Mood language through the canonical Mood resolver and add sufficiently evidenced Community Mood as a bounded soft Spot signal. This document records the pre-production semantic re-certification. It does **not** claim a Production deployment, Security acceptance, Founder physical acceptance, or final Product PASS.

## Authorized delta

- `backyrd_resolve_decision_mood_query_v1` reuses active governed Mood concepts and aliases and returns at most two distinct canonical concepts.
- `backyrd_decision_community_mood_signal_v1` reads only `ESTABLISHED` canonical Community Mood profile rows after Product and Distribution eligibility.
- The normalized signal is non-negative and the Decision component is capped at `0.06`.
- Missing, low-sample, unresolved, invalid, or unavailable Mood evidence yields zero and never excludes or penalizes a Spot.
- Community Mood does not alter retrieval eligibility, general ranking weights, N3/N4/N5/N6, User Taste, Gold/Accepted Facts, Offering/Purpose, or reason copy.

## Fail-closed evidence

The v6 contract binds the exact Engine source, the new pure bounded-signal module, the canonical Mood migration, existing Decision semantic sources, focused SQL and Decision regressions, and the unchanged D2 hard-gate evidence. `decision-d2-scope-guard.sh` admits only the exact two protected Decision files when this complete re-certification validates and the Mood migration plus both focused regressions are present. Any later byte drift invalidates the hashes.

The previous certified Production version 75 and bundle remain before-state evidence only. A new Production bundle/version cannot be certified before deployment; that release identity and byte-for-byte source comparison remain mandatory canary evidence.

## Regression contract

- alias/free query → canonical Mood;
- sufficiently evidenced profile → bounded positive component;
- low/no evidence → neutral zero;
- Product/Distribution eligibility precedes Mood read and fusion;
- Mood submission leaves Taste, N4, and Accepted/Gold facts unchanged;
- D2 adversarial hard gates and full Decision Lab remain required.

## Verdict boundary

Semantic change authorized and locally re-certifiable. Production release remains blocked on Security CTO acceptance, Production dry-run/canary, live identity verification, and physical Founder acceptance.
