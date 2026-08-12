# D3 Constitution Issue

## D3-CONSTITUTION-ISSUE-001 — Declared hard gates are not enforced by the frozen evaluator

| Field | Value |
|---|---|
| Area | D2 Constitution / Evaluation Framework |
| Severity | P1 — Framework integrity |
| Status | RESOLVED IN D2.1 — merged in PR #27 |
| Detected | 2026-08-12, mandatory D3 preflight |
| Production impact | None established by this finding; no Production access or mutation occurred |
| Required next phase | Versioned D2.x framework correction and complete acceptance rerun |

## Freeze verification

The identities named by the D3 specification match the merged D2 artifacts:

- Constitution content hash: `3ff5a5cc54014abdbd51a5a65a4d8110c10b215fbd27828625457f2269f57bbd`
- Scenario Registry hash: `2e3c9151021d647cb5a58b913970e62bc26580746f88ac63bf47b9c56f75b22c`
- V13 engine source SHA-256: `a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba`

The problem is therefore not identity drift. It is a behavioral defect in the frozen evaluation contract.

## Expected behavior

`decision-quality-v1` declares the following non-compensable hard gates:

- approved Product status = 100%
- Distribution eligibility = 100%
- entity integrity = 100%
- latent-leakage freedom = 100%
- declared must-pass constraints = 100%
- duplicate rate = 0

Golden scenarios declare city, category, open-now and exclusion constraints. Negation and open-now scenarios are explicitly marked `mustPass: true` and carry the invariant `hard-constraints-100-percent`.

An evaluation containing a candidate that violates one of these declared hard constraints must fail the corresponding hard gate. It must not be certifiable as `engineQuality: PASS`.

## Actual behavior

`evaluateTrace()` derives its hard verdict exclusively from P0/P1 records returned by `attributeFailure()`.
`attributeFailure()` currently creates hard failures only for:

- `item.status !== "approved"`
- `item.distribution` equal to `quarantined` or `excluded`

It does not validate result candidates against the scenario's:

- `city`
- required `category`
- `exclusions`
- `openNow`
- `mustPass`

It also does not turn the Constitution's duplicate-rate limit into a hard failure. `assertTrace()` validates only the presence and array shape of stages/results; it does not establish candidate entity integrity. `evaluateTrace()` does not call `assertIdentity()` and does not prove latent-leakage freedom.

`groundTruth()` applies approved/Distribution eligibility, category and category exclusions to the comparison universe, but this only changes soft retrieval/ranking metrics. A violating result is still classified at most as a P2 retrieval/ranking failure and therefore cannot fail the hard gate. City and open-now are not used to construct the eligible universe.

## Deterministic counterevidence

The preflight evaluated four deliberately invalid traces against the frozen smoke world and Constitution. Every candidate used `status: approved` and `distribution: normal`, isolating the missing gates.

| Counterexample | Declared invariant violated | Evaluator verdict | Hard-gate failures |
|---|---|---|---|
| A `bar` returned for a `negation` scenario with `exclusions: ["bar"]` and `mustPass: true` | exclusion / must-pass | `engineQuality: PASS` | none |
| A candidate from the wrong category returned for `category_intent` | category | `engineQuality: PASS` | none |
| A candidate whose latent `openByContext` is false returned for an `open_now` scenario with `mustPass: true` | open-now / must-pass | `engineQuality: PASS` | none |
| The same valid candidate returned twice while `duplicateRateMax` is `0` | duplicate hard gate | `engineQuality: PASS` | none |

The invalid cases may receive a P2 `RETRIEVAL_FAILURE`, but `hardGates.pass` remains `true`. This proves that the current evaluator can certify a run that violates the frozen Constitution.

These are evaluator counterfixtures, not observations of V13 runtime behavior. They establish a measurement-framework defect; they do not by themselves establish a new Production Decision defect.

## Root cause

The Constitution, scenario registry and metric helpers were implemented as separate contracts, but the evaluator's hard-gate decision was wired only to Product and Distribution failure records. The acceptance suite proves that the duplicate metric reacts numerically and that Product eligibility is non-compensable, but it does not adversarially pass each declared hard-gate violation through `evaluateTrace()` and assert `engineQuality: FAIL`.

Consequently, the prose and JSON Constitution promise more hard correctness coverage than the executable gate provides.

## D3 impact

An official D3 run on this framework could undercount hard failures and produce false-positive quality, Closed-Beta and D4-readiness verdicts. In particular, the required negation, opening-hours, category, entity-integrity and duplicate analyses could not be certified against the frozen rules.

Per D3 section 99, this is a Constitution defect and requires an immediate certification stop. No D3 run plan was frozen, no official baseline was executed, no V13 quality result was generated, and no engine or Lab behavior was changed.

## Required next action

Return deliberately to a versioned D2.x change. That change should, without changing V13:

1. define executable evidence for every declared hard gate, including how observed versus latent opening-hours truth is represented;
2. validate result entity membership and immutable candidate attributes from the world rather than trusting trace-supplied status/Distribution values;
3. enforce city, category, exclusions, open-now, `mustPass`, duplicate, entity-integrity and latent-leakage contracts;
4. call and test the identity contract at the evaluation boundary;
5. add one adversarial evaluator acceptance test per hard gate, plus multi-violation precedence tests;
6. version the Constitution/evaluator/gate identities, regenerate the freeze and rerun the complete D2 acceptance suite;
7. restart D3 from preflight against the newly approved D2.x snapshot.

The D2.x correction must not be made silently on the D3 branch because doing so would mutate the frozen measurement rules after D3 began.

## Stop verdict

**D3 V13 BASELINE MEASUREMENT — FAIL (NOT EXECUTED; INVALID MEASUREMENT FOUNDATION)**

No V13 quality or Basel Closed-Beta judgment is supportable from this aborted D3 attempt.

## D2.1 resolution

Root cause was the missing executable connection between declared Constitution gates, evaluator failure records, hard aggregation, adversarial acceptance and D3 readiness. D2.1 introduces nine deterministic gate evaluators, explicit applicability and `NOT_EVALUATED`, canonical synthetic-World evidence lookup, non-compensable aggregation, result invariants and coverage/readiness meta-guards.

The original four false-PASS traces are permanent regressions and now fail. Their valid equivalents pass. The adversarial matrix has 45 cases with 0 false passes, 0 false fails and 0 `NOT_EVALUATED` leaks. D2.A–D2.D, Scientific Validity, three-seed Regression and Locked Holdout re-certification pass.

New versions and freeze:

- Constitution: `decision-quality-v1.1` / `cf0df61e94db56a480a1334b701fe1725d563c989225bdfd5158ba16e0a5fca1`
- Scenario Registry: `golden-scenarios-v1.1` / `4f3e4294c385e29c35ea7911557bfc5bc014115b28cb6f58a1a856706c971bef`
- Evaluator: `decision-evaluator-v1.1` / `c60fdb75dc6e7550bc106dfbc1fd648e4f39227eb6901ebc2775ef62a9feae76`
- Freeze Manifest: `6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf`
- V13 Engine Source remains `a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba`

Final status is **RESOLVED IN D2.1**. PR #27 was merged, and the restarted D3 preflight validated the new freeze before measurement. The re-certified evaluator then correctly detected the separate engine-integrity finding `D3-F-001`; see `D3_P0_HARD_CONSTRAINT_INTEGRITY_STOP.md`.
