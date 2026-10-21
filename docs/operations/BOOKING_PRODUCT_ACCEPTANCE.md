# Backyrd Booking: restaurant operating acceptance

Product objective: a restaurant team should be able to run a service in Backyrd
Booking with little practical loss compared with its normal Aleno workflow.
This is an acceptance target, not a current parity claim. The founder requested
continued development on 2026-10-20. The signed-in reference review and its
limits are in [Console v1](BOOKING_CONSOLE_V1.md). Do not infer unobserved Aleno
behavior, payment reliability, capacity formulas or market-wide feature parity.

Backyrd Booking is a separate, spot-centered booking product using Backyrd
infrastructure. Discovery/Decision recommendations are not booking eligibility
or inventory. Restaurant-specific tables, services and attendance should remain
an adapter to resources, time windows and capacity; later museum, concert, club
and activity adapters need their own inventory and ticket semantics.

## Evidence levels

Track implementation, automated acceptance, production delivery and restaurant
validation separately. Mocked browser success is client evidence; actual SQL
tests establish transactional rules and authorization. A deployment is not a
restaurant trial. Never use a percentage or the completion of this checklist as
proof that every Aleno feature is replicated.

## Operating capabilities and acceptance

| Capability | Required acceptance | Current evidence / next increment |
| --- | --- | --- |
| Daily reservation book | Staff can locate, filter, create, inspect and cancel a reservation without losing date/service/room context; filtered-empty and failed reads are distinct. | Live first workspace. SQL v1 and synthetic browser acceptance. Restaurant service trial open. |
| Short contextual editor | Guest, party, date, time and table are quick to enter; guest input survives failures; uncertain retries cannot duplicate bookings. | Live. Numeric deletion, stale suggestions, conflicting create and uncertain response browser cases; SQL replay and overlap rules. The write-recovery candidate additionally freezes unknown create/amend payloads and reviews the requested date on exit. Physical iPhone input trial and recovery across browser restart remain open. |
| Attendance and departure | Confirmed → arrived → seated → completed records actual times; direct seating is supported; future-day attendance, stale writes and unauthorized updates fail. Occupying states retain capacity and departure releases it. | Merged forward migration and capability-gated Web controls; canonical SQL and browser checks passed. Production activation and restaurant validation remain open. |
| Walk-ins | Current-time allocation and immediate seating in one atomic operation; appropriate current capacity and end time; retries safe. | Current admission candidate implemented: private server clock, active-service/table checks, immediate seating, original-request replay after guest correction/departure, and an explicit uncertain-write flow. Canonical 194-migration clean boot, SQL and browser acceptance passed; production activation and restaurant trial remain. A source-only future reservation remains distinct. |
| Edit and reschedule | Correct name/contact/note, party, date/time, duration and table; preserve original booking on conflict; compare-and-set and audit; suggestions exclude only the edited booking. | Amendment increment merged in PR #549: atomic SQL and contextual editor, per-reservation revisions including status changes, same-request replay and original-create replay after amendment. Canonical clean boot and SQL/browser acceptance passed; production activation and restaurant trial remain. |
| Rooms and graphical table plan | Persisted positions/shapes/labels; clear live attendance and planned-time layers; accessible alternative to dragging; phone list; safe table moves. | Room-grouped overview live. Graphical plan merged in PR #554: persisted bounded geometry, rectangle/round shapes, native editor with drag/keyboard/numeric alternatives, room isolation, revision conflicts and frozen uncertain retries. Canonical 195-migration clean boot and 34 browser journeys passed. Production activation and a real-device trial remain open. The 202-migration candidate adds atomic seated-party moves with effective-range occupancy and retained history. |
| Table combinations and allocation | Combine compatible tables transactionally, no shared table overlap, room/service eligibility, retained history and concurrent assignment tests. | Configured two-to-four-table groups now have full create/amend/immediate-walk-in APIs and capability-gated Console controls. Every physical member blocks inventory and displays seating; parent guests count once. Definition archival preserves saved memberships. Canonical 201-migration validation, sixteen Booking SQL suites, actual role/Safety tests and competing public-write/retry races passed. Seated-party transfers are implemented in the 202-migration candidate, retaining original guest times while validating the remaining physical window. Eighteen Booking SQL suites and actual movement/replay/departure races passed. Production activation and restaurant validation remain open. |
| Planning and capacity | Weekly overview leads into service; date-specific closures/overrides, service room activation, quotas and durations; DST, midnight and capacity boundary acceptance. | Weekly same-day services live. Weekly scoped summary and dated full/partial service/room blocks implemented, with explicit preservation of existing reservations, DST-aware availability and real two-connection race acceptance. Canonical 196-migration candidate; production activation and restaurant trial remain. Exceptional openings, dated closed services and weekly/dated overnight services are implemented in the 199-migration candidate, sharing actual-day slots, amendments, admission and cross-midnight closure rules. Twelve Booking SQL suites and real planning/allocation and cross-restaurant-resource races passed. Production activation and restaurant acceptance remain open. Quotas and advanced capacity remain open. No inferred occupancy percentage. |
| Public reservation flow | Accessible mobile guest flow at /booking and spot embeds; actual availability, reviewed conditions, confirmation, safe request replay, abuse protection and private cancellation links. | Public introduction live. The dependent 203–209 candidates implement transactional server eligibility, authenticated publishing, public checkout, frozen terms, human-proof and guest read/cancellation with tab-scoped unknown-write recovery. The dedicated mobile Booking candidate imports personal links and manages existing receipts/cancellations. New intake remains hard closed. Production authorization, actual widget/sender acceptance, initial manual guest-access handoff, account/device association, retention and restaurant acceptance remain open. See `BOOKING_PUBLIC_CHECKOUT.md`, `BOOKING_GUEST_HTTP.md` and `BOOKING_MOBILE_WALLET.md`. |
| Guest communication | Confirmations, cancellations and reminders from a transactional outbox; verified sender; honest delivery/retry/bounce states; no duplicate sends; signed self-service links and consent where applicable. | Dependent 203–210 candidates implement immutable encrypted dispatch, bounded idempotent retries, signed recipient-bound callbacks, scoped staff delivery history, existing-link renewal and explicitly reviewed fact-only manual emails. Actual Auth/RPC/worker integration and competing transactions are locally verified with intercepted provider calls. Manual emails preserve phone/notes and add no guest access or retroactive terms. Initial manual guest-access agreement/handoff, reminders, general reconciliation actions and actual sender/callback/scheduler operation remain open. See `BOOKING_MAIL_WORKER.md`, `BOOKING_GUEST_LINK_REISSUE.md` and `BOOKING_MANUAL_CONFIRMATION.md`. No current production reservation action sends guest messages. |
| Guest records | Authorized reusable contact lookup, transparent history/preferences, safe merge, corrected identities, retention and access/deletion handling; no sensitive inference or AI export. | Reusable guest profiles remain open. The dependent reservation-search candidate adds authorized cross-day name/contact lookup, bounded keyset pages and fresh canonical-day opening; it does not infer a shared identity from matching contact data. Explicit profile linking/merging, preferences, corrected identities, retention and access/deletion handling remain open. See `BOOKING_RESERVATION_SEARCH.md`. Real Volta guest data must not become development fixtures. |
| Team operations | Restaurant-specific staff roles, invited access, least privilege, revoked access and two-device changes; owners cannot cross restaurant boundaries. | Canonical owner access live; team candidate adds verified-email invitations, Viewer/Host/Manager roles, owner-only team controls, per-member revisions and revocation/ownership fences under the restaurant lock. Canonical 197-migration execution and real two-connection revocation races passed. Client revalidation includes permission-only checks during open dialogs and role-specific controls; synthetic login, token handoff and two-console acceptance. Production activation, authenticated push and a real team multi-device trial remain open. |
| Daily control and insights | Unresolved requests, overdue seated visits, cancellations/no-shows, service totals with defined scope and useful change history. | Scoped live counts/filters. Amendment candidate adds a prior-day unclosed-visit queue and an independent saved seating layer; one seated party per table is enforced. Reservation history candidate adds scoped paginated audit reads, real before/after operating facts, actor references and guest-field change markers without copying guest text. Canonical 198-migration validation passed; detailed history is forward-only for upgraded RPCs. Production activation and restaurant acceptance remain open. The Web service-attention candidate adds a collapsed same-day review queue for saved seated visits beyond their effective planned end, independent of room/service/time filters. It uses the transferred physical allocation window, counts combined parties once and shows the next saved reservation without claiming actual arrival or available capacity. Only explicit existing lifecycle actions complete a visit. Local synthetic acceptance is documented in `BOOKING_SERVICE_ATTENTION.md`; production activation and restaurant/device validation remain open. A broader operational activity view and reports remain open. |
| Commercial integrations | Deposits/no-show policies/payment only with explicit merchant setup, payment events, refund rules and reconciliation. | Open; optional launch scope to agree before real charging. A “paid” status alone is not payment acceptance. |
| Reliability and recovery | Observable failures without guest PII, retries, concurrent writes, safe upgrades, export/restore rehearsal, backup policy and support runbook. | Existing canonical gates and backup pipeline; untested full recovery is a known release limitation. Booking-specific recovery drill and operational monitoring open. The dependent private Booking scope now adds a migration/query-bound catalog and ACL attestation, real rolled-back drift cases and a mandatory clean-boot check, while preserving legacy public/decision_lab fingerprints. An isolated logical restore now retains private facts and managed controls, parks stale sends and passes post-restore Booking/media authorization. Actual target comparison, encrypted cloud/Storage-byte restore, lost-write/provider reconciliation and reopening acceptance remain required. See `BOOKING_BACKUP_RECOVERY.md`. See `BOOKING_PRIVATE_DRIFT.md`. |

