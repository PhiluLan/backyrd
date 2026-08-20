# Production User Intelligence worker

The worker is a server-only orchestrator in
`@backyrd/user-intelligence-runtime`. It reads canonical sources through a
repository boundary, builds the production input, executes the frozen shared
runtime, validates its result, and calls exactly one `persistAtomically`
operation.

No N5 formula is present in the worker or SQL path. The existing SQL rebuild
function remains disabled and non-authoritative.

The repository implementation must provide a transaction that writes nodes,
snapshot identity, semantic ledger changes, and queue disposition together,
with a source watermark. It is intentionally not enabled until that adapter
and its staging E2E tests exist.
