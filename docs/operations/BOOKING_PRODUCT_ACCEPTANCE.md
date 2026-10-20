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
| Public reservation flow | Accessible mobile guest flow at /booking and spot embeds; real availability, confirmation, request replay, rate limits, abuse protection, cancellation/change links and privacy notice. | Public introduction live. The 203-migration server contract adds opt-in service policy, privacy-safe available instants, automatic complete allocation, credential-bound read/cancellation and atomic request/mail intents. Twenty Booking SQL suites and actual guest/Console claim, replay and pause races passed. The 204-migration follow-up fixes former-owner account erasure without deleting guest bookings or reusing old terms versions; 21 Booking SQL suites and a nonempty migration supplement passed. The dependent Web candidate adds a bounded same-origin HTTP bridge, independent quotas, human-proof/credential-sealing adapters and a private guest read/cancellation page with tab-scoped unknown-write recovery. New intake stays closed until the mail dispatcher is accepted. Public checkout UI, secure key reissue, broader lifecycle/retention, production activation and restaurant acceptance remain open. See `BOOKING_GUEST_HTTP.md` for exact boundaries and limitations. |
| Guest communication | Confirmations, cancellation and reminders from transactional outbox; verified sender; delivery/retry/bounce states; no duplicate sends; safe signed self-service links and consent. | The 203-migration candidate atomically queues guest creation/cancellation and relevant staff changes, suppresses obsolete/wrong-recipient intents and retains original-request replay. No worker or provider sends are implemented/activated in this increment. Immutable encrypted payloads, leasing, bounded provider retries, verified sender, signed delivery/bounce callbacks and actual communication acceptance remain open. No current production reservation action sends guest messages. |
| Guest records | Authorized reusable contact lookup, transparent history/preferences, safe merge, corrected identities, retention and access/deletion handling; no sensitive inference or AI export. | Open. Reservation-specific contact only. Real Volta guest data must not become development fixtures. |
| Team operations | Restaurant-specific staff roles, invited access, least privilege, revoked access and two-device changes; owners cannot cross restaurant boundaries. | Canonical owner access live; team candidate adds verified-email invitations, Viewer/Host/Manager roles, owner-only team controls, per-member revisions and revocation/ownership fences under the restaurant lock. Canonical 197-migration execution and real two-connection revocation races passed. Client revalidation includes permission-only checks during open dialogs and role-specific controls; synthetic login, token handoff and two-console acceptance. Production activation, authenticated push and a real team multi-device trial remain open. |
| Daily control and insights | Unresolved requests, overdue seated visits, cancellations/no-shows, service totals with defined scope and useful change history. | Scoped live counts/filters. Amendment candidate adds a prior-day unclosed-visit queue and an independent saved seating layer; one seated party per table is enforced. Reservation history candidate adds scoped paginated audit reads, real before/after operating facts, actor references and guest-field change markers without copying guest text. Canonical 198-migration validation passed; detailed history is forward-only for upgraded RPCs. Production activation and restaurant acceptance remain open. Same-day overstay alerts, a broader operational activity view and reports remain open. |
| Commercial integrations | Deposits/no-show policies/payment only with explicit merchant setup, payment events, refund rules and reconciliation. | Open; optional launch scope to agree before real charging. A “paid” status alone is not payment acceptance. |
| Reliability and recovery | Observable failures without guest PII, retries, concurrent writes, safe upgrades, export/restore rehearsal, backup policy and support runbook. | Existing canonical gates and backup pipeline; untested full recovery is a known release limitation. Booking-specific recovery drill and operational monitoring open. Existing structural fingerprint v1 covers public/decision_lab only; scoped private Booking schema/ACL drift validation is required before new production activation. |

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
