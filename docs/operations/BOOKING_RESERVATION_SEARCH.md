# Restaurant-wide reservation search

Dependent candidate after the service-attention review. Not a production
activation or evidence of Aleno parity.

## Restaurant workflow

“Reservierungen finden” searches the selected restaurant across a chosen date
range, independent of the book's current room, service, status and name filters.
The operator submits a name, email or phone fragment explicitly. At least three
characters, at most 120 Unicode characters and at most 366 inclusive calendar
days are accepted. Empty searches and control characters are rejected. Literal
percent/underscore characters do not become SQL wildcard operators. Phone-only
queries also compare digits across common formatting separators.

Each result represents one reservation. Matching contacts are not evidence of
one guest identity. The result shows recorded name/contact, Zurich date/time,
party size and saved status; notes are neither searched nor returned. Viewer
access includes inspection, not mutation. Selecting a result reloads its actual
day and opens the existing reservation panel only if it remains present.
Existing lifecycle, amendment, conflict and uncertain-write rules still apply.
If it disappeared or the read fails, the UI does not open a stale detail.

Search results are paged in groups of 25 using `(starts_at,id)`. Each page is a
fresh authorized read, not an immutable snapshot or a total guest count; concurrent
amendments can move a reservation between pages. Search again to review the
latest order. Only one page remains in component state. Editing the query/range
invalidates its results and cancels the in-flight request. Offline clears the
search results and requires a new explicit search after reconnecting. Closing
search preserves the book's filters and discards the local query/results.
Queries are not put in URLs, persisted in browser storage, or logged by this UI.

## Backend and authorization

Migration `20261021045215_booking_console_reservation_search_v1.sql` adds the
read-only authenticated RPC `booking_console_search_v1` and the explicit
`reservation_search` snapshot capability. It adds no table, raw table grant,
profile matching, guest link, retention job or message dispatch. Old snapshots
without the capability do not show the entry point.

The canonical `assert_console_access_v1(...,'read')` performs restaurant role,
current-owner and actual Safety checks under the shared restaurant lock before
validation/data lookup. Anonymous execution is revoked. Delegated raw table
reads remain denied by existing RLS. A revoked team member or unrelated actor
cannot continue by changing date, cursor or restaurant arguments.

The range uses `[Zurich midnight(from), Zurich midnight(to+1))`, including DST
days of 23 or 25 hours. The server bounds its materialized result to 26 rows,
returns 25, and ties any continuation to the last returned key. The browser
validates actual calendar days, field bounds, statuses, unique IDs, monotonic
keys, page length and cursor progress. Parent identity/generation fences and
component abort cleanup prevent a late read from restoring private state after
logout, a role change or search editing.

## Verification and remaining product work

SQL acceptance covers actual role execution, cross-restaurant and outsider
reads, anonymous grants, raw RLS, revoked membership, owner Safety, literal query
semantics, formatted phone matching, result minimization, tied-start pagination,
range/cursor limits and the 25-hour Zurich day. It rolls back synthetic fixtures.
Six Web contract cases cover boundary parsing and the actual read-RPC arguments.
Browser acceptance includes phone rendering/axe, canonical cross-day opening,
bounded pages, filter preservation, delayed responses, offline, Viewer access,
malformed/denied results, missing current reservations and logout/revocation.

This is reservation lookup, not the completed guest-record capability. Explicit
reusable profiles, corrected identities, transparent preferences/history,
authorised linking/merging, retention and access/deletion handling remain open.
No guest data is exported to Aleno or AI; real Volta data must not be fixtures.
Production authorization, a real-device test and restaurant-shift acceptance are
still required. The default Turbopack subprocess port is unavailable in this
local environment; the supported Webpack production build is used for browser
acceptance without changing the repository's default build configuration.
