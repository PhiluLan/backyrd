# Production User Intelligence persistence

The canonical production path is now:

`N2 Memory + canonical N4 + qualified review facts → production input adapter → shared frozen runtime → validated result → one atomic database commit`.

The server runner claims a user generation with a fixed ingestion watermark. A per-user lease coalesces all work through that watermark. Events arriving after the claim remain pending; an older computation cannot become latest after a newer watermark. Expired claims become retryable, and the response-loss reconciliation RPC recognizes a commit that succeeded before the runner lost its response.

The transaction writes or reuses the semantic snapshot, its nodes, semantic Change Ledger rows, latest pointer, committed watermark, and work disposition together. The card hash excludes timestamps, runner identity, attempts, and duration. An identical rebuild therefore reuses the same semantic hash and creates no fake ledger changes.

Consent and account existence are checked inside the final transaction. Withdrawal purges work, leases, snapshots, nodes, and ledger. Account deletion cascades the same state. A stale worker cannot resurrect either user. Source deletion uses an explicit service-only rebuild request; the shared runtime recalculates solely from remaining canonical sources.

The old SQL inference functions are guarded and non-authoritative. The background runner remains disabled by default and has no effect on Decision v13, N5 projection, ranking, copy, or UI.

Local/staging invocation:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/decision/run-user-intelligence-worker.mjs
```

The executable requires an explicit server environment and never contains a service credential.
