# Booking mail worker and signed callbacks

Status: dependent development candidate after #567. Forward migration 206 is
required before enabling its worker. No production schema or sender settings
were changed, no provider was contacted for sends and no real guest received a
message during these tests. Public new-intake readiness is still false in source;
setting an environment flag cannot activate guest checkout or Owner publishing.

The guest management page and three proof-authenticated Booking endpoints bypass
consumer-session refresh explicitly, retaining private/no-store/no-referrer/
noindex headers. Stale consumer cookies or an Auth refresh outage must not block
capability-based guest access, worker authentication or provider callbacks.
Console and Owner surfaces keep their normal session handling; their
authorization and canonical Safety checks are not bypassed.

## Endpoints and transport

`GET` or empty `POST /api/booking/mail/dispatch` requires the dedicated worker
Bearer secret. It accepts no query parameters, recipient, message body or job ID.
An independent canonical quota allows one job/minute and 1,440/day; each job
processes at most eight queued messages. HTTP 200 reports accepted/deferred/
review/rejected/superseded counts, never delivery. An idle/blocked claim is not
proof that the entire queue is empty. Scheduling/deployment and real throughput
acceptance remain open; no personal Codex automation or production cron was
created as part of this source increment.

Before claiming mail, the server uses the same provider key to verify the exact
sender domain, enabled sending and disabled open/click tracking. It also checks
the registered webhook's exact endpoint, enabled status, all seven delivery
event subscriptions and the actual signing secret against its configured list.
Missing or failed readiness leaves the queue untouched. Provider calls are paced
at least 600 ms apart. Bounded HTTP/RPC deadlines and a 40-second processing
budget prevent a job from starting a send without enough time to finish its
recording. Deployment runtime must support the route's 60-second budget.

The trusted worker opens the context-bound guest capability, builds an escaped
German HTML/plain-text message and seals the complete immutable request with
AES-256-GCM before obtaining dispatch permission. The seal is bound to outbox ID
and body SHA-256. It freezes the sender, guest-link origin, stable application
scope and a fingerprint of the provider API key, in addition to the exact body.
No internal note or physical table assignment enters a message. Pending requests
are explicitly unconfirmed; messages use Swiss local time and the promised
cancellation deadline. A personal link always leads to the current reservation.

Retries reuse the stored encrypted request and provider key; they do not rebuild
content or randomize the seal. An unavailable old key, changed sender/origin/
scope/provider credential or corrupt prepared payload enters review. Migration
206 extends the existing finish RPC to quarantine an active pre-dispatch lease
without inventing a first attempt, provider rejection or acceptance. Transport
loss during prepare/begin leaves the lease for safe recovery; it never triggers
a speculative send. The 205 fixed retry window and attempt cap still apply.

`POST /api/booking/mail/events` reads at most 64 KiB with a deadline, then verifies
the original raw body using Svix's HMAC-SHA256 protocol, constant-time signature
comparison and a five-minute attempt-time tolerance. Parsing occurs after
authentication. A separate keyed outbox tag binds provider events to Booking;
unrelated messages on the same provider account are ignored. Only event ID,
outbox ID, provider ID, mapped event kind and occurrence time reach PostgreSQL.
Recipient lists, subjects, message bodies and raw payloads are not retained.

Database failures/unmatched genuine events return 503 so the provider can retry.
Acceptance is distinct from delivery; delivery means provider confirmation of
delivery to the recipient mail server, not a read receipt or guaranteed inbox
placement. `email.suppressed` is recorded as suppression, not falsely called a
bounce, and stops further mail for that reservation without revoking its guest
link. Stronger terminal states cannot regress through late weaker callbacks.

Callbacks remain available when dispatch or new intake is paused. They require
neither the provider API key nor the payload/guest decryption keys. Old webhook
and binding keys can coexist during rotation. Keep the application scope stable
for existing callbacks. Provider-key/sender/origin changes require queue review;
never blindly rebind unknown sends to another account or reset attempt clocks.

## Configuration

All following values are server-only. Never add `NEXT_PUBLIC_` to a secret name,
commit values, print the environment or copy real guest data into tests.

- Existing backend: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Canonical guest-link origin: `BOOKING_GUEST_ORIGIN` (one exact HTTPS origin).
- Dispatch: `BOOKING_MAIL_DISPATCH_ENABLED=true`, `BOOKING_MAIL_WORKER_SECRET`
  (at least 32 bytes), `BOOKING_RESEND_API_KEY`, `BOOKING_MAIL_FROM` (plain sender
  email), `BOOKING_MAIL_DOMAIN_ID`, `BOOKING_MAIL_WEBHOOK_ID`.
