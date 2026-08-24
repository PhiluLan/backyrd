# Mobile Production Validation

## Automated gates

- Strict TypeScript: pass
- Expo lint: pass, zero warnings
- Expo Doctor: 18/18 checks pass
- Mobile Product contract suite: pass
- Forbidden legacy/client-secret scan: pass
- iOS Hermes Production export: pass
- Git whitespace validation: pass
- EAS Production environment: Maps present; iOS/Web OAuth configured; obsolete public OpenAI key removed
- Production dependency audit: all non-breaking fixes applied; remaining advisories are Expo/Metro build-tool transitives whose automated fix requires an unsupported breaking Expo 57 upgrade

## Contract coverage

- Fresh/COLD/EARLY users use North-Star or receive an honest error; never Legacy Ranking.
- Home free text reaches canonical Decision.
- Server reasons render without client invention or fake percentage.
- Visible card creates exposure; unseen payload candidates do not.
- Neutral browsing creates no Taste event.
- Explicit feedback is Decision/spot-bound and has no parallel legacy write.
- Route creates navigation intent.
- Trigger-created profile is read with bounded retry; onboarding writes remain RPC-owned.
- Badge sync is authenticated, self-only, idempotent, and server-authoritative.
- Missing Production configuration fails before release.

## Release acceptance

The prior first-launch-after-OTA failure is closed at its code root: JavaScript no longer initiates a reload after Tabs/Auth/providers have mounted. A new native runtime is required to validate the changed Expo launch contract cleanly.

Final Production acceptance remains intentionally open until the single native TestFlight release candidate is installed and verified on a real iPhone for: first and second launch, signup/onboarding, Home Decision, neutral browsing, explicit feedback, route, continuation, logout/login, offline recovery, and internal Release Status. No Production OTA is published as a substitute for this test.

Visual device capture against supplied references is also pending because the referenced images were not attached to the task context.

## Production boundary change

Migration `20260824235900_harden_mobile_achievement_sync_v1.sql` is applied. The Production schema linter reports no finding for the new function; its output still contains pre-existing unrelated extension/legacy-function findings that this Mobile scope did not modify.
