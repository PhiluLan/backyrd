# ADR-004: Server-authorized append-only World writes and shadow resolution

Status: accepted for Slice 3B repository implementation; not Production activated.

## Decision

Use a private append-only ledger, server-derived Owner/Admin authority, versioned Source/Entitlement policies, separately bound verification records, and immutable resolution manifests. Bind verification and confirmation to the exact current actor/Spot relationship. Separate input, resolution-output and manifest identities. Keep public World and Decision candidate projections separate. Restrict resolution to synthetic/allowlisted shadow subjects.

## Why

Direct client trust fields make self-verification possible. Mutable facts erase provenance. A shared projection leaks contacts and explanation-only content into Decision logic. Commercial tier in the knowledge contract creates an unacceptable ranking channel. The chosen boundary makes all four failures structurally testable.

## Consequences

Writes require server scope checks and append multiple records atomically. Current projections are rebuildable and historical claims remain stable. Owners/Admins can author the accepted objective scope, but reports/imports/AI cannot self-verify. Subscription can unlock an input surface without changing the meaning or weight of any fact.

Shadow resolution uses three explicit identities: a full input hash over ledger and policy dependencies, a resolution hash over both World snapshot and Decision-safe projection, and a manifest hash over subject, versions, time, input and output. Rebuild requests are persisted and serialized by idempotency identity. Reuse validates and returns stored artifacts. Current pointers advance monotonically by semantic time and ledger cutoff, never merely by completion order.

Actor deletion detaches the Auth identity and rotates an opaque pseudonym while preserving historical ledger references; this is pseudonymization, not an assertion of anonymization. Identity-changing merge/split/reversal operations remain disabled until a concrete event-scoped authority contract is approved.

Production activation needs a separate migration/release plan, retention approval, operational moderation, real identity/duplicate authority, monitoring, rollback rehearsal and consumer compatibility review.
