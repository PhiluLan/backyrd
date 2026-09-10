# ADR: Decision vNext Phase-1 final integrity closure

- Status: proposed in Draft PR #268
- Date: 2026-09-10
- Canonical base: `e48ecc461604f4f6ec73f399a39e233f7f5e5559`
- Scope: Decision vNext synthetic contracts and validation only

## Decision

1. Location authority is a mandatory server input. The Context resolver never derives it from client location or authenticated actor identity. Context binds separate client/scope hashes and a fail-closed match proof.
2. Client-supplied budget, available-time, weather and exploration placeholders remain explicit. `DERIVED` Context requires non-empty source hashes; `UNKNOWN` and `NOT_CONFIGURED` remain distinct.
3. Open-now uses a versioned deterministic evaluator over canonical World snapshots. Evaluation is IANA-timezone/DST aware, supports special and overnight venue hours, excludes kitchen hours from venue state, scopes Current State, and preserves `unknown`, `not_authorized`, `expired` and `disputed`.
4. Phase 1 declares a synthetic, unapproved opening source policy. This is not a Production policy and grants no Production adapter authority.
5. Result integrity recursively validates nested hashes and bindings, unique identities, central Eligibility replay, Baseline fit/rank replay, Confidence reconstruction and Explanation authorization/rendering. Supported Manifest versions are a closed allowlist.

## Rationale

An outer content hash proves only internal consistency; it does not prove that a semantically altered payload still follows the approved engine. Replaying deterministic Phase-1 stages against closed version registries makes rehashed rule, fit, confidence and explanation changes fail closed. Separating server Location Authority prevents client-controlled search input from becoming authorization merely because an actor is authenticated.

## Consequences and limits

Contracts and manifest advance to the integrity-closure versions. Synthetic results remain byte-replayable. Exact authenticity of an external future World snapshot still requires the authoritative World port/artifact identified by its bound hash; this ADR does not create signatures, persistence or a Production trust policy. No Product taxonomy, score, ranking weight, database object, RPC or serving path is added.
