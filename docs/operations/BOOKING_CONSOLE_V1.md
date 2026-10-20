# Backyrd Booking Console v1

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
