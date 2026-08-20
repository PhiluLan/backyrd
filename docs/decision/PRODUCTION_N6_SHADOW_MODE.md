# Production N6 Shadow Mode

## Isolation

The deterministic result is secured first. Shadow work runs only through a background scheduler and can neither replace the visible order/copy nor mutate the original Decision trace. Only the real visible Product result can create exposures and later learning evidence.

## Controls

The service-only singleton settings support:

- instant kill switch (`enabled`, default `false`);
- internal-only mode and UUID allowlist;
- deterministic percentage sampling;
- per-user and global daily provider-attempt caps;
- conservative global daily cost reservation;
- global provider concurrency;
- bounded attempts and lease-based claims.

Each provider attempt is a queue generation. A technical retry is therefore visible to rate/cost accounting. The database rechecks the kill switch and personalization consent before finalization. Consent withdrawal and account deletion remove pending work/traces, so stale workers cannot resurrect derived data.

Canonical Product profile erasure is wired directly to the same purge. A stale in-memory worker then fails its lifecycle recheck before provider access or commit.

## Trace and metrics

The append-only trace stores hashes for the package/candidates/N3/N5/N4, frozen contracts/model, timings, usage, conservative internal cost, retry count, validator result, N6 order, selected authorized reasons, confidence/uncertainty, output hash, and deterministic comparison. It excludes raw long-term history and generic logs exclude review text.

Operational aggregates are derivable for attempted/skipped/validated/rejected/provider failure/timeout, latency, token/cost, Top-1 agreement, order change, and WHY_FOR_YOU usage by knowledge mode.

## Rollout state

Production flag: OFF. Visible N6 output: prohibited. No Mobile release or migration rollback is needed to disable N6. Sprint 4 remains the immediate fallback.
