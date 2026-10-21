# Booking guest-link reissue

## Candidate and operator flow

Migration 208 (`20261021012134_booking_guest_link_reissue_v1.sql`) and the dependent Web candidate add explicit guest-link renewal for an existing future website reservation in `pending` or `confirmed` state. A saved, unexpired guest-access record is required. This builds on the mail worker and staff overview through 207. It applies no production migration, configures no sender or scheduler, and sends no real guest messages during verification.

The capability `guest_link_reissue` is advertised by the existing Console read RPC; old deployments keep it false. Owner, Manager and Host can review the currently saved recipient before selecting **Ja, neuen Gastlink vorbereiten**. Viewer cannot request issuance. The review explains that the old link becomes invalid, an in-flight email cannot be recalled, and the previously promised cancellation conditions remain intact. Successful acknowledgement means one new message intent is queued; it establishes neither provider acceptance nor delivery.

The service checks sender/domain/webhook readiness before replacing a credential. Dispatch must be enabled and the existing worker configuration must pass its actual provider checks. Missing configuration, an unready sender, invalid contact or sealing failure causes no new credential write. Read-only recovery of an earlier committed intent remains available without sender readiness or encryption keys.

This increment deliberately renews a link rather than offering a blind resend. It does not issue initial credentials for phone/email/operator bookings with no saved guest policy, extend expired links, reopen cancelled bookings, or send reminders or bulk messages. Those are remaining product work, not implied features of this control.

## Authorization and transaction boundaries

The HTTP entry point is `POST /api/booking/mail/reissue`, with same-origin JSON, no query parameters, a bounded 4 KiB/5-second body, and private/no-store/no-referrer/noindex replies. The caller's Bearer token is freshly checked with the existing server `ownerActor`/`getUser(token)` helper. No Billing or Owner-only authorization is invoked by that helper: current Booking roles determine access in SQL. Client-supplied actor identifiers and credentials are not accepted.

The service-only RPCs are:

- `booking_mail_reissue_recover_v1`: authorize the current actor and read an earlier outcome for exactly the reviewed intent.
- `booking_mail_reissue_context_v1`: validate the current reservation/revision/contact and return server-only creation context for encryption.
- `booking_mail_reissue_v1`: authorize again, deduplicate, validate current state, replace the capability and enqueue one message atomically.

The private `assert_console_actor_v1` is the common canonical role/Safety implementation for an explicit verified server actor and the existing Console's `auth.uid()` wrapper. It preserves restaurant ownership/member binding, read/write/manage/team scopes, revocation and ordered actor/owner Safety checks. It is not callable by clients. New public mutation/recovery functions are service-only; authenticated clients cannot inject key hashes, sealed keys or another actor. Current authorization is checked before returning an idempotent replay, including after ownership transfer.

All context/recovery/commit operations serialize on the restaurant root. The human intent fingerprint includes the actor, reservation, reviewed revision and exact contact fingerprint. It excludes newly randomized keys/ciphertext. A replay therefore returns the original committed result even if a retried server request generated different randomness. The existing complete-operation request registry is extended with `guest_reissue`; nonce collisions across booking creation, amendment, cancellation, transfer and reissue remain fenced.

Commit suppresses obsolete unattempted intents, parks attempted uncertain retries and supersedes in-flight sends without pretending to recall them. It replaces the capability, advances the reservation revision, appends exactly one changed-message intent and records the actual staff actor/role in the text-free reservation audit. Policy revision, cancellation minutes/deadline, expiry and original creation binding are preserved exactly. No guest name, contact, internal note, plaintext key or provider payload is copied into the audit or operation outcome.

## Contact and delivery binding

The review fingerprint hashes the exact contact bytes shown to the operator; browser/SQL Unicode case-folding differences cannot approve a different string. That fingerprint is separate from the immutable private recipient binding, which uses PostgreSQL's canonical lower/trim normalization. The gateway validates the server-only email and its exact fingerprint before generating a replacement key.

The outbox captures a private recipient hash when first prepared, or immediately for a new staff reissue. It becomes immutable. Provider bounce/complaint/suppression callbacks always retain their own delivery evidence, but block current guest mail only when the original bound recipient matches the reservation's current contact. A late callback for a former contact cannot suppress the corrected recipient's new message. A same-recipient delivery block cannot be cleared by reissue; a different known corrected recipient may be explicitly approved. Neither kind of delivery block automatically revokes guest self-service rights.

