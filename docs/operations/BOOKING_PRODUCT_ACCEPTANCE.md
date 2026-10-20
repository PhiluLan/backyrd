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
| Rooms and graphical table plan | Persisted positions/shapes/labels; clear live attendance and planned-time layers; accessible alternative to dragging; phone list; safe table moves. | Room-grouped overview live. Graphical plan merged in PR #554: persisted bounded geometry, rectangle/round shapes, native editor with drag/keyboard/numeric alternatives, room isolation, revision conflicts and frozen uncertain retries. Canonical 195-migration clean boot and 34 browser journeys passed. Production activation, real-device trial and allocation moves remain open. |
| Table combinations and allocation | Combine compatible tables transactionally, no shared table overlap, room/service eligibility, retained history and concurrent assignment tests. | Open. Current one-table reservation contract remains explicit. |
| Planning and capacity | Weekly overview leads into service; date-specific closures/overrides, service room activation, quotas and durations; DST, midnight and capacity boundary acceptance. | Weekly same-day services live. Weekly scoped summary and dated full/partial service/room blocks implemented, with explicit preservation of existing reservations, DST-aware availability and real two-connection race acceptance. Canonical 196-migration candidate; production activation and restaurant trial remain. Exceptional openings, overnight services, quotas and advanced capacity remain open. No inferred occupancy percentage. |
| Public reservation flow | Accessible mobile guest flow at /booking and spot embeds; real availability, confirmation, request replay, rate limits, abuse protection, cancellation/change links and privacy notice. | Public introduction live; actual guest checkout open. Must complete privacy/retention and secure access contracts first. |
| Guest communication | Confirmations, cancellation and reminders from transactional outbox; verified sender; delivery/retry/bounce states; no duplicate sends; safe signed self-service links and consent. | Open. No current reservation action sends guest messages. |
| Guest records | Authorized reusable contact lookup, transparent history/preferences, safe merge, corrected identities, retention and access/deletion handling; no sensitive inference or AI export. | Open. Reservation-specific contact only. Real Volta guest data must not become development fixtures. |
| Team operations | Restaurant-specific staff roles, invited access, least privilege, revoked access and two-device changes; owners cannot cross restaurant boundaries. | Canonical owner access live; team candidate adds verified-email invitations, Viewer/Host/Manager roles, owner-only team controls, per-member revisions and revocation/ownership fences under the restaurant lock. Canonical 197-migration execution and real two-connection revocation races passed. Client revalidation includes permission-only checks during open dialogs and role-specific controls; synthetic login, token handoff and two-console acceptance. Production activation, authenticated push and a real team multi-device trial remain open. |
| Daily control and insights | Unresolved requests, overdue seated visits, cancellations/no-shows, service totals with defined scope and useful change history. | Scoped live counts/filters. Amendment candidate adds a prior-day unclosed-visit queue and an independent saved seating layer; one seated party per table is enforced. Same-day overstay alerts, full operational history and reports remain open. |
| Commercial integrations | Deposits/no-show policies/payment only with explicit merchant setup, payment events, refund rules and reconciliation. | Open; optional launch scope to agree before real charging. A “paid” status alone is not payment acceptance. |
| Reliability and recovery | Observable failures without guest PII, retries, concurrent writes, safe upgrades, export/restore rehearsal, backup policy and support runbook. | Existing canonical gates and backup pipeline; untested full recovery is a known release limitation. Booking-specific recovery drill and operational monitoring open. |

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
