# Consumer Web product contract matrix

| Contract | Web implementation | Preserved truth |
| --- | --- | --- |
| Decision | authenticated `decision-v13` | strict `backyrd.decision-vnext.product-request@1.0` / `product-response@1.0` only |
| Product rendering | server-bound presentation, ranking, availability, reasons and limitations | no client ranking or generated claims |
| Alternative | `decision-v13` with `alternativeRequested` and `previouslyPresentedCandidateIds` | no negative signal |
| Contextual reject | `decision-v13` with `rejectedCandidateIds` | contextual only; no World fact |
| Visible impression / open | `decision-v13` with strict Product interaction request | canonical consent-bound User learning; no Legacy write |
| Failure | visible unavailable state | no Legacy route, engine selector or fallback |
| Discovery | `distribution_trust_spot_catalog_v1` | approved Product universe |
| Search / filters | existing catalog query and client presentation filters | no eligibility rewrite |
| Social | canonical feed/profile/comment/follow RPCs | RLS-authenticated |
| Auth | Supabase Auth with SSR cookie refresh and verified claims | no service role in client |
| Public Spot image | curated Owner/Admin header then Backyrd fallback | public Google disabled |
| Moment media | social-post media resolver | never replaced by Spot image |
| Private data | cookie-backed authenticated Supabase client | private/no-store and RLS |
| Learning firewall | canonical server-side, consent-bound User port only | no client impression, feedback or Memory write |
| Decision history | legacy `get_decision_visit_candidates_v1` read model | explicitly historical; never mixed with vNext |

The Web client supplies Product inputs only. Actor identity, location authority, policy, ranking, learning consent and persistence remain server-owned.
