# Restaurant guest cards

Dependent candidate after reservation search. Production activation and real
restaurant/device acceptance are not implied. This is a contact-card foundation,
with a subsequent explicit reservation-association/history candidate. Broader
guest-record and Aleno-parity acceptance are not complete.

## Restaurant workflow

Staff can browse/search cards for the selected restaurant, create a name with
optional separate email/phone, correct those fields and inspect up to 20 recent
change records. Matching names/contacts do not create a shared identity and do
not merge cards. One-character names are supported. Query fragments are literal;
phone lookup also ignores common formatting separators. Lists show 25 recently
updated cards per page, not a unique-person or visit total.

Viewer can inspect active cards. Host can create/correct cards. Manager and
Owner can additionally archive/restore and inspect archived cards. Archiving
removes a card from active selection; its data remains stored. Existing bookings
are unchanged. It is not an access/deletion-request or retention-erasure flow.

An explicit contact choice copies name and email or phone into the ordinary new
reservation editor. The operator reviews and can adjust the copied values. The
normal current availability, conflict, revision and uncertain-write rules apply.
The original contact-card foundation stores no reservation identity link.
The subsequent association increment below adds an explicit staff choice;
card corrections still do not rewrite existing reservation facts. Selecting
contact data does not send a message or establish marketing consent.

The dependent inline-selection increment exposes the same active-card search
inside the new-reservation form. Search is explicit and paginated; Enter in its
query performs the search rather than submitting a reservation. Selecting a row
reads the current card again before presenting a contact choice. Archived,
missing, malformed or denied cards cannot be copied. Copy is explicit and
replaces only the draft name/contact, including clearing an absent contact;
party, date, time, table, source and internal note stay as entered. Nothing is
written to the card or previous bookings. Staff can cancel the selection, or
press Escape inside it, without discarding the reservation draft.

Search/detail requests are cancellable and fenced to the current authenticated
entry. Changing the query, closing the selection, going offline, starting a
reservation save or logging out clears pending private selection state; late
responses cannot restore it. The entry is absent on older backends without the
guest-card capability. No new RPC, schema migration or guest identity link is
introduced by the original inline-selection increment. The existing separate directory remains the
place for card creation/correction, rather than adding a second editor here.

## Explicit reservation association and history

Migration `20261021064302_booking_guest_reservation_history_v1.sql` adds the
`guest_history` capability, while retaining all older contracts. The snapshot
parser requires guest cards and table combinations when that capability is
advertised. Older backends keep copy-only behavior and show no history controls.

Choosing a saved card still copies values. New reservations offer a separate,
initially unchecked **Reservierung dieser Gästekarte zuordnen** checkbox. It
identifies the selected card and explains that saved booking name/contact are
independent facts. Changing copied text does not implicitly change identity.
Without the explicit choice, matching contacts remain unlinked. The directory
entry and inline picker both retain the selected card revision for review.

On capable backends the Console uses `booking_console_create_v3`, including an
explicit nullable card and expected authenticated actor. It wraps the existing
canonical v2 allocator/create in one transaction: booking, allocations, optional
association and original operation receipt either commit together or not at all.
A changed/archived/cross-venue card rejects the new operation before creation.
The draft is retained; the operator can reselect a current card or deliberately
uncheck association. After an unknown acknowledgement the complete original
booking/card intent stays frozen and only that exact nonce can be replayed.
Original replay precedes fresh-card checks, so a later card correction/archive
cannot overwrite a committed association or prevent original-result recovery.
Existing v1/v2 clients stay compatible; v3 refuses to adopt a nonce created by
an older endpoint. No guest data is backfilled or associated automatically.

In reservation details, **Gästekarte zur Reservierung** reads the current
association. Host/Manager/Owner can choose an active card, correct a mistaken
association or explicitly detach it; Viewer can inspect without write controls.
Each mutation checks the reservation revision, independent association revision,
selected card revision, expected JWT actor, current Owner/team and Safety.
No-op confirmation and exact replay do not add change events. Correction removes
the booking from the mistaken card's current history. The booking's name,
contact, status, time, table and existing public audit facts remain unchanged.

The guest-card view lists at most 25 currently associated reservations per page,
ordered by booking start time/id descending. It shows saved guest name, party,
time and actual booking status, without contacts or internal notes. Cancelled,
declined, no-show and future reservations remain those facts; they are never
counted as completed visits. Opening a row reloads its canonical restaurant day
and current reservation before showing details, using the existing search-target
path. A removed/missing row is handled honestly. Archived-card history follows
the existing Manager/Owner restriction. Host/Viewer viewing an already linked
archived card receive a generic archived label, with no current card name or
revision through the association endpoint.

