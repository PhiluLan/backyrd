# Booking in the mobile app (candidate after 209)

This increment adds the dedicated Booking tab requested for Backyrd. It is an implemented candidate, not a production app release or an Aleno parity claim.

## User journey

Guests and signed-in users can explicitly add the personal management link from their booking email. Import accepts only exact HTTPS `backyrd.ch` / `www.backyrd.ch` management links with one reservation UUID and one canonical capability in the fragment. It never navigates a supplied URL, reads the clipboard automatically, claims a booking from matching email, creates a reservation or enrolls the user in marketing.

The app shows current restaurant/guest/date/party/status and original saved conditions. Pending requests remain visibly unconfirmed. Status is refreshed on entering the foreground/tab and through explicit refresh, with three concurrent reads at most. The local read time is visible and a stale or failed read cannot enable a fresh cancellation. A new cancellation first reads current details for the explicit confirmation; the backend still enforces the original cancellation deadline and reservation revision.

Removing a saved link is a local operation, distinct from cancellation. Sharing requires a separate review of the capability's access implications and opens the system sharing interface; the app never claims a message was sent. Invalid/revoked links clear cached guest details and stay as explicit local recovery entries rather than inventing a cancellation. A corrupt index is an error, not an empty list. An unreadable individual record stays visible for explicit reimport/removal.

## Storage and identity

Native credentials and cancellation intents use the already-installed Expo SecureStore, with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and a dedicated keychain service. There is no AsyncStorage/plain-file fallback. The web preview uses tab-scoped sessionStorage, not a claim of native Keychain security. The SHA256 namespace binds the API origin and the current account UUID (or the separate guest scope); the screen remounts on actor change. Adding a guest link does not automatically transfer it into a subsequent signed-in scope, link it to an account server-side or synchronize another device.

The encrypted index has at most 20 UUIDs. Each credential is a separate small record containing only reservation ID, capability and optional cancellation nonce/revision. Names, contacts, conditions and receipts are not persisted. Record/index writes are serialized across repository instances and verified before cancellation dispatch. Partial new imports retain a visible index slot; unknown cancellations are never evicted. Removal verifies record deletion before removing its index entry. Native device storage can fail or be lost; the booking email remains the recovery source, and the app must not promise recovery from reinstall or device restore.

The screen redacts on loss of tab focus or foreground activity, clears link-input text, fences late UI responses and preserves already-dispatched intents. A background mask is not a verified guarantee about OS task-switcher snapshots; physical-device privacy testing remains open.

## Networking and transaction recovery

Web and mobile now share the canonical validated guest DTOs and HTTP outcome/scope handling in `packages/shared/src/contracts/booking-guest*.ts`. Existing Web module paths are compatible re-exports/adapters. The shared transport uses a bounded AbortController deadline rather than depending on native support for `AbortSignal.timeout`.

Native uses explicit `expo/fetch`. The installed SDK's iOS/Android implementations were inspected for cookie omission and rejection of redirects; RN's legacy fetch documents limitations for those options. Production requests target exactly `https://www.backyrd.ch/api/booking/guest` and carry the canonical Origin header. Credentials remain in JSON, never query strings, router parameters, analytics, logs or ordinary external navigation. Anonymous capability authorization, Safety, quotas and revision checks remain on the existing canonical HTTP/RPC path; no new database grants, policies, tables or functions are introduced.

The apex currently redirects to `www`; native requests do not follow that redirect with credentials. Development requires an explicit isolated HTTPS origin, with loopback HTTP allowed for local browser tests; it cannot fall back to Backyrd production. Unknown app variants and conflicting production origin configuration fail closed. The first local smoke test detected a stale cached Expo manifest identifying the dev export as prod; a clean export corrected that mismatch before acceptance. Verify configuration in actual artifacts when changing Expo build environments.

Before cancellation dispatch, a stable UUID and expected reservation revision must be durably saved. Unknown writes retain that intent across app restart. Retrying first performs a read; a current root-locked higher revision (or cancelled status) fences the older compare-and-set, allowing a new explicit decision. Missing/unavailable/unchanged reads cannot release it. A quota rejection of a retry cannot prove the earlier request failed. Positive ACKs are followed by current receipt reads before displaying success. Native and Web both preserve the original uncertain intent on retry rejection; Web additionally recognizes the same authoritative higher-revision fence.

