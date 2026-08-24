# Production User Learning Validation

## Automated validation

- 60 canonical-semantics, User Intelligence, Decision Input, orchestrator, queue, retry, and parity tests passed.
- The new transactional SQL regression passed: visible-impression identity, duplicate feedback, correction supersession, standard Review Experience, `SELF_DECLARED`, cross-user denial, and service-only health.
- Controlled fresh-user execution passed: Open/Save honesty, canonical Review/Mood learning, missing-N4 honesty, deterministic rebuild, response-loss recovery, exclusive claims, watermark isolation, restart recovery, N4 retry, transactional retry, consent/account races, cross-user isolation, and a 100-event burst.
- 100-event burst: 427 ms. Full deterministic rebuild: 54 ms. Progressive, rebuild, and read-only parity hashes were identical.
- Local schema lint reported only pre-existing PostGIS/legacy function findings; no new learning-loop function finding.
- Two older SQL harnesses can crash the bundled local PostgreSQL process while catching an expected permission error. The equivalent authorization paths pass in the new SQL regression and the full client/service security suite; no Production error was observed.

## Production proof

Before deployment, Philipp had 124 canonical N2 events, 57 committed work items, 67 failed items (`unknown_spot_evidence_concept`), and a snapshot watermark from 21 August.

After worker v36 and migration `20260824170000`:

- N2 events: 124 (`14 decision_request`, `110 candidate_exposed`)
- Work: `124 COMMITTED`, `0 FAILED`, `0 PENDING`
- Snapshot watermark: `2026-08-24T12:07:01.084967+00:00`
- Maturity: `COLD`
- Active nodes: `0`
- Persisted hash: `8c0b74038bb7685443c606d28daa52f525f854c1be7c334f3603cf20b0044ec2`
- Exact read-only frozen-runtime hash: identical

Zero nodes remains the honest result: Philipp's 124 canonical events are requests/exposures only. No Legacy Review was reinterpreted and no synthetic preference was created.

Fresh-user readiness is validated for consented onboarding, `SELF_DECLARED`, Decision feedback, Open/Save/Route, canonical Reviews/Moods, worker processing, snapshot persistence, and later N5 consumption. The real `backyrdBuddy` account was not created.
