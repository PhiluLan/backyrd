# World Week 3 — internal allowlist read foundation

This slice adds a closed, versioned allowlist in front of the existing canonical `WorldKnowledgeReaderPort`. It does not add a second resolver, Decision semantics, User semantics, a client surface, or a Production activation path.

## Boundary

- Default state: **OFF**, kill switch **ENGAGED**.
- Enabled environments: `LOCAL_TEST` and `PROD_LIKE_TEST` only.
- Purpose: `INTERNAL_WORLD_READ_REHEARSAL` only.
- The committed release has zero members. Authority, expiry and retention remain `NOT_CONFIGURED`.
- Test members must use synthetic opaque pseudonyms and bind purpose, environment, release, spot hash, explicit registry keys, validity, and entry hash.
- A rejected request reaches neither the canonical reader nor a database loader.
- An accepted read returns only allowlisted Fact, Operational Rule, or Current State entries plus minimized conflicts and explicit state partitions. Contacts, actor identities, private sources, claims, commercial state and hashes of private evidence are excluded.
- The emergency switch is a one-way latch for the reader instance and clears replayed output.

## Semantic restraint

`UNKNOWN`, `NOT_CONFIGURED`, `NOT_APPLICABLE`, `INCOMPATIBLE`, and `DISPUTED` are separate output partitions. The adapter does not infer one from another. Only states already supported by the canonical snapshot are populated; the remaining partitions stay empty.

## Production truth

The Post-Deploy Evidence status is exactly `NOT_EXECUTED_NO_PRODUCTION_AUTHORITY`. No real allowlist member, Production credential, query, migration, deployment, Decision wiring, eligibility, ranking, or intent mapping is included.

The machine-readable evidence is [release-evidence.json](release-evidence.json). The operational sequence is in [RUNBOOK.md](RUNBOOK.md).