Backend proof for that fence: `booking_private.authorize_guest_v1` locks the restaurant root, refreshes the reservation after waiting, and checks current capability/expiry/Safety; `booking_guest_cancel_v1` checks replay then the captured expected revision before mutation. Reservation revisions are monotonically advanced by canonical writes. This increment reuses the parent 209 database evidence rather than claiming a new database migration or fresh native end-to-end SQL run.

## Validation and limitations

Run the Mobile contract chain (including `npm run test:booking`), Mobile/Web/shared TypeScript, Mobile/Web lint, the production Web build and an isolated Expo export for iOS, Android and web. The wallet/service tests exercise hostile links, actor/environment partitioning, concurrent import, capacity, corrupt/partial storage, original-nonce recovery after restart/quota errors, stale responses, current revision fences and post-ACK read failure. The opt-in `web/e2e/booking-mobile.spec.ts` runs the actual exported app with intercepted synthetic backend responses; default Web jobs skip it when no explicit Mobile test origin is supplied.

The local test export uses synthetic Supabase URL/public placeholder and local Booking origin, with all test requests intercepted. It is not a distributable production artifact. Native Hermes bundles are build evidence; browser tests of React Native Web and mocked transport are not proof of actual iOS/Android Keychain, ATS/TLS, app-switcher privacy, network redirects or store delivery. No production migration, OTA, store build, guest email, real booking or provider delivery was executed here.

New public intake remains hard closed by the server adapter. Outstanding work includes automatic association of authorized account bookings, a smooth checkout-to-app handoff, initial manual guest communication, guest directory/privacy lifecycle, full private-Booking drift/restore proof, operational acceptance and a real restaurant multi-device pilot. Manual link import is a usable first app workflow, not a substitute for those outstanding journeys.

Vendor references: [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [Expo fetch](https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api), [React Native networking limitations](https://reactnative.dev/docs/network#known-issues-with-fetch-and-cookie-based-authentication). Installed SDK source, lockfile and local tests take precedence over the current docs' newer SDK version.

### Reproduce the isolated app browser acceptance

From `mobile/`, export with synthetic settings (never production credentials):

```sh
APP_VARIANT=dev \
EXPO_PUBLIC_SUPABASE_URL=https://booking-mobile-test.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=booking-local-public-placeholder \
EXPO_PUBLIC_BOOKING_ORIGIN=http://127.0.0.1:4175 \
CI=1 npx expo export --clear --platform all --max-workers 2 --output-dir dist
node scripts/serve-web.mjs 4175
```

In another terminal from the repository root:

```sh
MOBILE_BOOKING_TEST_BASE_URL=http://127.0.0.1:4175 \
npm --workspace web run test:e2e -- e2e/booking-mobile.spec.ts
```

The tests wait until the startup overlay actually releases the controls, intercept the synthetic Supabase/Booking requests, and use only synthetic user/capability fixtures. Run the standard Mobile contract chain via `npm --prefix mobile run test:contracts`; `test:booking` is included in it. Stop the local server after acceptance. A test export is not a production release command.

### Final local acceptance

- **13/13** actual Expo-export browser journeys passed, including guest and signed-in 320px layouts, complete tab text (measured against clipping ancestors), retained moment touch target, accessibility of the Booking surface, pending/confirmed distinction, original terms, unknown cancellation across reload, fresh confirmation revisions, storage failures, invalid/revoked credentials, local-only removal and returning to an in-flight write without replaying a late private view.
- **16/16** new wallet/service tests and the complete standard Mobile contract chain passed. The final credential read explicitly refuses a record removed between the last two reads; it cannot fall back to a forgotten cached capability.
- **101/101** Web contract tests and **156/156** Booking Web browser journeys passed. Both surfaces retain an unknown cancellation on a quota-rejected retry and can settle it using a current higher revision.
- Mobile, Web and shared TypeScript; Web production build; isolated iOS/Android Hermes and Web exports; canonical secret scan and client-secret boundary all passed. Lint has no errors, one unchanged Mobile warning and 13 unchanged Web warnings.
- The parent 209 exact-input database receipt still validates (`resume-evidence: PASS`, SHA256 `1e6445b07ad4d51e0440d1ca36bbfbaa88ef7edc1db2842408ae7356ad993188`). No new database execution or migration is claimed by this client-only increment.

Actual iOS/Android execution, native secure-storage and network behavior, account-wide association, store/OTA release, production server readiness and restaurant pilot acceptance remain unverified. The mock app browser results must not be represented as physical-device or production evidence.
