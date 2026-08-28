# Mobile Sprint 7 — Complete Surface Inventory

Audited against the Runtime 1.1.0 mobile baseline on 2026-08-27. This is a presentation inventory only; Product contracts, persistence, authorization, ranking, learning, and database truth are frozen.

## Count and scope

- 50 route source files inspected.
- 45 user-visible route surfaces (native and platform-specific variants counted once per rendered surface).
- 16 user-visible overlays, sheets, dialogs, and transient-feedback surfaces.
- 61 total user-visible surfaces.
- 0 reachable surfaces unreviewed.
- 0 reachable design islands remaining.

`_layout`, `+native-intent`, and redirect-only files are navigation infrastructure, not separate rendered surfaces. Platform-only and development-only routes remain in the inventory and are classified explicitly.

## Route surfaces

| Surface | Type | Status | Native evidence / rationale |
| --- | --- | --- | --- |
| Entdecken / Home | PRIMARY_SCREEN | ALREADY_GOOD | Authenticated native walkthrough; carousel, Decision entry, Moments hint and Tab clearance reviewed. |
| Für jetzt / Decision input | PRIMARY_SCREEN | ALREADY_GOOD | Guided and free-text entry rendered; semantic callbacks unchanged. |
| Decision onboarding | SECONDARY_SCREEN | ALREADY_GOOD | Native entry and responsive form composition reviewed. |
| Decision loading/results/exhausted | PRIMARY_SCREEN + SYSTEM_STATE | ALREADY_GOOD | Existing Sprint 1–3 result system retained; loading/error copy re-audited. |
| Orte / Discovery list | PRIMARY_SCREEN | ALREADY_GOOD | Real authenticated list-first data rendered; loading remains conditional. |
| Map | PRIMARY_SCREEN | ALREADY_GOOD | Native Google map, markers, clusters, filters, preview, List switch and Tab clearance reviewed. |
| Map web variant | SECONDARY_SCREEN | UNREACHABLE_WITH_PROOF | `Platform.OS=web` implementation; never selected by an iOS runtime. Kept coherent for platform fallback. |
| Spot Detail | PRIMARY_SCREEN | MIGRATED | Initial state, typography, mood presentation, image identity, nearby cards and attribution reviewed natively. |
| Momente feed | PRIMARY_SCREEN | MIGRATED | Real media and no-media Moments, Spot references, actions, safe area and scroll reviewed. |
| Journey / Saved | PRIMARY_SCREEN | MIGRATED | State presentation and canonical Spot imagery audited. |
| Own Profile | PRIMARY_SCREEN | MIGRATED | Real account identity, compact stats, content tabs and actions reviewed. |
| Other Profile | SECONDARY_SCREEN | MIGRATED | Real user profile, owner-action separation, follow/message hierarchy and content reviewed. |
| Settings | SECONDARY_SCREEN | MIGRATED | Native utility hub and all reachable rows reviewed. |
| Achievements | SECONDARY_SCREEN | MIGRATED | Canonical foundation, loading/error/empty/content and terminology reviewed. |
| Messages list | SECONDARY_SCREEN | MIGRATED | Duplicate load removed; rows, empty/loading/error and compose action reviewed. |
| Chat | SECONDARY_SCREEN + FORM | MIGRATED | Composer, keyboard clearance, loading/error and message hierarchy reviewed. |
| People search | SECONDARY_SCREEN + FORM | MIGRATED | Native search states and Backyrd terminology reviewed. |
| Global search | SECONDARY_SCREEN + FORM | MIGRATED | Old visual island removed; query, loading, empty, error and results use foundation. |
| New Spot tab alias | SECONDARY_SCREEN | DEPRECATED | Redirect-only compatibility route; no independent UI. |
| Smart Review tab alias | SECONDARY_SCREEN | DEPRECATED | Redirect-only compatibility route; no independent UI. |
| Create Moment | MODAL + FORM | MIGRATED | Native modal, media/Spot separation, permission state, form hierarchy and cancel reviewed without submit. |
| New Review | FORM | MIGRATED | Copy, controls, validation and bounded errors audited. |
| Quick Review | FORM | MIGRATED | Form hierarchy, state copy and safe loading audited. |
| Smart Review | FORM | MIGRATED | Multi-step hierarchy, permission/error states and terminology audited. |
| Login | FORM | ALREADY_GOOD | Isolated iPhone 16e cold-auth render and invalid state reviewed. |
| Signup | FORM | MIGRATED | Isolated native review; text semantics and verification handoff preserved. |
| Verification | FORM + SYSTEM_STATE | ALREADY_GOOD | Isolated native verification presentation reviewed. |
| Gate | SYSTEM_STATE | ALREADY_GOOD | Isolated cold-auth launch gate reviewed. |
| Splash | SYSTEM_STATE | ALREADY_GOOD | Bounded launch state retained; no Product data fabricated. |
| Onboarding | FORM | ALREADY_GOOD | Isolated native presentation path reviewed without changing Production onboarding truth. |
| Legal consent gate | FORM | ALREADY_GOOD | Required/optional semantics and persistence unchanged; native presentation reviewed. |
| Privacy hub | SECONDARY_SCREEN | ALREADY_GOOD | Native authenticated walkthrough. |
| Consent overview | SECONDARY_SCREEN | MIGRATED | Canonical purpose names and human presentation copy added; native review completed. |
| Consent detail | FORM | MIGRATED | Foundation, bounded status and German location wording reviewed. |
| Data rights | FORM | MIGRATED | Request form, confirmation, errors and destructive distinction audited. |
| Consent history | SECONDARY_SCREEN | MIGRATED | Human event/source labels and localized purpose names reviewed natively. |
| Legal documents | SECONDARY_SCREEN | ALREADY_GOOD | Native empty state reviewed. |
| Visibility / Privacy | FORM | MIGRATED | Switch state, accessibility state/hint and consequences reviewed; RLS unchanged. |
| Decision history | SECONDARY_SCREEN | MIGRATED | Prototype intelligence dashboard replaced by calm editorial history presentation; data contract unchanged. |
| Safety Center | SECONDARY_SCREEN | MIGRATED | Human Backyrd terminology and state presentation reviewed natively. |
| Safety notifications | SECONDARY_SCREEN | MIGRATED | Localized status/count presentation and card accessibility reviewed natively. |
| Account status | SECONDARY_SCREEN | ALREADY_GOOD | Enforcement truth remains server-authored; UI hierarchy reviewed. |
| Safety report detail | SECONDARY_SCREEN | ALREADY_GOOD | Status, timeline, appeal/report actions and bounded states reviewed. |
| New Spot | FORM | MIGRATED | Existing creation contract retained; errors bounded and presentation audited. |
| Claim Spot | FORM | MIGRATED | Owner/claim flow remains reachable from Consumer Spot Detail; form/state foundation audited. |
| Manage Spot | FORM | MIGRATED | Authorization-gated form audited; no Owner semantics changed. |
| Development tools | SECONDARY_SCREEN | UNREACHABLE_WITH_PROOF | Production navigation never links the `dev` route; development-only utility migrated to foundation to avoid a local island. |
| Release diagnostics | SECONDARY_SCREEN | UNREACHABLE_WITH_PROOF | Guarded by development/release-diagnostics access; not a Production consumer route. |
| Template modal (`modal.tsx`) | MODAL | DEPRECATED | Expo template route has no stack declaration, link, push, replace, or deep-link mapping. |

