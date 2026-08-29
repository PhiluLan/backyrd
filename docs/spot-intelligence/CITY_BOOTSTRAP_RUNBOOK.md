# City Bootstrap Runbook V1

## Preconditions

1. Work from an up-to-date `main` SHA through a reviewed PR.
2. Deploy the additive migration and verify its exact Production tip.
3. Supply dedicated server-side `GOOGLE_PLACES_API_KEY`, `CITY_BOOTSTRAP_SUPABASE_URL`, and `CITY_BOOTSTRAP_SUPABASE_SERVICE_KEY`. Never use browser/mobile credentials.
4. Confirm the existing Research Agent worker has its server-side model secret and official-domain research capability.
5. Record the Admin/Founder UUID authorizing non-shadow work.
6. Deploy `city-bootstrap-worker` with JWT verification. When the dedicated credentials exist only in the Production Edge secret boundary, use this worker rather than copying secrets into a shell.

## Safe sequence

```bash
npm run city-bootstrap -- basel config-validate
npm run city-bootstrap -- basel plan
npm run city-bootstrap -- basel dry-run --source both --existing-production --operational-output .city-bootstrap/BASEL_CANDIDATE_UNIVERSE_V1.json --output docs/spot-intelligence/manifests/BASEL_CANDIDATE_UNIVERSE_V1.json
npm run city-bootstrap -- basel pilot-manifest --input .city-bootstrap/BASEL_CANDIDATE_UNIVERSE_V1.json --operational-output .city-bootstrap/BASEL_PILOT_SELECTION_V1.json --output docs/spot-intelligence/manifests/BASEL_PILOT_SELECTION_V1.json
npm run city-bootstrap -- basel stage --mode PILOT --input .city-bootstrap/BASEL_PILOT_SELECTION_V1.json --commit <40-char-main-sha> --requested-by <admin-uuid>
npm run city-bootstrap -- basel status --run-id <run-uuid>
```

Run the existing Research Agent on the staged pilot. Resolve genuine ambiguity in Admin; do not bulk-accept proposals. Verify identity, relevance, category, provenance, unsupported inference rate, review burden, provider usage, retry behavior, and client smoke paths. Only a passing pilot permits `SCALE`.

Research v2.6 requires both official-host authority and concrete venue-instance scope. For a path/query-scoped branch URL, reject evidence or a website proposal that falls back to a generic brand homepage, loses the branch tokens, or points at a sibling location. Unknown, ambiguous, tenant, subvenue, event, program, temporary, service, offering, and person attribution remains evidence/review only. Model confidence cannot override this deterministic check.

The Production Edge path exposes only aggregate, secret-free actions: `HEALTH`, `STAGE_PILOT`, `STAGE_REFRESH`, `PUBLISH_PILOT`, `KICK_RESEARCH`, and `STATUS`. `HEALTH` checks contract presence and makes a one-result Google identifier probe without retaining provider content. `STAGE_PILOT` accepts 20–80 retainable OSM candidates, uses at most three concurrent Google identity lookups, retains only Place IDs, and pauses below 20 eligible candidates. `PUBLISH_PILOT` requires `PUBLISH:<run-id>` and enqueues the canonical Research Agent v2.1 A/B workflow with an independently versioned Research policy in the source-scope hash; it cannot accept facts or write N4. Pilot Research selection excludes every previously researched Spot and normalized official host, so a remediation pilot cannot silently replay the earlier ten URLs.

For an `INTELLIGENCE` Population run, every `KICK_RESEARCH` request carries that run's UUID through the City worker to the Research worker. The service-only claim contract first verifies a running `INTELLIGENCE` run and then leases and recovers jobs only from that exact run. Older canaries and paused/completed audit runs are never drained by a newer launch-curation batch. Bounded worker concurrency controls simultaneous work; it does not reduce the run's coverage target.

Publication is deliberately separate and requires an exact confirmation token:

```bash
npm run city-bootstrap -- basel publish-batch --run-id <run-uuid> --limit 20 --confirm PUBLISH:<run-uuid>
```

Use small batches. After each batch, run corpus validation and check duplicate groups, fixtures, coordinates, category references, new-Spot details, embeddings, queue health, and Product surfaces. Stop immediately on a circuit breaker or unexplained integrity change.

## Pause, resume, and retry

- A circuit-breaker job failure pauses its run and preserves checkpoints.
- Expired job leases can be reclaimed; successful jobs and candidate/source fingerprints are idempotent.
- Retry only `TRANSIENT` failures within the bounded attempt count.
- `PERMANENT`, `REVIEW_REQUIRED`, and `CIRCUIT_BREAKER` failures require diagnosis or review.
- Never repair by rewriting historical migrations or deleting job/evidence history.

Resume with the same `run_key`, pipeline version, source fingerprints, and canonical commit. Check `status` before workers resume. Re-running publication for an already published candidate is a no-op; a second candidate with the same Place ID resolves to the existing Spot.

## Incremental refresh

Create a `REFRESH` run against the same city configuration through the server-side `STAGE_REFRESH` action. Supply the source run, canonical `main` commit, Founder/Admin actor, and a bounded current OSM snapshot. The worker compares stable source identities and fingerprints before any provider or deep-Research work. Unchanged fingerprints are checkpointed as `UNCHANGED_SOURCE_SKIP` with zero provider calls. New identities route to `IDENTITY_AMBIGUOUS`; changed known identities route to `MOVE_OR_RENAME_AMBIGUOUS`. Neither path mutates Product truth. Replaying the same refresh run key returns the durable checkpoint without duplicate candidates, reviews, jobs, or canonical writes.

Reprocess only new candidates, changed sources, stale fact families, previous failures, explicit review requests, and materially affected stages after a pipeline-version change. Closure, conflict, rename, and move signals route to evidence/review; they do not silently mutate or archive Product truth.

Recommended operational starting point: weekly lightweight discovery and freshness-driven evidence refresh, with the cadence adjusted from observed venue churn and provider cost after the Basel pilot.

## Adding another city

Add and validate one city configuration containing canonical name, administrative geography, bounds/grid, supported source types, and target parameters. Run `config-validate` and `plan` first. Zürich already validates without discovery or writes. Do not copy Basel logic or hardcode Spot IDs.

## Rollback

Pause the run, stop workers, and stop publication. Operational candidate/job records are audit history and remain. Any wrongly created Spot requires an individually reviewed, reversible archive action through canonical Product controls; do not mass-delete or rewrite history. This implementation performed no destructive Production changes.