Old attempted payloads lacking a verified recipient binding require operational review before a new link can be issued. No migration guesses their recipient from a subsequently corrected contact. An existing legacy payload can acquire its binding at dispatch only when its frozen original context equals the current snapshot under the root lock. Unknown legacy callbacks remain conservative. This limitation matters before applying 208 to a queue that has already sent real mail.

## Uncertain writes and recovery

The browser durably saves the reviewed nonce/revision/contact fingerprint in tab-scoped session storage before any write. It stores no raw recipient, guest key, bearer token or encryption secret. The key is scoped to actor, restaurant and reservation. Unavailable or corrupt storage stops a fresh issuance instead of risking a new nonce after reload. Other reservation edits are withheld while that dialog has an unresolved issuance intent.

Network loss or malformed post-commit output remains explicitly unknown. Reopening/reloading the same tab offers only **Auftragsstatus prüfen** and **Denselben Auftrag wiederholen** for the original intent. Recovery without an outcome is not proof that an earlier request cannot still commit. Sender unavailability for a retry likewise does not settle an older unknown write.

The one safe terminal-negative recovery is canonical: while holding the same root lock, no registry entry plus a strictly later monotonic reservation revision proves that the old reviewed intent can no longer commit. The RPC returns a scoped `not_committed` resolution, which clears the browser intent and reloads current data without issuing another key. A real committed outcome takes precedence over that check and remains the original outcome even after subsequent changes. This proof depends on monotonic revisions and the non-evicted operation registry: future retention must preserve appropriate tombstones, and database restore requires reconciliation before dispatch is re-enabled. The latest reservation and mail overview must still be read for current state.

HTTP quotas are independent transactions (10/minute and 100/day per verified actor; 120/minute and 2,000/day globally). The commit also bounds successful reissues to three per reservation/day and 50 per actor/restaurant/day. Exact committed replays do not consume another successful reissue. These are launch limits, not evidence of large-scale restaurant throughput.

## Verification and activation boundary

- Full canonical clean boot through 208, all 25 Booking SQL suites, baseline authorization suites and real independent-session races passed on CLI 2.80.0 / PostgreSQL `17.6.1.095`.
- Final exact-byte receipt: `d11d227073feb1876e82a5b46abbf44a640b05da2315f881662cdf6c5472e90b`. Generated evidence: `delivery/database-releases/booking-guest-link-reissue-v1.json`, following `booking-mail-overview-v1`.
- New SQL coverage includes original terms/expiry, revision-zero issuance, randomized retry deduplication, role/Safety/ownership/revocation checks, blocked-recipient handling, legacy uncertainty, Unicode fingerprints, authenticated Host attribution, contact correction, old/new capabilities and late former-recipient bounce. Real races cover duplicate intents with different keys, contact edits and guest cancellation in both root-lock orders, and ownership transfer before replay.
- The explicit `web/tests-integration/booking-mail.mjs` test uses real local Auth admin fixture creation/login, fresh `getUser` verification, actual user/service PostgREST RPCs, real sealing/decryption and signed callback processing. It exercises a lost commit response, recovery without sender readiness, corrected contact/new guest key and a late old-recipient bounce. All four provider-send requests are intercepted; no actual provider is contacted. It tests handler functions plus real Auth/RPC networking, not deployment of the Next route or genuine SMTP delivery.
- All 93 Web contract tests passed, including the new request/outcome, fresh actor, randomized capability, readiness, unknown-write, Unicode fingerprint and key-free response checks.
- All 136 production-build browser journeys passed (130 Console and six guest). Ten new cases cover explicit recipient review, a 320-pixel phone with axe checks, unknown outcome across reload, exact nonce replay, terminal-negative resolution, unready/blocked/legacy refusals, Viewer/Host fencing, late replies after session change, and unavailable/corrupt tab storage. The phone screenshot was inspected.
- TypeScript, the production build, lint (13 existing warnings, no errors), canonical SQL secret scan and client secret boundary checks passed. The final database evidence-resume check must pass after this generated evidence is committed. Local logs use `/tmp/backyrd-mail-reissue-*`; final receipt/snapshot use `.local/gate-receipts/booking-mail-reissue-final-{receipt,snapshot}.json`.

The last verified production schema is 191. Existing separate integration approvals for #557/#565/#567 and production migration/recovery gates remain open; 208 does not authorize them. Its atomic CHECK replacement uses the existing compatible-replacement rule, without changing the classifier; only standard SQL spacing was corrected before publishing the migration. Public intake remains hard closed. Full recovery rehearsal, private Booking schema/ACL drift coverage, initial manual-booking confirmations, public checkout/publishing, broader guest records and a real restaurant/device pilot remain required before a practical Aleno comparison.

Authentication reference: [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser).
