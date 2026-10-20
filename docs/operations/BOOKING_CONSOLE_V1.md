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
inside a customer account. Before the larger Console redesign, inspect the
founder's signed-in Volta Bräu workflow for reservation creation, book/table-plan
switching and phone/tablet operation. Do not modify live reservations or copy
guest data during that inspection. Walk-in lifecycle, guest profiles and table
movement need explicit backend designs; they are not enabled by these UI changes.
