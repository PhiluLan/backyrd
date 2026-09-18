# Mobile Product Path Matrix

| Capability | Active production path | Retired or isolated path |
| --- | --- | --- |
| Startup | Runtime config → one Auth provider → server product gate → router | Tab-mounted OTA reload; duplicate tab auth hydration |
| Updates | Native Expo Updates launch policy; next clean launch activates a downloaded update | Runtime `reloadAsync()` |
| Profile lifecycle | Auth trigger creates row; `complete_profile_onboarding_v2` writes onboarding fields | Client-side profile repair insert/update |
| Product entry | `get_my_product_entry_status_v1` | Local onboarding state as authority |
| Decision | Home/Decision input → authenticated strict Product contract on `decision-v13` | V9/V12 renderer, Founder-special route, and silent legacy fallback |
| Reasons | Server-authorized candidate reason | Client OpenAI copy and invented personal copy |
| Alternative / reject | Same Product route with prior/rejected candidate bindings | Legacy continuation RPC and client reranking |
| Exposure | >=50% visible for 750ms → Product `candidate_impression` | Batch exposure for unseen response candidates |
| Open | Candidate detail open → Product `candidate_opened` | Decision-origin legacy Taste/Memory/analytics writes |
| Discovery Home | Home free text → canonical Decision | Home free text → legacy spot search |
| Release safety | Config, channel, runtime and forbidden-path preflight | Publish succeeds with missing runtime config |

Historical backend tables remain untouched and isolated. This matrix describes
the source candidate, not an activated Production runtime; Product control stays
OFF until a separately authorized release.
