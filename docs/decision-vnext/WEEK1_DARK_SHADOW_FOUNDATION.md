# Decision vNext Week 1 — Dark Shadow Foundation

## Purpose

This slice prepares a future read-only comparison path while remaining entirely local, synthetic and disabled. It cannot receive Production requests, persist reports, alter visible decisions, influence eligibility/ranking/confidence, or write World or User state.

## Contract flow

```text
accepted Phase-3C result
  + synthetic source/artifact authority
  + separately supplied fixture trust anchor
  + disabled control
  -> content-addressed shadow envelope
  -> mirror fixture evaluation
  -> structural metrics
  -> content-addressed report
  -> deterministic replay
```

The envelope binds the canonical World cohort/registry/handoff, minimized User projection, Context interpretation, ordered candidate set, Phase-3C policy and release. Domain values stay owned by their canonical packages.

## Control and failure behavior

`DarkShadowControl` accepts exactly one state: disabled, kill switch engaged, zero basis-point sampling, and every execution/data/persistence/Product/write/mutation authority set to `false`. Unknown versions, missing bindings, candidate substitution, a mismatched source authority, relabeling, inner-result mutation or rehashing fail closed.

No activation helper exists. A future active contract must use a new contract version and undergo separate Product, Privacy, Security, Operations and deployment approval.

## Closed Founder scenario matrix

| Scenario ID | Structural evidence only |
|---|---|
| `quiet-first-date` | explicit target-location exclusion |
| `family-age12-with-adult` | core-intent coverage gate |
| `wheelchair-confirmed-vs-unknown` | UNKNOWN hard-constraint fallback remains distinct |
| `target-zurich-device-basel` | explicit target city wins over device context |
| `founder-family-outing-afternoon` | core-intent coverage gate |
| `founder-bouldering-family` | core-intent coverage gate |
| `context-flip` | only authorized Context changes |
| `alternative-request` | alternative has no negative meaning |
| `spot-not-fit` | reject remains Spot × Decision × Context scoped |
| `full-replay` | unchanged semantic input replays byte-identically |

Every entry requires the same candidate set and unchanged visible Product result. Ranking and confidence expectations are `NOT_CONFIGURED`.

## Metrics and interpretation

The report can count interpretation changes, hard-constraint deviations, candidate-tier deviations, UNKNOWN/fallback prevalence, false confirmations, false exclusions and replay parity. These are technical integrity metrics. They do not assert relevance, success probability, explanation quality, calibration or rollout readiness. Runtime duration is diagnostic and excluded from the report hash.

## Local and CI execution

```bash
npm run decision-vnext:shadow:week1
npm run decision-ci:group -- --group dark-shadow-week1
```

Both commands use synthetic fixtures only. They require no Supabase credentials and perform no network or database operation.

## Privacy and observability inventory

Allowed in a future, separately authorized minimized report: pseudonymous execution identity, canonical contract/version/content hashes, candidate counts, bounded reason classes, limitation states, structural deviations and bounded timing. Prohibited: raw request/free text, precise location, raw User history/events/reviews/searches, full User projection, companion identities, private World sources, secrets, Owner/payment/subscription/advertising data.

Persistence and retention are `NOT_CONFIGURED`. This slice persists nothing.

## Missing dependencies before real shadow traffic

All of the following remain blocking integration inputs:

1. server-owned read-only request adapter and accepted Production artifact/source authority;
2. explicit Privacy purpose, minimization, retention, deletion/export and access policy;
3. pseudonymous attribution contract and proof that raw request/location/User data never enter reports;
4. Operations-owned sample policy, capacity/cost budget, kill switch, alert ownership and incident runbook;
5. bounded store with authorization/RLS and deletion behavior, if persistence is approved;
6. real World/User/Context adapter acceptance and degradation contracts without direct table/event access;
7. approved Product scenario oracles and target metrics;
8. separately approved ranking, exploration and confidence contracts (currently `NOT_CONFIGURED`);
9. source-aware deployment authorization and evidence that active Decision-v13 output remains untouched;
10. an explicit release decision for any version capable of observing Production data.

Until every relevant dependency is approved, the correct operational state is disabled.

