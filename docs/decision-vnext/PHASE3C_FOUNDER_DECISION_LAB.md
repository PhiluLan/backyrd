# Phase 3C Founder Decision Lab

## Purpose

The lab makes one realistic Decision flow reviewable without JSON or Production data: German task text → editable interpretation → World/User/Context assessment → four candidate tiers → evidence-based explanation → deterministic replay.

## Run locally

```bash
npm run decision-vnext:phase3c:lab:ui
```

Open the printed `127.0.0.1` URL. The server rejects non-loopback binding, foreign Host/Origin values and oversized payloads. It sends no-store and restrictive browser security headers. Decision requests stay in memory; only an explicitly confirmed cohort import survives a restart.

The fixed URL is `http://127.0.0.1:3223`. The same command restarts the lab after it has been stopped. If the port is occupied, preflight stops with a clear error instead of selecting a different port.

Reset only the locally imported Decision-Lab cohort with:

```bash
npm run decision-vnext:phase3c:lab:reset
```

After the server starts, the complete workflow is available in the browser; no further terminal command is needed.

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

1. Review the desired spots in World Knowledge and add them to the Founder Cohort.
2. Choose “Founder World Cohort exportieren”.
3. Select that JSON file in the Decision Lab, inspect its preview and confirm the import.
4. Enter or choose a prepared German Decision task. The raw text is resolved only in memory.
5. Inspect and correct intent, occasion, moods, location, time, budget, duration, hard constraints and soft preferences.
6. Evaluate the bound cohort and compare confirmed candidates, unknown fallbacks, not-configured cases and hard failures.
7. Request an alternative, reject a candidate for this Decision, compare two requests or run the prepared Context Flip.
8. Replay the same input and confirm the byte-identical result identity.

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

Preferred input is the single, versioned handoff file produced by “Founder World Cohort exportieren”. The local Admin export binds the server-produced manifest to the unchanged World snapshots already visible to the authenticated Founder workflow. Decision validates scope, Registry and policy versions, manifest/spot identities, content hashes and the existing 1.1→2.0 compatibility boundary before activating it. It never connects to Supabase or reads tables.

The active handoff is written atomically outside Git with directory mode `0700` and file mode `0600`. It contains no raw Decision text or user data. Reimporting the identical file is idempotent. Importing another valid file requires an explicit preview and confirmation; resetting removes only this local Decision-Lab copy. Founder and synthetic spots are never mixed.

If a cohort contains one spot, the spot remains technically evaluable, but the UI explicitly says that this is not a meaningful ranking or candidate-comparison test. No synthetic candidates are added.

## Oracles

The 28 Phase-3C oracles are evaluation-only and bind request, expected tiers, required reason codes, World evidence expectation, User projection state and degradation. The report is rebuilt on replay; a rehashed inner mutation is rejected. These oracles assert integration behavior, not Product recommendation quality.
