# ADR-004: Server-authorized append-only World writes and shadow resolution

Status: accepted for Slice 3B repository implementation; not Production activated.

## Decision

Use a private append-only ledger, server-derived Owner/Admin authority, versioned Source/Entitlement policies, separately bound verification records, and immutable resolution manifests. Keep public World and Decision candidate projections separate. Restrict resolution to synthetic/allowlisted shadow subjects.

## Why

Direct client trust fields make self-verification possible. Mutable facts erase provenance. A shared projection leaks contacts and explanation-only content into Decision logic. Commercial tier in the knowledge contract creates an unacceptable ranking channel. The chosen boundary makes all four failures structurally testable.

## Consequences

Writes require server scope checks and append multiple records atomically. Current projections are rebuildable and historical claims remain stable. Owners/Admins can author the accepted objective scope, but reports/imports/AI cannot self-verify. Subscription can unlock an input surface without changing the meaning or weight of any fact.

Production activation needs a separate migration/release plan, retention approval, operational moderation, real identity/duplicate authority, monitoring, rollback rehearsal and consumer compatibility review.
