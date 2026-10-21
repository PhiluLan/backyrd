# Booking arrival limits — central restaurant pacing candidate

Restaurant staff need to limit how many guests are scheduled to start together,
even when several tables are free. This dependent migration-215 foundation adds
an optional restaurant-wide maximum party total in fixed 15-, 30- or 60-minute
windows. It applies across every service, room, source and physical table.
It does not replace table overlap, seating, closures, service hours, public
notice/horizon, role or Safety checks.

## Exact meaning

Each parent reservation contributes its saved party size once when its saved
start falls in `[window_start, window_end)`. Pending, confirmed, arrived, seated
and completed reservations contribute. Cancelled, declined and no-show do not.
Completing a visit does not make its recent intake load disappear. These are
saved planning facts, not unique people or observed arrival/presence.

Windows use PostgreSQL `date_bin` anchored at a UTC hour and elapsed minutes.
In Europe/Zurich these align to the selected quarter, half or full hour. Repeated
autumn hours remain distinct instants; the spring gap creates no phantom slots.
A boundary belongs to the next window, including midnight. **This is fixed-bin
pacing, not a rolling-window or kitchen-workload guarantee**: starts immediately
on either side of a boundary can still cluster.

No policy row means unlimited intake. A `null` maximum explicitly disables the
limit; zero is invalid. Accepted maxima are 1–1000 guests; existing booking party,
table and max-party restrictions continue to apply. The policy belongs to the
restaurant configuration and remains on Owner transfer. Actor-bound operation
receipts remain bound to their original Owner and verified current operator.

Lowering a limit never cancels, deletes or rewrites existing reservations. An
unchanged or smaller contribution in the same actual time window remains
editable even when that window is now above its configured limit. An increased
party or move into another window must pass the current cap. Changing service,
room, table or duration alone cannot add a second parent contribution or bypass
the global rule. Managers can disable/change the cap explicitly and with audit;
there is no silent per-booking bypass.

## Canonical paths and permissions

`booking_private.arrival_limits_v1` holds the current policy/revision;
`arrival_limit_requests_v1` holds original intent fingerprints and outcomes.
Both have RLS and no raw grants to anonymous, authenticated or service-role
clients. The parent-reservation trigger checks every counted insert/update,
including privileged parent writes and atomic multi-row statements. Existing
Booking RPCs acquire the restaurant root before reservation/resource rows; the
trigger shares that root serialization and advances its MVCC version without changing business fields. Real policy changes do the same, so Repeatable Read cannot commit from an older allocation/policy snapshot; PostgreSQL aborts the stale transaction with 40001. A missing/disabled policy is never
used as a replacement lock. Direct privileged multi-row updates must preserve
the same lock order or may be aborted by PostgreSQL deadlock detection.

Existing v1 single-table, v2 combination/amendment and immediate walk-in previews,
and public availability/creation, reuse the private predicate. Full windows are
removed before preview truncation. The trigger is the final transactional write
check, so stale previews or two different free tables cannot exceed the cap.
Canonical original booking retries return their original receipt before a fresh
capacity check and do not add another contribution. No mobile/shared/public
success payload is changed. Mobile currently consumes the same guest gateway;
Admin has no separate Booking allocator.

- `booking_console_arrival_limit_v1(spot)` reads the current policy for authorized
  Viewer/Host/Manager/Owner, subject to current role, ownership and Safety.
- `booking_console_save_arrival_limit_v1(spot, request, revision, window_minutes,
  max_guests, actor, recover=false)` is Manager/Owner only. It validates the actual
  JWT actor, CAS revision, range, current Owner and Safety before exact recovery.
  Recovery of an unused nonce returns null without writing. Identical replay
  returns the original outcome; changed intent/actor/Owner is rejected. A no-op
  may record its original receipt but does not bump policy revision or add a
  duplicate configuration audit. Real changes create an `arrival_limit_saved`
  event containing configuration facts, not guest text.

Outcomes contain only `spot_id`, policy `revision`, `window_minutes` and
`max_guests`. `booking_arrival_limit_changed` is a revision conflict;
`invalid_booking_arrival_limit` rejects invalid configuration;
`booking_arrival_limit_exceeded` is a definite failed write. Legacy/public
paths can reject earlier with the existing `booking_slot_unavailable` code.

## Acceptance and release boundary

The actual rolled-back SQL corpus exercises all canonical booking versions,
public preview/create, amendment self-exclusion, preserved/shrunk contributions
after lowering the cap, combined parents, completed and excluded statuses,
reactivation, atomic multi-row rollback, DST/half-open bounds, frozen private
server-clock walk-ins, actual role/raw-table denials, stale revisions, no-op and
original recovery, changed intent/actor, Safety, revocation and Owner transfer.
Nine additional actual two-connection cases cover competing free tables,
policy-before-create, create-before-lowering, concurrent identical policy retry,
policy CAS, public/operator allocation in both orders and Repeatable Read across distinct tables/policy changes. Synthetic guest-key
hashes are namespaced so unrelated reissue fixtures remain intact.

The existing `(spot_id, starts_at)` index supports the bounded window predicate;
no speculative index, backfill or existing-booking rewrite is introduced. The
private semantic fingerprint now covers 1124 facts,
`937a04845c02226bc7367a89cab7923813ff5d9cb54ebab7b3f757d5273fbd62`.

This foundation deliberately advertises no new Console capability before its
editor/recovery UX is implemented and tested. The Manager editor, current-window
review, public-facing empty-state copy, physical-device/restaurant acceptance,
advanced per-service/room/online quotas, rolling pacing and real activation remain
open. The populated restore proof from migration 214 does not certify populated
arrival-policy/request-table restoration. Production remains unchanged and
public guest intake remains paused. No practical Aleno parity claim follows.

Before claiming restaurant usability, implement the Console editor and run two
actual operator sessions on supported phone/desktop devices: review the effective
limit, replace/delete numeric input, save/disable it, recover a lost save response,
observe a competing Manager change, fill a window across services and combined
tables, try an online request at that same instant, move a booking across a
boundary and lower the limit while preserving existing bookings. Inspect the
current policy after retry rather than treating an older original receipt as the
latest configuration. These manual/device/restaurant steps remain unperformed.

Final local canonical acceptance passed all **32 Booking SQL suites**, baseline
and concurrency checks including the **nine new pacing races**, **20 private-drift
mutations**, lineage, public/private schema/ACL and database lint. Receipt:
`57177a369a75ac86ba0ad376373ffbf84f192ba4061358d333a2477bdfdba6f4`.
All 72 selected classifier/delivery-workflow contract cases and both secret
boundary scans passed. No Web runtime or shared success contract changed, so
previous browser results are not represented as new pacing-UI verification.

An earlier local gate completed its database execution but rejected release
evidence while the new migration/evidence were still uncommitted. That was not
accepted as a green release gate. The Repeatable Read correction changed a
protected SQL input, so the final gate used a fresh independent clean boot with
committed evidence. A first race-fixture attempt also exposed a collision with an
existing synthetic guest-key hash; only the owned fixtures were cleaned, new keys
were namespaced and the actual race suite was then rerun successfully. No failed
attempt or evidence-only resume is represented as the final execution proof.
