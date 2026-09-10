# Compatibility Adapter Contract

`LegacySpotInput` is a strict runtime boundary and has no database client. `adaptLegacySpot` validates the entire payload, calculates an input hash, performs only allow-listed transforms, emits deterministic IDs/claims/audit rows, resolves through Foundation, and binds adapter, mapping and registry identities.

Guarantees:

- missing values emit nothing, never false;
- no invented actor or evidence: actor is the adapter system, source is `LEGACY_IMPORT`, and absent source remains asserted/missing provenance;
- legacy values never become `VERIFIED`; numeric confidence is ignored;
- invalid category, country, URL, phone, timezone and schedules require review;
- unknown fact keys require review rather than generic ingestion;
- owner/commercial context is accepted only to produce explicit exclusions and cannot enter claims/snapshot;
- replay is byte-identical; changing source binding changes claim/result hashes;
- public contact remains in the general snapshot;
- `projectForDecision` intentionally omits public contact, owner/commercial context and research data, so contact cannot affect eligibility, ranking, confidence or personalization.

The adapter is not exported to any app or Edge Function and performs no reads/writes. It is a compatibility experiment, not migration code.
