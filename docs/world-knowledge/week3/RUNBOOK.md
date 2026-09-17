# Week 3 rehearsal runbook

## 1. Generate and compare the release evidence

Run `npm run world-knowledge:week3:plan` twice and compare the bytes. The report must bind canonical main/tree, the exact nine-migration bundle, reader/registry/source-policy/allowlist identities, an empty allowlist, and `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`.

## 2. Verify default OFF

Do not set the read toggle. A read must fail before the snapshot loader, with zero connection, query, and write effects.

## 3. Synthetic isolated TEST-ON

Create an in-memory release containing only synthetic pseudonymous subjects, an explicit expiry, one purpose, one test environment, a spot hash, and exact safe attribute keys. Enable the existing dark reader only in `LOCAL_TEST` or `PROD_LIKE_TEST`. Confirm one minimized projection and deterministic replay.

## 4. Emergency OFF

Engage the runtime emergency latch. Subsequent calls on that reader instance must return no projection and must not reach the loader. Re-enabling requires a new explicitly constructed test reader; the existing instance cannot be reopened.

## 5. Disposable PostgreSQL 17 rehearsal

Run `npm run world-knowledge:week3:rehearsal`. It uses the existing Week 2 disposable rehearsal: clean boot, the same nine forward migrations in order, migration replay no-op, concurrency cases, authorization/RLS negatives, and logical backup/restore. Never point the command at Production.

## 6. Deferred Production execution

There is no Production command. Production evidence remains `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY` until a separate, explicit authorization provides approved members, expiry, retention, release authority, credentials, and a deployment change window.
