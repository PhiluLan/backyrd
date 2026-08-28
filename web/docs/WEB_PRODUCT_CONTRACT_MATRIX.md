# Consumer Web product contract matrix

| Contract | Web implementation | Preserved truth |
| --- | --- | --- |
| Decision | authenticated `decision-v13` | identical guided keys, request fields and limits as Mobile |
| Weiter | local result navigation without feedback RPC | neutral |
| Passt / Nicht passend | `log_decision_action_v1` | `exact_mood` / `not_there` |
| Exposure | `backyrd_record_visible_decision_impression_v1` after 750 ms | visible-only |
| Continuation | `decision-v13` continuation identifiers | unchanged |
| Discovery | `distribution_trust_spot_catalog_v1` | approved Product universe |
| Search / filters | existing catalog query and client presentation filters | no eligibility rewrite |
| Social | canonical feed/profile/comment/follow RPCs | RLS-authenticated |
| Auth | Supabase Auth with SSR cookie refresh and verified claims | no service role in client |
| Public Spot image | curated Owner/Admin header then Backyrd fallback | public Google disabled |
| Moment media | social-post media resolver | never replaced by Spot image |
| Private data | cookie-backed authenticated Supabase client | private/no-store and RLS |
| Learning firewall | only existing explicit feedback/impression calls | scroll, hover, map pan and route views are not Taste |

No Decision Engine, ranking, learning, database, Mobile, Admin or Owner implementation is changed by this workstream.
