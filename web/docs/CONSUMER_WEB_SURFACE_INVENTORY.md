# Consumer Web surface inventory

Status: complete for the Consumer Web closure. Owner routes are intentionally excluded and unchanged.

## Route inventory (33 route entries)

The route tree contains 32 user-visible routes and one authentication callback.
Together with three global system states and four transient interaction surfaces,
the reviewed Consumer Web inventory contains **39 user-visible surfaces**.

| Family | Route(s) | Type | Status |
| --- | --- | --- | --- |
| Entdecken | `/` | Primary | Migrated |
| Für jetzt | `/decision`, `/discover` redirect | Primary | Migrated |
| Orte | `/places`, `/search` | Primary / secondary | Migrated |
| Spot | `/spots/[id]` | Primary public detail | Migrated |
| Momente | `/moments` | Primary | Migrated |
| Profile | `/profile`, `/users/[id]` | Primary / public profile | Migrated |
| Auth | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify`, `/auth/callback` | Forms / callback | Migrated |
| Onboarding | `/onboarding` | Form | Migrated |
| Social | `/messages`, `/messages/[id]`, `/notifications` | Secondary | Migrated |
| Contributions | `/reviews/new`, `/achievements` | Form / secondary | Migrated |
| Saved | `/favorites` | Secondary | Migrated |
| Settings | `/settings`, `/settings/profile`, `/settings/privacy`, `/settings/consents`, `/settings/data`, `/settings/history`, `/settings/notifications`, `/settings/decision-history`, `/settings/safety`, `/settings/support` | Utility / forms | Migrated |
| Legal | `/legal` | Public utility | Migrated |
| System | `not-found`, global `loading`, global `error` | System state | Migrated |

## Interaction surfaces

- Dialogs (3): comments, Moment composer, account logout confirmation.
- Transient feedback (1): shared success/error toast.
- Forms (12): Decision guided/free, search, filters, login, signup, forgot/reset password, onboarding, Moment creation, comments, review creation, profile edit, support, chat composer.
- Shared components (19): shell, authentication gate, buttons/links, icon buttons, chips, state view, avatar, dialog, toast, Spot image, Spot card, Moment card, comments, map, Decision, places, profile, settings shell, actions.
- System states: loading, content, empty, error, offline/retry, permission/private, exhausted, refreshing are represented where applicable.

## Reachability disposition

- Reachable Consumer surfaces unreviewed: **0**.
- Deprecated Consumer implementations removed: legacy landing and legacy discover client.
- Owner Web: existing separate product surface; explicitly outside this closure and not changed.
- Browser push notifications: not implemented because no canonical Product contract exists.
- Anonymous Google photo resolution: intentionally unavailable by security contract.
