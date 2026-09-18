# Founder Live durable idempotency v1

Status: **SOURCE_ONLY / NO_PRODUCTION_APPLY**. This change defines and tests a database contract. It does not authorize applying the migration, configuring a secret, enabling Founder Live, deploying a function, querying Production, or producing Product output.

## Boundary and threat model

`founder_live_private.idempotency_records_v1` is a private operational store for the read-only Founder Live evaluation path. It is not a Decision history, analytics, learning, Product, external-provider, or writeback store. The private schema is not exposed and grants no direct table rights to `PUBLIC`, `anon`, `authenticated`, or `service_role`. The only application boundary is a public-schema RPC whose execution grant and explicit JWT-role check both require `service_role`; unknown or missing authority fails closed.

The store assumes the server adapter holds a private HMAC secret and the sealed release bindings. The adapter converts the already pseudonymous subject binding and the request idempotency key into purpose- and release-bound HMAC-SHA-256 digests. The database never receives email, raw Auth UUID, bearer token/JWT, request text, IP address, user agent, or reversible identity mapping. Response envelopes reject identity/credential/request-text key names and are limited to 64 KiB canonical JSON.

The replay identity binds scope, purpose, response contract, release, artifact, source set, subject digest, and key digest. The payload hash is compared after the unique identity is locked. A first request creates one immutable row; identical concurrent requests replay its exact stored bytes; a changed payload returns stable `CONFLICT` without overwrite. Expired records return `EXPIRED` and never replay. Caller-supplied timestamps do not exist: PostgreSQL owns `created_at`, derives `expires_at`, and caps TTL at 86,400 seconds.

## Immutability, cleanup, and recovery

No general update or delete RPC exists. A trigger rejects all updates and deletes. The bounded cleanup RPC temporarily opens only the trigger path needed to delete rows whose server timestamp is already expired. One materialized CTE selects and locks at most 1,000 exact composite primary keys with `FOR UPDATE SKIP LOCKED`; `DELETE` can join only those selected keys. The owning server operations team must schedule and monitor cleanup before any future Production authorization; this source-only candidate schedules nothing.

Rollback is forward-only. Before Production application, revert the source candidate. After any separately authorized application, do not edit or remove this migration: add a reviewed forward migration that first disables callers, preserves evidence required for incident response, revokes execute, and only then retires objects. Restore rehearsals must restore the private table and its unique constraint, immutable trigger, grants, function definitions, and expiry index together; partial restore is a NO-GO.

Emergency-OFF is outside this store and remains the first runtime gate. When engaged, the Decision path must stop before reads, projections, evaluation, idempotency commit, Product output, or network activity. This store provides no fallback and cannot enable runtime behavior.

## Verification

The SQL acceptance test proves schema/table/function ACLs, service-only authority, atomic create/replay/conflict behavior, exact response-byte replay, TTL ceiling and lower boundary, expired non-replay, bounded purge, PII-shaped response rejection, and immutability. The multi-connection race test proves one creator, deterministic replay, conflict isolation, and one durable row across independent PostgreSQL sessions. The TypeScript test proves purpose-bound HMAC pseudonyms, sealed release/artifact/source-set bindings, response-hash verification, and fail-closed handling of RPC/status/replay tampering. The destructive-operation classifier accepts only the canonical normalized definition and exact service-only ACL of this one versioned purge RPC; changes to function/table/schema, authority, grants, clock, expiry predicate, limit, locks, key join, SQL execution mode, or `search_path` restore the destructive block.

The canonical adapter contract is `backyrd.decision-vnext.founder-live-durable-idempotency-port@1.0`. Decision PR #309 must bind this exact port without a Map, process-local, or availability fallback. Gate-7 rate limiting remains a separate port and store.
