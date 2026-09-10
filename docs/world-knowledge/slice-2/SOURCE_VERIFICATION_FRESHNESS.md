# Source, Verification, Freshness and Conflict Policy

The source-policy contract is per attribute. It separates allowed source types, allowed actor types, source-reference requirement, self-assertion, verification process, freshness policy reference, conflict policy, minimum qualitative trust, and authorization per use case and port. The resolver evaluates every claim into a deterministic, SHA-256-bound source assessment containing its policy/claim identities, trust result, freshness policy, per-use-case authorization and reason codes.

The resolver input/result contract advances to `backyrd.world-knowledge.resolution@2.0` because source policy and verification records are now mandatory, hash-bound inputs. The Slice 1 `@1.0` shape is not silently reinterpreted. Registry and World port versions do not change.

The checked-in policy is intentionally `NOT_CONFIGURED` for source hierarchy and TTL decisions. It may retain assertions in the general World snapshot for audit/research, but it cannot authorize Decision, eligibility, hard constraints, accessibility, price, or other trust-dependent use. A configured policy can produce `READY` only from concrete claims that pass its source, actor, reference, self-assertion, trust and freshness requirements. Readiness is derived from those assessments rather than from policy presence alone.

`projectForDecision` is a validated policy projection, not a generic snapshot copier. It emits only entries whose bound source assessments authorize the relevant use case under an explicitly accepted policy. Unconfigured/rejected/review-only entries and public contact are omitted.

## Trust transitions

- owner input: `ASSERTED`;
- admin observation: `ASSERTED`;
- a reference produces at most `REFERENCED` only when the configured policy permits the source/actor combination and requires or permits that reference; an arbitrary `source:*` string has no trust effect;
- `VERIFIED`: only a valid Verification Record under a configured policy and authorized process;
- AI inference: never independently verifiable;
- role, subscription, payment, advertising and sponsorship: no transition.

## Verification Record

`backyrd.world-knowledge.verification-record@1.0` binds policy version/hash, claim ID/hash, attribute key, spot ID, process ID/version/hash, execution-authority ID/hash, verifier role, source references, result, checked time, reverification reference and reason codes. Results: `VERIFIED`, `REJECTED`, `INCONCLUSIVE`, `REQUIRES_REVIEW`.

The record cannot authorize itself. Parsing requires a separately injected catalog containing an accepted versioned verification-process contract and an accepted execution-authority contract. The process binds attributes, allowed source types, roles, authority class, freshness/reverification policy, allowed outcomes and clock-skew rule. The execution authority binds one process version/hash, role, authority class and validity interval. Cross-spot/key/claim records, swapped sources, stale/unknown process versions, mismatched reverification policy, altered evidence, future/predating checks and AI-only verification fail closed. `checkedAt` must not predate `claim.observedAt`, must fall inside the accepted authority window and must not exceed an injected server time plus the process's explicit skew allowance. Records append; they never mutate claims.

These are locally synthetic authority contracts, not proof of real-world process execution. Production verifier identities, credentials, signatures/attestation, revocation and trusted server-time injection are not implemented.

## Freshness/TTL framework

Modes: permanent until contradicted, known valid-until, periodic reverification, mandatory valid-until, schedule-bound, and not configured. Current state always requires `valid_until`. No durations are product truth in Slice 2.

CTO recommendation matrix for later calibration (classes only, no duration): identity/category = durable-until-contradicted; public contact/price/service/accessibility = periodic reverification; regular schedules = periodic plus source observation; special hours = date-bound; current state = mandatory expiry; event state = event/schedule-bound.

## Conflicts

Policies may retain alternatives, fail closed, or select a current value while retaining all alternatives. No universal “admin wins”, “official wins”, or “newest wins” rule exists. Sensitive unresolved conflicts fail closed. Current state never overwrites a durable fact; corroboration does not erase evidence; a decision records policy version and reason codes.
