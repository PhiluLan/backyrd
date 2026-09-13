# Phase 3C Founder Decision Lab

## Purpose

The lab makes one realistic Decision flow reviewable without JSON or Production data: German task text → editable interpretation → World/User/Context assessment → four candidate tiers → evidence-based explanation → deterministic replay.

## Run locally

```bash
npm run decision-vnext:phase3c:lab:ui
```

Open the printed `127.0.0.1` URL. The server rejects non-loopback binding, foreign Host/Origin values and oversized payloads. It sends no-store and restrictive browser security headers. Closing the process removes all state.

Machine-readable evaluation:

```bash
npm run decision-vnext:phase3c:lab
```

Browser interaction test:

```bash
npx playwright install chromium
npm run decision-vnext:phase3c:ui:e2e
```

## Founder flow

1. Enter a German Decision task. The raw text is resolved only in memory.
2. Inspect and correct intent, occasion, moods, location, time, budget, duration, hard constraints and soft preferences.
3. Evaluate the bound cohort.
4. Compare confirmed candidates, unknown fallbacks, not-configured cases and hard failures.
5. Inspect plain-language reasons; technical codes and hashes are confined to the optional expert view.
6. Request an alternative or mark a spot as unsuitable for this Decision. Neither action writes to User Intelligence.
7. Replay the same input and confirm the byte-identical result identity.

## Semantics and boundaries

- A named target city wins over device location. With denied tracking, an explicit city remains usable; without either, location is not invented.
- Budget preserves amount, CHF and per-person meaning. The `LOW_CH_DINNER_EVALUATION_ONLY` interpretation never replaces the amount.
- Mood synonyms are local fixture interpretations. Unknown words remain visible.
- A combined request such as quiet food for a first date is evaluated as one context, not separate searches.
- Confirmed hard facts precede unknown fallbacks. Unknown is never rendered as false.
- The age fixture means: under 13 alone fails, under 13 with an adult passes, and 13 or older passes. No absent time/day/area/event rule is invented.
- Opening and kitchen hard constraints with no authorized World evidence follow the accepted per-rule fail-closed policy.
- Commercial state has no request, World, User, result or UI channel.

## World cohort

Preferred input is a valid local Founder cohort manifest plus the canonical reader. If either binding is absent or invalid, the pair is rejected. With no pair, the lab clearly reports `SYNTHETIC_FALLBACK`; it never combines Founder and synthetic spots.

## Oracles

The 28 Phase-3C oracles are evaluation-only and bind request, expected tiers, required reason codes, World evidence expectation, User projection state and degradation. The report is rebuilt on replay; a rehashed inner mutation is rejected. These oracles assert integration behavior, not Product recommendation quality.
