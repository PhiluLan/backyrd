# Decision vNext Week 3 — Internal Dark Shadow Operation

## Outcome

Week 3 proves that the canonical Decision path can run as a strictly internal, read-only, discarded evaluation behind two independent safeguards: an always-OFF public control and a local/CI-only process capability. It does not activate Product behavior or Production traffic.

## Request flow

```text
Untrusted FounderLabRequest
  → server-bound internal envelope
  → pinned allowlist + artifact trust
  → canonical World dark reader (read-only)
  → canonical minimized User projection port (read-only)
  → Phase-3C contextual evaluation
  → minimized technical parity report
  → complete result discarded
```

The same neutral candidate set and the Week-2 request path form the technical reference. Metrics describe structural parity only; they make no Product-quality, ranking, relevance, or calibration claim.

## Modes

| Mode | Entry | Reads | Evaluation | Output / persistence / mutation |
|---|---|---:|---:|---:|
| Default OFF | public runtime | 0 | 0 | 0 |
| TEST_ON | non-exported local/CI capability | exact bound cohort + one minimized User projection | 1 | 0 |
| EMERGENCY_OFF | local controller generation invalidation | in-flight read-only calls may complete | 0 after abort | 0 |

TEST_ON accepts only `LOCAL_SYNTHETIC` and `PROD_LIKE_TEST`. `PRODUCTION` is not a contract value. The World adapter itself must be enabled for the matching non-production environment.

## Bound identities

The envelope includes request, actor, purpose, environment, server time/location, World Reader/Registry/Source Policy/Cohort, User Projection Release, Phase-3C policy/release, candidates, reference report, source SHA, source tree, and artifact identity. The report binds the envelope, allowlist, reference, candidate set, evaluation, interpretation, summaries, metrics, and zero-side-effect boundaries.

## Failure policy

All authority, scope, environment, validity, source, World, User, Phase-3C, candidate, or request mismatches stop before evaluation. Client fields cannot select authority or policy. Replay rebuilds the complete report and rejects semantic manipulation even when reachable hashes are recomputed.

Alternative requests and situational rejects retain Phase-3C semantics: neither creates a negative World claim nor writes User Intelligence. Spot names, commercial state, owner/payment/subscription state, and array position are not decision channels.

## Running locally

```bash
npm run decision-vnext:internal-dark-shadow:week3
node scripts/ci/run-decision-ci.mjs --group internal-dark-shadow-week3
```

The command uses only deterministic local artifacts. It requires no credentials and performs no external network access.

## Post-deploy record

Because deployment is not authorized, the evidence status is always `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`. A source-aware Production plan may be generated for review, but `executionAuthorized:false` remains mandatory and no plan step is executed.
