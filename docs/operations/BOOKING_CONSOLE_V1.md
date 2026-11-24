# Backyrd Booking Console v1

The continuing product target and acceptance gaps are tracked in
[Booking product acceptance](BOOKING_PRODUCT_ACCEPTANCE.md).

Task class: DATABASE_PR plus affected Web gate. The Console is a restaurant
operations module at `/booking/console`, separate from Decision ranking.

## Operator workflow

Sign in with an existing Backyrd account. Only spots whose canonical
`spots.owner_id` is the current actor are available. No self-asserted claim,
subscription payment, client metadata or Admin flag grants Booking access.
An unassigned account receives an access-request link.

1. Set the default visit duration and maximum party size (up to 30).
2. Add named areas, tables and weekly services.
3. Save the entire setup atomically. Revision conflicts preserve the draft and
   require discarding/reloading before saving again.
4. Open a date in the diary, check available slots and choose a table/time.
5. Record the guest name and optional contact and operational note. Select
   phone, email, on-site or operator source, and pending or confirmed status.
6. Confirm, decline or cancel through an explicit status confirmation. A no-show
   can only be recorded after the start. Cancelled/declined/no-show records are
   terminal and remain in the diary and audit history.

The entire visit must fit inside the service. All calendar dates and displayed
times use Europe/Zurich. Pending and confirmed bookings both occupy one table;
adjacent visits may use the same table. Setup and booking writes lock the same
restaurant settings row. A database exclusion constraint independently prevents
overlaps. Repeating the same create request returns the original reservation;
reusing its identifier with different guest/slot details is rejected.

Deactivating a resource prevents future allocation without deleting existing
reservations. Reducing a table below the party size of its future active
reservations is rejected. The Console supports one table per reservation,
same-day weekly services and bookings from now through the next 365 days.

## Boundaries and data

All six `booking_*` tables have RLS and explicit grants. Clients can only read
their own operator rows; all writes use checked transactional RPCs. Anonymous
callers cannot invoke these RPCs or read guest data. Public availability,
guest checkout, payment, guest messaging, table combinations, floor-plan
dragging, overnight services and date-specific closures are outside v1.

The old `public.reservations` consumer intent log and the initial unshipped
restaurant draft from an older checkout are not sources of Booking inventory.
No historical intent is silently converted into a confirmed reservation.

Guest contact and notes are optional. Collect only necessary booking data;
notes must not contain sensitive personal information. Audit records store
actor, action, reservation reference and time, without duplicating guest text.
The Console is operator-only and excluded from indexing. It emits no guest
data to analytics or external AI providers. A retention/anonymisation policy
and guest self-service must be completed before opening public guest bookings.

## Validation and release

Run Web lint, typecheck, contract tests, build, and
`web/e2e/booking-console.spec.ts` plus Booking/Owner-entry smoke. Browser
fixtures are synthetic and mock the RPC transport; SQL acceptance verifies
the actual database authorization and allocation rules. The database test is
`supabase/tests/booking_restaurant_console_v1.sql` and must also pass on the
canonical Supabase clean boot. Generate database release evidence from that
execution's schema/ACL snapshot; do not rerun the full database suite merely
to finish its evidence packaging.

Production needs separate explicit approval for the exact canonical Main SHA,
the new forward migration and Web delivery. Apply the certified database
release before operator onboarding. No existing restaurant is auto-enabled.
Until the migration is deployed, the Console reports an unavailable backend
instead of an empty diary or fake success. Verify an unauthenticated Console
entry, an assigned operator read and the own-spot save/read path in an isolated
environment; do not create production guest bookings for smoke tests.

Rollback: remove the Console entry through a Web revert, preserving database
reservations. Never drop the Booking tables or rewrite the applied migration.

## Interaction direction: restaurant service first

Aleno is the requested usability reference. Keep Backyrd's own design and domain
contracts, while reducing the effort of common service tasks. Public research
on 2026-10-20 is sufficient to define the first structure:

