# Guest HTTP bridge and personal reservation page

Status: dependent development candidate after public-intake migration 203 and
owner-cleanup migration 204. This document describes source behavior, not a
production activation. No guest messages have been sent for acceptance testing.

## Boundary and credentials

`POST /api/booking/guest` accepts exact, bounded JSON DTOs for availability,
creation, read, recovery and cancellation. It accepts a single configured origin,
rejects query parameters/compressed bodies/cross-site requests, caps streamed
request bytes at 8 KiB and applies a read deadline. Replies are private/no-store,
no-referrer and noindex. Incoming cookies or Authorization headers are never
forwarded to the privileged database connection.

The server calls only an explicit RPC allowlist with a server-only service key.
Every accepted attempt first consumes the existing atomic launch-cost boundary
in a separate transaction, so a later rejected booking cannot refund its quota.
Read budgets are 40/minute and 800/day per subject, 600/minute and 20,000/day
globally; writes are 8/minute and 100/day per subject, 120/minute and 2,000/day
globally. These initial limits need traffic/restaurant acceptance before launch.
Subjects are HMACs, never plaintext IP addresses. On Vercel only the platform's
`x-vercel-forwarded-for` IP is used; otherwise all requests share the conservative
unattributed subject. Arbitrary forwarded IPs cannot create fresh buckets. Other
hosting needs an explicitly reviewed trusted-proxy design before scale-up.

Guest capabilities contain 32 random bytes, canonically encoded as unpadded
base64url. The database receives only SHA-256 of the decoded bytes and an
AES-256-GCM seal. Each seal has a random 12-byte IV, key version, authentication
tag and additional authenticated context binding the spot, creation request and
key hash. Retain old seal keys while any queued mail needs them; losing the key
ring is an operational recovery risk. Payload sealing is randomized, whereas
the database's logical request fingerprint remains stable.

The human-proof adapter validates Cloudflare Siteverify success, the exact
configured hostname and `booking_create` action with a bounded deadline. A new
proof may be needed for a retry because tokens expire and are single-use. The
booking request ID, key and logical form must remain unchanged for that retry.

## Personal guest link

`/booking/manage#id=<reservation UUID>&key=<capability>` carries the credential
only in the fragment. The page consumes and clears the fragment before fetching
reservation details. The server-rendered page and metadata contain no guest
details. No consumer login/profile is loaded for this page. Its HTTP headers and
metadata prevent referrer transmission and indexing. The capability and a
pending cancellation ID are stored only in sessionStorage for this tab, with an
in-memory fallback when storage is unavailable. No guest contact or note is
cached there. The page explains link authority and provides an explicit remove
action that does not cancel the booking.

Guests see pending versus confirmed status, the restaurant, their own name,
party and Swiss local time. Cancellation requires an explicit confirmation and
uses the saved revision. An uncertain result retains the exact request ID and
revision across reloads. Guests can read the current state or retry that same
request. A definite revision conflict requires reloading and a fresh decision;
it never silently reapplies cancellation to changed terms. Invalid/revoked links
clear the saved credential and disclose no reservation details. Reading or
cancelling an existing reservation does not require an active new-intake flag,
mail readiness, a fresh challenge or seal keys. Canonical database capability,
deadline and owner Safety checks still apply; HTTP does not bypass them.

The 203 candidate currently denies link access during an owner Safety
restriction. A support/human-policy review remains necessary before activation;
do not remove the canonical Safety assertion to work around this limitation.

## Configuration and activation

The server reads `BOOKING_GUEST_ORIGIN` (one exact HTTPS origin), the existing
`NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY`, and a
private `BOOKING_GUEST_RATE_SECRET` of at least 32 bytes. Development HTTP is
limited to localhost plus a local database. Optional future creation adapters
read `BOOKING_TURNSTILE_SECRET`, `BOOKING_GUEST_SEAL_ACTIVE` and
`BOOKING_GUEST_SEAL_KEYS` (JSON mapping key IDs to canonical base64 32-byte keys).
Do not put any of these secrets in a `NEXT_PUBLIC_` variable or document values.

**Production new-intake readiness is deliberately false in source.** No
environment flag can turn it on before the immutable mail dispatcher, verified
sender, callbacks and retry acceptance exist. Availability and creation return
an honest unavailable state. The public date/party/time checkout and Owner
publishing/readiness controls are still open. Existing-link read/recovery/cancel
remain independently usable once the approved schema and server configuration
are available. This candidate does not apply migrations, publish a restaurant,
send messages or imply that the production schema has advanced past 191.

Network loss or an invalid response after a write dispatch returns an explicit
unknown outcome; it never promises failure or success. Database error details,
contact information, notes, physical inventory and raw keys are not returned.
The browser must not create a fresh booking after an unknown create outcome;
read-only recovery uses the original request and key. A recovery miss alone
does not prove that a concurrent request cannot still commit.

## Validation and sources

The gateway tests exercise the real TypeScript handler/security modules with
synthetic transports and actual Request/Response streams: strict DTOs, byte
limits/timeouts, seal authentication/rotation, trusted IP handling, proof scope,
closed intake with continued link access, independent quotas, unknown writes,
response identity fences and stable logical retry. Browser cases exercise
personal-link privacy, mobile layout/accessibility, pending requests, explicit
cancellation, unknown-write reload/retry, stale revisions and credential removal.
These tests do not establish real mail delivery, real Siteverify deployment or
restaurant acceptance. Prior canonical 21-suite SQL evidence covers the unchanged
database RPCs; this increment adds no migration.

Primary integration references:

- [Vercel request headers](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for)
- [Cloudflare server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

Local checkpoint (2026-10-21): 19 focused gateway/security/browser-transport
tests passed within 61 Web contract tests; all 111 existing Console browser
journeys passed. All six new guest journeys passed against the development
server and again against the final production build, including an axe check
and no-overflow check at 320 px. The production pass verifies no-store,
no-referrer and noindex HTTP headers. TypeScript, production build and lint
passed (13 pre-existing lint warnings, no errors or new-file warnings). The
synthetic cancelled-reservation phone screenshot was visually inspected.

Production activation also requires approved migration risk gates, scoped
private-Booking schema/ACL drift validation, the recovery rehearsal, genuine
sender/challenge/key setup and an explicitly agreed restaurant pilot.