- Stable application scope: `BOOKING_MAIL_SCOPE` (ASCII label, 1–64 characters).
- Original guest keys: `BOOKING_GUEST_SEAL_ACTIVE` / `BOOKING_GUEST_SEAL_KEYS`.
- Payload encryption: `BOOKING_MAIL_SEAL_ACTIVE` / `BOOKING_MAIL_SEAL_KEYS`.
- Outbox binding: `BOOKING_MAIL_BINDING_ACTIVE` / `BOOKING_MAIL_BINDING_KEYS`.
- Callback signatures: `BOOKING_MAIL_WEBHOOK_SECRETS`, a JSON array of 1–8 actual
  provider `whsec_...` secrets, including still-valid rotation keys.

The key maps are JSON objects mapping bounded key IDs to canonical base64
32-byte keys. Keep guest, payload and binding purposes separately keyed and keep
old decryption/verification keys as long as existing links/mail/events need them.
The dedicated provider key must support the read-only domain/webhook readiness
checks and email sends. No provider mutation, plan upgrade or charge is initiated
by readiness checks. Validate quota/runtime/scheduler setup with the actual
account before launch; this candidate has not established that configuration.

## Revision-zero correction and validation

Canonical new reservations start at revision **0**. The original guest HTTP/
browser validator incorrectly required at least 1. This candidate accepts 0 for
receipts, cancellation requests and tab-restored uncertain cancellation IDs,
while continuing to reject negative/noninteger revisions. Creation replay still
returns the original recorded outcome; read-only recovery returns the current
state. Checkout must use current recovery/read before displaying a replay as a
current booking, especially after staff amendments or guest cancellation.

The isolated canonical boot passed all 206 migrations, 23 Booking SQL suites,
existing authorization suites and actual parallel claim/contact/dispatch races.
Database receipt:
`985d8c2f9e5c7ab2aafde6787b4971c30fc1a50c0b21f5bab66221a930c74be5`.
Generated release evidence: `booking-mail-worker-v1.json`.

`web/tests-integration/booking-mail.mjs` additionally exercises the real local
PostgREST service-role boundary: create/read/cancel at revision 0, immutable
encrypted preparation, intercepted provider acceptance, real signed callback
ingestion, out-of-order delivery, provider suppression and original/current
replay distinctions. It requires explicit disposable-database opt-in and matched
loopback API/DB ports. Invoke with the kept canonical CLI status variables
exported in the child environment, then
`BACKYRD_BOOKING_INTEGRATION_EPHEMERAL=1 node web/tests-integration/booking-mail.mjs`.
Provider calls in that script are always intercepted; production credentials and
real guest fixtures must never be used. Destroy the disposable database after
verification, rather than keeping its committed synthetic integration rows.

Current Web validation: 80 contract tests including 38 focused guest/mail tests,
the real local HTTP/RPC integration, TypeScript, lint (13 existing warnings, no
new-file warnings), production build and all six guest browser journeys against
that build, including revision-zero reload/retry, 320 px/axe and privacy headers.
Console runtime did not change; the prior 111 Console journeys are inherited
evidence, not a fresh mail acceptance run. The official Svix known signature
vector is tested in addition to forged/modified/stale/rotated callbacks.

Real sender/callback/scheduler acceptance, broader staff review actions, initial
manual-booking confirmations, reminders, public checkout/publishing, private schema/ACL drift,
the full recovery rehearsal and restaurant/device acceptance remain open.
Separate integration approvals for #557/#565/#567 and production migration/
recovery authorization remain outstanding. The 206 CHECK replacement uses the
existing compatible-replacement rule; it does not add another destructive scope.

Primary integration references:

- [Resend send-email contract](https://resend.com/docs/api-reference/emails/send-email)
- [Resend domain readiness](https://resend.com/docs/api-reference/domains/get-domain)
- [Resend webhook readiness](https://resend.com/docs/api-reference/webhooks/get-webhook)
- [Resend delivered-event contract](https://resend.com/docs/webhooks/emails/delivered)
- [Svix raw-body signature protocol and known vector](https://docs.svix.com/receiving/verifying-payloads/how-manual)

## Staff delivery evidence follow-up

The dependent 207 candidate adds a privacy-safe, role-scoped, on-demand Console overview of message intents and actual delivery evidence. See [BOOKING_MAIL_OVERVIEW.md](BOOKING_MAIL_OVERVIEW.md). It introduces no resend or guest-key reissue operation and does not activate dispatch.

## Recipient binding and guest-link renewal follow-up (208)

The dependent candidate freezes each prepared message’s normalized recipient hash and fences late provider callbacks from a former contact. Explicit staff renewal preserves saved guest terms and queues one audited new intent; see [BOOKING_GUEST_LINK_REISSUE.md](BOOKING_GUEST_LINK_REISSUE.md). Initial manual-booking confirmation, broader reconciliation and genuine production acceptance remain open.
