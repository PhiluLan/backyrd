# Common User Intelligence runtime

`@backyrd/user-intelligence-runtime` is the single server-side entry point
for frozen N5.7, N5.8, N5.8.2 and N5.8.4 semantics. It deliberately exports
the frozen Lab implementations directly: production must execute the same
algorithm, not a SQL approximation.

The production worker boundary remains responsible only for:

1. reading authorized N2 memory and canonical N4 input;
2. serializing it into the frozen canonical event input;
3. invoking the common runtime;
4. atomically persisting its card, ledger, and snapshot.

It must not compute affinity, confidence, eligibility, fusion, or negative
promotion itself. N4 remains read-only and unavailable N4 remains UNKNOWN.

The package is server-only. It has no mobile export, no N6 integration, and
does not enable the existing background runtime. A following worker-port
change must replace the remaining SQL approximation before Sprint 2 can be
closed.
