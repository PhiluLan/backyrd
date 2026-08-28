# Sprint 6 utility and system surface inventory

Status values are `MIGRATED`, `ALREADY_GOOD`, `DEPRECATED`, or
`UNREACHABLE_WITH_PROOF`. Owner claim and Spot management are intentionally
outside the consumer Sprint 6 scope.

| Surface | Route / entry | Status | Evidence / scope |
| --- | --- | --- | --- |
| Logged-out gate | `/gate` | MIGRATED | Native cold-start entry; development-only presentation links never write Product state. |
| Login | `/auth/login` | MIGRATED | Inline validation, human auth failures, keyboard-safe form. |
| Signup | `/auth/register` | MIGRATED | Inline validation, autofill metadata, preserved signup contract. |
| Email verification | `/auth/verify` | MIGRATED | Human retry/error states; existing verification RPC/Auth behavior preserved. |
| Forgot/reset password | no route or reachable entry | UNREACHABLE_WITH_PROOF | Repository route and navigation search finds no implemented Product flow. No replacement behavior invented. |
| Profile onboarding | `/onboarding` | MIGRATED | Inline validation, canonical loading state, safe development-only visual preview. |
| Taste onboarding | `/(tabs)/decision-onboarding` | ALREADY_GOOD | Current progressive Backyrd Decision onboarding from Sprint 3; no semantic change. |
| Required legal gate | `/legal-consent` | MIGRATED | Canonical loading/error/empty states; exact accept/version semantics preserved. |
| Settings home | `/(tabs)/settings` | MIGRATED | Account, privacy, and safety/support groups on canonical theme. |
| Edit profile | Profile edit sheet | ALREADY_GOOD | Keyboard avoiding, safe-area-aware sheet, avatar/fields/save/cancel; generic recoverable errors. |
| Profile visibility | `/settings/privacy` | MIGRATED | Canonical loading/error/retry states; existing `is_private` semantics preserved. |
| Privacy hub | `/privacy-consent` | MIGRATED | Coherent entry for consent, documents, history, and data rights. |
| Consent and permission controls | `/privacy-consents` | MIGRATED | Location/push denied states link to system settings; no defaults or consent meaning changed. |
| Data rights | `/privacy-data-rights` | MIGRATED | Export/delete/cancel remain confirmed actions; canonical loading and human failure copy. |
| Consent history | `/privacy-history` | MIGRATED | Canonical loading/error/empty/retry states. |
| Legal documents | `/privacy-legal-documents` | MIGRATED | Canonical loading/error/empty/retry states. |
| Decision history | `/profile/history` | MIGRATED | Canonical loading state and human load failure; Decision data remains read-only. |
| Safety and support | `/safety-center` | MIGRATED | Human load error, canonical loading state, unchanged report/appeal behavior. |
| Safety notifications | `/safety-notifications` | MIGRATED | Canonical loading/error/empty states; notice semantics unchanged. |
| Account safety status | `/safety/account-status` | MIGRATED | Canonical loading state; enforcement status remains server-authored. |
| Moderation report detail | `/safety-report/[reportId]` | MIGRATED | Canonical loading and bounded human error copy. |
| Logout confirmation | Profile danger action | MIGRATED | Explicit cancel/destructive confirmation; sign-out occurs only after confirmation. |
| Delete account confirmation | Data rights danger zone | ALREADY_GOOD | Existing staged confirmation and cancellation retained; never executed during visual QA. |
| Camera/photo permissions | Existing Moment/Profile media entries | ALREADY_GOOD | Existing OS-mediated request behavior retained; no new utility route or fake state added. |
| Internal diagnostics | `/release-diagnostics`, `/dev` | ALREADY_GOOD | Hidden from ordinary consumers; available only to development/internal users. |

Reachable surfaces left unreviewed: **0**.

Surfaces still marked `NEEDS_FIX`: **0**.

## Validation coverage

- Isolated iPhone 16e development build: logged-out gate, Login, invalid-login
  presentation, Signup, Verification, and Onboarding presentation. The
  development-only presentation routes never persist Auth, profile,
  onboarding, or consent state.
- Native responsive coverage: 375 px (iPhone 13 mini), 393 px (iPhone 16e),
  and 430 px (iPhone 16 Plus). The unsupported 320 px iOS runtime was covered
  with the deterministic Expo/React Native web renderer at a 320 px viewport.
- Representative accessibility-large coverage: Gate and Login, including
  scroll reachability and bounded editorial display scaling.
- Keyboard coverage: Onboarding and Auth fields remain visible and actions
  remain reachable with the software keyboard open.
- Destructive actions: Logout and account deletion were inspected through
  their confirmation states only; neither action was executed during QA.
- Main authenticated simulator session: unchanged throughout Sprint 6.

## State audit classification

- Full-surface loading, empty, error, offline, permission, and exhausted
  states use the existing Backyrd state language on migrated utility screens.
- Remaining `ActivityIndicator` uses on these surfaces are action-local
  progress indicators, image-local loading, or the shared state primitive.
- Remaining `Alert.alert` uses are confirmations, permission handoffs,
  success acknowledgements, or bounded human recovery messages. No migrated
  utility surface displays raw database, RPC, Auth, or Edge error payloads.
