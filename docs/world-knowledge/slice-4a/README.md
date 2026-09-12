# World Knowledge Slice 4A

Slice 4A connects the canonical Slice 3B ledger to a guided Admin/Owner authoring experience for an isolated Founder cohort. It does not activate World Knowledge for production clients or Decision vNext.

## Boundary

- Every cohort member is marked `FOUNDER_EVALUATION_ONLY`, stored with `data_origin = TEST`, and its legacy `public.spots` row remains `archived`.
- The authoring entry points additionally require the database-local setting `app.world_knowledge_founder_authoring_enabled = on`. The local seed enables it; no migration enables it.
- Admin and exact current ownership are resolved server-side. `user_metadata`, subscription, payment, and caller-provided trust are ignored.
- Existing Slice 3B RPCs create append-only Claims and bound `ADMIN_CONFIRMED` or `OWNER_CONFIRMED` Verification Records.
- Applicability is separate authoring metadata. `NOT_APPLICABLE` does not create a false Claim.
- The Shadow Resolver stays service-role only and is reached through a server route after an authenticated scope check. There is no Decision runtime connection.

## Root cause / existing system audit

The repository already contained a mature legacy Admin editor, Owner editor, Gold authoring, research imports and the Slice 3B ledger. The safe ledger had no cohort membership, read model or non-technical UI. Reusing the legacy forms would have preserved subjective, numeric-confidence and overwrite-oriented concepts. Slice 4A therefore adapts authentication/ownership and extends the canonical ledger, while keeping every existing production path unchanged.

See [compatibility-matrix.md](./compatibility-matrix.md), [security.md](./security.md), and [local-runbook.md](./local-runbook.md).

## Authoring reliability closure

The Founder pass against Volta Bräu exposed drift between the original form serializer and Registry 1.1: abbreviated weekdays, `from`/`to` intervals and unregistered rule values reached an RPC whose canonical contract requires full weekday names, `start`/`end` intervals and the registered enums. The UI now validates every field through `parseAttributeValue` before a write, sends the canonical value, and the database validator enforces the same shapes. Existing Claims are not rewritten.

Browser RPCs refresh an expired local session once and replay the exact request. Server-only rebuild/export actions additionally require an explicit loopback endpoint binding. Expected validation, session and RPC failures stay inside the form with a German correction and preserve the entered value; technical details remain in the opt-in expert view.

Legacy review now uses German labels and structured displays. It compares the old value with the canonical candidate, prevents re-confirmation of already answered fields, and withholds imported values whose shape is not Registry-valid. The imported audit trail is preserved unchanged.

The product-readiness closure removes the redundant activity page, ships eight coherent sections, and governs the expanded objective taxonomy through Registry 2.0. Main category immediately filters place types; an older incompatible value stays visible as a blocking, correctable conflict. Venue, kitchen and exceptional kitchen hours remain distinct. The review page derives exact blocking issues and known gaps from the same runtime-valid values used at the RPC boundary, while a private append-only review ledger preserves section progress across sessions.

## Deferred

Secondary categories, the remaining draft taxonomy, Capability→Intent relations, ranking, production backfill, public projections, automatic duplicate merges, holiday calendars/notifications, final retention periods, and the final mobile Spot page remain outside Slice 4A.
