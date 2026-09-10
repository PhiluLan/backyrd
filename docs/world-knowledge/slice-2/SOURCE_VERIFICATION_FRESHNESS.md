# Source, Verification, Freshness and Conflict Policy

The source-policy contract is per attribute. It separates allowed source types, allowed actor types, source-reference requirement, self-assertion, verification process, freshness policy reference, conflict policy, and authorization per use case and port.

The resolver input/result contract advances to `backyrd.world-knowledge.resolution@2.0` because source policy and verification records are now mandatory, hash-bound inputs. The Slice 1 `@1.0` shape is not silently reinterpreted. Registry and World port versions do not change.

The checked-in policy is intentionally `NOT_CONFIGURED` for source hierarchy and TTL decisions. Public contact is permitted in the general World snapshot and prohibited from Decision influence by a separate projection. Research is permitted as research. Opening-hours eligibility, price, hard constraints, accessibility and other trust-dependent uses cannot become `READY` from this policy.

## Trust transitions

- owner input: `ASSERTED`;
- admin observation: `ASSERTED`;
- a valid bound source reference: at most `REFERENCED`;
- `VERIFIED`: only a valid Verification Record under a configured policy and authorized process;
- AI inference: never independently verifiable;
- role, subscription, payment, advertising and sponsorship: no transition.

## Verification Record

`backyrd.world-knowledge.verification-record@1.0` binds policy version/hash, claim ID/hash, attribute key, spot ID, process ID/version, verifier role, source references, result, checked time, reverification reference and reason codes. Results: `VERIFIED`, `REJECTED`, `INCONCLUSIVE`, `REQUIRES_REVIEW`. Cross-spot/key/claim records, altered evidence, unknown policies/processes and AI-only verification fail closed. Records append; they never mutate claims.

## Freshness/TTL framework

Modes: permanent until contradicted, known valid-until, periodic reverification, mandatory valid-until, schedule-bound, and not configured. Current state always requires `valid_until`. No durations are product truth in Slice 2.

CTO recommendation matrix for later calibration (classes only, no duration): identity/category = durable-until-contradicted; public contact/price/service/accessibility = periodic reverification; regular schedules = periodic plus source observation; special hours = date-bound; current state = mandatory expiry; event state = event/schedule-bound.

## Conflicts

Policies may retain alternatives, fail closed, or select a current value while retaining all alternatives. No universal “admin wins”, “official wins”, or “newest wins” rule exists. Sensitive unresolved conflicts fail closed. Current state never overwrites a durable fact; corroboration does not erase evidence; a decision records policy version and reason codes.
