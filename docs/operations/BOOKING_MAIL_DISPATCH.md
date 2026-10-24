# Transactional Booking mail dispatch

Status: migration 205 development candidate, dependent on the Booking chain
through guest HTTP/self-service #566. This increment defines and tests the
database dispatch boundary. It does not deploy a worker, verify a sender, send
mail or activate public intake. The HTTP adapter remains closed for new intake.

## Canonical operation

Creation and relevant amendments/cancellation already enqueue one intent per
reservation revision/event in the 203 candidate. The dispatch extension keeps
that canonical outbox and adds service-only operations:

1. `booking_mail_claim_v1(lease_id)` acquires a 90-second lease. Workers use fresh
   UUIDs; retrying an active claim with the same UUID does not extend its clock.
   Restaurant roots and outbox rows are locked in the same order as booking
   writes. `SKIP LOCKED` lets a competing worker skip a busy restaurant. A call
   inspects at most 64 candidates; a null result is not proof of an empty queue.
2. The trusted worker must build and encrypt an immutable provider request from
   the scoped snapshot, then call `booking_mail_prepare_v1(id, lease, context,
   sealed_payload, digest)`. No note or physical table assignment is in the
   snapshot. Metadata-only revisions do not drop the initial confirmation.
   Context timestamps are normalized to UTC, independent of SQL session zone.
   The original guest link is still sealed and bound to its creation request.
3. `booking_mail_begin_v1(id, lease, digest)` rechecks canonical guest access,
   current owner Safety and snapshot context under the restaurant lock. It
   records the first attempt, increments the bounded attempt count and changes
   the state to `sending` before any provider request. It returns the frozen
   payload and stable `backyrd-booking/<outbox UUID>` provider key. Repeating the
   same active begin returns the same body/window without another attempt.
4. `booking_mail_finish_v1` records provider acceptance, definite rejection, a
   retryable unknown result or manual review. Acceptance means `accepted`, never
   `delivered`. A stale lease cannot acknowledge a newer worker's attempt.
5. `booking_mail_event_v1` ingests only a provider-signature-verified minimal DTO
   through the privileged service channel. It binds the provider ID once and
   deduplicates event IDs, rejecting changed event replays. Late acceptance does
   not regress delivery, and a late delivery does not hide a bounce/complaint.
   A callback may establish acceptance/delivery before the send response arrives.
   Raw provider payloads, recipient lists and message bodies are not retained in
   the event ledger. The public HTTP signature verifier is still follow-up work.

All new RPCs revoke PUBLIC, anon and authenticated execution; events use RLS
with no client grants. Snapshot helpers and payload immutability guards are not
client-callable. This is trusted infrastructure access, not a staff invitation
or owner privilege. Service credentials must remain server-only.

## Dispatch is an irreversible boundary

Before `begin`, contact or relevant public changes suppress an unattempted
message, and a stale lease/context cannot dispatch it. After `begin`, an external
request may already be in flight. A contact correction marks it superseded and
forbids retries but cannot recall that request. Its eventual acceptance/delivery
is still recorded honestly. An attempted, unknown message waiting to retry is
routed to `review_required`, rather than being mislabeled definitely unsent.

Staff copy and future support screens must explain this boundary. Never promise
that an already dispatched message can be withdrawn. Contact changes still
revoke the old self-service key; this increment does not invent a replacement
link or silently notify a newly entered recipient.

Bounce or complaint blocks further mail for that reservation and suppresses its
waiting intents. It does not revoke the guest's self-service access. This is
transactional delivery handling, not marketing consent or a reusable guest-wide
suppression directory. Broader identity, retention and consent handling remain
separate launch work.

## Bounded recovery and payload freeze

Resend retains idempotency keys for 24 hours. Automatic retries stop 23 hours
after the first recorded attempt, with at most eight dispatch attempts. Backoff
starts at 30 seconds, doubles and is capped at one hour. Unknown outcomes beyond
that window, exhausted attempts, invalid context and superseded in-flight sends
go to review; a worker must never reset `first_attempt_at` to obtain another
provider-key window. Provider IDs, prepared payloads/context/digests and the
first attempt timestamp are protected against rewriting by a database trigger.

The future worker must encrypt the exact immutable request before `begin`,
including the verified sender and provider-account scope, use the frozen body
on every retry and refuse account-scope changes. Randomized re-encryption cannot
replace an already prepared payload. Recover the stored seal after an uncertain
prepare. Key rotation must retain old decryption keys while pending messages
need them. Losing keys or changing provider account requires an operational
review, not blind re-sending. No provider keys or plaintext guest links belong
in the database event ledger, logs or browser bundles.

The migration takes bounded locks with 5-second lock and 60-second statement
timeouts and refuses an outbox larger than 5,000 rows before DDL. A larger
existing queue requires an explicitly staged rollout. No reservation rows or
guest records are deleted or rewritten by this migration. Private Booking
schema/ACL drift verification and the full recovery rehearsal remain release
requirements; the existing generic application fingerprint does not cover the
whole private schema.

## Validation scope and remaining work

The new SQL suite checks actual client denial, service-only positive paths,
metadata-only confirmation preservation, session-zone-independent context,
immutable payload preparation, stable begin replay, obsolete-recipient retry
prevention, early/out-of-order callbacks, provider/event identity fences,
bounce/complaint handling without revoking guest access, lease fencing, delayed
retry and the expired provider window. The canonical race harness additionally
uses real independent PostgreSQL sessions to verify nonblocking competing claims
and contact correction versus dispatch in both lock orders. All fixtures are
synthetic; no provider is contacted by these checks.

The actual encrypted worker/envelope, verified-sender readiness, signed HTTP
callback, deployment/scheduling, staff delivery/review UI, reminders and real
restaurant communication acceptance are still required. The guest checkout and
Owner publish controls remain closed until those acceptance conditions hold.
Do not infer production approval from a passing isolated migration run.

Canonical local checkpoint (2026-10-21): all 205 migrations booted on the pinned
PostgreSQL 17.6.1.095 / Supabase CLI 2.80.0 runtime; all 22 Booking SQL suites and
the real claim/contact/dispatch races passed, along with the existing canonical
authorization suites and expected SQL-lint baseline. The final full database
execution receipt is
`ff2633a60fc1f067ada745fd90a2e9dcb8491dad4a24395d8e138b8a31042da0`.
Release evidence: `booking-guest-mail-dispatch-v1.json`. No Web runtime changed;
the inherited 61 Web contracts and 117 browser journeys are unchanged-runtime
evidence from #566, not new mail-delivery acceptance. An initial concurrency
harness failure was traced to psql suppressing an intermediate `-c` result;
stdin-based result capture passed a targeted real-session probe and the final
clean boot. No database bypass was added to make that test pass.

Primary references:

- [Resend idempotency window and immutable request retries](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend raw-body webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [PostgreSQL row locking and SKIP LOCKED](https://www.postgresql.org/docs/17/sql-select.html)

Integration approval is still separate from passing execution. The existing
`scripts/ci/classify-change.mjs` also classifies 205's atomic replacement of the
outbox status CHECK constraint as requiring Founder authorization, because the
DROP/ADD occurs in a combined ALTER statement. This replacement expands the
allowed delivery states and does not delete reservation/guest data. It must be
included explicitly alongside the pending #557 closure-configuration removal
and #565 former-owner policy cleanup; their previous approval question does not
authorize this additional operation. Do not weaken the classifier or rewrite
the published migration/evidence to hide it. Production migration/recovery
approval remains a separate outstanding decision.
