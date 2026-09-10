# Legacy to Foundation Mapping Matrix

Canonical machine-readable source: `packages/world-knowledge-core/src/legacy-mapping.ts` (`backyrd.world-knowledge.legacy-mapping@1.0`).

| Legacy field group | Status | World handling |
|---|---|---|
| spot UUID | DIRECT | World `scope.spotId` |
| name/address/city/country/coordinates/website/phone | MISSING_PROVENANCE | Registry validation; assertion or reference only |
| category | NORMALIZED | Exact allow-listed mapping only |
| price level | AMBIGUOUS | No conversion to currency range |
| weekly hours | MISSING_PROVENANCE | Validate/group only when timezone exists; not eligibility-ready |
| Restaurant V1 typed facts | NORMALIZED | Individual allow-listed converters required before rollout |
| suitability, moods, occasions | SUBJECTIVE | Explanation/research only; not capabilities |
| N4 numeric confidence | UNSUPPORTED | Never mapped to qualitative World trust |
| email | AMBIGUOUS | Excluded until public/private classification exists |
| owner/payment/subscription/advertising | PROHIBITED | Always excluded |
| event `spot_id` | NO_TARGET_KEY | Keep cross-domain relation |

The Slice 2 adapter deliberately implements the smallest safe subset: validated identity/location/public website and phone, explicit category mapping, and regular hours only with valid schedule plus timezone. Other accepted-fact JSON is reported for review rather than guessed.
