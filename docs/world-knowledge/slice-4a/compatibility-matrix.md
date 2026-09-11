# Existing-system compatibility matrix

| Component | Classification | Slice 4A treatment |
| --- | --- | --- |
| `public.spots.id` | KEEP | Canonical Spot identity; cohort rows point to it. |
| Legacy mandatory coordinates | ADAPT | New isolated rows receive a non-authoritative `0/0` compatibility sentinel. It never enters World Knowledge; only explicit location Claims enter a snapshot. |
| `public.spots.owner_id` | ADAPT | Server-side current ownership check; never emitted as World knowledge. |
| Admin `SpotForm` | KEEP | Existing production authoring remains unchanged. A separate cohort route is added. |
| Owner spot/profile form | KEEP | Existing production form remains unchanged. A separate cohort route is added. |
| Gold proposals/accepted facts | ADAPT | Research evidence only; no implicit migration or trust elevation. |
| Legacy categories/offerings | ADAPT | Only mappings already classified `DIRECT`/`NORMALIZED` may be imported later. |
| Legacy numeric confidence | PROHIBITED | Never mapped to World trust. |
| Atmosphere, moods and suitability | PROHIBITED | Not objective authoring; excluded from authorized facts. |
| Slice 3B Claims/Verification/Confirmation | KEEP | Canonical append-only write model. |
| Slice 3B resolver/manifests | KEEP | Server-only local Shadow resolution. |
| Slice 3B entitlement policy | KEEP | Stable-key Basic/Pro/Admin authoring scope. |
| Production public/mobile/Decision consumers | PROHIBITED | No route, projection, retrieval or ranking activation. |
| Secondary categories | UNKNOWN_NEEDS_PRODUCT_DECISION | Explicitly deferred. |
| Official holiday source | UNKNOWN_NEEDS_PRODUCT_DECISION | No calendar or reminder semantics invented. |

Existing Admin authority remains `profiles.is_admin` through the established server function. Owner authority remains exact current `spots.owner_id`. Neither client-editable metadata nor billing is authoritative.