The three additional private tables are `reservation_guests_v1` (current
association), `reservation_guest_requests_v1` (actor/Owner-bound fingerprints and
minimal original results) and `reservation_guest_events_v1` (up to 20 projected
actor/previous-card/current-card/revision/time events). They have RLS and no raw
anonymous, authenticated or worker grants. Reads use authenticated scoped RPCs;
no old contact values or names are copied into association receipts/events.
A new Owner sees no predecessor card, association or private association events.
They may deliberately associate a retained reservation with their own current
card, without inheriting or transferring the predecessor's directory. This does
not settle the separately open retention/handover policy.

Association writes recover the frozen exact request before dispatch. Failure of
that pre-dispatch read keeps the draft editable; a lost/malformed acknowledgement
after dispatch freezes it. Known conflicts require explicit reload before a new
request. Offline keeps local drafts and disables saving. Logout, role downgrade
and account-entry changes remove private state; identity guards also run between
recovery and dispatch, and before callbacks. Late empty recovery or denial from
a previous account cannot dispatch its old intent or clear a new account's draft.
Pending intents currently live only in the mounted editor. On exit/restart the
operator must inspect the canonical current association/book before a new action;
cross-restart recovery remains open.

## Schema and authorization

Migration `20261021051825_booking_guest_cards_v1.sql` adds three private tables:
`guest_cards_v1`, `guest_card_requests_v1` and `guest_card_events_v1`. RLS is enabled;
raw anonymous, authenticated and service-role table privileges are revoked.
The authenticated JSON RPCs reuse `assert_console_access_v1`, root locking,
current team roles and actual actor/owner Safety checks:

- `booking_console_guests_v1`: one bounded recent page and keyset cursor;
- `booking_console_guest_v1`: one current card plus bounded change metadata;
- `booking_console_guest_write_v1`: typed save/archive intent, revision compare,
  original-request replay and recovery of the exact same normalized intent.

The snapshot advertises `guest_cards`; older backends show no entry point.
Cards are scoped to restaurant and the current Owner account. An ownership
transfer does not expose a former Owner's directory to the new Owner. The old
rows remain isolated for a separately authorized retention/handover process;
this is an authorization fence, not a determination of legal data ownership.
No broader backfill, identity transfer, guest erasure or account association is
silently performed.

Each write authorizes before replay and serializes against owner/team changes.
The expected operator UUID must match the actual JWT subject; a refresh or
account switch cannot transfer a pending write to another account. Client
identity/entry guards also run between recovery, dispatch and callbacks, before
React unmount cleanup. The expectation is captured from the authenticated entry,
not an editable guest field.
Different requests cannot overwrite a newer revision. Retries return the
original id/revision/archive outcome even after later corrections. The journal
stores a scoped fingerprint and minimal result, not duplicate contact values.
Audit stores actor reference, action, field names and time, not prior contact
values. No AI invocation, guest ranking, blacklist or recommendation influence
is added. Real Volta data must never be development fixtures.

## Client failure and recovery behavior

Read requests have the existing bounded deadline and cancellation/generation
fences. Logout, revocation and role changes remove open private card state.
The editor keeps offline drafts, disables saving offline, and respects explicit
discard. A failed recovery read before any write leaves the draft editable.
After a lost/malformed write acknowledgement the exact request is frozen; retry
checks that same intent before replay, and fields remain disabled until settled
or explicitly left for review. A known revision conflict preserves the draft
until the operator chooses to discard it and read the current card.

Uncertain card intents currently live only in the mounted editor. After exit or
browser restart, staff must inspect the current directory before creating a new
card. Cross-restart recovery/fencing remains open. No background request resumes
a guest-card write automatically. Supabase response timestamps retain their
microseconds for keyset validation; millisecond truncation must not reject or
repeat cards updated within one millisecond.

## Verification and remaining acceptance

SQL coverage exercises actual Owner/Manager/Host/Viewer and outsider roles,
raw grants/RLS, exact replay after correction, stale revisions, no-op edits,
shared contacts, archive/restore, input bounds, tied cursor pages, owner Safety,
revocation and ownership handover. The existing two-connection Booking harness
adds concurrent identical creates, competing corrections, archive/edit in both
orders and an owner-transfer/replay fence. Actual SQL page/detail/audit/recovery
JSON is also passed through the Web codecs with rolled-back synthetic fixtures.
Seven contract cases cover strict fields/intents/outcomes, private-field
minimization, event/cursor bounds and real microsecond ordering.

