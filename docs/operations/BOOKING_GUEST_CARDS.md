# Restaurant guest cards

Dependent candidate after reservation search. Production activation and real
restaurant/device acceptance are not implied. This is a contact-card foundation,
not completion of the broader guest-record or Aleno-parity acceptance.

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
No reservation-to-profile identity link is inferred or stored in this increment;
card corrections therefore do not rewrite existing reservation facts. Selecting
contact data does not send a message or establish marketing consent.

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
offline drafts, pagination, logout and permissions. Record final results only
after the corresponding run completes.

Remaining product work includes explicit reservation linkage and history,
controlled identity merge/correction workflows, transparent preferences with
appropriate consent, retention/access/deletion handling, ownership handover,
search-assisted selection directly inside reservation forms, cross-restart
recovery and actual restaurant/device acceptance. The new private tables must
also be included in the next populated guest-card backup/restore rehearsal;
the existing logical-restore evidence predates this schema increment.