## Restaurant trial before claiming practical parity

Use an isolated restaurant configuration and synthetic bookings first. Test the
critical paths with two operator sessions and the supported phone/desktop
surfaces, then agree an explicitly scoped pilot with restaurant staff. Do not
create production guest bookings or contact real guests as automated QA.

Trial scenarios must include a normal reservation, pending request, duplicate
retry, competing table claim, party/time/table amendment, walk-in, arrival,
seating, departure, late-running visit, cancellation, no-show, closed date,
combined tables, revoked staff access, offline/failed write and guest message
failure. Record outcome, practical friction and recovery, not just screenshots.

The founder and restaurant operator should agree which optional integrations
matter to their actual service. Core availability, privacy, authorization,
communication honesty and recovery cannot be waived to improve a comparison.
Only after core workflows pass and remaining differences are explicitly named
may we make the limited practical comparison requested by the founder.

## Integration checkpoint: 2026-10-20

Weekly planning is reviewable in PR #557; team access is a dependent draft in
PR #558. The weekly planning classification gate currently blocks integration
because `booking_console_save_closure_v1` intentionally deletes a selected
closure configuration when its operator confirms removal. It does not delete
reservations or guest records, and it records the removed configuration in the
audit log. Separate, narrowly scoped Founder authorization for this deletion
has been requested and has not yet been received. Do not bypass or weaken the
classifier, infer authorization from the general development mandate, or merge
with a failing required gate. Archival is an alternative if selected by the
founder; published migration history and release evidence must be preserved.
Production activation is a separate outstanding decision.