## Overlays, sheets, dialogs, and feedback

| Surface | Type | Status |
| --- | --- | --- |
| Moment composer | MODAL | MIGRATED |
| Comments | BOTTOM_SHEET + FORM | MIGRATED |
| Edit Profile | BOTTOM_SHEET + FORM | MIGRATED |
| Map filters | BOTTOM_SHEET + FORM | ALREADY_GOOD |
| Login prompt | MODAL | MIGRATED |
| Profile privacy editor | MODAL + FORM | MIGRATED |
| Achievement unlock | MODAL | MIGRATED |
| Achievement progress | TOAST / POPUP | MIGRATED |
| Report content | BOTTOM_SHEET + FORM | ALREADY_GOOD |
| Appeal decision | MODAL + FORM | ALREADY_GOOD |
| Global safety enforcement | DIALOG | MIGRATED |
| Spot taxonomy details | MODAL | ALREADY_GOOD |
| Moment options | DIALOG | ALREADY_GOOD |
| Logout confirmation | DIALOG | ALREADY_GOOD |
| Delete-account confirmation | DIALOG | ALREADY_GOOD |
| Native share sheet | SYSTEM DIALOG | ALREADY_GOOD — intentionally native |

## Shared component closure

- Canonical foundation: `backyrdTheme`, `AppText`, `Screen`, `Button`, `IconButton`, `Chip`, `StateView`, `SpotImage`/`SpotArtwork`.
- One Avatar implementation now covers image, initials, size variants and local failure fallback.
- User-facing failures pass through a bounded error presenter; raw database/RPC/Edge payloads are not rendered.
- Moment user media remains separate from canonical Spot media.
- Spot source identity remains Owner/Admin → authenticated Google Places → Backyrd fallback.
- Same semantic actions keep the same visual hierarchy; destructive actions remain isolated in confirmations/danger areas.

## State and feedback classification

All reachable data surfaces were reviewed for initial, loading, content, empty, error, offline, permission, exhausted, and refreshing states where applicable.

- Remaining `ActivityIndicator` usages are action-local progress (submit, refresh, media resolve), launch gating, or the implementation inside shared `StateView`; none is a reachable spinner-only error/content screen.
- Remaining `Alert.alert` usages are destructive confirmations, operating-system/settings handoffs, share/report action failures, or short action-local recovery. They do not expose raw backend payloads.
- Native share and settings handoff dialogs intentionally remain native because they represent operating-system actions.

## Unreachable and deprecated visual source

The following legacy/template helpers have no reachable import or route path and are not counted as Product design islands: `LoginBottomSheet`, `FollowButton`, Expo template `hello-wave`, `haptic-tab`, `parallax-scroll-view`, `themed-text`, `themed-view`, old `components/ui.tsx`, `ui/collapsible`, icon-symbol variants, `map/Map.native.tsx`, old `components/spot.tsx`, and template theme helpers. They remain historical dead source; Git is the history and no Production route renders them.

## Product firewall

No Decision Engine, N3/N4/N5/N6, ranking, Offering/Purpose, User Learning, social persistence, Auth/consent/privacy semantics, RLS, database schema, search/filter eligibility, or canonical image priority was changed by this closure.
