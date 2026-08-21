# Production Decision Input Package

Status: deterministic Sprint-3 shadow package; N6 is not authorized.

## Flow

`decision-v13` Product request and visible impressions
→ frozen N3 Current Moment
→ latest canonical User Card
→ frozen N5.6.1 projection
→ existing V13 candidate identities/order
→ hard Product/Distribution eligibility
→ canonical N4 batch read and bounded serialization
→ validated, hashed Decision Input Package
→ minimized shadow trace.

The current visible ranking and copy remain authoritative. Sprint 3 neither retrieves replacement candidates nor reorders candidates.

## Candidate boundary

Candidate identity comes from the Product's existing `decision_impressions`, which are the visible V13 result. Before freezing, the adapter enforces:

- approved Product state;
- Distribution eligibility for the Decision surface;
- selected city;
- explicit required/excluded Place Type;
- explicit open-now when requested.

Opening-hours policy: without an explicit open-now constraint, opening state is not a hard exclusion. With explicit open-now, both `closed` and `unknown` are excluded. This is deterministic and fail-closed.

The frozen candidate-set hash covers decision identity, retrieval position, Spot identity, and each N4 snapshot hash. A later N6 may only reorder this universe; it may never add a Spot.

## N4 Decision serialization

Each candidate contains only Spot identity, canonical Place Type when available, positive canonical concept presence, N4 confidence, bounded provenance identity, canonical snapshot/freshness identity, and minimal Product facts. Availability is explicit:

- `FULL`: canonical concepts plus canonical global snapshot identity;
- `PARTIAL`: canonical concepts without a complete global snapshot identity;
- `UNKNOWN`: no qualifying canonical concepts.

Missing N4 is not replaced with Legacy intelligence. Owner plan, payment, subscription, sponsored boost, Distribution priority, and profile-completeness boost are excluded.

## Validation and trace

Validation rejects cross-user cards, identity mismatches, duplicate or ineligible candidates, N4/Spot mismatch, inconsistent hashes, forbidden commercial fields, raw evidence references, and latent/evaluator truth. Package creation is server-side.

The persisted shadow trace stores only decision/user identity plus User Card, N3, N5, candidate-set, N4, package hashes, knowledge mode, contract versions, and validation disposition. Trace persistence is service-only, RLS-default-deny, idempotent for the same package, and fail-closed for a conflicting replay.

Feature flag default: disabled. There is no N6 call and no visible Product dependency.