- The reservation book is the daily working surface. Date and service context
  should remain visible when starting a reservation. Aleno documents creation
  from both its reservation book and seating view, with date/time editable in
  the form: [Create reservations](https://knowledge.aleno.me/de/kb/reservierungen-erstellen).
- Common party sizes should take one tap, with direct entry for other sizes.
  The first increment adds size shortcuts within the restaurant's configured
  maximum. Changing party size always invalidates old availability.
- Separate setup from service work. A later room/table-plan view should support
  placement without obscuring the reservation list. Public reference:
  [Create a table plan](https://knowledge.aleno.me/de/kb/tischplan-erstellen).
- A later calendar/service overview should lead into the selected day's book;
  date-specific overrides require backend support before exposing controls.
  Public reference: [Calendar and day settings](https://knowledge.aleno.me/de/kb/kalender-funktionen).
- Keep the daily list scannable; choose essential columns before adding a large
  guest form. Public reference: [Reservation-book columns](https://knowledge.aleno.me/de/kb/spalten-ansicht-im-booqin-und-in-print-anpassen).

Numeric drafts remain text until valid form submission; deleting a value must
leave it empty, including after blur. Duration, maximum party size and table
seats are converted only at the existing numeric API boundary. Required, range
and whole-number rules still apply. Availability checks reject an empty or
invalid party size without calling the backend. Mobile inputs use numeric
keyboards and 16px text, and table setup stacks on narrow screens.

Public documentation establishes structure, not proof of current touch behavior
inside a customer account. The signed-in review below supplements that evidence.
Walk-in lifecycle, guest profiles and table movement need explicit backend
designs; they are not enabled by the numeric-input improvements.

## Signed-in workflow review, 2026-10-20

The founder authorized inspection of the signed-in Volta Bräu account. This was
an interaction review, not a data import or a usability study with restaurant
staff. Both the existing narrow browser view and a temporary 1280px view were
inspected. No physical iPhone keyboard or touch gestures were tested. No guest
names, contacts, reservation identifiers, comments, account screenshots or
restaurant configuration values are retained in this document.

### Observed behavior

| Workflow | Direct observation | Implication for Backyrd |
| --- | --- | --- |
| Operational entry | Dashboard groups unresolved work, including provisional and unassigned reservations. Book and seating views have date navigation, Today, shift selection, capacity figures and new-reservation actions. | Put service work first; setup should be a separate destination. Add unresolved-work queues only for states supported by our backend. |
| New reservation | Opening the action creates an unsaved editor in the current operating view. Guest lookup entry, common party-size choices, default confirmed status, date/time, optional comment and table suggestions are prominent. | Use a short core form in context. A guest lookup field does not establish that autocomplete, matching or profile creation was tested. |
| Progressive disclosure | More details reveal end time, shift, room preference, table assignment, repetition, language and external questions. | Show only fields needed for the current task; keep secondary controls behind explicit disclosure. |
| Suggestions | The editor displays suitable time/table suggestions, and can show a no-table message. Opening a draft also changes figures in its local preview; closing it restores the prior view. | Keep draft availability separate from saved totals. Only confirmed server success may change saved bookings. Suggest alternatives without presenting them as booked. |
| Reservation book | The wide view uses compact columns and time bands, with party size, guest, times, table identifiers and operational information. Selecting a row exposes its editor and contextual status actions. | Prefer a scannable working list to large cards and repeated action buttons. Open details on demand. |
| Status filter | Turning the existing filter off revealed rows hidden from the initial view. The filter was restored afterwards. | A filtered-empty list must explain why it is empty and offer Clear filters; distinguish it from an empty day and a failed load. |
| Seating view | At wide width, the reservation/time list stays beside multiple room plans; narrow width stacks the room plans. Selecting a time changes room occupancy presentation. Switching between book and seating preserves that selected time. | Keep restaurant, date, service, focused time and applicable filters across views. Do not require the user to rebuild context. |
| Calendar | Weekly shift blocks show times and capacity figures. Selecting a block exposes a link into its operational view. | Use planning as a way into the selected day's service, rather than a second reservation workflow. |
| Walk-in | Its action opens an unsaved draft with the current time and seated status already selected. The draft was closed without saving. | A walk-in action must have real arrival/seating semantics. Our existing walk-in source field alone is not that lifecycle. |
| Setup | Rooms have their own list/details and a separate table-plan editor entry. Shifts have a list, recurrence and times, with advanced settings reached separately. Save remains disabled without edits. | Split long setup into focused sections, retain drafts across section changes and make the save state explicit. |

The visible status choices extend beyond Backyrd v1, including provisional,
reconfirmed, arrived, seated, departed and paid. No status was changed. No table
was moved or assigned, no guest text entered, and no Save, send, export or
configuration mutation was performed. New-reservation and walk-in drafts were
closed. The original status filter, dashboard and browser viewport were restored.
The database/network side effects of opening an editor were not instrumented.

### Proposed Backyrd interaction contract

This is a proposal for our Console, not a claim about Aleno's implementation.
Retain Backyrd typography, dark surfaces and pink accent, using clear text labels
and non-color state cues rather than copying icon-only controls.

1. **Reservation book as the default workspace.** Keep a compact service bar with
   restaurant, previous/next day, Today, date and service/room filters. Place one
   obvious New reservation action here. Show clearly labelled counts of saved
   reservations, guests and pending requests, each with an explicit day/filter
   scope. A service's total guest count is not simultaneous seat occupancy;
   do not infer percentages or online quotas from it. Aleno's displayed ratios
   were observed, but their calculation was not verified.
2. **Short reservation editor.** On desktop use a side panel; on phones use a
   dedicated full-height sheet with a visible heading, back/cancel and save.
   Start with guest name, optional contact, person count, date/time and a valid
   table choice. Keep source, internal note and the existing pending/confirmed
   choice available through Details. The chosen service/date prefill from the
   workspace; show them in the editor rather than hiding them. Do not simulate
   guest-profile search while no guest-profile service exists.
3. **Availability in the same flow.** Reuse the current slot RPC and transactional
   create RPC. Debounce or request availability deliberately, clear old choices
   when relevant inputs change, and expose loading, retry and no-availability
   states. Revalidate on save in the backend; suggestions are not inventory
   holds. Preserve entered guest details after a conflict and offer a new choice.
4. **Compact list, deliberate actions.** Use arrival time, duration/end, party,
   guest, area/table and text status as the primary row. Keep notes and secondary
   actions in details. Provide status and room filters with visible active
   filters, Clear filters and honest filtered-empty feedback. Status transitions
   stay within the existing checked backend contract and confirmation behavior.
5. **Focused setup.** Organize Basics, Areas and tables, and Service times as
   distinct sections. Retain unsaved drafts on internal navigation, identify
   incomplete required fields, and never silently convert an empty number to
   zero or overwrite a revision conflict. Reuse the existing atomic setup save.
6. **Views share context.** The first extension can be a table overview grouped
   by area using current data. A graphical floor plan follows only after a
   geometry and allocation contract exists. On phones provide a clear switch
   between book and table view; preserve the working date, service and time.

### Delivery order and acceptance

**First implementation: current contracts.** Redesign the service bar, compact
book, filters, contextual reservation editor and setup navigation. Keep the
existing operator ownership boundary, numeric validation, atomic allocation,
idempotency, conflict handling, session clearing and audit behavior. Do not
introduce public guest booking, email delivery or new statuses as UI shortcuts.
Acceptance should cover a phone reservation from the selected day through
save/reload, clear-and-retype numeric inputs, a party-size change invalidating
availability, two clients competing for a slot, a failed save preserving input,
filtered-empty recovery, unsaved-editor cancellation and account switching.
Check 320/390px widths and a wide view, keyboard focus/Escape behavior, meaningful
field labels, no horizontal page overflow and accessible text status cues.

**Following backend work.** Design arrival/seating/departure and true walk-ins,
rescheduling, multiple-table allocation, table geometry, service-specific room
activation and capacities, calendar exceptions and any guest-profile model as
explicit domain changes. Each needs transactional rules, shared contracts where
actually consumed, authorization tests and migrations before its controls ship.
For the universal Booking foundation, rooms/tables are the restaurant adapter
of resources/capacity/time windows; do not make restaurant-only lifecycle states
mandatory for a later museum, club or activity adapter.

Not verified in this review: successful save or notification delivery, guest
matching, drag-and-drop reallocation, payment, profile deduplication, capacity
formulas or phone touch behavior. Those are not established product guarantees.

## Console workspace implementation

The first Aleno-informed increment implements the existing-contract scope:

- A compact reservation book, service/area/status/name filters, a visible day
  context and explicit recovery from a filtered-empty result.
- Saved active-reservation, expected-guest and pending-request counts scoped to
  the current list selection; no inferred seat-capacity percentage.
- A table overview grouped by area. Day totals and occupancy at a focused
  Europe/Zurich time are distinguished; a reservation ending at that time no
  longer occupies the table. This is not a graphical floor-plan editor.
- A native modal side panel on wide screens and full-height phone editor.
  Background controls are inert, Escape/close protects edited drafts, focus
  enters the editor and returns to its launching control on cancellation.
- Automatic debounced availability for the chosen date and party size, with
  stale-response rejection, separate time/table choices and optional details.
  Filters prefill from the working context. Guest text survives a rejected
  save; an identical retry retains its request ID after an uncertain response.
- Existing reservation details and explicit checked status confirmation live
  in a separate panel. No new lifecycle states or notifications are implied.
- Setup navigation separates Basics, Areas and tables, and Service times.
  Drafts survive section changes. Saving reveals and focuses invalid fields in
  their section before any backend call, then uses the existing atomic save.
- Sign-out/account changes clear private inputs and reject stale UI responses.

The Web read model now consumes the existing reservation service_id returned
by booking_console_read_v1, so overlapping service hours do not cause guessed
service attribution. The SQL/RPC contracts, grants, table allocation and
idempotency enforcement are unchanged. No migration is needed.

Acceptance lives in web/e2e/booking-console.spec.ts with synthetic RPC fixtures:
save/reload/create/cancel, filters and context retention, half-open table-time
boundaries, 320/390px layout, focus/Escape/discard, logout with an open draft,
out-of-order availability, slot conflict and accepted-write/uncertain-response
retry identity. These browser fixtures verify client behavior; the existing
database authorization/allocation acceptance remains the backend evidence.

## Restaurant service lifecycle increment

Forward migration `20261020184245_booking_restaurant_service_lifecycle_v1.sql`
extends the restaurant adapter with `arrived`, `seated` and `completed`.
Confirmed bookings can arrive or be seated directly on their Europe/Zurich
service date. Arrived guests can be seated or cancelled; seated guests can
complete their visit, including closing a visit left open on an earlier day.
Terminal states cannot be reopened through the status endpoint. Pending
requests must first be confirmed. Existing confirmation, decline, cancellation
and no-show rules remain.

Actual arrival, seating and completion timestamps are set by the server and
shown separately from the original planned interval. Arrived/seated reservations
occupy that planned interval in both slot lookup and the exclusion constraint.
Setup capacity reduction retains the same protection for those states.
Completion releases the interval without deleting the reservation or changing
the planned times. It does not automatically infer payment or send a message.

All writes retain the common restaurant lock and expected-current-state check.
An identical same-actor retry of a previously completed transition succeeds
without a second audit event, including a lost response. A stale attempt to a
different target still fails. RLS, table grants, owner/safety checks and all five
public RPC signatures are unchanged. Audit continues to avoid guest text.

The read RPC advertises `capabilities.service_lifecycle`; clients treat its
absence as false and hide lifecycle actions against the old backend. The new
Web parser accepts the additional states/timestamps. There are no Mobile/Admin
Booking consumers to migrate. Cached older Web clients may need a reload to
understand new states; they cannot bypass the server transition rules.

The table time selector shows planned intervals. The service badges/counts
show the last manually saved attendance state, not a live physical occupancy
sensor. Automatic overstay handling, extended allocations, overdue queues,
undo/correction workflows and real current-time walk-ins remain acceptance gaps.
No production status changes or actual guest bookings are used as QA.

The CI classifier recognizes an atomic same-table/same-name GiST exclusion
replacement as a schema change, analogous to its existing CHECK replacement
rule. It still requires the Database gate, SQL acceptance and release evidence;
unpaired drops, a different relation/name and row/column removal remain blocked.
This recognition does not approve a production release or establish that an
arbitrary replacement preserves business rules. This migration expands the
existing predicate and SQL acceptance checks the actual allocation behavior.

Candidate validation on 2026-10-20: the canonical 192-migration Supabase clean
boot passed its baseline SQL, both explicitly selected Booking suites, RLS/ACL
checks, existing multi-connection races and the unchanged DB-lint allowance.
Its schema/ACL snapshot generates the immutable lifecycle release record.
The 15 synthetic browser cases cover the full attendance flow across reloads,
320px layout, capability/date gating, concurrent-change rejection and uncertain
status-response retry, in addition to the original workspace cases. The phone
viewport was visually inspected with synthetic data. Web lint (existing
warnings only), typecheck, 42 contract tests, production build and 48 classifier
tests passed. This is candidate evidence, not a production deployment or a
physical-device/restaurant service trial.

## Atomic reservation amendments

The following increment adds `booking_console_amendment_slots_v1` and
`booking_console_amend_v1`, using the same canonical owner/safety checks and
restaurant write lock. The private shared availability enumerator takes an
optional exclusion identity; only the checked amendment wrapper can supply the
operator's own target booking. Standard create/availability retains its v1
signature and configured default duration. Amendment durations are whole minutes
between 30 and 480, within the chosen weekly same-day service and its slot grid.

Pending/confirmed reservations may change guest fields and allocation. A change
to party/date/service/table/duration requires a new eligible future slot. If it
conflicts, the original booking and guest data remain intact. No temporary
cancellation is used to find alternatives. Arrived/seated bookings allow guest
corrections without touching allocation or actual service timestamps; their
allocation cannot be moved here. Terminal bookings cannot be amended. Past
party-size corrections, occupied-table moves and an override workflow remain
separate acceptance gaps.

Each reservation has a revision. Both amendments and real status transitions
advance it; the amendment endpoint rejects a stale revision. No-op edits do not
advance it or manufacture audit events. An amendment request UUID is stored on
the reservation, unique within a restaurant. Its identical retry replays safely
after a lost response, including a subsequent status transition. Reusing the
UUID for different fields or another reservation fails. After a newer amendment
replaces that request identity, an older retry conflicts and requires a read;
this is not an indefinite command-history service.

The first real amendment preserves a SHA-256 digest of the original normalized
create fields. A retry of the original create request must still return the
same booking ID after edits or cancellation; it cannot restore the original
guest text, reallocate inventory or reactivate the reservation. The original
v1 contract's status-independent create replay is retained intentionally.
No duplicate guest text is stored in command/audit tables. Internal replay
metadata is omitted from the Console read model. Audit records the amendment
actor, time and reservation reference, without guest text; full before/after
history and privacy corrections after a terminal state remain future work.

The read capability `reservation_amendments` gates the editor. Metadata changes
do not fetch or replace allocation. Changing the allocation explicitly opens a
debounced alternative search, clears stale selections, and supports numeric
deletion without converting blanks to zero. Failed writes preserve guest text;
identical retries retain request identity and expected revision. A conflicting
revision offers an explicit discard-and-reload choice. Successful cross-day
rescheduling follows the new date/service/room in the workspace. No guest
message is sent. This increment is not production activated yet.

Physical seating is protected separately from the planned interval: a partial
unique index permits at most one `seated` party per table, and the checked
transition returns `booking_table_occupied` when the current visit must be
resolved first. Adjacent planned reservations are still valid. On the server's
current Europe/Zurich operating date, the read model includes prior-day seated
visits separately from the day's diary. The Console provides an explicit
recovery queue and a table service-state layer unaffected by the planning time
filter; those prior visits do not inflate the selected day's reservation totals.
Details include the actual reservation date. An operator may complete a prior
visit after checking it, then seat the new party. No automatic departure or
physical-presence inference is made. The earlier lifecycle SQL test restores
its synthetic future seating fixture before exercising actual current-day
seating; both suites remain part of the amendment release acceptance.

Amendment candidate validation on 2026-10-20: canonical 193-migration Supabase
clean boot, baseline SQL and all three Booking suites passed, including original
create replay after an amendment, rollback on conflicts, owner isolation,
status/amendment revisions, seating uniqueness and prior-day recovery. The
generated schema/ACL snapshot is recorded in the amendment release evidence.
All 23 synthetic browser cases passed on the unchanged final source, including
numeric deletion, cross-day context, metadata corrections after arrival,
uncertain/slot-conflict retries, stale availability and 320px prior-visit recovery.
Phone recovery and desktop editor viewports were visually inspected. Web lint
has no new errors (13 existing unrelated warnings), typecheck, contract checks
and production build passed. No actual production guest data was written or
copied. Backend activation and restaurant/physical-device validation remain open.

## Real current-time walk-ins

`booking_console_walk_in_slots_v1` previews current eligible services and tables;
`booking_console_walk_in_v1` atomically admits and seats a party. Both retain
the owner/safety boundary and restaurant row lock. No public guest grant is
added. A short shared lock keeps the preview's resource names, current service
list and availability consistent. Client input cannot set an admission time.
The write obtains the server clock after waiting for the restaurant write lock,
then checks active same-day weekly services, duration within closing time,
active room/table, party capacity, planned intervals and any still-seated visit.
The planned-time and physical-presence predicates are deliberately separate.

An admitted visit has `is_walk_in=true`, source `walk_in`, status `seated` and
server arrival/seating timestamps. Legacy/future reservations with only a
walk-in source stay `is_walk_in=false`. A name/contact is optional for a private
in-person admission; unnamed visits use the explicit «Walk-in» placeholder.
Durations retain the restaurant adapter's 30–480 minute contract. Suggestions
do not hold inventory and are checked again at commit. One request UUID replays
the original ID/time, including after a guest correction or completion; changed
input or an ordinary reservation's UUID is rejected. No guest message is sent.

The private admission clock normally calls `clock_timestamp()` and is not
executable by clients. SQL acceptance replaces only this private clock inside
a rolled-back synthetic transaction, advances it between preview/write, and
tests closing boundaries without dependence on the CI runner's wall clock.
It does not override PostgreSQL built-ins or add a public test-time parameter.

The capability-gated Walk-in action works independently of a future planning
date and follows the server-returned date after saving. The short editor offers
party/duration shortcuts and current table choices with authoritative resource
labels, plus optional guest details. Unknown write outcomes freeze the current
payload for an identical retry. Leaving such a request explicitly warns that it
may already be stored, refreshes the server's current operating day and shows a
review warning until acknowledged. Late responses from a signed-out session
cannot close a new session's draft. Console read snapshots are scoped to their
restaurant/date; row accessibility descriptions distinguish repeated guest names
and unnamed admissions by time, party, table and status.

The original walk-in increment left the general reservation/amendment editors
with retry identity but without a payload freeze/review warning. The later
write-recovery increment below closes that in-session gap. Durable
uncertain-outcome recovery across a browser restart remains a reliability gap;
do not claim indefinite exactly-once processing. Broader offline support,
overnight services and dynamic overstay replanning remain outside this increment.

Walk-in candidate validation on 2026-10-20: canonical 194-migration Supabase
clean boot with baseline SQL and all four Booking suites passed. The dedicated
clock fixture explicitly uses a UTC session and constructs Zurich civil times
with grouped timezone conversion. SQL acceptance covers current service/window,
resource eligibility, real seating, planned reservations, overdue visits,
closing endpoints, failed-write rollback, changed/replayed UUIDs, guest
corrections, completed-visit replay and negative authorization. The immutable
release evidence chains from the amendment candidate; it is not a Production
deployment receipt. This branch depends on the amendment PR #549.

All 30 synthetic browser journeys passed after the scoped-snapshot change; the
seven walk-in journeys were rechecked after final label/error-text hardening.
The 320px editor was visually inspected. Web typecheck, lint (existing warnings
only), 42 contracts and production build passed. The shared native dialog and
older reservation flows remain covered. Late-session response and frozen
uncertain-payload tests use controlled synthetic transport, not production guest
writes or an Aleno account mutation. The Vercel integration reported a build
quota limit during this work; verify actual delivery separately from Git/CI
before calling a new UI increment live.

## Schematic restaurant table plans

The optional `table_layouts` capability exposes bounded integer geometry on
restaurant tables. Each room uses a 1000 × 700 coordinate space; rectangle and
round/oval shapes are supported with dimensions 40–300. A private CHECK validator
also protects privileged writes. Clients still have no direct write grant.
`booking_console_save_layout_v1` uses the existing owner/safety assertion and
restaurant settings lock. A patch contains only table, expected room and geometry;
capacity, booking allocation and guest data are not accepted. All entries are
validated before writes, duplicate IDs and cross-spot resources are rejected,
and settings revisions prevent lost updates. An already satisfied identical
patch replays without another revision/audit entry. Actual room changes clear
the old coordinates; the legacy setup RPC's temporary resource retirement does
not. Geometric overlap is a visible editor warning, not a reservation constraint.

The Tischübersicht retains the date, service, room and planned-time context when
opening a plan. The schematic view has keyboard-operable nodes, zoom/local scroll
and a full-size button/list alternative. Table cards remain the detailed source
for planned bookings and last saved physical attendance. Unpositioned tables
are explicit. The native editor supports drag, arrow keys (Shift for larger
steps), numeric string drafts, shapes, removal and an explicit unsaved room-grid
proposal. No automatic table allocation is implied by a visual move. Invalid
numeric drafts are never converted to zero. Version conflicts retain the draft;
unknown save responses freeze the patch for an identical retry. Closing or
reloading warns about unsaved/uncertain input. New UI remains capability-gated
until this migration cohort is separately authorized and activated.

Table-plan candidate validation on 2026-10-20: canonical 195-migration Supabase
clean boot with all five Booking SQL suites, baseline authorization/race tests,
ACL/schema snapshots and database lint passed. The release record chains from
the walk-in candidate; it does not activate Production. All 34 synthetic browser
journeys passed, including numeric clearing, geometry persistence, constrained
drag/keyboard positioning, room isolation, context retention, revision conflict,
unsaved discard and identical uncertain retries. The 320px plan/list was visually
inspected. Web typecheck and 42 contracts passed; lint has only the 13 existing
warnings. A physical-device/restaurant trial remains required before a usability
or operational-parity claim.
The production Web build passed after clearing a generated Turbopack cache that
had retained a sandbox-denied loopback error. No application configuration or
security control was changed to resolve the local build-cache failure.


## In-session uncertain reservation writes

New reservations and amendments now freeze the exact original request after an
unknown write result, including its UUID, allocation, guest fields and revision.
The editor stops availability refreshes and disables further input; the footer
remains available for an identical retry. A later retry rejection does not prove
that the original unknown request failed, so the payload stays frozen until a
successful replay or explicit exit. Definite initial validation/allocation
conflicts remain editable and retain the usual recheck behavior.

The native exit warning explains that the request may already be stored. Leaving
refreshes the candidate booking date, clears filters and shows a persistent
review warning without claiming success. For an amendment, operators should
check the old and requested dates. The dialog no longer offers an editable
stale detail view after such an exit. Actor/entry guards prevent signed-out
responses from changing a new session. No new database, guest messaging or
browser storage of private booking payloads is introduced. Recovery after a
browser restart and full offline support remain open.

Write-recovery candidate validation: all 36 synthetic browser journeys passed;
the unchanged create/amend replay cases also passed after advancing the browser
clock beyond the original reservation date. Those two clock fixtures explicitly
use a longer synthetic token lifetime so token refresh is not confused with
reservation replay. Web typecheck, 42 contracts, lint (existing warnings only)
and the production build passed. Backend execution evidence is unchanged from
the preceding table-plan candidate; this increment adds no migration.

## Console freshness and concurrent sessions

The visible, idle reservation/table workspace revalidates through the existing
owner/safety-protected `booking_console_read_v1` every 30 seconds and on focus or
visibility return. It does not subscribe directly to reservation tables or put
guest payloads in browser storage. The displayed timestamp is a successful read
time, not a claim of an instantaneous live feed. Setup, open dialogs, dirty
input, foreground reads and writes pause background reads. In-flight responses
are aborted and ignored when that context changes; foreground reload generation
and actor/session guards prevent late reads from crossing contexts. A long-open
editor/setup is revalidated on return to the workspace.

Offline state and failed background reads retain the last successful snapshot
with an explicit stale/offline message. New reservation/walk-in launches are
blocked until a successful canonical read; reconnect forces revalidation even
if the last read was recent. Existing open editors are not an offline write
queue: any attempted write still uses the existing server RPC and uncertain
outcome flow. This is not full offline operation. Ownership/authentication denial
and the actual canonical `P0001` Safety rejection messages clear the snapshot
instead of retaining a degraded guest list. An open dialog pauses polling, so
this is detection on the next allowed read, not instant remote revocation.

Read requests have an explicit 15-second deadline and abort the underlying
PostgREST fetch. The deadline also bounds the UI wait if the SDK is still waiting
for auth renewal before starting fetch. The polling loop allows one read at a
time and retries at the normal interval; it does not run while hidden. All write
eligibility, table occupancy, revisions and replay rules remain server-enforced.
An authenticated push invalidation mechanism with appropriate restaurant/safety
access control, staff roles and a real restaurant multi-device trial remain
separate operating acceptance gaps.

Freshness candidate validation: all 42 synthetic Booking browser journeys passed,
including shared-server two-console changes, paused drafts, a read started before
opening an editor, offline/reconnect failure and recovery, ownership denial,
canonical Safety error shape and a held request timing out/recovering without
an overlapping poll. Web typecheck, 42 contracts, lint (13 existing warnings)
and the production build passed. No backend schema or grant was changed, so the
preceding canonical 195-migration database evidence remains the backend basis;
these browser cases prove client behavior, not a real multi-device pilot.

## Weekly planning and restaurant booking blocks

The capability-gated week view provides seven ordered Zurich civil dates, scoped
to the selected service and room. It uses one owner/safety-protected weekly RPC
with the restaurant shared lock, not seven unrelated daily reads. Counts are
reservations whose start belongs to that civil day: pending/confirmed/arrived/
seated are active; pending is also reported separately, and cancelled includes
declined. Guest counts sum active party sizes and are not an occupancy quota.
Guest identity/contact/note fields are absent from the summary; organizational
block reasons retain the same private operator boundary. Opening a day preserves
scope and immediately revalidates even when it is already the selected date.
Incomplete/failed weeks do not become an apparently empty calendar. A weekly
Safety/auth denial clears the whole private workspace and retires old callbacks.

`booking_restaurant_closures` stores dated full-day or minute-aligned intervals,
optionally limited to a service and/or room. A private civil-boundary CHECK also
protects privileged writes. Partial blocks may end at 24:00; full days use the
next local midnight and can be 23 or 25 actual hours. Nonexistent local block
boundaries are rejected; ambiguous starts use the earliest occurrence and ends
the latest, covering the continuous interval between those boundaries. The
editor explains that behavior. Intervals are half-open at both booking/block
boundaries. Existing setup clients leave these independent records intact.

The closure RPC shares the restaurant FOR UPDATE lock with create, amendment,
walk-in and configuration writes. It validates the complete scoped request,
uses the settings revision, replays an already satisfied save/removal without
another revision/audit entry, and never deletes or cancels a reservation. When
active reserved intervals overlap a new/changed block, the write requires an
explicit `keep_existing` acknowledgement. The affected count is computed again
under the lock; changing scope resets the UI acknowledgement. Save/removal audit
details retain the before/after rule, actor and affected count. A saved identical
block can still replay after its date passes. Changing/creating blocks is limited
to today and the next 365 days; removing an old rule remains safe with a revision.

New booking suggestions, create and allocation-changing amendments use the same
private block predicate; real-time walk-in allocation checks it too. Existing
bookings can still receive guest corrections and normal attendance transitions,
and replay of an original request remains valid after a block is introduced.
The native editor preserves conflict drafts, freezes unknown saves/removals for
an identical retry, and revalidates the possibly saved target date on explicit
exit. Closure transport has a 15-second UI deadline; cancellation does not prove
that the server transaction rolled back. A busy/uncertain block warns on unload.
Full offline operation and durable recovery after a browser restart remain open.

Planned slots now iterate actual instants rather than adding a duration to
potentially nonexistent civil starts. Weekly service openings in a repeated hour
use the earliest occurrence, closings the latest; missing weekly boundaries use
PostgreSQL's forward shift. Walk-ins use the same service boundary rule. Real
reservation duration and service end remain hard constraints. The time chooser
labels duplicated autumn times with UTC offsets, and intervals crossing the
clock change show both offsets. Table-time focus includes both valid occurrences
of an ambiguous local time and none of a spring gap, with an explicit UI note.

The two-connection closure/booking acceptance script observes a holder actually
idle in its transaction and a second backend waiting on a PostgreSQL lock. It
then commits the holder and tests both winners: a block rejects the waiting new
booking; a booking forces the waiting block to request explicit preservation.
The race runs only against an explicitly marked loopback test database and is
part of the canonical database gate and its input receipt. All fixtures are
synthetic; no production guest or signed-in reference account is mutated.

This increment does not implement exceptional opening windows, overnight service
adapters, room/service quotas, table combinations, guest checkout, notifications
or staff invitations. These remain operating acceptance requirements. Backend
activation requires the new cohort's migration-scoped recovery-risk approval and
certified deployment. Merging code alone is not evidence of production delivery.

Week-planning candidate validation on 2026-10-20: canonical 196-migration Supabase
clean boot passed with all six Booking SQL suites, baseline authorization/race
contracts, the observed two-connection closure race, ACL/schema snapshots and
database lint. SQL acceptance includes original request replay after blocks,
metadata correction, allocation rejection, scoped/half-open boundaries,
explicit existing-booking preservation, revision conflicts, denied access,
actual spring/autumn durations, a service opening in the repeated hour,
nonexistent boundaries, 24:00 and saved-block replay after its date passes.
The generated release record chains from table layout and is not a deployment.

All 52 synthetic browser journeys passed, including week/day scope retention,
seven desktop columns/320px layout, existing-reservation acknowledgement and
removal, stale/incomplete/late weekly responses, Safety denial, ambiguous-time
selection and table focus, midnight closing, unknown closure exit/replay and
write timeout recovery. The week and native phone editor were visually inspected.
Web typecheck, lint (13 existing warnings), 42 contracts, 25 CI receipt/delivery
regression tests and the production build passed. Physical-device/restaurant
acceptance and the new migration cohort's production activation remain open.