The team candidate passed 65 browser journeys, TypeScript, contracts, CI tests,
lint and production build, plus the canonical 197-migration database validation
including Safety/RLS and real concurrent revocation tests. This is implemented
and locally verified evidence, not production delivery or restaurant acceptance.

### Staff communication evidence candidate (207)

The Console now has a capability-gated, on-demand guest-message overview: distinct queue/unknown dispatch/acceptance/delivery/problem states, contact-link revocation, delivery blocks, stale-read recovery and bounded pagination. The read RPC enforces canonical restaurant roles, revocation, ownership and actor/owner Safety without exposing credentials, payloads or provider identifiers. Editor copy distinguishes preparation from sending and no longer promises name-change mail after arrival. See `BOOKING_MAIL_OVERVIEW.md` for verified scope. The dependent 208 candidate supplies explicit existing-link renewal, recipient-bound suppression and an audited new message intent. Initial manual credentials, general reconciliation/resend actions and actual production operation remain open; this is not a parity claim.

### Public checkout and restaurant rules candidate (209)

The dependent public checkout supplies date/party/time selection, contact entry, explicit review of frozen restaurant conditions, human-proof integration, current-status confirmation and tab-scoped uncertain-write recovery. Owner/Manager can prepare online services and cancellation/confirmation rules with actor-bound journaled save/recovery and explicit stale-draft discard. Guest management retains separate pending cancellations for multiple reservations. See [public checkout](BOOKING_PUBLIC_CHECKOUT.md) for exact semantics and evidence. New HTTP intake remains hard closed; production authorization, real sender/widget acceptance, restore rehearsal, initial manual guest-access handoff and restaurant pilot remain open. The subsequent mobile Booking candidate is described below. This is implementation and local validation, not live delivery or parity.

### Dedicated mobile Booking area candidate

The native app now has a Booking tab with explicit personal-link import, current receipt/original-condition display, clear request/confirmation states, device/actor/environment-scoped secure native credentials and durable uncertain-cancellation recovery. Existing guest links are usable without an account claim; local removal and capability sharing are explicit separate actions. Web and mobile share DTO and transport validation. See [Mobile Booking](BOOKING_MOBILE_WALLET.md). Native bundles, synthetic app browser acceptance and contract tests are separate from real-device/restaurant acceptance. Automatic account association, cross-device recovery and a smooth checkout-to-app handoff remain open; new intake remains hard closed and no app release is claimed.

### Reviewed manual message candidate (210)

Phone/email/operator reservations now have a separate recipient-review flow that prepares current booking facts through the canonical journal and worker. It supports original-request recovery without changing contact text or adding guest access/terms. The read-only v2 history identifies the selected recipient; pending is never presented as confirmed. See [manual confirmation](BOOKING_MANUAL_CONFIRMATION.md). This closes the manual fact-message gap, while initial guest credentials/conditions, reminders and real communication/device/restaurant acceptance remain open. Production schema remains 191; there is no practical-parity claim.

### Private Booking drift candidate

The canonical database gate now checks private capabilities, operation journals and dispatch metadata through a separately recorded catalog/ACL fingerprint bound to migration and query bytes. Twenty actual drift mutations, inherited privileges, historical ledger normalization and guest-row independence are verified in isolated rolled-back fixtures. This improves release/recovery evidence but does not demonstrate a successful restore, production deployment or restaurant operation. See [private drift scope](BOOKING_PRIVATE_DRIFT.md).

### Booking backup and logical recovery candidate

The weekly exporter now includes every application schema, private data, migration history and captured app-owned managed controls. An actual isolated export/restore matched 384 table digests and both fingerprint scopes; all 27 Booking SQL suites and media authorization passed after restore. Open sends were audited and parked, with original outcomes and sealed bytes retained. Cloud/Storage-byte recovery, separate secrets, post-backup operations and an approved real reopening remain open. See [backup recovery](BOOKING_BACKUP_RECOVERY.md). No production delivery or restaurant-parity claim.
