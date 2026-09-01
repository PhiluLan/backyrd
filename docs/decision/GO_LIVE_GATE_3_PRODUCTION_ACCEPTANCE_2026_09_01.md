# Go-Live Gate 3 Production Acceptance — 2026-09-01

## Scope and authorization

This is the complete semantic re-certification evidence for the Founder/CTO-authorized Gate-3 change class. It covers explicit German negation, bounded Basel location, evidence-backed price intent, verified exact-match cardinality, reason honesty, canonical `spot_hours` eligibility, visible-impression continuation learning, explicit social-context eligibility, and the German `frühstücken` inflection. It does not authorize a Mood, Taste, Trust, N4, or general ranking-architecture redesign.

Canonical base: `458107a89a85dba535f362e2dc2a137d35505cbc`  
Authorized Product source commit: `a4ceb0043d3723dd318c8aa757a3a275dd7554fe`  
Engine source SHA-256: `c80c275b5f09adf0e3081dc10763a06846f81333097fd2a9ead6e8dfb8d7987a`

## Production identity

Production project `hjgcrrzfjchzqoegcywn` runs `decision-v13` version `116` with JWT verification enabled.

- Production EZBR bundle SHA-256: `88b4f26919f1e1e98b403b9226e4dbe8562ff7593885e3e5915ccc94944b718e`
- Deployment entrypoint: exactly `import "./live-index.ts";` followed by one newline
- Entrypoint SHA-256: `4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299`
- Downloaded deployed sources: 39
- Repository byte matches: 39/39
- Production migration ledger tip added by Gate 3: `20260901141014_gate3_decision_production_acceptance_v1.sql`

The v8 D2 contract pinned function version 110 and bundle `5bf3dc86c778a4c6d10de5c21165505e2d5d8b4d41dcb0adb5d8829ff0902c7c`. That identity is stale for the Gate-3 Production runtime and is deliberately preserved in v8 as forensic history. It must not be copied forward as current Production truth. Version 116 was downloaded from Production after deployment and compared byte-for-byte; no repository approximation or locally reconstructed bundle was accepted.

## Semantic re-certification

The protected semantic source set binds all 39 deployed source files and the canonical Gate-3 migration. The evidence set binds the D2 validator, adversarial tests, scope guard and its mutation regressions, database validation, Product acceptance harness, continuation validator, and focused semantic regressions.

Verified properties:

- Unambiguous negation excludes; ambiguous language does not speculate.
- Explicit quarter, landmark, and bounded-distance requests use the small canonical Basel registry and stored coordinates only.
- Ordinal price intent is matched only against confirmed `price.level`; a CHF budget cannot borrow ordinal evidence.
- Every explicit factual requirement must have a candidate-specific `MATCH`; `UNKNOWN`, `PARTIAL`, and `MISMATCH` do not qualify.
- Two, one, or zero verified matches are returned without generic fill.
- Reasons are selected only from candidate-specific confirmed facts; unknown evidence cannot produce match copy.
- Explicit open-now and weekday/time windows are evaluated against canonical `spot_hours`; missing hours remain `UNKNOWN` and are excluded from explicit-time matches.
- Visible impressions are persisted through the canonical RPC before continuation; the observed 3/3/1 pages returned seven distinct spots, seven visible impressions, zero duplicates, and an exhausted terminal page.
- Explicit Date context is a verified exact requirement. The pre-fix “Budget-Date” false positive is now an honest empty result because no candidate has both confirmed low-price and Date suitability evidence.
- `Sonntagmorgen frühstücken` binds both the Sunday-morning hours window and confirmed `BREAKFAST`. The pre-fix Basler Münster false positive is removed.
- Mood, Taste, Trust, N4, and the general deterministic ranking architecture are unchanged.

## Product acceptance

The same strict 67-scenario Basel acceptance corpus was executed against Production v116: 61 cold-start scenarios plus six scenarios with sufficient controlled User Card evidence. The machine collector was used only for safety diagnostics; each result and reason received manual Product review.

| Area | Scenario IDs | Manual verdict |
| --- | --- | --- |
| Simple | S01–S08 | 8/8 PASS |
| Combined | C01–C10 | 10/10 PASS |
| Mood | M01–M08 | 8/8 PASS |
| Offering/Purpose | O01–O10 | 10/10 PASS |
| Time | T01–T06 | 6/6 PASS |
| Location | L01–L04 | 4/4 PASS |
| Price | P01–P04 | 4/4 PASS |
| Adversarial | A01–A05 | 5/5 PASS |
| Fallback | F01–F03 | 3/3 PASS |
| Diversity | D01–D03 | 3/3 PASS |
| Sufficient User Evidence | C02, C03, M01, M02, O04, F01 | 6/6 PASS |

`S06` is a manual PASS despite the diagnostic expecting only Product type `outing`: Botanischer Garten and Zoo Basel both carry confirmed `WALK` activity evidence, and their reasons claim only that verified activity. This is a coarse category expectation mismatch, not an incorrect Decision.

Product quality before remediation: 39/67 (58.2%).  
Product quality after remediation: 67/67 (100.0%).  
Obviously wrong recommendations before: 19.  
Obviously wrong recommendations after: 0.

## Decision failures versus insufficient Spot evidence

No systemic Decision failure class remains in the 67-scenario acceptance corpus.

Six scenarios are correctly limited by insufficient Spot evidence and therefore return no fabricated match:

- C08 — no candidate proves both low price and lunch.
- C10 — no cultural candidate proves the requested maximum duration.
- O02 — no candidate proves `OWN_BREWED_BEER`.
- T06 — no candidate proves a maximum 30-minute duration.
- P02 — no candidate proves both low price and Date suitability.
- A04 — no open Bar candidate proves the supported exact subset of the very specific low-price/quiet request; vegan rooftop and live-jazz facts are not fabricated.

A01 and A05 are not evidence failures. Their requests are logically contradictory after explicit negation parsing, so an honest empty response is the correct deterministic outcome.

## Acceptance conclusion

The Product behavior is relevant, explainable, deterministic, and honest under missing evidence. The remaining empty results are bounded evidence limitations rather than Decision defects. The semantic change is Founder/CTO-authorized and must remain blocked by D2 until this v9 contract, its source set, evidence set, freezes, and Production identity all validate together.
