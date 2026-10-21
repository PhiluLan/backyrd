# Reviewed messages for manual restaurant reservations

Dependent candidate 210 lets an authorized restaurant operator prepare an email
with the current facts of a future reservation entered by phone, email or staff.
The Console requires a separately reviewed recipient and booking summary before
preparation. Pending requests explicitly remain unconfirmed. Cancelled and
rejected requests use their actual status. The email refers changes and
cancellations to the restaurant.

This increment does not create a guest capability, invent previously agreed
restaurant conditions or introduce an online cancellation deadline. A future
initial manual guest-access flow needs an explicit agreement/handoff design.
Existing phone/contact and private notes remain unchanged. Internal notes,
physical table assignments and authorization credentials are absent from the
message. The email displays the Swiss UTC offset, including both autumn-fold
instants.

## Authorization and transaction

`POST /api/booking/mail/summary` accepts a bounded same-origin JSON request with
exactly an operation, spot, reservation, reviewed revision, request UUID and
single email. A fresh verified staff identity is resolved from the bearer;
client-supplied actor identity is not accepted. SQL checks current restaurant
write permission, verified staff/owner email, ownership and actor/owner Safety
before mutation or replay. New mutation/recovery/context RPCs are service-only.
Viewer remains read-only.

Recovery and commit share the existing restaurant root lock and complete request
registry. The fingerprint binds the actor, reservation, reviewed revision and
exact trimmed recipient. One successful request increments the reservation
revision, records a text-free attributed audit and adds one immutable private
outbox snapshot. There is no separate dispatch queue. Original successful replay
wins over later changes; nonce collisions and cross-actor reuse fail. Successful
preparation is limited to three per reservation in 24 hours and 500 per
actor/restaurant in 24 hours. Independent HTTP quotas are 30/minute and
1,000/day per actor, 240/minute and 20,000/day globally. These are launch bounds,
not throughput acceptance.

The existing worker rechecks canonical facts, revision, captured owner, original
staff authority/Safety and recipient suppression before claim/preparation/start.
Changes supersede older queued messages; unattempted messages stop and attempted
ones require review. Started email cannot be recalled. A bounce, complaint or
provider suppression for the same recipient blocks further messages; a reviewed
different corrected address can be used without overwriting the booking contact.
Prepared provider bytes, recipient binding and provider idempotency remain
immutable. Existing online messages keep their original snapshot and capability
semantics. See [worker](BOOKING_MAIL_WORKER.md) and
[dispatch](BOOKING_MAIL_DISPATCH.md).

## Console privacy and recovery

The Console uses `manual_guest_mail` to enable the action. Read-only
`booking_console_mail_v2` delegates the existing scoped/paginated authorization
and adds the reviewed address only for a manual message. Legacy v1 remains
recipient-free. Staff can distinguish an operator-requested message from an
online lifecycle message. A queue entry is not evidence of provider acceptance,
SMTP delivery, opening or guest acknowledgement.

Before submission the tab stores the reviewed intent under an actor/spot/
reservation-scoped session-storage key. This intentionally contains the selected
email and nonce/revision, but no bearer or guest key. The storage must be
available and readable. Corrupt storage blocks new preparation. An unknown
outcome survives reload and permits only read-only recovery or replay of the
same intent; other reservation edits remain withheld in that dialog. Null
recovery is not noncommit evidence. A root-locked strictly newer revision with
no registry entry is terminal negative evidence; the operator must review again.
A verified acknowledgement is cleared from storage before normal operation
resumes. Metadata reload failure does not turn it into an unknown write.

Sender readiness is required before a fresh mutation, but not to read an
existing result. Production sender/scheduler/webhook acceptance is still open.
No operator action promises actual delivery.

## Local verification and limits

- Full canonical 210-migration clean boot, 27 Booking SQL suites, baseline
  authorization tests and all actual independent-session races passed on pinned
  CLI 2.80.0 / PostgreSQL `17.6.1.095`. Receipt:
  `48a0b4f5a69d89ec8731bdf657e12c56fcde6a748f94c62e5bedbc13ef030568`.
  Generated evidence: `delivery/database-releases/booking-manual-confirmation-v1.json`.
- SQL covers revision-zero commit/replay/recovery, one outbox/no guest access,
  preserved phone/notes, immutable snapshots, private/client denial, scoped v2,
  same/corrected recipient, current roles, owner transfer and Safety. Actual
  competing transactions cover duplicate preparation, amendment/cancellation
  ordering and ownership change before replay.
- Real local Auth/HTTP/RPC integration passed with verified tokens, readiness
  refusal, lost-ACK recovery, authenticated v2 reads and forbidden direct RPC,
  actual worker payload preparation and signed delivery callback. Five provider
  requests are intercepted, including the manual message; none reach a provider.
- All 112 Web contracts passed. Production-build browser validation covers
  168 Console/guest/checkout cases: 167 passed in the full run; the remaining
  new reload-recovery test passed after removing its redundant click on an
  already reopened dialog. No runtime change was needed. Twelve new manual
  message cases include a 320-pixel screenshot and axe validation. Browser
  transport is synthetic and does not prove production or device operation.
- Web TypeScript, lint (13 existing warnings, no errors), production build,
  canonical SQL secret scan and committed client secret-boundary scan passed.
  The complete Mobile contract chain, including all 16 Booking tests, and Mobile
  TypeScript passed after the compatible shared guest-summary extraction. No
  native feature or bundle release is claimed by this increment.

The last verified production schema remains 191. No migration, sender activation,
real guest message, app release or Aleno write is authorized by this local
candidate. Separate predecessor integration gates, private Booking drift coverage,
full restore/reconciliation rehearsal, actual sender/widget acceptance and an
explicit restaurant/device pilot remain open. The Supabase changelog was reviewed;
this pinned local run is not evidence for a PostgreSQL 17.11 upgrade.
