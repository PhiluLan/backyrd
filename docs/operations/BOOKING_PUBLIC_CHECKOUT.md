# Public checkout and restaurant booking rules (candidate 209)

Implemented candidate, dependent on 208. Not production activation and not an Aleno parity claim.

## Guest journey

`/booking/<spot UUID>` is an anonymous restaurant booking route. Date, party size and actual eligible slots precede contact details, original restaurant conditions, explicit review and server-verified human proof. Requests awaiting staff approval are distinct from confirmed reservations. Swiss dates and ambiguous autumn clock times carry the applicable offset. The internal planned occupancy end is not promised as a guest departure deadline.

These exact routes and `/booking/manage` do not depend on consumer profile/session loading. Console and Owner routes retain authentication. Credentials travel only in HTTPS request bodies or local fragment links, never query strings. Pages and guest endpoints retain no-store/no-referrer/noindex protections. Per-reservation management storage preserves a prior uncertain cancellation when another reservation is opened or forgotten.

Before a create or cancellation can be sent, its stable nonce and intent must be verifiably stored in tab-scoped sessionStorage. Storage failure blocks the mutation. Pending checkout includes contact details, original terms and a random 32-byte capability; after a known successful create, the stored checkout becomes a minimal reservation/capability pointer. No human-proof token is stored. Browser restart, tab closure and clearing website data are not durable server recovery guarantees; the UI must not claim they are.

A lost acknowledgement freezes the same intent. Reload and status checks only read; retry uses the original request and a new proof. A missing recovery row does not prove failure. The new recovery RPC releases an absent request only when its original start is past or an eligible, publicly observable later policy revision prevents that original request committing. Paused/unpublished policy revisions are not disclosed to anonymous callers. Current receipts are read after create replay before displaying status, so a historical acknowledgement cannot overwrite a subsequent staff cancellation.

## Restaurant rules

Owner/Manager controls appear only with backend `public_booking` capability. Host/Viewer cannot manage them. Services, lead time, booking horizon, cancellation window, immediate confirmation versus request review, privacy contact and guest notice are editable. Numeric drafts permit an empty value, including deletion of zero. The interface explicitly says preparation does not constitute public activation.

The v2 save journals an actor-bound nonce and exact intent under the canonical restaurant lock, alongside an expected root revision. Exact retries settle once. A later root revision proves an unjournaled older request cannot subsequently commit. Conflicting drafts stay visible until explicit discard/reload. Every recovery checks current authorization and Safety, including after ownership changes. Old-owner configuration is hidden from the current-owner read projection. SQL v1 remains compatible.

New guest credentials freeze their original conditions, and reissue preserves them. Historical rows have null snapshots; no invented backfill. The original cancellation deadline is retained. Guest receipt registry capacity increases from 2 to 8 KiB to accommodate valid multilingual conditions; existing outcomes remain valid. The migration uses the unchanged classifier's recognized atomic CHECK replacement. No new destructive authorization scope is introduced.

## Activation boundary

`newIntakeReady` remains hard false in the server adapter. Setting the restaurant switch or a public Turnstile site key cannot bypass it. No production DDL, new live intake, real guest fixture or actual provider message was executed in this increment.

Before activation, complete the dependent migration release gates and production authorization, proven restore/reconciliation procedure, sender/domain and provider callback acceptance, scheduler/dispatch operation, real Turnstile host/action verification, public terms/privacy review, and a restaurant pilot on actual devices. The environment variable `NEXT_PUBLIC_BOOKING_TURNSTILE_SITE_KEY` is a public site key, not a secret; use the correct restricted production hostname. The server's independent verification remains mandatory. Client tokens are single use and expire; expiration resets submit readiness. A 320px phone uses the compact widget. Tests intercept the SDK and provider and do not prove real Cloudflare or SMTP delivery.

Authoritative vendor references: [client rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/), [server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [widget configuration](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/).

## Verification

Canonical fresh boot through 209: 26 Booking SQL suites, baseline authorization checks and actual independent-transaction races including public-settings save/replay versus legacy writers. Receipt SHA256: `1e6445b07ad4d51e0440d1ca36bbfbaa88ef7edc1db2842408ae7356ad993188`.

Actual local HTTP/Auth/PostgREST integration verifies required policy review, immutable conditions, actor-bound publication replay/recovery and public negative settlement without paused-policy disclosure, alongside the existing guest/mail/reissue/callback lifecycle. Four provider calls are intercepted; no real messages are sent. Web contracts, TypeScript, lint, production build and synthetic production-browser tests cover client failure and recovery separately. See the PR for final counts and limitations.

Open product work includes initial operator-created guest communication, guest directory and privacy lifecycle, service reports, the dedicated mobile Booking tab, generic private-Booking drift coverage, full restore rehearsal and measured restaurant pilot acceptance. This increment does not close those gaps.

Final local acceptance for this increment: **154/154** synthetic production-browser cases (135 Console, 9 guest management, 10 public checkout), **101/101** Web contract tests, TypeScript, production build, lint with 13 unchanged warnings/no errors, canonical secret scan and client-secret boundary all passed. The production-browser run includes 320px layouts, accessibility checks on checkout, original-conditions review, pending versus confirmed, historical create versus current cancelled receipt, lost acknowledgements/reload, proof expiry, tab-storage failure, multi-reservation cancellation preservation and operator conflict/replay/role restrictions. A malformed new test fixture was corrected to use the actual settings `revision` contract; the final full run passed after the phone overflow and uncertain-cancellation storage fixes.

The release manifest was validated against the unchanged exact-input clean-boot receipt (`resume-evidence: PASS`). The disposable database was stopped and its temporary workspace removed after real HTTP/Auth/RPC integration passed. Draft [PR #571](https://github.com/PhiluLan/backyrd/pull/571) remains dependent on #570. GitHub's risk/classification gates still reject the preceding destructive migration scopes pending separate authorization; Vercel reports its build quota limit. Required remote Web/database jobs were skipped behind that gate, so local passes must not be represented as a green remote CI run or a deployment.
