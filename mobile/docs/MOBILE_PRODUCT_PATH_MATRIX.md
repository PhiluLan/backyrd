# Mobile Product Path Matrix

| Capability | Active production path | Retired or isolated path |
| --- | --- | --- |
| Startup | Runtime config → one Auth provider → server product gate → router | Tab-mounted OTA reload; duplicate tab auth hydration |
| Updates | Native Expo Updates launch policy; next clean launch activates a downloaded update | Runtime `reloadAsync()` |
| Profile lifecycle | Auth trigger creates row; `complete_profile_onboarding_v2` writes onboarding fields | Client-side profile repair insert/update |
| Product entry | `get_my_product_entry_status_v1` | Local onboarding state as authority |
| Decision | Home/Decision input → authenticated `decision-v13` North-Star | V9/V12 Product renderer and silent legacy fallback |
| Reasons | Server-authorized candidate reason | Client OpenAI copy and invented personal copy |
| Continuation | Same server decision and continuation request ID | Client reranking |
| Exposure | Visible card → `backyrd_record_visible_decision_impression_v1` | Batch exposure for unseen response candidates |
| Neutral browse | Weiter/swipe → navigation only | Forced Passt/Nicht passend |
| Feedback | Explicit Passt/Nicht passend → canonical action RPC | Parallel `user_taste_events_v2` writes |
| Discovery Home | Home free text → canonical Decision | Home free text → legacy spot search |
| Release safety | Config, channel, runtime and forbidden-path preflight | Publish succeeds with missing runtime config |

Historical backend tables remain untouched. The old V3/V9 mobile Decision debug client has been removed; current Decision observability stays server-side.
