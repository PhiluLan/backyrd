# Booking Console: guest communication evidence

## Candidate and boundaries

Migration 207 (`20261021010759_booking_console_mail_overview_v1.sql`) and the dependent Web change add a read-only, on-demand message overview to each reservation. They depend on the guest intake, dispatch ledger and worker candidates through 206. The last verified production schema is 191; this work does not apply production migrations. This change does not activate public checkout, send email, configure a scheduler, rotate or reissue guest credentials, or add a resend operation.

The Console advertises `capabilities.guest_mail` only after the new database contract exists. Older deployments continue without this control. An operator opens **Gastnachrichten anzeigen** from the reservation, then can refresh current evidence or load older message intents. The original reservation source is preserved; a manual reservation without an outbox intent shows an honest empty result.

## Meaning of the states

- Pending with no first attempt means queued, not sent. A due date is the earliest possible attempt; a running worker and accepted provider configuration remain prerequisites.
- Leased means claimed for preparation, not accepted by the provider.
- Sending means a dispatch began and its result is not confirmed. The message may already be in transit.
- Accepted means the mail provider acknowledged the request. It does not establish delivery.
- Delayed is shown separately while the canonical state is accepted. An old delayed callback does not hide a later delivered state.
- Delivered means the receiving mail server accepted delivery. It establishes neither opening nor reading by the guest.
- Bounced, complained, failed, suppressed and review-required remain distinct. Suppression and review explicitly distinguish messages with and without an earlier dispatch attempt.
- Superseded is independent of the delivery state. A stale message already in transit cannot be recalled.
- Revoked/expired guest access and provider-triggered delivery blocks are displayed independently. A delivery block does not itself revoke guest self-service access.

There is deliberately no automatic or manual blind resend button. The dependent 208 candidate adds explicit existing-link renewal, recipient-bound suppression and an audited new intent. General delivery reconciliation and initial manual-booking credentials remain separate work. Internal notes and table changes produce no mail; after arrival, guest-name corrections also produce no message. Contact correction invalidates the prior link and stops further attempts, but cannot retract an in-flight email. The editor now explains those boundaries.

## Authorization and data boundary

`booking_console_mail_v1(spot_id, reservation_id, before_id)` is executable by authenticated clients only. It uses canonical `assert_console_access_v1(...,'read')` before looking up a reservation or cursor: current Owner/Manager/Host/Viewer membership, ownership-transfer fencing, revoked access and both actor/owner Safety measures apply under the restaurant lock.

The DTO contains the reservation identifier/revision, observation timestamp, guest-access status, delivery-block flag, and at most 50 intent summaries with a reservation-bound keyset cursor. Each summary contains its own identifier/revision, kind/state, creation/update timestamps, attempt count, prepared flag, first-attempt timestamp, pending next-attempt timestamp, superseded flag and delayed flag. It returns no guest contact/name/note, raw errors, provider payload/identifier, credential/hash, lease or encrypted body. Private tables and dispatch mutation functions retain their existing grants and RLS. Staff cannot manufacture delivery receipts through this read endpoint.

Opening the overview starts one abortable, bounded authenticated RPC. Closing, switching identity or losing access clears the private view through the existing Console boundary. Reads which fail or return malformed/cross-reservation data never become successful empty results. Failed refreshes explicitly mark retained evidence as possibly stale. Refresh replaces accumulated pages with the latest page; pagination keeps the observation time of the latest-page inspection and never claims a global live snapshot.

## Local verification

- Full canonical clean boot through 207, 24 Booking SQL suites, baseline authorization suites and independent-session allocation/contact/dispatch races passed on CLI 2.80.0 / PostgreSQL image `17.6.1.095`.
- Receipt: `285baea862940eda4c3c64a2d317d9cd2aaf65a03e0015d1448a95cafd670f0c`. Generated release evidence: `delivery/database-releases/booking-mail-overview-v1.json`, following `booking-mail-worker-v1`.
- The new SQL suite observes real dispatch acceptance, delay, delivery, out-of-order callbacks and bounce through the canonical mail RPCs. It verifies revision zero, private-field exclusion, current roles, outsider/anonymous denial, revoked membership, ownership transfer, actor/owner Safety, bounded tied-time pagination, invalid cursors, missing/cross-spot reservations, and revoked/expired capabilities.
- All 83 Web contract tests passed; the new suite validates revision zero, distinct states, inconsistent attempt/dispatch evidence, foreign reservations, pagination and credential stripping.
- All 126 browser journeys passed on the final production build (120 Console and six guest self-service). New cases cover acceptance/delay/delivery, unknown/suppressed/review evidence, Viewer access, tied-time paging, failed/malformed reads, role/Safety denial, reservation freshness, expired/revoked links, late replies after sign-out, and post-arrival editor honesty. A 320-pixel screenshot was inspected and the new region passed axe accessibility checks.
- Production build, TypeScript, lint (13 existing warnings; no errors), canonical SQL secret scan and client secret boundary checks passed. Local proof files are `/tmp/backyrd-mail-overview-{contracts,types,lint,build,browser,secret-scan,client-boundary}.log` and `.local/gate-receipts/booking-mail-overview-{receipt,snapshot}.json`.

No actual customer record, recipient or provider request is used. Local acceptance does not establish production readiness or Aleno parity. Production migration approvals, full restore/drift coverage, genuine sender/callback/scheduler acceptance and a real restaurant multi-device trial remain open.

## Existing-link renewal follow-up (208)

The dependent candidate adds explicit staff renewal for an existing unexpired future website booking, with recipient-bound delivery feedback and durable uncertain-write recovery. See [BOOKING_GUEST_LINK_REISSUE.md](BOOKING_GUEST_LINK_REISSUE.md). It provides no initial manual-booking credentials, blind resend or production activation.
