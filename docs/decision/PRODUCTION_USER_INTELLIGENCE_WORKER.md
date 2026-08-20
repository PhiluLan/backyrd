# Production User Intelligence worker

The worker is a server-only orchestrator in
`@backyrd/user-intelligence-runtime`. It reads canonical sources through a
repository boundary, builds the production input, executes the frozen shared
runtime, validates its result, and calls exactly one `persistAtomically`
operation.

No N5 formula is present in the worker or SQL path. The existing SQL rebuild
function remains disabled and non-authoritative.

The Supabase repository and executable queue runner now implement that
boundary. Claiming is concurrency-safe, uses a per-user lease and fixed
ingestion watermark, and coalesces all available work for that user. Technical
failures are bounded and retryable; invalid runtime/contract results are
terminal. A successful commit followed by response loss is reconciled from
the committed work rows instead of being persisted twice.

The runtime remains disabled by default. Local/staging execution is:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/decision/run-user-intelligence-worker.mjs
```

Operational logs contain only bounded execution metadata: run/work identity,
user identity, watermark, attempt, status, runtime version, snapshot hash,
semantic node-change count, duration, and failure code. Snapshots and ledgers
contain bounded provenance; generic runner logs contain no review text.