Browser verification covers phone create/correct/copy, archive/restore, role
controls, uncertain acknowledgement, pre-dispatch recovery failure, conflicts,
offline drafts, pagination, logout, permissions and account switches while
recovery is pending (both a late empty result and late denial).

Final local candidate verification: 206 browser tests and 132 Web contract tests
passed. The canonical database gate passed all 29 Booking SQL suites, the
existing baseline/concurrency checks, five additional guest-card concurrency
cases and 20 private-schema drift checks. An actual SQL negative case rejects
an expected operator different from the JWT subject. Actual PostgreSQL JSON
passed the Web codecs. The actor-bound gate receipt is
`fd9ce5b4a9e8bae0ab3045a735ef8e0ba11b9ea2cdf4a3a28b86089a8fec8196`.
Web type checking and the supported Webpack production build passed; lint had
zero errors and 13 existing warnings. These use synthetic local fixtures, not
production activation or restaurant/device pilot evidence.

The inline-selection increment passed 216 Booking browser cases and all 132
Web contract cases. After the final compact-radio and keyboard-focus adjustment,
all ten targeted inline-selection cases passed again against a fresh Webpack
production build. The phone case verifies 320-pixel layout without horizontal
overflow, 20-pixel radio controls with the established label targets, keyboard
focus, no automated accessibility violations and a real ordinary booking through
the synthetic RPC fixture. The final build and type checking passed; lint still
has zero errors and 13 existing warnings. That inline-selection increment left
schema and database-gate inputs unchanged from the actor-bound guest-card receipt above; it did not establish populated
restore or restaurant/device pilot acceptance.

Remaining product work includes controlled duplicate-card identity resolution
and merge workflows, transparent preferences with
appropriate consent, retention/access/deletion handling, ownership handover,
cross-restart recovery and actual restaurant/device acceptance.

The subsequent populated logical-restore drill covers the three private guest
tables with three cards, seven original request receipts and seven metadata
events. All 387 source/target table digests, both schema/ACL scopes and 26 managed
controls matched. Actual role and Owner fences, correction/archive/restore,
stale revisions and original actor-bound replay after correction passed; actual
JSON passed the Web codecs. All 29 Booking SQL suites and media authorization
also passed on the restored target. See `BOOKING_BACKUP_RECOVERY.md`. This closes
the local populated guest-card logical-restore gap; encrypted cloud/Storage-byte
recovery and an approved actual reopening remain separate acceptance.

The association/history increment has passed all 30 Booking SQL suites and the
canonical baseline/races, including seven new actual two-connection cases:
identical create/replay, competing inventory rollback, card correction before
create, create before archive, competing association correction, booking amendment
before association, and Owner transfer before original replay. Its private scope
has 1,066 measured facts with fingerprint
`d35d619430c7fc41c5077d6fcd0cbe87d9a00bbc41ca8adf2cb62a8fd3147348`.
The new canonical gate receipt is
`950a0c46b2fb8aab100d6663fb90f2e8e1dbc9c7c28f48b14eee57ecfc155625`.
Actual PostgreSQL page/association/original-create JSON passes the Web codecs.
Six added Web contract cases cover intent/ack binding, redaction, microsecond
pagination, minimized statuses and explicit nullable atomic-create association.
All 138 Web contract cases and all 235 Booking browser cases passed, including
19 new association/history cases. They cover explicit versus copy-only creation,
canonical opening from history, correction/detach without saved-fact mutation,
Viewer restrictions, paging/cancellation facts, stale card/association handling,
pre-dispatch recovery-read failure, lost/malformed acknowledgements, offline,
three actual endpoint denials, logout, role downgrade and late recovery after an
account switch. Both 320-pixel creation/correction paths pass automated
accessibility and no-horizontal-overflow checks. Type checking and the supported
Webpack production build passed; lint has zero errors and 13 existing warnings.
These are local synthetic fixtures, not a restaurant or physical-device pilot.

The previously verified 387-table populated restore covered the contact-card
foundation. The three subsequent association/history tables still require their
own populated restore extension; the exporter discovers private tables but
export inclusion alone is not a restore proof. Restaurant/device, actual cloud
recovery and production activation remain open.
